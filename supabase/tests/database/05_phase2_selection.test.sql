-- フェーズ2: 選考ステップ・選考状態の判定・変更履歴・ゴミ箱（20261013000002）
-- 03 §8.1 の S-05, S-10, S-16、04 の 2-05, 2-06, 2-13, 2-14, 2-15, 2-19, 2-20, 2-23
-- 利用者 A・B、停止中 C、管理者 M、未ログイン（anon）。
begin;
select plan(71);

-- ---------------------------------------------------------------- 準備（管理者権限で作成）
insert into public.allowed_emails (email, note) values
  ('a@example.com', 'A'), ('b@example.com', 'B'), ('c@example.com', 'C'), ('m@example.com', 'M');
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'm@example.com');
update public.profiles set role = 'admin' where id = '44444444-4444-4444-4444-444444444444';
update public.profiles set status = 'suspended' where id = '33333333-3333-3333-3333-333333333333';
insert into public.companies (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A社'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'A社（ゴミ箱用）'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B社'),
  ('cccccccc-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'C社');
insert into public.selection_steps (id, user_id, company_id, kind, label) values
  ('bbbbbbbb-5555-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001', 'es', 'B のES'),
  ('aaaaaaaa-5555-0000-0000-000000000099', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'es', 'ゴミ箱用ES');

-- B の行の指紋（A の操作の前後で変わらないことを確認する）
create function pg_temp.b_fingerprint() returns text language sql as $$
  select md5(string_agg(r, '|' order by r)) from (
    select row_to_json(s)::text as r from public.selection_steps s where s.user_id = '22222222-2222-2222-2222-222222222222'
    union all select row_to_json(c)::text from public.companies c where c.user_id = '22222222-2222-2222-2222-222222222222'
    union all select row_to_json(t)::text from public.timeline_entries t where t.user_id = '22222222-2222-2222-2222-222222222222'
  ) x;
$$;
create temp table b_before as select pg_temp.b_fingerprint() as fp;
create function pg_temp.a1_steps_fingerprint() returns text language sql as $$
  select md5(string_agg(row_to_json(s)::text, '|' order by s.id)) from public.selection_steps s
   where s.company_id = 'aaaaaaaa-0000-0000-0000-000000000001';
$$;
grant execute on all functions in schema pg_temp to authenticated;
grant select on b_before to authenticated;

-- ---------------------------------------------------------------- A のステップ
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok($$insert into public.selection_steps (company_id, kind, label) values ('aaaaaaaa-0000-0000-0000-000000000001', 'es', 'ES')$$,
  'A は自分の企業にステップを追加できる');
select is((select position from public.selection_steps where label = 'ES'), 0, '最初のステップの並び順は0');
select lives_ok($$insert into public.selection_steps (company_id, kind, label) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'written_exam', '筆記試験'),
    ('aaaaaaaa-0000-0000-0000-000000000001', 'interview', '一次面接'),
    ('aaaaaaaa-0000-0000-0000-000000000001', 'interview', '二次面接')$$,
  'よくある流れを1回でまとめて追加できる（N-6。筆記試験の種別、B-5）');
select is((select array_agg(label order by position) from public.selection_steps where company_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  array['ES', '筆記試験', '一次面接', '二次面接'], 'まとめて追加しても末尾に順番どおり並ぶ');
select throws_ok($$insert into public.selection_steps (company_id, kind, label) values ('bbbbbbbb-0000-0000-0000-000000000001', 'es', '乗っ取り')$$,
  '42501', null, 'S-05 A は B の企業にステップを追加できない');
select throws_ok($$insert into public.selection_steps (user_id, company_id, kind, label) values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'es', '偽装')$$,
  '42501', null, 'A は user_id を指定できない');
select throws_ok($$insert into public.selection_steps (company_id, kind, label) values ('aaaaaaaa-0000-0000-0000-000000000001', 'briefing', '説明会')$$,
  '23514', null, '説明会はステップの種別にできない（フェーズ3の予定で扱う、B-5）');
select throws_ok($$insert into public.selection_steps (company_id, kind, label, scheduled_at, scheduled_end_at) values ('aaaaaaaa-0000-0000-0000-000000000001', 'gd', 'GD', '2026-10-20 10:00+09', '2026-10-20 09:00+09')$$,
  '23514', null, '終了日時が開始日時より前なら保存できない（入力エラー）');
select is((select count(*)::int from public.selection_steps), 5, 'A に見えるのは自分のステップだけ');
select lives_ok($$update public.selection_steps set label = '乗っ取り' where id = 'bbbbbbbb-5555-0000-0000-000000000001'$$,
  'A による B のステップの更新はエラーにならず0件');
select lives_ok($$delete from public.selection_steps where id = 'bbbbbbbb-5555-0000-0000-000000000001'$$,
  'A による B のステップの削除も0件');
select throws_ok($$update public.selection_steps set company_id = 'aaaaaaaa-0000-0000-0000-000000000002' where label = 'ES'$$,
  '42501', null, 'ステップを別の企業に移せない');

-- S-10 履歴は読むだけ
select throws_ok($$insert into public.timeline_entries (user_id, entity_type, action, summary) values ('11111111-1111-1111-1111-111111111111', 'company', 'created', '偽')$$,
  '42501', null, 'S-10 A は履歴を書き込めない');
select throws_ok($$update public.timeline_entries set summary = '改ざん'$$, '42501', null, 'S-10 A は履歴を書き換えられない');
select throws_ok($$delete from public.timeline_entries$$, '42501', null, 'S-10 A は履歴を消せない');
select is((select count(*)::int from public.timeline_entries where user_id <> '11111111-1111-1111-1111-111111111111'), 0,
  'A に見える履歴は自分のものだけ');

-- ---------------------------------------------------------------- 選考状態の自動判定（トリガー）
update public.selection_steps set status = 'awaiting_result', completed_at = now() where label = 'ES';
select is((select selection_status from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'in_progress',
  '結果待ちのステップがあると選考中');
select is((select count(*)::int from public.timeline_entries where summary = 'ES: 未着手 → 結果待ち' and action = 'status_changed'), 1,
  'ステップの状態の変更が履歴に1件残る（2-06）');
update public.selection_steps set status = 'failed' where label = 'ES';
update public.selection_steps set status = 'scheduled' where label = '一次面接';
select is((select selection_status || '/' || selection_status_reason from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'needs_review/progress_after_failed', 'E-1 不合格の後ろが進んでいれば要確認');
update public.selection_steps set status = 'passed' where label = 'ES';
select is((select selection_status || '/' || coalesce(selection_status_reason, '-') from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'in_progress/-', 'E-9 不合格を通過に戻すと選考中に戻る');
select is((select selection_status from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'in_progress',
  'S-16 判定はステップから計算される');
update public.companies set selection_status = 'offer' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select selection_status from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'in_progress',
  'S-16 画面から送った選考状態は反映されない');

update public.companies set final_outcome = 'offer', final_outcome_at = '2000-01-01' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select selection_status from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'offer',
  '「結果を記録」した内定が選考状態になる');
select ok((select final_outcome_at > '2020-01-01' from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '結果の記録日時は DB が決め、画面から送った日時は使わない（N-10）');
select is((select count(*)::int from public.timeline_entries where summary = '結果を記録: 内定' and action = 'outcome_changed'), 1,
  '結果の記録が履歴に残る');
update public.companies set final_outcome = null where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select selection_status || '/' || coalesce(final_outcome_at::text, 'null') from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'in_progress/null', '記録を取り消すとステップからの判定に戻り、記録日時も消える');

-- ---------------------------------------------------------------- 応募状態とステップは互いに変えない（2-13, 2-14）
create temp table a1_steps_before as select pg_temp.a1_steps_fingerprint() as fp;
update public.companies set application_status = 'applied', applied_on = '2026-10-12' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is(pg_temp.a1_steps_fingerprint(), (select fp from a1_steps_before), '2-14 応募状態を変えてもステップは一切変わらない');
select is((select count(*)::int from public.timeline_entries
            where action = 'application_changed' and summary = '応募状態: 未応募 → 応募済み（応募日 10/12）'), 1,
  '2-13 応募状態の変更が application_changed として履歴に残る');
update public.selection_steps set status = 'not_started' where label = '一次面接';
select is((select application_status from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'applied',
  '2-14 ステップを変えても応募状態は変わらない');
update public.companies set applied_on = '2026-10-14' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select count(*)::int from public.timeline_entries where summary = '応募日を変更: 10/12 → 10/14'), 1,
  '2-13 応募日だけの変更も履歴に残る');

-- ---------------------------------------------------------------- 志望度（2-15）
select throws_ok($$update public.companies set preference = 6 where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '23514', null, '2-15 志望度6は保存できない');
select throws_ok($$update public.companies set preference = '1.5' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '22P02', null, '2-15 志望度に小数は保存できない');
update public.companies set preference = 4 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select count(*)::int from public.timeline_entries where summary = '志望度: 未設定 → 4 本命候補'), 1,
  '志望度の変更が履歴に残る');

-- ---------------------------------------------------------------- 更新順と履歴の量（N-2, 2-23）
reset role;
update public.companies set updated_at = '2020-01-01' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
create temp table a1_company_entries as
  select count(*)::int as n from public.timeline_entries where entity_type = 'company' and company_id = 'aaaaaaaa-0000-0000-0000-000000000001';
grant select on a1_company_entries to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
update public.selection_steps set memo = '持ち物: 筆記用具' where label = '筆記試験';
select ok((select updated_at > '2020-01-02' from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'N-2 ステップを変えると企業の更新日時も新しくなる');
select is((select count(*)::int from public.timeline_entries where entity_type = 'company' and company_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  (select n from a1_company_entries), '2-23 自動計算の列（更新日時・選考状態）だけの変化では企業の履歴が増えない');
select is((select summary from public.timeline_entries where entity_type = 'step' and action = 'updated'), '筆記試験を更新: メモ',
  'ステップの項目の変更は、変えた項目名つきで1件残る');

-- ---------------------------------------------------------------- 並替（2-05, 2-23）
select throws_ok($$select public.reorder_steps('aaaaaaaa-0000-0000-0000-000000000001',
    array(select id from public.selection_steps where company_id = 'aaaaaaaa-0000-0000-0000-000000000001') || 'bbbbbbbb-5555-0000-0000-000000000001'::uuid)$$,
  '22023', null, '2-05 他人のステップが混ざった並替は全体を拒否');
select throws_ok($$select public.reorder_steps('bbbbbbbb-0000-0000-0000-000000000001', array['bbbbbbbb-5555-0000-0000-000000000001'::uuid])$$,
  'P0002', null, '2-05 他人の企業の並替はできない');
select throws_ok($$select public.reorder_steps('aaaaaaaa-0000-0000-0000-000000000001',
    (array(select id from public.selection_steps where company_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by position))[1:3])$$,
  '22023', null, '一部のステップだけの並替は拒否（全件を指定する）');
select throws_ok($$select public.reorder_steps('aaaaaaaa-0000-0000-0000-000000000001',
    array(select id from public.selection_steps where company_id = 'aaaaaaaa-0000-0000-0000-000000000001')
    || (select id from public.selection_steps where label = 'ES'))$$,
  '22023', null, '同じステップを2回指定した並替は拒否');
select lives_ok($$select public.reorder_steps('aaaaaaaa-0000-0000-0000-000000000001',
    array(select id from public.selection_steps where company_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by position desc))$$,
  '自分の企業のステップを並べ替えられる');
select is((select array_agg(label order by position) from public.selection_steps where company_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  array['二次面接', '一次面接', '筆記試験', 'ES'], '指定した順に並ぶ');
select is((select count(*)::int from public.timeline_entries where summary = 'ステップの順番を変更'), 1,
  '2-23 1回の並替で履歴は1件（N-5）');

-- ステップの削除
delete from public.selection_steps where label = '二次面接';
select is((select count(*)::int from public.timeline_entries where action = 'deleted' and summary = 'ステップを削除: 二次面接'), 1,
  'ステップの削除が履歴に残る');

-- ---------------------------------------------------------------- ゴミ箱（2-20, N-3, N-4）
select lives_ok($$select public.trash_company('aaaaaaaa-0000-0000-0000-000000000002')$$, 'ゴミ箱に移せる');
select throws_ok($$update public.companies set name = '変更' where id = 'aaaaaaaa-0000-0000-0000-000000000002'$$,
  '55000', null, 'ゴミ箱内の企業の項目は変更できない');
select throws_ok($$insert into public.selection_steps (company_id, kind, label) values ('aaaaaaaa-0000-0000-0000-000000000002', 'es', '追加')$$,
  '42501', null, 'ゴミ箱内の企業にステップを追加できない');
update public.selection_steps set label = '変更' where id = 'aaaaaaaa-5555-0000-0000-000000000099';
delete from public.selection_steps where id = 'aaaaaaaa-5555-0000-0000-000000000099';
select is((select label from public.selection_steps where id = 'aaaaaaaa-5555-0000-0000-000000000099'), 'ゴミ箱用ES',
  'ゴミ箱内の企業のステップは変更も削除もされない（読み取り専用）');
select throws_ok($$select public.reorder_steps('aaaaaaaa-0000-0000-0000-000000000002', array['aaaaaaaa-5555-0000-0000-000000000099'::uuid])$$,
  'P0002', null, 'ゴミ箱内の企業は並替もできない');
select lives_ok($$select public.restore_company('aaaaaaaa-0000-0000-0000-000000000002')$$, 'ゴミ箱から復元できる');
select is((select array_agg(action order by occurred_at, action) from public.timeline_entries
            where company_id = 'aaaaaaaa-0000-0000-0000-000000000002' and action in ('trashed', 'restored')),
  array['restored', 'trashed'], 'ゴミ箱への移動と復元が履歴に残る');
select is((select count(*)::int from public.selection_steps where company_id = 'aaaaaaaa-0000-0000-0000-000000000002'), 1,
  '復元するとステップも元どおり');
select throws_ok($$select public.purge_company('aaaaaaaa-0000-0000-0000-000000000002')$$,
  'P0002', null, 'ゴミ箱に入れていない企業は完全削除できない');
select public.trash_company('aaaaaaaa-0000-0000-0000-000000000002');
select lives_ok($$select public.purge_company('aaaaaaaa-0000-0000-0000-000000000002')$$, 'ゴミ箱内の企業を完全削除できる');
select throws_ok($$select public.trash_company('bbbbbbbb-0000-0000-0000-000000000001')$$,
  'P0002', null, '他人の企業はゴミ箱に移せない');
reset role;
select is((select count(*)::int from public.selection_steps where company_id = 'aaaaaaaa-0000-0000-0000-000000000002'), 0,
  '完全削除でステップも消える');
select is((select count(*)::int from public.timeline_entries where company_id = 'aaaaaaaa-0000-0000-0000-000000000002'), 0,
  '完全削除でその企業の履歴もすべて消える（N-3）');
select ok((select count(*) > 0 from public.timeline_entries where company_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'ほかの企業の履歴は残る');
select is(pg_temp.b_fingerprint(), (select fp from b_before), 'A の操作で B のステップ・企業・履歴は一切変わらない');

-- ---------------------------------------------------------------- 停止中の C・未ログイン
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select throws_ok($$insert into public.selection_steps (company_id, kind, label) values ('cccccccc-0000-0000-0000-000000000001', 'es', 'ES')$$,
  '42501', null, 'S-06 停止中の C は自分の企業にもステップを追加できない');
select is((select count(*)::int from public.timeline_entries), 0, 'S-06 停止中の C は自分の履歴も読めない');
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$select count(*) from public.selection_steps$$, '42501', null, 'S-01 未ログインはステップを読めない');
select throws_ok($$select count(*) from public.timeline_entries$$, '42501', null, 'S-01 未ログインは履歴を読めない');
select throws_ok($$select public.reorder_steps('aaaaaaaa-0000-0000-0000-000000000001', '{}')$$, '42501', null,
  '未ログインは並替RPCを呼べない');
reset role;

-- ---------------------------------------------------------------- アカウント完全削除（2-19）
create temp table b_before2 as select pg_temp.b_fingerprint() as fp;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select public.admin_revoke('a@example.com');
select lives_ok($$select public.admin_delete_account('a@example.com', 'a@example.com')$$,
  'ステップと履歴がある利用者も完全削除できる');
reset role;
select is((select count(*)::int from public.selection_steps where user_id = '11111111-1111-1111-1111-111111111111'), 0,
  '2-19 完全削除でステップがすべて消える');
select is((select count(*)::int from public.timeline_entries where user_id = '11111111-1111-1111-1111-111111111111'), 0,
  '2-19 完全削除で履歴がすべて消える');
select is(pg_temp.b_fingerprint(), (select fp from b_before2), '2-19 ほかの利用者のステップ・企業・履歴は変わらない');

-- ---------------------------------------------------------------- 構成
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'selection_steps'), 4,
  'selection_steps に4操作分のポリシーがある');
select ok(not has_table_privilege('authenticated', 'public.timeline_entries', 'insert,update,delete')
          and has_table_privilege('authenticated', 'public.timeline_entries', 'select'),
  '履歴は利用者に読む権限だけがある');
select is((select count(*)::int from private.schema_migrations where version = '20261013000002'), 1, '適用記録がある');

select * from finish();
rollback;
