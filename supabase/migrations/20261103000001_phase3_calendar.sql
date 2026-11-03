-- =====================================================================
-- JobTrack フェーズ3（前半）: 予定・個人タスク・カレンダー（設計書 v1.0、02 §3.3・§3.6）
-- バージョン: 20261103000001（20261013000002 の適用後に実行する）
--
-- 適用方法は既存と同じ。SQL Editor に全文を貼り付けて1回で実行する。
-- 既存の行は削除・変更しない。新しい表・ビュー・関数・トリガーの追加だけを行う。
-- メール通知（pg_cron・Edge Function・配信サービス）はこのファイルに含めない（持ち主の判断で後回し、2026-11-03）。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 二重適用の防止と前提の確認
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from private.schema_migrations where version = '20261013000002') then
    raise exception '先に 20261013000002 を適用してください。';
  end if;
  if exists (select 1 from private.schema_migrations where version = '20261103000001') then
    raise exception 'マイグレーション 20261103000001 は適用済みです。再実行は不要です。';
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 1. 予定（説明会・インターン・OB訪問など、選考ステップ以外の日時つき予定。02 §3.3、B-5）
--    企業との紐付けは任意。紐付けるときは (company_id, user_id) の複合外部キーで他人の企業を指せない。
--    日時は「時刻あり（starts_at）」か「終日（all_day_date）」のどちらか一方が必須。
-- ---------------------------------------------------------------------
create table public.events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  company_id    uuid,
  kind          text not null default 'other' check (kind in ('briefing', 'internship', 'ob_visit', 'other')),
  title         text not null check (char_length(btrim(title)) between 1 and 100),
  starts_at     timestamptz,
  ends_at       timestamptz,
  all_day_date  date,
  place         text check (char_length(place) <= 500),
  url           text check (char_length(url) <= 2000 and url ~ '^https?://'),
  memo          text check (char_length(memo) <= 5000),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint events_company_fk foreign key (company_id, user_id)
    references public.companies (id, user_id) on delete cascade,
  constraint events_id_user_id_key unique (id, user_id),
  constraint events_one_when check ((starts_at is null) <> (all_day_date is null)),
  constraint events_end_after_start check (ends_at is null or (starts_at is not null and ends_at >= starts_at))
);
create index events_user_starts_idx on public.events (user_id, starts_at);
create index events_user_day_idx on public.events (user_id, all_day_date);
create index events_user_company_idx on public.events (user_id, company_id);

create trigger events_set_updated_at before update on public.events
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. 個人タスク（02 §3.3）。期日は任意（終日か時刻ありのどちらか一方まで）。1=高（ホームの「優先タスク」）
-- ---------------------------------------------------------------------
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  company_id    uuid,
  title         text not null check (char_length(btrim(title)) between 1 and 100),
  due_date      date,
  due_at        timestamptz,
  priority      smallint not null default 2 check (priority between 1 and 3),
  memo          text check (char_length(memo) <= 5000),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint tasks_company_fk foreign key (company_id, user_id)
    references public.companies (id, user_id) on delete cascade,
  constraint tasks_id_user_id_key unique (id, user_id),
  constraint tasks_one_due check (due_date is null or due_at is null)
);
create index tasks_user_open_idx on public.tasks (user_id, completed_at);
create index tasks_user_company_idx on public.tasks (user_id, company_id);

create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. 権限とRLS（03 §4.3 と同じ雛形）
--    追加・変更・削除は、企業に紐付けるならその企業が自分のもので、ゴミ箱に入っていないときだけ（N-4 と同じ）
-- ---------------------------------------------------------------------
revoke all on public.events, public.tasks from public, anon, authenticated;

grant select, delete on public.events, public.tasks to authenticated;
grant insert (company_id, kind, title, starts_at, ends_at, all_day_date, place, url, memo, completed_at),
      update (company_id, kind, title, starts_at, ends_at, all_day_date, place, url, memo, completed_at)
  on public.events to authenticated;
grant insert (company_id, title, due_date, due_at, priority, memo, completed_at),
      update (company_id, title, due_date, due_at, priority, memo, completed_at)
  on public.tasks to authenticated;

alter table public.events enable row level security;
alter table public.tasks  enable row level security;

-- 紐付け先の企業が、自分のもので、ゴミ箱に入っていないこと（紐付けなしは常に可）
create function private.company_writable(p_company_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_company_id is null
      or exists (select 1 from public.companies c
                  where c.id = p_company_id and c.user_id = (select auth.uid()) and c.deleted_at is null);
$$;
revoke all on function private.company_writable(uuid) from public, anon;
grant execute on function private.company_writable(uuid) to authenticated;

create policy events_select on public.events for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_member()));
create policy events_insert on public.events for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_active_member()) and private.company_writable(company_id));
create policy events_update on public.events for update to authenticated
  using      (user_id = (select auth.uid()) and (select private.is_active_member()) and private.company_writable(company_id))
  with check (user_id = (select auth.uid()) and (select private.is_active_member()) and private.company_writable(company_id));
create policy events_delete on public.events for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_member()) and private.company_writable(company_id));

create policy tasks_select on public.tasks for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_member()));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_active_member()) and private.company_writable(company_id));
create policy tasks_update on public.tasks for update to authenticated
  using      (user_id = (select auth.uid()) and (select private.is_active_member()) and private.company_writable(company_id))
  with check (user_id = (select auth.uid()) and (select private.is_active_member()) and private.company_writable(company_id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_member()) and private.company_writable(company_id));

-- ---------------------------------------------------------------------
-- 4. 履歴（02 §3.3）。予定・タスクの追加・変更・完了・削除をトリガーで記録する（利用者は書けない、S-10）
--    企業に紐付いたものはその企業の履歴にも出る（company_id）。紐付けのないものは company_id が空の履歴になる。
-- ---------------------------------------------------------------------
create function private.event_kind_label(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind when 'briefing' then '説明会' when 'internship' then 'インターン'
                     when 'ob_visit' then 'OB・OG訪問' when 'other' then '予定' else p_kind end;
$$;
revoke all on function private.event_kind_label(text) from public, anon;

create function private.events_tasks_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row     record;
  v_entity  text := case tg_table_name when 'events' then 'event' else 'task' end;
  v_noun    text := case tg_table_name when 'events' then '予定' else 'タスク' end;
  v_cols    text[];
  v_changed text[];
  v_old     jsonb;
  v_new     jsonb;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  v_cols := case tg_table_name
    when 'events' then array['company_id', 'kind', 'title', 'starts_at', 'ends_at', 'all_day_date', 'place', 'url', 'memo', 'completed_at']
    else array['company_id', 'title', 'due_date', 'due_at', 'priority', 'memo', 'completed_at'] end;

  -- アカウント削除・企業の完全削除の連動で消えている途中なら何もしない（N-3）
  if not exists (select 1 from public.profiles p where p.id = v_row.user_id)
     or (v_row.company_id is not null
         and not exists (select 1 from public.companies c where c.id = v_row.company_id and c.user_id = v_row.user_id)) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    perform private.add_timeline(new.user_id, new.company_id, v_entity, new.id, 'created',
      v_noun || 'を追加: ' || new.title, null, jsonb_strip_nulls(private.pick(to_jsonb(new), v_cols)));
  elsif tg_op = 'DELETE' then
    perform private.add_timeline(old.user_id, old.company_id, v_entity, old.id, 'deleted',
      v_noun || 'を削除: ' || old.title, jsonb_strip_nulls(private.pick(to_jsonb(old), v_cols)), null);
  else
    v_changed := private.changed_columns(to_jsonb(old), to_jsonb(new), v_cols);
    if cardinality(v_changed) = 0 then
      return null;
    end if;
    v_old := private.pick(to_jsonb(old), v_changed);
    v_new := private.pick(to_jsonb(new), v_changed);
    if (old.completed_at is null) <> (new.completed_at is null) then
      perform private.add_timeline(new.user_id, new.company_id, v_entity, new.id, 'status_changed',
        new.title || ': ' || case when new.completed_at is null then '未完了に戻す' else '完了' end, v_old, v_new);
    else
      perform private.add_timeline(new.user_id, new.company_id, v_entity, new.id, 'updated',
        v_noun || 'を更新: ' || new.title, v_old, v_new);
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.events_tasks_after_change() from public, anon, authenticated;

create trigger events_after_change after insert or update or delete on public.events
  for each row execute function private.events_tasks_after_change();
create trigger tasks_after_change after insert or update or delete on public.tasks
  for each row execute function private.events_tasks_after_change();

-- ---------------------------------------------------------------------
-- 5. カレンダーの単一データソース（02 §3.6、K-03）
--    専用の表は作らず、元の表を束ねる読み取り専用のビュー。security_invoker で元の表の RLS が効く。
--    ゴミ箱内の企業に紐付く項目は出さない。編集・完了は source_table / source_id で元の行を直接更新する。
--    item_type: es_deadline / test_deadline / deadline / step_scheduled / result_expected / event / task
-- ---------------------------------------------------------------------
create view public.calendar_items with (security_invoker = true) as
  -- 選考ステップの締切
  select 'selection_steps'::text as source_table, s.id as source_id, s.company_id, c.name as company_name,
         case when s.kind = 'es' then 'es_deadline'
              when s.kind in ('webtest', 'aptitude', 'written_exam') then 'test_deadline'
              else 'deadline' end as item_type,
         s.label as title,
         s.deadline_at as starts_at, null::timestamptz as ends_at, s.deadline_date as all_day_date,
         s.status not in ('not_started', 'scheduled') as done,
         null::smallint as priority
    from public.selection_steps s
    join public.companies c on c.id = s.company_id and c.user_id = s.user_id
   where c.deleted_at is null and (s.deadline_at is not null or s.deadline_date is not null)
  union all
  -- 面接・GD などの実施日時
  select 'selection_steps', s.id, s.company_id, c.name, 'step_scheduled', s.label,
         s.scheduled_at, s.scheduled_end_at, null::date,
         s.status not in ('not_started', 'scheduled'), null::smallint
    from public.selection_steps s
    join public.companies c on c.id = s.company_id and c.user_id = s.user_id
   where c.deleted_at is null and s.scheduled_at is not null
  union all
  -- 結果通知予定（結果待ちのものだけ）
  select 'selection_steps', s.id, s.company_id, c.name, 'result_expected', s.label,
         null::timestamptz, null::timestamptz, s.result_expected_on, false, null::smallint
    from public.selection_steps s
    join public.companies c on c.id = s.company_id and c.user_id = s.user_id
   where c.deleted_at is null and s.status = 'awaiting_result' and s.result_expected_on is not null
  union all
  -- 予定
  select 'events', e.id, e.company_id, c.name, 'event', e.title,
         e.starts_at, e.ends_at, e.all_day_date, e.completed_at is not null, null::smallint
    from public.events e
    left join public.companies c on c.id = e.company_id and c.user_id = e.user_id
   where e.company_id is null or c.deleted_at is null
  union all
  -- 期日のある個人タスク
  select 'tasks', t.id, t.company_id, c.name, 'task', t.title,
         t.due_at, null::timestamptz, t.due_date, t.completed_at is not null, t.priority
    from public.tasks t
    left join public.companies c on c.id = t.company_id and c.user_id = t.user_id
   where (t.due_at is not null or t.due_date is not null) and (t.company_id is null or c.deleted_at is null);

revoke all on public.calendar_items from public, anon, authenticated;
grant select on public.calendar_items to authenticated;

-- ---------------------------------------------------------------------
-- 6. 適用記録
-- ---------------------------------------------------------------------
insert into private.schema_migrations (version, description)
values ('20261103000001', 'フェーズ3（前半）: 予定・個人タスク・カレンダー');
