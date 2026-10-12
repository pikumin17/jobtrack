-- 構成の自動点検（テスト 1-10, 03 §4.4）
begin;
select plan(11);

select is_empty(
  $$ select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'public の全テーブルで RLS が有効');

select is_empty(
  $$ select table_name::text from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public' $$,
  '未ログイン（anon）は public のどのテーブルにも権限がない');

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute') $$,
  '未ログイン（anon）が実行できる関数がない');

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') $$,
  'security definer 関数はすべて search_path を固定している');

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.proname <> 'hook_before_user_created' $$,
  'public に置く security definer 関数は招待判定フックだけ（管理者RPCの本体は private）');

select ok(
  not has_table_privilege('authenticated', 'public.allowed_emails', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.admin_audit_log', 'select,insert,update,delete'),
  '利用者は許可リストと監査ログに直接アクセスできない');

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'companies'),
  4, 'companies に4操作分のポリシーがある');

select ok(
  has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute'),
  '招待判定フックを実行できるのは Supabase Auth だけ');

select is(
  (select count(*)::int from private.schema_migrations where version = '20261012000001'),
  1, 'マイグレーションの適用記録がある');

select is_empty(
  $$ select u.id::text from auth.users u
     where u.email is not null and not exists (select 1 from public.profiles p where p.id = u.id) $$,
  'メールのある全ユーザー（適用前からいたユーザーを含む）にプロフィールがある');

select is_empty(
  $$ select p.email from public.profiles p
     where p.status = 'active'
       and not exists (select 1 from public.allowed_emails a where a.email = p.email and a.revoked_at is null) $$,
  '招待されていない有効ユーザーはいない（適用前からいたユーザーは停止で作られる）');

select * from finish();
rollback;
