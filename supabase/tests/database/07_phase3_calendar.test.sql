-- フェーズ3（前半）: 予定・個人タスク・カレンダー（20261103000001）
-- 03 §8.1 の S-11（予定・タスクの越境）、04 フェーズ3 の 3-01〜3-08（このファイルでの番号）
-- 利用者 A・B、停止中 C、未ログイン（anon）。
begin;
select plan(55);

-- ---------------------------------------------------------------- 準備（管理者権限で作成）
insert into public.allowed_emails (email, note) values
  ('a@example.com', 'A'), ('b@example.com', 'B'), ('c@example.com', 'C');
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com');
update public.profiles set status = 'suspended' where id = '33333333-3333-3333-3333-333333333333';
insert into public.companies (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A社'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'A社（ゴミ箱用）'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B社'),
  ('cccccccc-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'C社');
insert into public.selection_steps (id, user_id, company_id, kind, label, deadline_date, scheduled_at, status, result_expected_on) values
  ('aaaaaaaa-5555-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'es', 'ES', '2026-11-10', null, 'not_started', null),
  ('aaaaaaaa-5555-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'interview', '一次面接', null, '2026-11-12 10:00+09', 'scheduled', null),
  ('aaaaaaaa-5555-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'webtest', 'SPI', '2026-11-05', null, 'awaiting_result', '2026-11-20'),
  ('aaaaaaaa-5555-0000-0000-000000000099', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'es', 'ゴミ箱のES', '2026-11-11', null, 'not_started', null),
  ('bbbbbbbb-5555-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001', 'es', 'B のES', '2026-11-10', null, 'not_started', null);
insert into public.events (id, user_id, company_id, kind, title, all_day_date) values
  ('bbbbbbbb-eeee-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001', 'briefing', 'B の説明会', '2026-11-08'),
  ('aaaaaaaa-eeee-0000-0000-000000000099', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'briefing', 'ゴミ箱の説明会', '2026-11-09'),
  ('cccccccc-eeee-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', null, 'other', 'C の予定', '2026-11-09');
insert into public.tasks (id, user_id, title, due_date) values
  ('bbbbbbbb-7777-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B のタスク', '2026-11-08');
update public.companies set deleted_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000002';

-- B の行の指紋（A の操作の前後で変わらないことを確認する）
create function pg_temp.b_fingerprint() returns text language sql as $$
  select md5(string_agg(r, '|' order by r)) from (
    select row_to_json(e)::text as r from public.events e where e.user_id = '22222222-2222-2222-2222-222222222222'
    union all select row_to_json(t)::text from public.tasks t where t.user_id = '22222222-2222-2222-2222-222222222222'
    union all select row_to_json(l)::text from public.timeline_entries l where l.user_id = '22222222-2222-2222-2222-222222222222'
  ) x;
$$;
create temp table b_before as select pg_temp.b_fingerprint() as fp;
grant execute on all functions in schema pg_temp to authenticated;
grant select on b_before to authenticated;

-- ---------------------------------------------------------------- 表とビューの作り
select ok((select relrowsecurity from pg_class where oid = 'public.events'::regclass), 'events は RLS 有効');
select ok((select relrowsecurity from pg_class where oid = 'public.tasks'::regclass), 'tasks は RLS 有効');
select ok((select 'security_invoker=true' = any(reloptions) from pg_class where oid = 'public.calendar_items'::regclass),
  'calendar_items は security_invoker（元の表の RLS が効く）');
select ok(not has_table_privilege('anon', 'public.events', 'select'), 'anon は予定を読めない');
select ok(not has_table_privilege('anon', 'public.tasks', 'select'), 'anon はタスクを読めない');
select ok(not has_table_privilege('anon', 'public.calendar_items', 'select'), 'anon はカレンダーを読めない');
select ok(not has_table_privilege('authenticated', 'public.calendar_items', 'insert'), 'カレンダーは読み取り専用');

-- ---------------------------------------------------------------- A の予定
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok($$insert into public.events (kind, title, starts_at, ends_at) values
    ('other', '自己分析の勉強会', '2026-11-06 19:00+09', '2026-11-06 21:00+09')$$,
  '3-01 A は企業に紐付けない予定を追加できる');
select lives_ok($$insert into public.events (company_id, kind, title, all_day_date) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'briefing', 'A社 説明会', '2026-11-07')$$,
  '3-01 A は自分の企業に紐付けた終日の予定を追加できる');
select is((select user_id::text from public.events where title = '自己分析の勉強会'),
  '11111111-1111-1111-1111-111111111111', '所有者はログイン中の利用者になる');
select throws_ok($$insert into public.events (company_id, title, all_day_date) values ('bbbbbbbb-0000-0000-0000-000000000001', '乗っ取り', '2026-11-07')$$,
  '42501', null, 'S-11 A は B の企業に予定を紐付けられない');
select throws_ok($$insert into public.events (user_id, title, all_day_date) values ('22222222-2222-2222-2222-222222222222', '偽装', '2026-11-07')$$,
  '42501', null, 'A は user_id を指定できない');
select throws_ok($$insert into public.events (company_id, title, all_day_date) values ('aaaaaaaa-0000-0000-0000-000000000002', 'ゴミ箱へ', '2026-11-07')$$,
  '42501', null, 'ゴミ箱内の企業には予定を追加できない');
select throws_ok($$insert into public.events (title) values ('日時なし')$$, '23514', null, '予定は日時が必須');
select throws_ok($$insert into public.events (title, starts_at, all_day_date) values ('両方', '2026-11-06 10:00+09', '2026-11-06')$$,
  '23514', null, '時刻ありと終日の両方は指定できない');
select throws_ok($$insert into public.events (title, starts_at, ends_at) values ('逆', '2026-11-06 10:00+09', '2026-11-06 09:00+09')$$,
  '23514', null, '終了が開始より前なら保存できない');
select throws_ok($$insert into public.events (title, all_day_date, url) values ('URL', '2026-11-06', 'javascript:alert(1)')$$,
  '23514', null, 'URL は http(s) だけ');
select throws_ok($$insert into public.events (title, all_day_date, kind) values ('種別', '2026-11-06', 'party')$$,
  '23514', null, '種別は決まった値だけ');
select throws_ok($$insert into public.events (title, all_day_date) values ('   ', '2026-11-06')$$, '23514', null, '空白だけの名前は保存できない');

select is((select count(*)::int from public.events), 3, 'A に見えるのは自分の予定だけ（ゴミ箱の企業の予定を含む）');
select lives_ok($$update public.events set title = '乗っ取り' where id = 'bbbbbbbb-eeee-0000-0000-000000000001'$$,
  'A による B の予定の更新はエラーにならず0件');
select lives_ok($$delete from public.events where id = 'bbbbbbbb-eeee-0000-0000-000000000001'$$, 'A による B の予定の削除も0件');
select throws_ok($$update public.events set company_id = 'bbbbbbbb-0000-0000-0000-000000000001' where title = '自己分析の勉強会'$$,
  '42501', null, 'S-11 自分の予定を B の企業に付け替えられない');
select lives_ok($$update public.events set title = '変更' where id = 'aaaaaaaa-eeee-0000-0000-000000000099'$$,
  'ゴミ箱内の企業の予定の更新はエラーにならず0件');
select is((select title from public.events where id = 'aaaaaaaa-eeee-0000-0000-000000000099'), 'ゴミ箱の説明会',
  'ゴミ箱内の企業の予定は変わらない（読み取り専用）');

-- ---------------------------------------------------------------- A のタスク
select lives_ok($$insert into public.tasks (title, priority) values ('自己PRを見直す', 1)$$,
  '3-02 期日なしのタスクを追加できる');
select lives_ok($$insert into public.tasks (company_id, title, due_at) values
    ('aaaaaaaa-0000-0000-0000-000000000001', '逆質問を用意', '2026-11-11 21:00+09')$$,
  '3-02 企業に紐付けた、時刻ありの期日のタスクを追加できる');
select is((select priority::int from public.tasks where title = '逆質問を用意'), 2, '優先度の初期値は2（中）');
select throws_ok($$insert into public.tasks (title, priority) values ('優先度', 4)$$, '23514', null, '優先度は1〜3');
select throws_ok($$insert into public.tasks (title, due_date, due_at) values ('両方', '2026-11-06', '2026-11-06 10:00+09')$$,
  '23514', null, '期日は終日か時刻ありの一方まで');
select throws_ok($$insert into public.tasks (company_id, title) values ('bbbbbbbb-0000-0000-0000-000000000001', '乗っ取り')$$,
  '42501', null, 'S-11 A は B の企業にタスクを紐付けられない');
select is((select count(*)::int from public.tasks), 2, 'A に見えるのは自分のタスクだけ');
select lives_ok($$update public.tasks set completed_at = now() where id = 'bbbbbbbb-7777-0000-0000-000000000001'$$,
  'A による B のタスクの完了はエラーにならず0件');

-- ---------------------------------------------------------------- カレンダー（3-03）
select is((select count(*)::int from public.calendar_items where company_name like 'B%' or title like 'B %'), 0,
  'S-11 A のカレンダーに B の項目は出ない');
select is((select array_agg(item_type || ':' || title order by item_type, title) from public.calendar_items),
  array['es_deadline:ES', 'event:A社 説明会', 'event:自己分析の勉強会', 'result_expected:SPI', 'step_scheduled:一次面接',
        'task:逆質問を用意', 'test_deadline:SPI'],
  '3-03 ステップの締切・実施日時・結果通知予定、予定、期日のあるタスクが1つの一覧になる');
select is((select count(*)::int from public.calendar_items where title like 'ゴミ箱%'), 0,
  'ゴミ箱内の企業の項目はカレンダーに出ない');
select is((select count(*)::int from public.calendar_items where title = '自己PRを見直す'), 0, '期日のないタスクはカレンダーに出ない');
select is((select done from public.calendar_items where item_type = 'test_deadline'), true,
  '結果待ちのステップの締切は完了扱い');
select is((select company_name from public.calendar_items where title = 'A社 説明会'), 'A社', '紐付けた企業名が付く');
select is((select source_table || '/' || source_id from public.calendar_items where title = '逆質問を用意'),
  (select 'tasks/' || id from public.tasks where title = '逆質問を用意'), '元の表と行が分かる（カレンダーから元データを編集する）');

-- 完了（3-04）: 元の行を更新すると、カレンダーにも反映される
update public.tasks set completed_at = now() where title = '逆質問を用意';
select is((select done from public.calendar_items where title = '逆質問を用意'), true, '3-04 タスクを完了するとカレンダーでも完了');
update public.events set completed_at = now() where title = 'A社 説明会';
select is((select done from public.calendar_items where title = 'A社 説明会'), true, '3-04 予定を完了（参加済み）にできる');

-- ---------------------------------------------------------------- 履歴（3-05）
select is((select count(*)::int from public.timeline_entries
            where entity_type = 'event' and action = 'created' and company_id = 'aaaaaaaa-0000-0000-0000-000000000001'
              and summary = '予定を追加: A社 説明会'), 1, '3-05 企業に紐付けた予定の追加が、その企業の履歴に残る');
select is((select count(*)::int from public.timeline_entries where entity_type = 'task' and action = 'status_changed'
              and summary = '逆質問を用意: 完了'), 1, '3-05 タスクの完了が履歴に残る');
select is((select count(*)::int from public.timeline_entries where entity_type = 'task' and company_id is null
              and summary = 'タスクを追加: 自己PRを見直す'), 1, '紐付けのないタスクの履歴は企業なしで残る');
update public.tasks set priority = priority where title = '自己PRを見直す';
select is((select count(*)::int from public.timeline_entries where entity_type = 'task' and summary like '%自己PRを見直す'),
  1, '中身が変わらない更新は履歴に残さない');
select throws_ok($$insert into public.timeline_entries (user_id, entity_type, action, summary) values ('11111111-1111-1111-1111-111111111111', 'task', 'created', '偽')$$,
  '42501', null, 'S-10 予定・タスクの履歴も書き込めない');
select lives_ok($$delete from public.tasks where title = '自己PRを見直す'$$, 'タスクを削除できる');
select is((select count(*)::int from public.timeline_entries where summary = 'タスクを削除: 自己PRを見直す'), 1, '削除も履歴に残る');


-- ---------------------------------------------------------------- 停止中の C
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select is((select count(*)::int from public.events), 0, '停止中の利用者は自分の予定も読めない');
select throws_ok($$insert into public.tasks (title) values ('停止中')$$, '42501', null, '停止中の利用者はタスクを追加できない');

-- ---------------------------------------------------------------- 未ログイン
reset role;
set local role anon;
select throws_ok($$select count(*) from public.calendar_items$$, '42501', null, '未ログインはカレンダーを読めない');

-- ---------------------------------------------------------------- 企業の完全削除（3-06）
reset role;
-- 管理者権限で B の行を確かめる（A からは B の行が見えないため）
select is((select fp from b_before), pg_temp.b_fingerprint(), 'S-11 A の操作の前後で B の予定・タスク・履歴は変わらない');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok($$select public.purge_company('aaaaaaaa-0000-0000-0000-000000000002')$$, 'ゴミ箱の企業を完全削除できる');
select is((select count(*)::int from public.events where id = 'aaaaaaaa-eeee-0000-0000-000000000099'), 0,
  '3-06 完全削除した企業の予定も消える');

select * from finish();
rollback;
