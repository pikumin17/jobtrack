-- =====================================================================
-- JobTrack フェーズ2: 選考ステップ・企業全体の選考状態の判定・変更履歴・ゴミ箱（設計書 v1.0）
-- バージョン: 20261013000002（20261013000001 の適用後に実行する）
--
-- 適用方法は既存と同じ（設計書 05 §7）。SQL Editor に全文を貼り付けて1回で実行する。
-- 既存の行は削除・変更しない。新しい表・関数・トリガーの追加と、選考状態のトリガー関数の置き換えだけを行う。
-- 既存の企業の選考状態が新しい判定で変わらないことを最後に確かめ、変わる場合は全体を取り消す（§8）。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 二重適用の防止と前提の確認
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from private.schema_migrations where version = '20261013000001') then
    raise exception '先に 20261013000001 を適用してください。';
  end if;
  if exists (select 1 from private.schema_migrations where version = '20261013000002') then
    raise exception 'マイグレーション 20261013000002 は適用済みです。再実行は不要です。';
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 1. 選考ステップ（02 §3.3）
--    所有者は user_id。親の企業とは (company_id, user_id) の複合外部キーで、他人の企業には付けられない。
-- ---------------------------------------------------------------------
create table public.selection_steps (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  company_id         uuid not null,
  position           integer not null default 0 check (position >= 0),
  kind               text not null check (kind in (
                       'es', 'webtest', 'aptitude', 'written_exam', 'gd', 'interview', 'casual', 'other')),
  label              text not null check (char_length(btrim(label)) between 1 and 50),
  status             text not null default 'not_started' check (status in (
                       'not_started', 'scheduled', 'done', 'awaiting_result', 'passed', 'failed', 'withdrawn', 'exempted')),
  deadline_date      date,
  deadline_at        timestamptz,
  scheduled_at       timestamptz,
  scheduled_end_at   timestamptz,
  completed_at       timestamptz,
  result_expected_on date,
  result_at          timestamptz,
  place              text check (char_length(place) <= 500),
  memo               text check (char_length(memo) <= 5000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint selection_steps_company_fk foreign key (company_id, user_id)
    references public.companies (id, user_id) on delete cascade,
  -- 今後の子テーブル（会話の記録など）の複合外部キーの参照先
  constraint selection_steps_id_user_id_key unique (id, user_id),
  -- 並替は1回の更新で番号を入れ替えるため、重複の検査は確定時に行う
  constraint selection_steps_position_key unique (company_id, position) deferrable initially deferred,
  -- 締切は終日か時刻ありのどちらか一方
  constraint selection_steps_one_deadline check (deadline_date is null or deadline_at is null),
  -- 終了日時は開始日時より前にできない（入力エラー、02 §3.5.5）
  constraint selection_steps_schedule_order check (
    scheduled_end_at is null or (scheduled_at is not null and scheduled_end_at >= scheduled_at))
);
create index selection_steps_user_company_idx on public.selection_steps (user_id, company_id);

create trigger selection_steps_set_updated_at before update on public.selection_steps
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. 変更履歴（02 §3.3）。書き込むのはトリガーだけで、利用者は読むだけ（S-10）
--    company_id には外部キーを張らない（ステップを消しても企業の履歴は残す）。
--    user_id は profiles への on delete cascade（アカウント完全削除で消える、v0.9 の規則）
-- ---------------------------------------------------------------------
create table public.timeline_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  company_id  uuid,
  entity_type text not null check (entity_type in ('company', 'step', 'event', 'task')),
  entity_id   uuid,
  action      text not null check (action in (
                'created', 'updated', 'status_changed', 'application_changed', 'outcome_changed',
                'preference_changed', 'deleted', 'restored', 'trashed', 'backup_restored')),
  summary     text not null,
  before      jsonb,
  after       jsonb,
  occurred_at timestamptz not null default now()
);
create index timeline_entries_user_company_idx on public.timeline_entries (user_id, company_id, occurred_at desc);

-- ---------------------------------------------------------------------
-- 3. 権限とRLS（03 §4.3）
-- ---------------------------------------------------------------------
revoke all on public.selection_steps, public.timeline_entries from public, anon, authenticated;

-- ステップ: id / user_id / 所属企業 / 日時は変更不可。並び順は追加時にトリガーが決め、並替RPCで変える
grant select, delete on public.selection_steps to authenticated;
grant insert (company_id, kind, label, status, deadline_date, deadline_at, scheduled_at, scheduled_end_at,
              completed_at, result_expected_on, result_at, place, memo)
  on public.selection_steps to authenticated;
grant update (position, kind, label, status, deadline_date, deadline_at, scheduled_at, scheduled_end_at,
              completed_at, result_expected_on, result_at, place, memo)
  on public.selection_steps to authenticated;

grant select on public.timeline_entries to authenticated;

alter table public.selection_steps  enable row level security;
alter table public.timeline_entries enable row level security;

create policy selection_steps_select on public.selection_steps for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_member()));
-- 追加・変更・削除は、親の企業が自分のもので、ゴミ箱に入っていないときだけ（N-4）
create policy selection_steps_insert on public.selection_steps for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_active_member())
              and exists (select 1 from public.companies c
                          where c.id = company_id and c.user_id = (select auth.uid()) and c.deleted_at is null));
create policy selection_steps_update on public.selection_steps for update to authenticated
  using      (user_id = (select auth.uid()) and (select private.is_active_member())
              and exists (select 1 from public.companies c
                          where c.id = company_id and c.user_id = (select auth.uid()) and c.deleted_at is null))
  with check (user_id = (select auth.uid()) and (select private.is_active_member())
              and exists (select 1 from public.companies c
                          where c.id = company_id and c.user_id = (select auth.uid()) and c.deleted_at is null));
create policy selection_steps_delete on public.selection_steps for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_member())
         and exists (select 1 from public.companies c
                     where c.id = company_id and c.user_id = (select auth.uid()) and c.deleted_at is null));

create policy timeline_entries_select on public.timeline_entries for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_member()));

-- ---------------------------------------------------------------------
-- 4. 企業全体の選考状態の判定（02 §3.5.3）
--    判定表そのものは入力だけで決まる関数にし、src/lib/status.ts と同じテストケースで検査する（2-02）
-- ---------------------------------------------------------------------
create function private.judge_selection_status(p_final_outcome text, p_steps jsonb, out status text, out reason text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_first_failed    integer;
  v_first_withdrawn integer;
begin
  -- 1. 利用者が「結果を記録」した値を最優先（E-6）
  if p_final_outcome is not null then
    status := p_final_outcome;
    return;
  end if;

  select min((e ->> 'position')::integer) filter (where e ->> 'status' = 'failed'),
         min((e ->> 'position')::integer) filter (where e ->> 'status' = 'withdrawn')
    into v_first_failed, v_first_withdrawn
    from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) e;

  -- 2. 不合格と辞退が混在（E-2）
  if v_first_failed is not null and v_first_withdrawn is not null then
    status := 'needs_review';
    reason := 'failed_and_withdrawn';
    return;
  end if;

  -- 3〜4. 不合格。後ろのステップが進んでいれば要確認（E-1）、未着手だけなら不合格（E-8）
  if v_first_failed is not null then
    if exists (select 1 from jsonb_array_elements(p_steps) e
               where (e ->> 'position')::integer > v_first_failed
                 and e ->> 'status' in ('scheduled', 'done', 'awaiting_result', 'passed')) then
      status := 'needs_review';
      reason := 'progress_after_failed';
    else
      status := 'rejected';
    end if;
    return;
  end if;

  -- 5〜6. 辞退
  if v_first_withdrawn is not null then
    if exists (select 1 from jsonb_array_elements(p_steps) e
               where (e ->> 'position')::integer > v_first_withdrawn
                 and e ->> 'status' in ('scheduled', 'done', 'awaiting_result', 'passed')) then
      status := 'needs_review';
      reason := 'progress_after_withdrawn';
    else
      status := 'withdrawn';
    end if;
    return;
  end if;

  -- 7. どれかが進んでいれば選考中（全通過でも内定とは推測しない、E-3）
  if exists (select 1 from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) e
             where e ->> 'status' in ('scheduled', 'done', 'awaiting_result', 'passed', 'exempted')) then
    status := 'in_progress';
    return;
  end if;

  -- 8. ステップなし、または全て未着手
  status := 'not_started';
end;
$$;
revoke all on function private.judge_selection_status(text, jsonb) from public, anon;
grant execute on function private.judge_selection_status(text, jsonb) to authenticated;

-- 企業の BEFORE トリガー（フェーズ1の暫定版を置き換える）。選考状態を計算するのはここだけ（N-11）
--   ・ゴミ箱内の企業は変更できない。できるのは復元（deleted_at を空にする）だけ（N-4）
--   ・最終結果の記録日時は DB が決める（N-10）
--   ・選考状態は自分のステップと最終結果から毎回計算し、画面から送られた値は使わない（S-16）
create or replace function private.companies_guard_selection_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.deleted_at is not null and new.deleted_at is not null then
      raise exception 'ゴミ箱に入っている企業は変更できません。先に復元してください' using errcode = '55000';
    end if;
    if new.final_outcome is distinct from old.final_outcome then
      new.final_outcome_at := case when new.final_outcome is null then null else now() end;
    else
      new.final_outcome_at := old.final_outcome_at;
    end if;
  else
    new.final_outcome_at := case when new.final_outcome is null then null else now() end;
  end if;

  select j.status, j.reason
    into new.selection_status, new.selection_status_reason
    from private.judge_selection_status(
           new.final_outcome,
           (select jsonb_agg(jsonb_build_object('position', s.position, 'status', s.status))
              from public.selection_steps s
             where s.company_id = new.id and s.user_id = new.user_id)) j;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. ステップのトリガー
-- ---------------------------------------------------------------------

-- 追加時: 並び順は末尾に付ける（画面からの値は使わない）。同じ企業への同時追加は企業の行のロックで順番にする
create function private.selection_steps_set_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.companies c where c.id = new.company_id and c.user_id = new.user_id for update;
  select coalesce(max(s.position) + 1, 0) into new.position
    from public.selection_steps s
   where s.company_id = new.company_id;
  return new;
end;
$$;
revoke all on function private.selection_steps_set_position() from public, anon, authenticated;

create trigger selection_steps_set_position before insert on public.selection_steps
  for each row execute function private.selection_steps_set_position();

-- 表示用の名前（履歴の文に使う）
create function private.step_status_label(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'not_started' then '未着手' when 'scheduled' then '対応予定' when 'done' then '実施/提出済み'
    when 'awaiting_result' then '結果待ち' when 'passed' then '通過' when 'failed' then '不合格'
    when 'withdrawn' then '辞退' when 'exempted' then '免除' else p_status end;
$$;

create function private.outcome_label(p_outcome text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_outcome
    when 'offer' then '内定' when 'offer_accepted' then '内定承諾' when 'offer_declined' then '内定辞退'
    when 'rejected' then '不合格' when 'withdrawn' then '辞退' when 'closed_other' then '終了（その他）'
    else p_outcome end;
$$;

create function private.preference_label(p_preference integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_preference
    when 5 then '5 第一志望' when 4 then '4 本命候補' when 3 then '3 興味あり'
    when 2 then '2 情報収集中' when 1 then '1 優先度低' else '未設定' end;
$$;

create function private.column_label(p_column text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_column
    when 'name' then '企業名' when 'application_type' then '応募区分' when 'job_type' then '職種'
    when 'location' then '勤務地' when 'channel' then '応募経路' when 'recruit_url' then '採用ページ'
    when 'mypage_url' then 'マイページ' when 'login_id_hint' then 'ログインIDのヒント'
    when 'contact_person' then '担当者' when 'memo' then 'メモ' when 'kind' then '種別' when 'label' then '名前'
    when 'deadline_date' then '締切' when 'deadline_at' then '締切' when 'scheduled_at' then '実施日時'
    when 'scheduled_end_at' then '終了日時' when 'completed_at' then '完了日' when 'result_expected_on' then '結果通知予定日'
    when 'result_at' then '結果の日時' when 'place' then '場所' else p_column end;
$$;

revoke all on function private.step_status_label(text), private.outcome_label(text),
                       private.preference_label(integer), private.column_label(text)
  from public, anon;

-- 2つの行（jsonb）で値が違う列だけを取り出す
create function private.changed_columns(p_old jsonb, p_new jsonb, p_columns text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(c order by ord), '{}')
    from unnest(p_columns) with ordinality t(c, ord)
   where p_old -> c is distinct from p_new -> c;
$$;

create function private.pick(p_row jsonb, p_columns text[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(c, p_row -> c), '{}'::jsonb) from unnest(p_columns) c;
$$;

revoke all on function private.changed_columns(jsonb, jsonb, text[]), private.pick(jsonb, text[]) from public, anon;

-- 履歴の書き込み（definer）。書き込み先の user_id は変更された行のもので、ログイン中の利用者とも一致を確認する（03 §4.4）
create function private.add_timeline(
  p_user_id uuid, p_company_id uuid, p_entity_type text, p_entity_id uuid,
  p_action text, p_summary text, p_before jsonb, p_after jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception '他の利用者の履歴は書き込めません' using errcode = '42501';
  end if;
  insert into public.timeline_entries (user_id, company_id, entity_type, entity_id, action, summary, before, after)
  values (p_user_id, p_company_id, p_entity_type, p_entity_id, p_action, p_summary, p_before, p_after);
end;
$$;
revoke all on function private.add_timeline(uuid, uuid, text, uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated;

-- ステップの変更後: 親の企業の更新日時を進めて選考状態を再計算させ（N-2, N-11）、履歴を1件残す
create function private.selection_steps_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row     public.selection_steps;
  v_old     jsonb;
  v_new     jsonb;
  v_cols    constant text[] := array['kind', 'label', 'status', 'deadline_date', 'deadline_at', 'scheduled_at',
                                     'scheduled_end_at', 'completed_at', 'result_expected_on', 'result_at', 'place', 'memo'];
  v_changed text[];
begin
  v_row := case when tg_op = 'DELETE' then old else new end;

  -- アカウント削除・企業の完全削除の連動で消えている途中なら何もしない（履歴も残さない、N-3）
  if not exists (select 1 from public.profiles p where p.id = v_row.user_id)
     or not exists (select 1 from public.companies c where c.id = v_row.company_id and c.user_id = v_row.user_id) then
    return null;
  end if;

  update public.companies set updated_at = now() where id = v_row.company_id and user_id = v_row.user_id;

  if tg_op = 'INSERT' then
    v_new := private.pick(to_jsonb(new), v_cols);
    perform private.add_timeline(new.user_id, new.company_id, 'step', new.id, 'created',
      'ステップを追加: ' || new.label, null, jsonb_strip_nulls(v_new));
  elsif tg_op = 'DELETE' then
    v_old := private.pick(to_jsonb(old), v_cols);
    perform private.add_timeline(old.user_id, old.company_id, 'step', old.id, 'deleted',
      'ステップを削除: ' || old.label, jsonb_strip_nulls(v_old), null);
  else
    -- 並び順・更新日時だけの変化は記録しない（並替は文単位のトリガーで1件にまとめる、N-5）
    v_changed := private.changed_columns(to_jsonb(old), to_jsonb(new), v_cols);
    if cardinality(v_changed) = 0 then
      return null;
    end if;
    v_old := private.pick(to_jsonb(old), v_changed);
    v_new := private.pick(to_jsonb(new), v_changed);
    if new.status is distinct from old.status then
      perform private.add_timeline(new.user_id, new.company_id, 'step', new.id, 'status_changed',
        new.label || ': ' || private.step_status_label(old.status) || ' → ' || private.step_status_label(new.status),
        v_old, v_new);
    else
      perform private.add_timeline(new.user_id, new.company_id, 'step', new.id, 'updated',
        new.label || 'を更新: ' || (select string_agg(distinct private.column_label(c), '・') from unnest(v_changed) c),
        v_old, v_new);
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.selection_steps_after_change() from public, anon, authenticated;

create trigger selection_steps_after_change after insert or update or delete on public.selection_steps
  for each row execute function private.selection_steps_after_change();

-- 並替: 1回の更新（1文）につき、企業ごとに「ステップの順番を変更」を1件だけ記録する（N-5, 2-23）
create function private.selection_steps_log_reorder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select distinct n.user_id, n.company_id
      from new_rows n join old_rows o on o.id = n.id
     where o.position <> n.position
  loop
    if exists (select 1 from public.profiles p where p.id = r.user_id) then
      perform private.add_timeline(r.user_id, r.company_id, 'company', r.company_id, 'updated', 'ステップの順番を変更',
        jsonb_build_object('order', (select jsonb_agg(o.label order by o.position) from old_rows o where o.company_id = r.company_id)),
        jsonb_build_object('order', (select jsonb_agg(n.label order by n.position) from new_rows n where n.company_id = r.company_id)));
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.selection_steps_log_reorder() from public, anon, authenticated;

create trigger selection_steps_log_reorder after update on public.selection_steps
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.selection_steps_log_reorder();

-- ---------------------------------------------------------------------
-- 6. 企業の履歴（02 §3.3）。利用者が入力する列の変化だけを記録する（自動計算の列は記録しない）
-- ---------------------------------------------------------------------
create function private.companies_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_info    constant text[] := array['name', 'application_type', 'job_type', 'location', 'channel', 'recruit_url',
                                     'mypage_url', 'login_id_hint', 'contact_person', 'memo'];
  v_changed text[];
  v_summary text;
begin
  if not exists (select 1 from public.profiles p where p.id = new.user_id) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    perform private.add_timeline(new.user_id, new.id, 'company', new.id, 'created', '企業を登録: ' || new.name, null,
      jsonb_strip_nulls(private.pick(to_jsonb(new), v_info || array['application_status', 'applied_on', 'preference'])));
    return null;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  -- ゴミ箱への移動・復元
  if old.deleted_at is null and new.deleted_at is not null then
    perform private.add_timeline(new.user_id, new.id, 'company', new.id, 'trashed', 'ゴミ箱に移動', null, null);
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform private.add_timeline(new.user_id, new.id, 'company', new.id, 'restored', 'ゴミ箱から復元', null, null);
  end if;

  -- 応募状態・応募日（02 §3.5.1）
  v_changed := private.changed_columns(v_old, v_new, array['application_status', 'applied_on']);
  if cardinality(v_changed) > 0 then
    if new.application_status is distinct from old.application_status then
      v_summary := '応募状態: '
        || case old.application_status when 'applied' then '応募済み' else '未応募' end || ' → '
        || case new.application_status when 'applied' then '応募済み' else '未応募' end
        || case when new.applied_on is not null then '（応募日 ' || to_char(new.applied_on, 'FMMM/FMDD') || '）' else '' end;
    else
      v_summary := '応募日を変更: ' || coalesce(to_char(old.applied_on, 'FMMM/FMDD'), '—')
        || ' → ' || coalesce(to_char(new.applied_on, 'FMMM/FMDD'), '—');
    end if;
    perform private.add_timeline(new.user_id, new.id, 'company', new.id, 'application_changed', v_summary,
      private.pick(v_old, v_changed), private.pick(v_new, v_changed));
  end if;

  -- 結果の記録・選考終了理由
  v_changed := private.changed_columns(v_old, v_new, array['final_outcome', 'closed_reason']);
  if cardinality(v_changed) > 0 then
    v_summary := case
      when new.final_outcome is distinct from old.final_outcome and new.final_outcome is null then '結果の記録を取り消し'
      when new.final_outcome is distinct from old.final_outcome then '結果を記録: ' || private.outcome_label(new.final_outcome)
      else '選考終了の理由を変更' end;
    perform private.add_timeline(new.user_id, new.id, 'company', new.id, 'outcome_changed', v_summary,
      private.pick(v_old, v_changed), private.pick(v_new, v_changed));
  end if;

  -- 志望度
  if new.preference is distinct from old.preference then
    perform private.add_timeline(new.user_id, new.id, 'company', new.id, 'preference_changed',
      '志望度: ' || private.preference_label(old.preference) || ' → ' || private.preference_label(new.preference),
      jsonb_build_object('preference', old.preference), jsonb_build_object('preference', new.preference));
  end if;

  -- そのほかの企業情報
  v_changed := private.changed_columns(v_old, v_new, v_info);
  if cardinality(v_changed) > 0 then
    perform private.add_timeline(new.user_id, new.id, 'company', new.id, 'updated',
      '企業情報を更新: ' || (select string_agg(private.column_label(c), '・') from unnest(v_changed) c),
      private.pick(v_old, v_changed), private.pick(v_new, v_changed));
  end if;
  return null;
end;
$$;
revoke all on function private.companies_after_change() from public, anon, authenticated;

create trigger companies_after_change after insert or update on public.companies
  for each row execute function private.companies_after_change();

-- 企業の完全削除: その企業の履歴もすべて消す（N-3 案a）。完全削除の操作自体も記録しない
create function private.companies_purge_timeline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.timeline_entries t where t.company_id = old.id and t.user_id = old.user_id;
  return null;
end;
$$;
revoke all on function private.companies_purge_timeline() from public, anon, authenticated;

create trigger companies_purge_timeline after delete on public.companies
  for each row execute function private.companies_purge_timeline();

-- ---------------------------------------------------------------------
-- 7. RPC（02 §3.9）。すべて security invoker で、RLS の下で自分の行だけを操作する
-- ---------------------------------------------------------------------

-- 並替: 企業の全ステップを、指定した順に並べ直す（1トランザクション）。他人の・別の企業のステップが混ざれば全体を拒否（2-05）
create function public.reorder_steps(p_company_id uuid, p_step_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.companies c where c.id = p_company_id and c.deleted_at is null for update;
  if not found then
    raise exception '企業が見つかりません' using errcode = 'P0002';
  end if;
  if p_step_ids is null
     or cardinality(p_step_ids) <> (select count(distinct x) from unnest(p_step_ids) x)
     or cardinality(p_step_ids) <> (select count(*) from public.selection_steps s where s.company_id = p_company_id)
     or exists (select 1 from unnest(p_step_ids) x
                where not exists (select 1 from public.selection_steps s where s.id = x and s.company_id = p_company_id)) then
    raise exception '並び順の指定が正しくありません（この企業のステップを、すべて1回ずつ指定してください）' using errcode = '22023';
  end if;
  update public.selection_steps s
     set position = t.ord - 1
    from unnest(p_step_ids) with ordinality t(id, ord)
   where s.id = t.id and s.company_id = p_company_id and s.position <> t.ord - 1;
end;
$$;

create function public.trash_company(p_company_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.companies set deleted_at = now() where id = p_company_id and deleted_at is null;
  if not found then
    raise exception '企業が見つかりません' using errcode = 'P0002';
  end if;
end;
$$;

create function public.restore_company(p_company_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.companies set deleted_at = null where id = p_company_id and deleted_at is not null;
  if not found then
    raise exception 'ゴミ箱に見つかりません' using errcode = 'P0002';
  end if;
end;
$$;

-- 完全削除はゴミ箱内の企業だけ。ステップは連動して消え、履歴はトリガーが消す
create function public.purge_company(p_company_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.companies where id = p_company_id and deleted_at is not null;
  if not found then
    raise exception 'ゴミ箱に見つかりません' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.reorder_steps(uuid, uuid[]), public.trash_company(uuid),
                       public.restore_company(uuid), public.purge_company(uuid)
  from public, anon;
grant execute on function public.reorder_steps(uuid, uuid[]), public.trash_company(uuid),
                          public.restore_company(uuid), public.purge_company(uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- 8. 既存の企業の確認: 新しい判定でも選考状態が変わらないこと（更新日時を書き換えないため再計算はしない）
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.companies c
               cross join lateral private.judge_selection_status(c.final_outcome, '[]'::jsonb) j
              where j.status is distinct from c.selection_status
                 or j.reason is distinct from c.selection_status_reason) then
    raise exception '新しい判定で選考状態が変わる企業があります。適用を中止しました（何も変更されていません）。';
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 9. 適用記録
-- ---------------------------------------------------------------------
insert into private.schema_migrations (version, description)
values ('20261013000002', 'フェーズ2: 選考ステップ・選考状態の判定・変更履歴・ゴミ箱');
