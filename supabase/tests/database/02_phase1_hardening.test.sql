-- フェーズ1の強化（20261012000002）と、再レビューで不足していたケース
begin;
select plan(31);

-- ---------------------------------------------------------------- 準備
insert into public.allowed_emails (email) values
  ('a@example.com'), ('b@example.com'), ('m@example.com'), ('ws@example.com'), ('nopro@example.com');
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'm@example.com');
update public.profiles set role = 'admin' where id = '44444444-4444-4444-4444-444444444444';

-- ---------------------------------------------------------------- メールの正規化
insert into auth.users (id, email) values ('66666666-6666-6666-6666-666666666666', '  WS@Example.com ');
select is((select email || '/' || status from public.profiles where id = '66666666-6666-6666-6666-666666666666'),
  'ws@example.com/active', '前後の空白と大文字を除いたメールで招待を判定し、保存する');
select throws_ok($$insert into auth.users (id, email) values ('77777777-7777-7777-7777-777777777777', null)$$,
  '23502', null, 'メールのないユーザーは作成されない');

-- ---------------------------------------------------------------- ログイン用メールの変更
update auth.users set email = 'other@example.com' where id = '22222222-2222-2222-2222-222222222222';
select is((select email || '/' || status from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'other@example.com/suspended', '招待されていないメールに変えると、プロフィールのメールが変わり停止になる');
update auth.users set email = 'ws2@example.com' where id = '66666666-6666-6666-6666-666666666666';
select is((select status from public.profiles where id = '66666666-6666-6666-6666-666666666666'),
  'suspended', '別の未招待メールでも停止');
insert into public.allowed_emails (email) values ('ws3@example.com');
update auth.users set email = 'WS3@example.com' where id = '11111111-1111-1111-1111-111111111111';
select is((select email || '/' || status from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'ws3@example.com/active', '招待済みのメールに変えた場合は有効のまま');
update auth.users set email = 'a@example.com' where id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------- 通知の送信先
update public.notification_settings set email_verified_at = now() where user_id = '11111111-1111-1111-1111-111111111111';

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
update public.notification_settings set email_address = 'new@example.com';
reset role;
select is((select email_verified_at from public.notification_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  null, '送信先を変えると確認済みの印が外れる');

-- ---------------------------------------------------------------- 利用者 A（他人の行・登録列の制限）
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok($$insert into public.companies (name, created_at) values ('x', '2000-01-01')$$, '42501', null,
  '登録時に作成日時を偽装できない');
select throws_ok($$insert into public.companies (name, deleted_at) values ('x', now())$$, '42501', null,
  '登録時にゴミ箱の日時を指定できない');
select throws_ok($$insert into public.companies (id, name) values ('aaaaaaaa-0000-0000-0000-00000000000f', 'x')$$, '42501', null,
  '登録時にIDを指定できない');
select throws_ok($$insert into public.companies (user_id, name) values ('11111111-1111-1111-1111-111111111111', 'x')$$, '42501', null,
  '登録時に所有者を指定できない（既定値で自分になる）');
select lives_ok($$insert into public.companies (name, preference, application_status, applied_on) values ('A社', 5, 'applied', '2026-10-12')$$,
  '編集できる列だけなら登録できる');
update public.profiles set display_name = '乗っ取り' where id = '44444444-4444-4444-4444-444444444444';
update public.notification_settings set send_hour_jst = 3 where user_id = '44444444-4444-4444-4444-444444444444';
select throws_ok($$select private.assert_admin()$$, '42501', null, '利用者は private の内部関数を呼べない');
reset role;
select is((select display_name from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  null, 'A は他人のプロフィールを変更できない');
select is((select send_hour_jst::int from public.notification_settings where user_id = '44444444-4444-4444-4444-444444444444'),
  8, 'A は他人の通知設定を変更できない');

-- ---------------------------------------------------------------- 停止中の利用者
update public.profiles set status = 'suspended' where id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
update public.profiles set display_name = '停止中の変更' where id = '11111111-1111-1111-1111-111111111111';
update public.notification_settings set send_hour_jst = 5;
reset role;
select is((select coalesce(display_name, '-') from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  '-', '停止中は自分のプロフィールも変更できない');
select is((select send_hour_jst::int from public.notification_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  8, '停止中は自分の通知設定も変更できない');

-- ---------------------------------------------------------------- 管理者 M
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select lives_ok($$select public.admin_invite('a@example.com')$$, '招待済みのメールをもう一度招待してもエラーにならない');
reset role;
select is((select status from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'active', '招待済みなのに停止中のプロフィールは、招待し直すと有効に戻る');
select is((select count(*)::int from public.allowed_emails where email = 'a@example.com'), 1, '許可リストは重複しない');

set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok($$select public.admin_invite('not an email')$$, '22023', null, '形式が正しくないメールは招待できない');
select throws_ok($$select public.admin_revoke('unknown@example.com')$$, 'P0002', null, '招待されていないメールは取り消せない');
select lives_ok($$select public.admin_revoke('nopro@example.com')$$, 'まだログインしていない人の招待も取り消せる');
select throws_ok($$select public.admin_revoke('nopro@example.com')$$, 'P0002', null, '取り消し済みの招待は二重に取り消せない');
select throws_ok($$select * from public.allowed_emails$$, '42501', null, '管理者でも許可リストを直接は読めない');
select throws_ok($$select * from public.admin_audit_log$$, '42501', null, '管理者でも監査ログを直接は読めない');
select is((select count(*)::int from public.profiles), 1, '管理者でも他人のプロフィールは読めない');
select is((select count(*)::int from public.notification_settings), 1, '管理者でも他人の通知設定は読めない');
reset role;

-- 停止中の管理者
update public.profiles set status = 'suspended' where id = '44444444-4444-4444-4444-444444444444';
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok($$select * from public.admin_list_members()$$, '42501', null, '停止中の管理者は管理者RPCを使えない');
reset role;

-- ---------------------------------------------------------------- 権限の点検
select ok(
  not has_function_privilege('authenticated', 'private.canonical_email(text)', 'execute')
  and not has_function_privilege('authenticated', 'private.is_invited_email(text)', 'execute')
  and not has_function_privilege('authenticated', 'private.normalize_email(text)', 'execute')
  and not has_function_privilege('authenticated', 'private.assert_admin()', 'execute'),
  '利用者は内部関数を実行できない');
select ok(
  not has_column_privilege('authenticated', 'public.companies', 'user_id', 'insert')
  and not has_column_privilege('authenticated', 'public.companies', 'selection_status', 'insert')
  and has_column_privilege('authenticated', 'public.companies', 'name', 'insert'),
  'companies の登録列は利用者が編集できる列だけ');
select is((select count(*)::int from private.schema_migrations where version = '20261012000002'), 1,
  '強化マイグレーションの適用記録がある');

select * from finish();
rollback;
