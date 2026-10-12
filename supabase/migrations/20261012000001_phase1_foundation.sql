-- =====================================================================
-- JobTrack フェーズ1: 基盤（招待制・プロフィール・企業・RLS・管理者RPC）
-- バージョン: 20261012000001
--
-- 適用方法（設計書 05 §7）:
--   Supabase ダッシュボード → SQL Editor → New query に全文を貼り付けて Run。
--   全体が1回の実行（1トランザクション）として扱われ、途中でエラーになれば何も変更されない。
--   2回目に実行すると、冒頭の確認で止まる（二重適用の防止）。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 適用記録と二重適用の防止
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;

create table if not exists private.schema_migrations (
  version     text primary key,
  description text not null,
  applied_at  timestamptz not null default now()
);
revoke all on private.schema_migrations from public, anon, authenticated;

do $$
begin
  if exists (select 1 from private.schema_migrations where version = '20261012000001') then
    raise exception 'マイグレーション 20261012000001 は適用済みです。再実行は不要です。';
  end if;
end
$$;

-- RLS ポリシーからヘルパー関数を呼ぶため、ログイン済みの利用者にはスキーマの利用だけ許可する。
-- private スキーマは Data API に公開されないため、外部から直接は呼べない。
grant usage on schema private to authenticated;

-- 今後 public に作るテーブル・関数を、未ログイン（anon）に自動公開しない
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------------
-- 1. 共通トリガー関数
-- ---------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. テーブル
-- ---------------------------------------------------------------------

-- 利用者プロフィール（auth.users 作成時にトリガーで作られる）
create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  email                   text not null unique check (email = lower(email)),
  role                    text not null default 'member' check (role in ('admin', 'member')),
  status                  text not null default 'active' check (status in ('active', 'suspended')),
  display_name            text check (char_length(display_name) <= 50),
  graduation_year         smallint check (graduation_year between 2000 and 2100),
  purpose                 text check (char_length(purpose) <= 200),
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- 招待＝許可リスト。利用者は直接読み書きできない（管理者RPCのみ）
create table public.allowed_emails (
  email      text primary key check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  invited_by uuid references public.profiles (id) on delete set null,
  note       text check (char_length(note) <= 100),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- 管理者操作の記録（A-6）
create table public.admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null check (action in ('invite', 'revoke', 'restore_access')),
  target_email text not null,
  created_at   timestamptz not null default now()
);

-- メール通知設定（1ユーザー1行。フェーズ1では行の作成のみ。送信はフェーズ3）
create table public.notification_settings (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  email_enabled     boolean not null default false,
  email_address     text check (email_address = lower(email_address)),
  email_verified_at timestamptz,
  types             text[] not null default array['es_deadline', 'webtest_deadline', 'interview', 'event', 'task', 'result_overdue']
                    check (types <@ array['es_deadline', 'webtest_deadline', 'interview', 'event', 'task', 'result_overdue']),
  offsets_days      integer[] not null default array[3, 1, 0] check (offsets_days <@ array[7, 3, 1, 0]),
  send_hour_jst     smallint not null default 8 check (send_hour_jst between 0 and 23),
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 企業（全列をフェーズ1で作成。応募操作・志望度入力・選考状態の本格判定はフェーズ2）
create table public.companies (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name                    text not null check (char_length(btrim(name)) between 1 and 100),
  application_type        text check (application_type in ('main', 'internship', 'early', 'other')),
  preference              smallint check (preference between 1 and 5),
  application_status      text not null default 'not_applied' check (application_status in ('not_applied', 'applied')),
  applied_on              date,
  job_type                text check (char_length(job_type) <= 100),
  location                text check (char_length(location) <= 100),
  channel                 text check (channel in ('company_site', 'job_site', 'reverse_offer', 'agent', 'school', 'other')),
  recruit_url             text check (recruit_url ~ '^https?://' and char_length(recruit_url) <= 2048),
  mypage_url              text check (mypage_url ~ '^https?://' and char_length(mypage_url) <= 2048),
  login_id_hint           text check (char_length(login_id_hint) <= 200),
  contact_person          text check (char_length(contact_person) <= 100),
  memo                    text check (char_length(memo) <= 5000),
  selection_status        text not null default 'not_started' check (selection_status in (
                            'not_started', 'in_progress', 'offer', 'offer_accepted', 'offer_declined',
                            'rejected', 'withdrawn', 'closed_other', 'needs_review')),
  selection_status_reason text check (selection_status_reason in (
                            'failed_and_withdrawn', 'progress_after_failed', 'progress_after_withdrawn')),
  final_outcome           text check (final_outcome in (
                            'offer', 'offer_accepted', 'offer_declined', 'rejected', 'withdrawn', 'closed_other')),
  final_outcome_at        timestamptz,
  closed_reason           text check (closed_reason in (
                            'rejected_document', 'rejected_webtest', 'rejected_interview', 'withdrawn_other_offer',
                            'withdrawn_lost_interest', 'withdrawn_schedule', 'offer_declined', 'other')),
  deleted_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- 応募済み ⇔ 応募日あり（仕様変更1）
  constraint companies_applied_on_consistent check ((application_status = 'applied') = (applied_on is not null)),
  constraint companies_final_outcome_at_consistent check ((final_outcome is null) = (final_outcome_at is null)),
  constraint companies_reason_only_when_needs_review check (
    selection_status_reason is null or selection_status = 'needs_review'),
  -- 子テーブルの複合外部キー (company_id, user_id) の参照先（フェーズ2）
  constraint companies_id_user_id_key unique (id, user_id)
);

create index companies_user_selection_idx   on public.companies (user_id, deleted_at, selection_status);
create index companies_user_application_idx on public.companies (user_id, deleted_at, application_status);
create index companies_user_updated_idx     on public.companies (user_id, updated_at desc);
create index allowed_emails_invited_by_idx  on public.allowed_emails (invited_by);
create index admin_audit_log_actor_idx      on public.admin_audit_log (actor_id);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger notification_settings_set_updated_at before update on public.notification_settings
  for each row execute function private.set_updated_at();
create trigger companies_set_updated_at before update on public.companies
  for each row execute function private.set_updated_at();

-- 企業全体の選考状態は DB が決める。画面から送られた値は使わない（03 §4.3, S-16）。
-- フェーズ1は選考ステップがないため「記録された結果、なければ選考前」。フェーズ2で判定表（02 §3.5.3）に置き換える。
create function private.companies_guard_selection_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.selection_status := coalesce(new.final_outcome, 'not_started');
  new.selection_status_reason := null;
  return new;
end;
$$;
revoke all on function private.companies_guard_selection_status() from public, anon, authenticated;

create trigger companies_guard_selection_status before insert or update on public.companies
  for each row execute function private.companies_guard_selection_status();

-- ---------------------------------------------------------------------
-- 3. ヘルパー関数（RLS から呼ぶ）
-- ---------------------------------------------------------------------
create function private.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  );
$$;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active' and p.role = 'admin'
  );
$$;

revoke all on function private.is_active_member() from public, anon;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_active_member() to authenticated;
grant execute on function private.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 4. 権限（テーブル単位・列単位）
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.allowed_emails, public.admin_audit_log,
              public.notification_settings, public.companies
  from public, anon, authenticated;

-- profiles: 読むのは自分の行だけ。更新できるのは表示用の列だけ（role / status は不可, S-07）
grant select on public.profiles to authenticated;
grant update (display_name, graduation_year, purpose, onboarding_completed_at) on public.profiles to authenticated;

-- notification_settings: 確認済み日時と停止用トークンは利用者が変更できない
grant select on public.notification_settings to authenticated;
grant update (email_enabled, email_address, types, offsets_days, send_hour_jst) on public.notification_settings to authenticated;

-- companies: id / user_id / 作成日時は更新不可（S-04）。選考状態はトリガーが上書きする
grant select, insert, delete on public.companies to authenticated;
grant update (name, application_type, preference, application_status, applied_on, job_type, location, channel,
              recruit_url, mypage_url, login_id_hint, contact_person, memo, final_outcome, final_outcome_at,
              closed_reason, deleted_at, selection_status, selection_status_reason)
  on public.companies to authenticated;

-- allowed_emails / admin_audit_log: 利用者には一切の権限を与えない（管理者RPC経由のみ）

-- ---------------------------------------------------------------------
-- 5. RLS（行単位のアクセス制御）
-- ---------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.allowed_emails        enable row level security;
alter table public.admin_audit_log       enable row level security;
alter table public.notification_settings enable row level security;
alter table public.companies             enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) and (select private.is_active_member()));
create policy profiles_update on public.profiles for update to authenticated
  using      (id = (select auth.uid()) and (select private.is_active_member()))
  with check (id = (select auth.uid()) and (select private.is_active_member()));

create policy notification_settings_select on public.notification_settings for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_member()));
create policy notification_settings_update on public.notification_settings for update to authenticated
  using      (user_id = (select auth.uid()) and (select private.is_active_member()))
  with check (user_id = (select auth.uid()) and (select private.is_active_member()));

create policy companies_select on public.companies for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_member()));
create policy companies_insert on public.companies for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_active_member()));
create policy companies_update on public.companies for update to authenticated
  using      (user_id = (select auth.uid()) and (select private.is_active_member()))
  with check (user_id = (select auth.uid()) and (select private.is_active_member()));
-- 完全削除はゴミ箱に入っている企業だけ（02 §3.9）
create policy companies_delete on public.companies for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_member()) and deleted_at is not null);

-- allowed_emails / admin_audit_log にはポリシーを作らない＝利用者からは全拒否

-- ---------------------------------------------------------------------
-- 6. ユーザー作成時の初期データ（auth.users のトリガー）
-- ---------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(new.email);
begin
  insert into public.profiles (id, email) values (new.id, v_email);
  insert into public.notification_settings (user_id, email_address) values (new.id, v_email);
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- 7. 招待判定フック（Supabase Auth の Before User Created フック, 03 §2.1）
--    ダッシュボードのフック選択画面に表示させるため public に置く。
--    実行できるのは Supabase Auth（supabase_auth_admin）だけ。
-- ---------------------------------------------------------------------
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(event -> 'user' ->> 'email'));
begin
  if v_email is null or v_email = '' or not exists (
    select 1 from public.allowed_emails a
    where a.email = v_email and a.revoked_at is null
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'このアカウントは招待されていません'));
  end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------------
-- 8. 管理者RPC（招待・取り消し・再有効化・一覧）
--    本体は private の security definer 関数。冒頭で管理者かを必ず確認する。
--    public には画面から呼ぶための薄い入口（security invoker）だけを置く。
-- ---------------------------------------------------------------------
create function private.assert_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception '管理者だけが実行できます' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create function private.normalize_email(p_email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(btrim(p_email));
begin
  if v is null or v !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'メールアドレスの形式が正しくありません' using errcode = '22023';
  end if;
  return v;
end;
$$;

create function private.admin_list_members()
returns table (
  email           text,
  note            text,
  invited_at      timestamptz,
  revoked_at      timestamptz,
  user_id         uuid,
  role            text,
  status          text,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin();
  -- 招待状況と最終ログイン日時だけを返す。就活データは一切参照しない（M-3）
  return query
    select a.email, a.note, a.created_at, a.revoked_at, p.id, p.role, p.status, u.last_sign_in_at
    from public.allowed_emails a
    left join public.profiles p on p.email = a.email
    left join auth.users u on u.id = p.id
    order by a.created_at;
end;
$$;

create function private.admin_invite(p_email text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.assert_admin();
  v_email text := private.normalize_email(p_email);
  v_note  text := nullif(btrim(p_note), '');
  v_prev  public.allowed_emails;
begin
  select * into v_prev from public.allowed_emails where email = v_email for update;

  if not found then
    insert into public.allowed_emails (email, invited_by, note) values (v_email, v_actor, v_note);
    insert into public.admin_audit_log (actor_id, action, target_email) values (v_actor, 'invite', v_email);
  elsif v_prev.revoked_at is not null then
    -- 再招待: アクセスだけを戻す。データは取り消し中も保持している（A-3）
    update public.allowed_emails
      set revoked_at = null, note = coalesce(v_note, note)
      where email = v_email;
    update public.profiles set status = 'active' where email = v_email;
    insert into public.admin_audit_log (actor_id, action, target_email) values (v_actor, 'restore_access', v_email);
  elsif v_note is not null then
    update public.allowed_emails set note = v_note where email = v_email;
  end if;
end;
$$;

create function private.admin_revoke(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.assert_admin();
  v_email text := private.normalize_email(p_email);
begin
  if exists (select 1 from public.profiles where email = v_email and role = 'admin') then
    raise exception '管理者の招待は取り消せません' using errcode = '42501';
  end if;

  update public.allowed_emails set revoked_at = now()
    where email = v_email and revoked_at is null;
  if not found then
    raise exception '有効な招待が見つかりません' using errcode = 'P0002';
  end if;

  -- 取り消し: データは消さず、アクセスだけを止める（A-3）。RLS が次の操作から拒否する
  update public.profiles set status = 'suspended' where email = v_email;
  insert into public.admin_audit_log (actor_id, action, target_email) values (v_actor, 'revoke', v_email);
end;
$$;

revoke all on function private.assert_admin() from public, anon, authenticated;
revoke all on function private.normalize_email(text) from public, anon, authenticated;
revoke all on function private.admin_list_members() from public, anon;
revoke all on function private.admin_invite(text, text) from public, anon;
revoke all on function private.admin_revoke(text) from public, anon;
grant execute on function private.admin_list_members() to authenticated;
grant execute on function private.admin_invite(text, text) to authenticated;
grant execute on function private.admin_revoke(text) to authenticated;

create function public.admin_list_members()
returns table (
  email           text,
  note            text,
  invited_at      timestamptz,
  revoked_at      timestamptz,
  user_id         uuid,
  role            text,
  status          text,
  last_sign_in_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.admin_list_members();
$$;

create function public.admin_invite(p_email text, p_note text default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.admin_invite(p_email, p_note);
$$;

create function public.admin_revoke(p_email text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.admin_revoke(p_email);
$$;

revoke all on function public.admin_list_members() from public, anon;
revoke all on function public.admin_invite(text, text) from public, anon;
revoke all on function public.admin_revoke(text) from public, anon;
grant execute on function public.admin_list_members() to authenticated;
grant execute on function public.admin_invite(text, text) to authenticated;
grant execute on function public.admin_revoke(text) to authenticated;

-- ---------------------------------------------------------------------
-- 9. 適用記録
-- ---------------------------------------------------------------------
insert into private.schema_migrations (version, description)
values ('20261012000001', 'フェーズ1: 招待制・プロフィール・企業・RLS・管理者RPC');
