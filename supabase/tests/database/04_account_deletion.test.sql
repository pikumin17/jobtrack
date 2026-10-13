-- アカウント完全削除（20261013000001、03 §8.1 の S-18〜S-21）
-- 管理者 M、削除対象 T（招待を取り消す）、ほかの利用者 B、停止中の管理者 S、一度もログインしていない G。
begin;
select plan(31);

-- ---------------------------------------------------------------- 準備
insert into public.allowed_emails (email, note) values
  ('m@example.com', 'M'), ('t@example.com', 'T のメモ'), ('b@example.com', 'B'),
  ('s@example.com', 'S'), ('g@example.com', 'G'), ('xt@example.com', 'T に似たメール');
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'm@example.com'),
  ('77777777-7777-7777-7777-777777777777', 'T@Example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('66666666-6666-6666-6666-666666666666', 's@example.com'),
  ('88888888-8888-8888-8888-888888888888', 'xt@example.com');
update public.profiles set role = 'admin' where id in ('44444444-4444-4444-4444-444444444444', '66666666-6666-6666-6666-666666666666');
update public.profiles set status = 'suspended' where id = '66666666-6666-6666-6666-666666666666';
insert into public.companies (user_id, name, memo) values
  ('44444444-4444-4444-4444-444444444444', '管理者の会社', null),
  ('77777777-7777-7777-7777-777777777777', 'T社1', '担当 t@example.com'),
  ('77777777-7777-7777-7777-777777777777', 'T社2', null),
  ('22222222-2222-2222-2222-222222222222', 'B社', null);
-- Supabase の認証記録（実際の形: actor_id / actor_username、管理操作では traits.user_id / user_email）
insert into auth.audit_log_entries (id, payload) values
  (gen_random_uuid(), '{"action":"login","actor_id":"77777777-7777-7777-7777-777777777777","actor_username":"t@example.com"}'),
  (gen_random_uuid(), '{"action":"user_modified","actor_id":"00000000-0000-0000-0000-000000000000","traits":{"user_id":"77777777-7777-7777-7777-777777777777","user_email":"t@example.com"}}'),
  (gen_random_uuid(), '{"action":"login","actor_id":"44444444-4444-4444-4444-444444444444","actor_username":"m@example.com"}'),
  (gen_random_uuid(), '{"action":"login","actor_id":"88888888-8888-8888-8888-888888888888","actor_username":"xt@example.com"}');

-- 管理者・B の行の指紋（削除の前後で変わらないことを確認する）
create function pg_temp.others_fingerprint() returns text language sql as $$
  select md5(string_agg(r, '|' order by r)) from (
    select row_to_json(p)::text as r from public.profiles p where p.id <> '77777777-7777-7777-7777-777777777777'
    union all select row_to_json(c)::text from public.companies c where c.user_id <> '77777777-7777-7777-7777-777777777777'
    union all select row_to_json(n)::text from public.notification_settings n where n.user_id <> '77777777-7777-7777-7777-777777777777'
    union all select row_to_json(u)::text from auth.users u where u.id <> '77777777-7777-7777-7777-777777777777'
  ) x;
$$;
-- public の全テーブルで、行のどこかに指定の文字列が含まれる件数
create function pg_temp.rows_containing(p_text text) returns integer language plpgsql as $$
declare t record; n integer; total integer := 0;
begin
  for t in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind = 'r' loop
    -- 前後がメールに使える文字でない位置だけを一致とみなす（xt@example.com は t@example.com に一致しない）
    execute format('select count(*) from public.%I x where lower(row_to_json(x)::text) ~ $1', t.relname)
      into n using '(^|[^a-z0-9._%+-])' || regexp_replace(lower(p_text), '([.+])', '\\\1', 'g') || '($|[^a-z0-9._%+-])';
    total := total + n;
  end loop;
  return total;
end;
$$;
create temp table before_fp as select pg_temp.others_fingerprint() as fp;

-- ---------------------------------------------------------------- 招待と取り消しの記録を作る（監査ログに T のメールが入る）
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select public.admin_revoke('t@example.com');
select public.admin_invite('t@example.com');

-- ---------------------------------------------------------------- S-18: 管理者以外は実行できない
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select throws_ok($$select public.admin_delete_account('t@example.com', 't@example.com')$$, '42501', null,
  '一般ユーザーは完全削除を実行できない');
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select throws_ok($$select public.admin_delete_account('t@example.com', 't@example.com')$$, '42501', null,
  '停止中の管理者は完全削除を実行できない');
select set_config('request.jwt.claims', '', true);
select throws_ok($$select public.admin_delete_account('t@example.com', 't@example.com')$$, '42501', null,
  'ログインしていない呼び出しは実行できない');
select ok(not has_table_privilege('authenticated', 'auth.users', 'delete'),
  '利用者は auth.users を直接削除できない（削除はRPCの中だけ）');

-- ---------------------------------------------------------------- S-19: 条件に合わない削除は止まる
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select throws_ok($$select public.admin_delete_account('t@example.com', 't@example.com')$$, '55000', null,
  '招待を取り消していない人は削除できない');
select public.admin_revoke('t@example.com');
select throws_ok($$select public.admin_delete_account('t@example.com', 'xt@example.com')$$, '22023', null,
  '確認用に再入力したメールが違うと削除できない');
select throws_ok($$select public.admin_delete_account('t@example.com', null)$$, '22023', null,
  '確認用のメールが空だと削除できない');
select throws_ok($$select public.admin_delete_account('nobody@example.com', 'nobody@example.com')$$, 'P0002', null,
  '招待のないメールは削除できない');
reset role;
update public.allowed_emails set revoked_at = now() where email in ('m@example.com', 's@example.com');
set local role authenticated;
select throws_ok($$select public.admin_delete_account('m@example.com', 'm@example.com')$$, '42501', null,
  '管理者は自分自身を削除できない（招待が取り消し済みでも）');
select throws_ok($$select public.admin_delete_account('s@example.com', 's@example.com')$$, '42501', null,
  'ほかの管理者も削除できない');
reset role;
update public.allowed_emails set revoked_at = null where email in ('m@example.com', 's@example.com');
select is((select count(*)::int from auth.users where id = '77777777-7777-7777-7777-777777777777'), 1,
  '拒否された呼び出しでは何も消えていない');

-- ---------------------------------------------------------------- S-20: 取り消し済みの人を削除する
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select is(public.admin_delete_account(' T@Example.com ', 't@example.com'),
  '{"auth_user_deleted": true, "auth_log_entries_deleted": 2}'::jsonb,
  '削除できる（前後の空白・大文字は同じメールとして扱う）。結果に認証記録の削除件数が入る');
reset role;
select is((select count(*)::int from auth.users where id = '77777777-7777-7777-7777-777777777777'), 0, 'auth.users から消える');
select is((select count(*)::int from public.profiles where id = '77777777-7777-7777-7777-777777777777'), 0, 'プロフィールが消える');
select is((select count(*)::int from public.companies where user_id = '77777777-7777-7777-7777-777777777777'), 0, '企業データが消える');
select is((select count(*)::int from public.notification_settings where user_id = '77777777-7777-7777-7777-777777777777'), 0, '通知設定が消える');
select is((select count(*)::int from public.allowed_emails where email = 't@example.com'), 0, '招待の行が消える');
select is((select count(*)::int from auth.audit_log_entries
           where payload::text like '%77777777-7777-7777-7777-777777777777%' or payload::text like '%"t@example.com"%'), 0,
  'Supabase の認証記録から対象者の行が消える');
select is((select count(*)::int from auth.audit_log_entries), 2,
  'ほかの人の認証記録は残る（似たメール xt@example.com も消えない）');
select is(pg_temp.rows_containing('t@example.com'), 0,
  'public のどのテーブルにも対象メールが残っていない（似たメールを除く）');
select is((select count(*)::int from public.admin_audit_log where target_email is null and action in ('invite', 'revoke', 'restore_access')), 3,
  '監査ログの招待・取り消し・再招待の行は、対象メールを消して日時と種類だけ残る');
select is((select count(*)::int from public.admin_audit_log
           where action = 'delete_account' and target_email is null and actor_id = '44444444-4444-4444-4444-444444444444'), 1,
  '削除の操作が、対象メールなしで1行記録される');
select is(pg_temp.others_fingerprint(), (select fp from before_fp),
  '管理者・ほかの利用者のプロフィール・企業・通知設定・ログイン情報は変わらない');
select is(public.hook_before_user_created('{"user":{"email":"t@example.com"}}') -> 'error' ->> 'http_code', '403',
  '削除後、同じメールでアカウントを作り直そうとしても招待判定フックが拒否する');

-- ---------------------------------------------------------------- 一度もログインしていない人
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select public.admin_revoke('g@example.com');
select is(public.admin_delete_account('g@example.com', 'g@example.com') ->> 'auth_user_deleted', 'false',
  '一度もログインしていない人は、招待の行だけ消える');
reset role;
select is((select count(*)::int from public.allowed_emails where email = 'g@example.com'), 0, '招待の行が消える（未ログインの人）');

-- ---------------------------------------------------------------- 制約と構成（S-21）
select throws_ok($$insert into public.admin_audit_log (action, target_email) values ('delete_account', 'x@example.com')$$,
  '23514', null, '削除の記録には対象メールを入れられない');
select is_empty(
  $$ select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
     join pg_attribute a on a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'r'
       and not exists (select 1 from pg_constraint k
                       where k.conrelid = c.oid and k.contype = 'f' and k.confdeltype = 'c'
                         and k.confrelid = 'public.profiles'::regclass and k.conkey = array[a.attnum]) $$,
  '利用者の所有データの表（user_id 列がある表）はすべて profiles への on delete cascade');
select ok(exists (select 1 from pg_constraint k where k.conrelid = 'public.profiles'::regclass and k.contype = 'f'
                  and k.confrelid = 'auth.users'::regclass and k.confdeltype = 'c'),
  'profiles は auth.users への on delete cascade');
select ok(has_table_privilege(
            (select p.proowner::regrole::text from pg_proc p where p.oid = 'private.admin_delete_account(text,text)'::regprocedure),
            'auth.users', 'delete'),
  '削除RPCの持ち主は auth.users を削除できる（本物の Supabase 環境での確認を兼ねる）');
select diag('削除RPCの持ち主: ' || (select p.proowner::regrole::text from pg_proc p where p.oid = 'private.admin_delete_account(text,text)'::regprocedure)
  || ' / auth.audit_log_entries の削除権限: '
  || has_table_privilege((select p.proowner::regrole::text from pg_proc p where p.oid = 'private.admin_delete_account(text,text)'::regprocedure),
                         'auth.audit_log_entries', 'delete')::text);
select ok(has_function_privilege('authenticated', 'public.admin_delete_account(text,text)', 'execute')
          and not has_function_privilege('anon', 'public.admin_delete_account(text,text)', 'execute'),
  '削除RPCを呼べるのはログイン済みの利用者だけ（管理者かどうかは関数の中で判定）');

select * from finish();
rollback;
