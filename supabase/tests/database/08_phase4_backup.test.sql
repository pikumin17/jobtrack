-- フェーズ4: 全データの書き出しと復元（20261103000002）
-- 02 §6、D-01〜D-05、04 フェーズ4 の 4-01〜4-07（このファイルでの番号）
-- 利用者 A・B、停止中 C、未ログイン（anon）。
begin;
select plan(35);

-- ---------------------------------------------------------------- 準備（管理者権限で作成）
insert into public.allowed_emails (email, note) values ('a@example.com', 'A'), ('b@example.com', 'B'), ('c@example.com', 'C');
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com');
update public.profiles set status = 'suspended' where id = '33333333-3333-3333-3333-333333333333';
insert into public.companies (id, user_id, name) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B社');
insert into public.tasks (user_id, title) values ('22222222-2222-2222-2222-222222222222', 'B のタスク');

create function pg_temp.b_fingerprint() returns text language sql as $$
  select md5(string_agg(r, '|' order by r)) from (
    select row_to_json(c)::text as r from public.companies c where c.user_id = '22222222-2222-2222-2222-222222222222'
    union all select row_to_json(t)::text from public.tasks t where t.user_id = '22222222-2222-2222-2222-222222222222'
    union all select row_to_json(l)::text from public.timeline_entries l where l.user_id = '22222222-2222-2222-2222-222222222222'
  ) x;
$$;
create temp table b_before as select pg_temp.b_fingerprint() as fp;
create temp table saved (name text primary key, value jsonb);
grant execute on all functions in schema pg_temp to authenticated;
grant select, insert, update on saved to authenticated;

select ok(not has_function_privilege('anon', 'public.export_my_data()', 'execute'), 'anon は書き出せない');
select ok(not has_function_privilege('anon', 'public.restore_my_data(jsonb)', 'execute'), 'anon は復元できない');

-- ---------------------------------------------------------------- A のデータを作る
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

update public.profiles set display_name = 'ぴくみん', graduation_year = 2028 where id = auth.uid();
insert into public.companies (name, channel, application_status, applied_on, preference) values
  ('A社', 'agent', 'applied', '2026-10-01', 5), ('ゴミ箱の会社', null, 'not_applied', null, null);
insert into public.selection_steps (company_id, kind, label, status, completed_at) values
  ((select id from public.companies where name = 'A社'), 'es', 'ES', 'passed', '2026-10-02 10:00+09'),
  ((select id from public.companies where name = 'A社'), 'webtest', 'SPI', 'awaiting_result', '2026-10-05 10:00+09'),
  ((select id from public.companies where name = 'A社'), 'interview', '一次面接', 'not_started', null),
  ((select id from public.companies where name = 'ゴミ箱の会社'), 'es', 'ゴミ箱のES', 'not_started', null);
insert into public.events (company_id, kind, title, all_day_date) values
  ((select id from public.companies where name = 'A社'), 'briefing', 'A社 説明会', '2026-11-07');
insert into public.tasks (title, priority, due_date) values ('自己PRを見直す', 1, '2026-11-10');
select public.trash_company((select id from public.companies where name = 'ゴミ箱の会社'));

-- ---------------------------------------------------------------- 書き出し（4-01）
insert into saved values ('backup', public.export_my_data());
select is((select value ->> 'format' from saved where name = 'backup'), 'jobtrack-backup', '4-01 形式名が入る');
select is((select value #>> '{owner,user_id}' from saved where name = 'backup'), '11111111-1111-1111-1111-111111111111',
  '4-01 所有者は A');
select is((select value -> 'counts' from saved where name = 'backup'),
  ('{"companies": 2, "selection_steps": 4, "events": 1, "tasks": 1, "timeline_entries": ' ||
    (select count(*) from public.timeline_entries)::text || '}')::jsonb,
  '4-01 件数が入る（ゴミ箱の企業も含む）');
select is((select count(*)::int from saved, jsonb_array_elements(value #> '{data,companies}') c where c ? 'user_id'), 0,
  'user_id はファイルに入れない（復元時は常にログイン中の利用者）');
select is((select count(*)::int from saved, jsonb_array_elements(value #> '{data,tasks}') t where t ->> 'title' like 'B%'), 0,
  'S-11 B のデータは書き出しに入らない');
select is((select value #>> '{data,profile,display_name}' from saved where name = 'backup'), 'ぴくみん', 'プロフィールも入る');

-- ---------------------------------------------------------------- 書き出した後に変更してから、復元する（4-02）
delete from public.companies where name = 'A社';
insert into public.companies (name) values ('あとから足した会社');
update public.profiles set display_name = '別の名前' where id = auth.uid();

select lives_ok($$select public.restore_my_data((select value from saved where name = 'backup'))$$, '4-02 自分のバックアップを復元できる');
select is((select array_agg(name order by name) from public.companies), array['A社', 'ゴミ箱の会社'],
  '4-02 企業が書き出した時点に戻る（後から足した会社は消える）');
select is((select array_agg(label order by position) from public.selection_steps s
             join public.companies c on c.id = s.company_id where c.name = 'A社'),
  array['ES', 'SPI', '一次面接'], 'ステップの並び順が戻る');
select is((select status from public.selection_steps where label = 'SPI'), 'awaiting_result', 'ステップの状態が戻る');
select is((select selection_status from public.companies where name = 'A社'), 'in_progress', '選考状態は DB が計算し直す');
select is((select application_status || '/' || applied_on from public.companies where name = 'A社'), 'applied/2026-10-01',
  '応募状態と応募日が戻る');
select ok((select deleted_at is not null from public.companies where name = 'ゴミ箱の会社'), 'ゴミ箱内の企業はゴミ箱に戻る');
select is((select count(*)::int from public.selection_steps where label = 'ゴミ箱のES'), 1, 'ゴミ箱内の企業のステップも戻る');
select is((select c.name from public.events e join public.companies c on c.id = e.company_id where e.title = 'A社 説明会'), 'A社',
  '予定の企業の紐付けが、新しい ID に付け替わる');
select is((select priority::int || '/' || due_date from public.tasks where title = '自己PRを見直す'), '1/2026-11-10', 'タスクが戻る');
select ok((select c.id::text <> (select value #>> '{data,companies,0,id}' from saved where name = 'backup')
             from public.companies c where c.name = 'A社'), 'ID は新しく振り直す');
select is((select display_name from public.profiles where id = auth.uid()), 'ぴくみん', 'プロフィールが戻る');
select is((select count(*)::int from public.timeline_entries where action = 'backup_restored'), 1, '4-03 復元の記録が履歴に1件残る');
select is((select count(*)::int from public.timeline_entries where action <> 'backup_restored'),
  (select (value #>> '{counts,timeline_entries}')::int from saved where name = 'backup'),
  '4-03 履歴は書き出した時点のものに戻る（復元の途中の自動記録は残さない）');
select is((select count(*)::int from public.timeline_entries t join public.companies c on c.id = t.company_id where c.name = 'A社')
            > 0, true, '履歴の企業の紐付けも新しい ID に付け替わる');

-- ---------------------------------------------------------------- 復元できないもの（4-04〜4-06）。失敗したら何も変わらない
insert into saved values ('before_bad', (select jsonb_agg(name order by name) from public.companies));
select throws_ok($$select public.restore_my_data('{"format":"other","schema_version":1}')$$, '22023', null,
  '4-04 JobTrack のバックアップでなければ拒否');
select throws_ok($$select public.restore_my_data(jsonb_set((select value from saved where name = 'backup'), '{schema_version}', '2'))$$,
  '22023', null, '4-04 形式の版が違えば拒否');
select throws_ok($$select public.restore_my_data(jsonb_set((select value from saved where name = 'backup'), '{owner,user_id}',
                     '"22222222-2222-2222-2222-222222222222"'))$$,
  '42501', null, '4-05 D-05 ほかの利用者のバックアップは拒否');
select throws_ok($$select public.restore_my_data(jsonb_set((select value from saved where name = 'backup'), '{data,selection_steps,0,company_id}',
                     '"99999999-9999-9999-9999-999999999999"'))$$,
  '22023', null, '4-06 存在しない企業を参照するステップがあれば拒否');
select throws_ok($$select public.restore_my_data(jsonb_set((select value from saved where name = 'backup'), '{data,companies,0,channel}', '"unknown"'))$$,
  '23514', null, '4-06 決まった値以外の列があれば、表の制約で拒否');
select throws_ok($$select public.restore_my_data(jsonb_set((select value from saved where name = 'backup'), '{data,companies,1,id}',
                     (select value #> '{data,companies,0,id}' from saved where name = 'backup')))$$,
  '22023', null, '4-06 企業の ID が重複していれば拒否');
select is((select jsonb_agg(name order by name) from public.companies), (select value from saved where name = 'before_bad'),
  '4-06 復元に失敗しても、今のデータは変わらない（全体が取り消される）');

-- ---------------------------------------------------------------- B から
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select throws_ok($$select public.restore_my_data((select value from saved where name = 'backup'))$$, '42501', null,
  '4-05 B は A のバックアップを復元できない');
select is((select count(*)::int from public.companies), 1, 'B から見えるのは B の企業だけ');

-- ---------------------------------------------------------------- 停止中の C
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select throws_ok($$select public.export_my_data()$$, '42501', null, '停止中の利用者は書き出せない');
select throws_ok($$select public.restore_my_data('{}')$$, '42501', null, '停止中の利用者は復元できない');

reset role;
select is((select fp from b_before), pg_temp.b_fingerprint(), 'S-11 A の復元の前後で B のデータは変わらない');

select * from finish();
rollback;
