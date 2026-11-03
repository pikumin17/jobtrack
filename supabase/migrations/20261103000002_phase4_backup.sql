-- =====================================================================
-- JobTrack フェーズ4: 全データの書き出し（JSONバックアップ）と復元（設計書 v1.0、02 §3.8・§6、D-01〜D-05）
-- バージョン: 20261103000002（20261103000001 の適用後に実行する）
--
-- 適用方法は既存と同じ。SQL Editor に全文を貼り付けて1回で実行する。
-- 既存の行は削除・変更しない。関数を2つ追加するだけ。
-- 分析・CSV・初回設定・設定画面は画面側だけで作るので、DB の変更はない。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 二重適用の防止と前提の確認
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from private.schema_migrations where version = '20261103000001') then
    raise exception '先に 20261103000001 を適用してください。';
  end if;
  if exists (select 1 from private.schema_migrations where version = '20261103000002') then
    raise exception 'マイグレーション 20261103000002 は適用済みです。再実行は不要です。';
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 1. 書き出し（invoker）。RLS の下で動くので、返るのはログイン中の利用者のデータだけ
--    形式は 02 §6。checksum はブラウザで付ける（ファイルの破損の検出用）
-- ---------------------------------------------------------------------
create function public.export_my_data()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_data jsonb;
begin
  if v_uid is null or not private.is_active_member() then
    raise exception 'ログインし直してください' using errcode = '42501';
  end if;

  v_data := jsonb_build_object(
    'profile', (select jsonb_build_object('display_name', p.display_name, 'graduation_year', p.graduation_year,
                                          'purpose', p.purpose)
                  from public.profiles p where p.id = v_uid),
    'notification_settings', (select jsonb_build_object('types', n.types, 'offsets_days', n.offsets_days,
                                                        'send_hour_jst', n.send_hour_jst)
                                from public.notification_settings n where n.user_id = v_uid),
    'companies', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id' - 'selection_status' - 'selection_status_reason'
                                            order by c.created_at, c.id)
                             from public.companies c where c.user_id = v_uid), '[]'),
    'selection_steps', coalesce((select jsonb_agg(to_jsonb(s) - 'user_id' order by s.company_id, s.position)
                                   from public.selection_steps s where s.user_id = v_uid), '[]'),
    'events', coalesce((select jsonb_agg(to_jsonb(e) - 'user_id' order by e.created_at, e.id)
                          from public.events e where e.user_id = v_uid), '[]'),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id' order by t.created_at, t.id)
                         from public.tasks t where t.user_id = v_uid), '[]'),
    'timeline_entries', coalesce((select jsonb_agg(to_jsonb(l) - 'user_id' order by l.occurred_at, l.id)
                                    from public.timeline_entries l where l.user_id = v_uid), '[]'));

  return jsonb_build_object(
    'format', 'jobtrack-backup',
    'schema_version', 1,
    'exported_at', now(),
    'owner', (select jsonb_build_object('user_id', p.id, 'email', p.email) from public.profiles p where p.id = v_uid),
    'counts', jsonb_build_object(
      'companies', jsonb_array_length(v_data -> 'companies'),
      'selection_steps', jsonb_array_length(v_data -> 'selection_steps'),
      'events', jsonb_array_length(v_data -> 'events'),
      'tasks', jsonb_array_length(v_data -> 'tasks'),
      'timeline_entries', jsonb_array_length(v_data -> 'timeline_entries')),
    'data', v_data);
end;
$$;

-- ---------------------------------------------------------------------
-- 2. 復元（definer。操作できるのはログイン中の利用者自身のデータだけ、03・D-05）
--    1回の実行（1トランザクション）で: 検証 → 自分の既存データを削除 → ID を新しく振り直して参照を付け替えながら挿入
--    → 復元の記録を履歴に1件。どこかで失敗すれば全体が取り消され、既存データはそのまま残る。
--    ・所有者が違うバックアップは拒否する。user_id はファイルの値を使わず、常にログイン中の利用者
--    ・各列の値の検査は表の CHECK 制約に任せる（違反すれば全体が取り消される）
--    ・選考状態・応募日の整合・並び順などは、通常の追加と同じトリガーが決める
--    ・最終結果の記録日時と更新日時は、復元した時刻になる（DB が決める列のため）
--    本体は private の definer 関数、画面から呼ぶのは public の invoker の薄い関数（フェーズ1の管理者RPCと同じ形）
-- ---------------------------------------------------------------------
create function private.restore_my_data(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_data      jsonb := p_payload -> 'data';
  v_map       jsonb := '{}'::jsonb;
  v_trashed   uuid[] := '{}'::uuid[];
  v_new_id    uuid;
  r           jsonb;
  v_counts    jsonb;
  c_limit     constant integer := 5 * 1024 * 1024;
begin
  -- ---- 呼び出した人の確認
  if v_uid is null or not private.is_active_member() then
    raise exception 'ログインし直してください' using errcode = '42501';
  end if;

  -- ---- ファイルの形式
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > c_limit then
    raise exception 'バックアップのファイルが正しくないか、大きすぎます（5MBまで）' using errcode = '22023';
  end if;
  if p_payload ->> 'format' is distinct from 'jobtrack-backup' or p_payload -> 'schema_version' is distinct from '1'::jsonb then
    raise exception 'JobTrack のバックアップ（形式の版 1）ではありません' using errcode = '22023';
  end if;
  if p_payload #>> '{owner,user_id}' is distinct from v_uid::text then
    raise exception 'ほかの利用者のバックアップは復元できません' using errcode = '42501';
  end if;
  if jsonb_typeof(v_data) <> 'object'
     or exists (select 1 from unnest(array['companies', 'selection_steps', 'events', 'tasks', 'timeline_entries']) k
                where jsonb_typeof(v_data -> k) is distinct from 'array') then
    raise exception 'バックアップの中身の形が正しくありません' using errcode = '22023';
  end if;

  -- ---- 参照の整合（ID の重複、ステップ・予定・タスクの企業がバックアップの中にあるか）
  if (select count(*) <> count(distinct x ->> 'id') or bool_or(x ->> 'id' is null)
        from jsonb_array_elements(v_data -> 'companies') x) then
    raise exception '企業の ID が重複しているか、空です' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_data -> 'selection_steps') s
             where not exists (select 1 from jsonb_array_elements(v_data -> 'companies') c where c ->> 'id' = s ->> 'company_id'))
     or exists (select 1 from jsonb_array_elements(v_data -> 'events') e
                where e ->> 'company_id' is not null
                  and not exists (select 1 from jsonb_array_elements(v_data -> 'companies') c where c ->> 'id' = e ->> 'company_id'))
     or exists (select 1 from jsonb_array_elements(v_data -> 'tasks') t
                where t ->> 'company_id' is not null
                  and not exists (select 1 from jsonb_array_elements(v_data -> 'companies') c where c ->> 'id' = t ->> 'company_id')) then
    raise exception 'バックアップの中で、存在しない企業を参照している項目があります' using errcode = '22023';
  end if;

  -- ---- 自分の既存データを削除（企業の連動でステップ・予定・タスクも消える）
  delete from public.companies where user_id = v_uid;
  delete from public.events where user_id = v_uid;
  delete from public.tasks where user_id = v_uid;

  -- ---- プロフィールと通知設定（表示用の列と通知の好みだけ。メール送信の有効化と送信先は戻さない）
  if jsonb_typeof(v_data -> 'profile') = 'object' then
    update public.profiles set
      display_name    = v_data #>> '{profile,display_name}',
      graduation_year = (v_data #>> '{profile,graduation_year}')::smallint,
      purpose         = v_data #>> '{profile,purpose}'
     where id = v_uid;
  end if;
  if jsonb_typeof(v_data -> 'notification_settings') = 'object' then
    update public.notification_settings set
      types         = coalesce((select array_agg(x) from jsonb_array_elements_text(v_data #> '{notification_settings,types}') x), types),
      offsets_days  = coalesce((select array_agg(x::integer) from jsonb_array_elements_text(v_data #> '{notification_settings,offsets_days}') x), offsets_days),
      send_hour_jst = coalesce((v_data #>> '{notification_settings,send_hour_jst}')::smallint, send_hour_jst)
     where user_id = v_uid;
  end if;

  -- ---- 企業。ゴミ箱内の企業も、いったん通常の企業として入れ、子を入れた後にゴミ箱へ戻す
  for r in select x from jsonb_array_elements(v_data -> 'companies') x order by x ->> 'created_at', x ->> 'id' loop
    insert into public.companies (user_id, name, application_type, preference, application_status, applied_on, job_type,
                                  location, channel, recruit_url, mypage_url, login_id_hint, contact_person, memo,
                                  final_outcome, closed_reason, created_at)
    values (v_uid, r ->> 'name', r ->> 'application_type', (r ->> 'preference')::smallint,
            coalesce(r ->> 'application_status', 'not_applied'), (r ->> 'applied_on')::date, r ->> 'job_type',
            r ->> 'location', r ->> 'channel', r ->> 'recruit_url', r ->> 'mypage_url', r ->> 'login_id_hint',
            r ->> 'contact_person', r ->> 'memo', r ->> 'final_outcome', r ->> 'closed_reason',
            coalesce((r ->> 'created_at')::timestamptz, now()))
    returning id into v_new_id;
    v_map := v_map || jsonb_build_object(r ->> 'id', v_new_id);
    if r ->> 'deleted_at' is not null then
      v_trashed := v_trashed || v_new_id;
    end if;
  end loop;

  -- ---- 選考ステップ（企業ごとに元の並び順で入れる。並び順はトリガーが末尾から振る）
  for r in select x from jsonb_array_elements(v_data -> 'selection_steps') x
            order by x ->> 'company_id', (x ->> 'position')::integer, x ->> 'id' loop
    insert into public.selection_steps (user_id, company_id, kind, label, status, deadline_date, deadline_at, scheduled_at,
                                        scheduled_end_at, completed_at, result_expected_on, result_at, place, memo, created_at)
    values (v_uid, (v_map ->> (r ->> 'company_id'))::uuid, r ->> 'kind', r ->> 'label', coalesce(r ->> 'status', 'not_started'),
            (r ->> 'deadline_date')::date, (r ->> 'deadline_at')::timestamptz, (r ->> 'scheduled_at')::timestamptz,
            (r ->> 'scheduled_end_at')::timestamptz, (r ->> 'completed_at')::timestamptz,
            (r ->> 'result_expected_on')::date, (r ->> 'result_at')::timestamptz, r ->> 'place', r ->> 'memo',
            coalesce((r ->> 'created_at')::timestamptz, now()))
    returning id into v_new_id;
    v_map := v_map || jsonb_build_object(r ->> 'id', v_new_id);
  end loop;

  -- ---- 予定
  for r in select x from jsonb_array_elements(v_data -> 'events') x order by x ->> 'created_at', x ->> 'id' loop
    insert into public.events (user_id, company_id, kind, title, starts_at, ends_at, all_day_date, place, url, memo,
                               completed_at, created_at)
    values (v_uid, (v_map ->> (r ->> 'company_id'))::uuid, coalesce(r ->> 'kind', 'other'), r ->> 'title',
            (r ->> 'starts_at')::timestamptz, (r ->> 'ends_at')::timestamptz, (r ->> 'all_day_date')::date,
            r ->> 'place', r ->> 'url', r ->> 'memo', (r ->> 'completed_at')::timestamptz,
            coalesce((r ->> 'created_at')::timestamptz, now()))
    returning id into v_new_id;
    v_map := v_map || jsonb_build_object(r ->> 'id', v_new_id);
  end loop;

  -- ---- タスク
  for r in select x from jsonb_array_elements(v_data -> 'tasks') x order by x ->> 'created_at', x ->> 'id' loop
    insert into public.tasks (user_id, company_id, title, due_date, due_at, priority, memo, completed_at, created_at)
    values (v_uid, (v_map ->> (r ->> 'company_id'))::uuid, r ->> 'title', (r ->> 'due_date')::date,
            (r ->> 'due_at')::timestamptz, coalesce((r ->> 'priority')::smallint, 2), r ->> 'memo',
            (r ->> 'completed_at')::timestamptz, coalesce((r ->> 'created_at')::timestamptz, now()))
    returning id into v_new_id;
    v_map := v_map || jsonb_build_object(r ->> 'id', v_new_id);
  end loop;

  -- ---- ゴミ箱内だった企業を戻す
  update public.companies set deleted_at = now() where user_id = v_uid and id = any (v_trashed);

  -- ---- 履歴: 上の挿入でトリガーが書いた分を消し、バックアップの履歴を ID を付け替えて戻し、復元の記録を1件足す
  delete from public.timeline_entries where user_id = v_uid;
  insert into public.timeline_entries (user_id, company_id, entity_type, entity_id, action, summary, before, after, occurred_at)
  select v_uid, (v_map ->> (x ->> 'company_id'))::uuid, x ->> 'entity_type', (v_map ->> (x ->> 'entity_id'))::uuid,
         x ->> 'action', x ->> 'summary', x -> 'before', x -> 'after', coalesce((x ->> 'occurred_at')::timestamptz, now())
    from jsonb_array_elements(v_data -> 'timeline_entries') x
   -- 企業に紐付いていた履歴は、その企業がバックアップにあるものだけ戻す
   where x ->> 'company_id' is null or v_map ? (x ->> 'company_id');

  v_counts := jsonb_build_object(
    'companies', (select count(*) from public.companies where user_id = v_uid),
    'selection_steps', (select count(*) from public.selection_steps where user_id = v_uid),
    'events', (select count(*) from public.events where user_id = v_uid),
    'tasks', (select count(*) from public.tasks where user_id = v_uid));
  perform private.add_timeline(v_uid, null, 'company', null, 'backup_restored',
    'バックアップから復元（' || (p_payload ->> 'exported_at') || ' に書き出したもの）', null, v_counts);

  return v_counts;
end;
$$;

revoke all on function private.restore_my_data(jsonb) from public, anon;
grant execute on function private.restore_my_data(jsonb) to authenticated;

create function public.restore_my_data(p_payload jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.restore_my_data(p_payload);
$$;

revoke all on function public.export_my_data(), public.restore_my_data(jsonb) from public, anon;
grant execute on function public.export_my_data(), public.restore_my_data(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. 適用記録
-- ---------------------------------------------------------------------
insert into private.schema_migrations (version, description)
values ('20261103000002', 'フェーズ4: 全データの書き出しと復元');
