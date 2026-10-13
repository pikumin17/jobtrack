-- ローカル検証用: Supabase の最小限の環境（ロール・auth スキーマ・auth.uid()）を素の Postgres に再現する。
-- Docker が使えない環境で、マイグレーションと pgTAP テストを動かすためだけに使う。本番には使わない。
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin noinherit; end if;
end
$$;

create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role, supabase_auth_admin;
grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;

-- Supabase と同じく、public に作られるテーブル・関数は既定で各ロールに公開される（マイグレーション側で絞る前提の確認になる）
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now()
);

-- 本物の Supabase と同じく、ユーザーにぶら下がる認証データは auth.users の削除に連動して消える
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  identity_data jsonb
);
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade
);
create table if not exists auth.refresh_tokens (
  id bigserial primary key,
  token varchar(255),
  user_id varchar(255),
  session_id uuid references auth.sessions (id) on delete cascade
);
-- 認証記録（ログイン履歴）。本物と同じく auth.users との外部キーはない
create table if not exists auth.audit_log_entries (
  instance_id uuid,
  id uuid primary key,
  payload json,
  created_at timestamptz default now(),
  ip_address varchar(64) not null default ''
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role, supabase_auth_admin;
