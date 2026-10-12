-- フェーズ1のセキュリティテスト（03 §8.1 の S-01〜S-04, S-06〜S-09, S-12, S-13, S-16）
-- 利用者 A・B、停止中 C、管理者 M、未ログイン（anon）で、データの分離と権限を確認する。
begin;
select plan(52);

-- ---------------------------------------------------------------- 準備（管理者権限で作成）
insert into public.allowed_emails (email, note) values
  ('a@example.com', 'A'), ('b@example.com', 'B'), ('c@example.com', 'C'), ('m@example.com', 'M');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'A@Example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'm@example.com');

update public.profiles set role = 'admin' where id = '44444444-4444-4444-4444-444444444444';
update public.profiles set status = 'suspended' where id = '33333333-3333-3333-3333-333333333333';
update public.allowed_emails set revoked_at = now() where email = 'c@example.com';

insert into public.companies (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A社'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B社'),
  ('cccccccc-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'C社');

-- ---------------------------------------------------------------- 新規ユーザーの初期データ
select is((select email from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'a@example.com', 'ユーザー作成時にプロフィールが小文字のメールで作られる');
select is((select role || '/' || status from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'member/active', '新規ユーザーは一般メンバー・有効');
select is((select email_enabled from public.notification_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  false, '通知設定の行が作られ、メール通知は初期OFF');

-- ---------------------------------------------------------------- S-01 未ログイン
set local role anon;
select throws_ok('select * from public.companies', '42501', null, 'S-01 anon は companies を読めない');
select throws_ok('select * from public.profiles', '42501', null, 'S-01 anon は profiles を読めない');
select throws_ok('select * from public.allowed_emails', '42501', null, 'S-01 anon は許可リストを読めない');
select throws_ok('select * from public.notification_settings', '42501', null, 'S-01 anon は通知設定を読めない');
select throws_ok('select * from public.admin_audit_log', '42501', null, 'S-01 anon は監査ログを読めない');
select throws_ok($$select public.admin_list_members()$$, '42501', null, 'S-01 anon は管理者RPCを呼べない');
select throws_ok($$insert into public.companies (user_id, name) values ('11111111-1111-1111-1111-111111111111', 'x')$$,
  '42501', null, 'S-01 anon は企業を登録できない');
reset role;

-- ---------------------------------------------------------------- 利用者 A
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq('select name from public.companies', $$values ('A社'::text)$$, 'A には自分の企業だけが見える');
select is((select count(*)::int from public.profiles), 1, 'A には自分のプロフィールだけが見える');
select is((select count(*)::int from public.notification_settings), 1, 'A には自分の通知設定だけが見える');

-- S-02 他人の行
select is((select count(*)::int from public.companies where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 0,
  'S-02 A は B の企業を ID 指定でも読めない');
select lives_ok($$update public.companies set name = '乗っ取り' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  'S-02 A による B の企業の更新はエラーにならず0件');
select lives_ok($$update public.companies set deleted_at = now() where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  'S-02 A による B の企業のゴミ箱移動も0件');
select lives_ok($$delete from public.companies where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  'S-02 A による B の企業の削除も0件');

-- S-03 他人の user_id で登録
select throws_ok($$insert into public.companies (user_id, name) values ('22222222-2222-2222-2222-222222222222', '偽装')$$,
  '42501', null, 'S-03 A は user_id=B で企業を登録できない');

-- 正常系: user_id を省略すると自分のものになる
select lives_ok($$insert into public.companies (id, name) values ('aaaaaaaa-0000-0000-0000-000000000002', 'A社2')$$,
  'A は企業名だけで登録できる');
select is((select user_id::text from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  '11111111-1111-1111-1111-111111111111', '登録した企業の所有者は自分');
select is((select application_status || '/' || selection_status from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  'not_applied/not_started', '新規企業は未応募・選考前');

-- S-04 所有者の付け替え
select throws_ok($$update public.companies set user_id = '22222222-2222-2222-2222-222222222222' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '42501', null, 'S-04 A は自分の企業の所有者を B に変更できない');

-- S-16 選考状態の直接書き換え
update public.companies set selection_status = 'offer', selection_status_reason = 'progress_after_failed'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select selection_status from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'not_started', 'S-16 画面から送った選考状態は反映されない');

-- 制約（値の範囲と整合）
select throws_ok($$update public.companies set application_status = 'applied' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '23514', null, '応募済みには応募日が必要');
select lives_ok($$update public.companies set application_status = 'applied', applied_on = '2026-10-12' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '応募日つきなら応募済みにできる');
select throws_ok($$update public.companies set preference = 0 where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '23514', null, '志望度は1〜5');
select lives_ok($$update public.companies set preference = null where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '志望度は未設定（null）にできる');
select throws_ok($$update public.companies set recruit_url = 'javascript:alert(1)' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '23514', null, 'URL は http(s) のみ');
select throws_ok($$insert into public.companies (name) values ('   ')$$, '23514', null, '企業名は空にできない');

-- 完全削除はゴミ箱内だけ
delete from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select is((select count(*)::int from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000002'), 1,
  'ゴミ箱に入れていない企業は完全削除されない');
update public.companies set deleted_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000002';
delete from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select is((select count(*)::int from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000002'), 0,
  'ゴミ箱内の企業は完全削除できる');

-- S-07 権限の昇格
select throws_ok($$update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'S-07 A は自分を管理者にできない');
select throws_ok($$update public.profiles set status = 'active' where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'S-07 A は自分の状態を変更できない');
select throws_ok($$update public.notification_settings set email_verified_at = now()$$,
  '42501', null, 'A は送信先の確認済み日時を自分で設定できない');
select lives_ok($$update public.profiles set display_name = 'えー' where id = '11111111-1111-1111-1111-111111111111'$$,
  'A は表示名を変更できる');

-- S-08 管理者RPC
select throws_ok($$select public.admin_invite('x@example.com')$$, '42501', null, 'S-08 A は招待できない');
select throws_ok($$select public.admin_revoke('b@example.com')$$, '42501', null, 'S-08 A は取り消しできない');
select throws_ok($$select * from public.admin_list_members()$$, '42501', null, 'S-08 A はメンバー一覧を見られない');
select throws_ok($$select public.hook_before_user_created('{"user":{"email":"a@example.com"}}')$$,
  '42501', null, 'A は招待判定フックを直接呼べない');
reset role;
select is((select name || '/' || coalesce(deleted_at::text, 'active') from public.companies where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'B社/active', 'S-02 B の企業は A の操作で変更・削除されていない');

-- ---------------------------------------------------------------- S-06 停止中の C
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is((select count(*)::int from public.companies), 0, 'S-06 停止中の C は自分の企業も読めない');
select throws_ok($$insert into public.companies (name) values ('C社2')$$, '42501', null, 'S-06 停止中の C は登録できない');
reset role;

-- ---------------------------------------------------------------- 管理者 M
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is((select count(*)::int from public.companies), 0, 'S-09 管理者でも他人の企業は見えない');
select is((select count(*)::int from public.admin_list_members()), 4, '管理者はメンバー一覧を見られる');
select lives_ok($$select public.admin_revoke('A@example.com')$$, '管理者は A の招待を取り消せる');
select throws_ok($$select public.admin_revoke('m@example.com')$$, '42501', null, '管理者は自分（管理者）を取り消せない');
reset role;

-- 取り消された A は次の操作から拒否される
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((select count(*)::int from public.companies) + (select count(*)::int from public.profiles), 0,
  '取り消し後の A はデータもプロフィールも読めない');
reset role;

-- 再招待で元どおり（データは保持されている）
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select public.admin_invite('a@example.com');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select results_eq('select name from public.companies', $$values ('A社'::text)$$, '再招待後の A は元のデータを使える');
reset role;

select results_eq(
  $$select action, target_email from public.admin_audit_log order by created_at, action desc$$,
  $$values ('revoke'::text, 'a@example.com'::text), ('restore_access', 'a@example.com')$$,
  '取り消しと再有効化が監査ログに残る');

-- ---------------------------------------------------------------- S-12 / S-13 招待判定フック
set local role supabase_auth_admin;
select is(public.hook_before_user_created('{"user":{"email":"stranger@example.com"}}') -> 'error' ->> 'http_code',
  '403', 'S-12 許可リスト外のメールは拒否される');
select is(public.hook_before_user_created('{"user":{"email":"c@example.com"}}') -> 'error' ->> 'http_code',
  '403', 'S-13 取り消し済みのメールは拒否される');
select is(public.hook_before_user_created('{"user":{"email":"B@Example.com"}}'),
  '{}'::jsonb, '招待済みのメールは大文字小文字を問わず許可される');
reset role;

select * from finish();
rollback;
