-- このファイルは scripts/gen-selection-cases.mjs が supabase/fixtures/selection-cases.json から生成する。手で編集しない。
-- 判定表（02 §3.5.3）を DB の関数で検査し、src/lib/status.ts と同じ結果になることを保証する（2-01, 2-02）
begin;
select plan(30);
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[]'::jsonb) j),
  row('not_started'::text, null::text)::text, 'ステップなし');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"not_started"},{"position":1,"status":"not_started"}]'::jsonb) j),
  row('not_started'::text, null::text)::text, '全て未着手');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"scheduled"},{"position":1,"status":"not_started"}]'::jsonb) j),
  row('in_progress'::text, null::text)::text, '予定あり');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"done"}]'::jsonb) j),
  row('in_progress'::text, null::text)::text, '実施/提出済み');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"awaiting_result"},{"position":1,"status":"awaiting_result"}]'::jsonb) j),
  row('in_progress'::text, null::text)::text, '結果待ちが複数');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"passed"},{"position":1,"status":"failed"}]'::jsonb) j),
  row('rejected'::text, null::text)::text, '不合格');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"passed"},{"position":1,"status":"withdrawn"}]'::jsonb) j),
  row('withdrawn'::text, null::text)::text, '辞退');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"passed"},{"position":1,"status":"passed"}]'::jsonb) j),
  row('in_progress'::text, null::text)::text, '全通過でも内定と推測しない（E-3）');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"exempted"},{"position":1,"status":"not_started"}]'::jsonb) j),
  row('in_progress'::text, null::text)::text, '免除だけでも選考中');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"exempted"},{"position":1,"status":"passed"}]'::jsonb) j),
  row('in_progress'::text, null::text)::text, '免除と通過の混在');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"failed"},{"position":1,"status":"scheduled"}]'::jsonb) j),
  row('needs_review'::text, 'progress_after_failed'::text)::text, 'E-1 不合格の後ろが予定');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"failed"},{"position":1,"status":"awaiting_result"}]'::jsonb) j),
  row('needs_review'::text, 'progress_after_failed'::text)::text, 'E-1 不合格の後ろが結果待ち');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"failed"},{"position":1,"status":"passed"}]'::jsonb) j),
  row('needs_review'::text, 'progress_after_failed'::text)::text, 'E-1 不合格の後ろが通過');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"failed"},{"position":1,"status":"done"}]'::jsonb) j),
  row('needs_review'::text, 'progress_after_failed'::text)::text, 'E-1 不合格の後ろが実施済み');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"passed"},{"position":1,"status":"passed"},{"position":2,"status":"failed"}]'::jsonb) j),
  row('rejected'::text, null::text)::text, '不合格の前が通過（順当）');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"failed"},{"position":1,"status":"exempted"}]'::jsonb) j),
  row('rejected'::text, null::text)::text, '不合格の後ろが免除だけなら不合格');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"withdrawn"},{"position":1,"status":"failed"}]'::jsonb) j),
  row('needs_review'::text, 'failed_and_withdrawn'::text)::text, 'E-2 不合格と辞退の混在');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"withdrawn"},{"position":1,"status":"scheduled"}]'::jsonb) j),
  row('needs_review'::text, 'progress_after_withdrawn'::text)::text, '辞退の後ろが予定');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"withdrawn"},{"position":1,"status":"not_started"}]'::jsonb) j),
  row('withdrawn'::text, null::text)::text, '辞退の後ろが未着手だけ');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"passed"},{"position":1,"status":"failed"},{"position":2,"status":"not_started"},{"position":3,"status":"not_started"}]'::jsonb) j),
  row('rejected'::text, null::text)::text, 'E-8 不合格の後ろが未着手だけ');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":0,"status":"passed"},{"position":1,"status":"passed"},{"position":2,"status":"scheduled"}]'::jsonb) j),
  row('in_progress'::text, null::text)::text, 'E-9 不合格を通過に戻した');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":7,"status":"scheduled"},{"position":3,"status":"failed"}]'::jsonb) j),
  row('needs_review'::text, 'progress_after_failed'::text)::text, '位置の番号が飛んでいても順序で判定');
select is((select row(j.status, j.reason)::text from private.judge_selection_status(null, '[{"position":2,"status":"passed"},{"position":9,"status":"failed"}]'::jsonb) j),
  row('rejected'::text, null::text)::text, '不合格が後ろなら前の通過は問題なし（番号が飛ぶ）');
select is((select row(j.status, j.reason)::text from private.judge_selection_status('offer', '[{"position":0,"status":"passed"}]'::jsonb) j),
  row('offer'::text, null::text)::text, '結果を記録（内定）が最優先');
select is((select row(j.status, j.reason)::text from private.judge_selection_status('offer', '[{"position":0,"status":"awaiting_result"},{"position":1,"status":"failed"}]'::jsonb) j),
  row('offer'::text, null::text)::text, 'E-6 内定を記録し結果待ち・不合格が残る');
select is((select row(j.status, j.reason)::text from private.judge_selection_status('offer_accepted', '[]'::jsonb) j),
  row('offer_accepted'::text, null::text)::text, '結果を記録（内定承諾）');
select is((select row(j.status, j.reason)::text from private.judge_selection_status('offer_declined', '[{"position":0,"status":"passed"}]'::jsonb) j),
  row('offer_declined'::text, null::text)::text, '結果を記録（内定辞退）');
select is((select row(j.status, j.reason)::text from private.judge_selection_status('rejected', '[{"position":0,"status":"failed"},{"position":1,"status":"scheduled"}]'::jsonb) j),
  row('rejected'::text, null::text)::text, '結果を記録（不合格）は要確認より優先');
select is((select row(j.status, j.reason)::text from private.judge_selection_status('withdrawn', '[{"position":0,"status":"scheduled"}]'::jsonb) j),
  row('withdrawn'::text, null::text)::text, '結果を記録（辞退）');
select is((select row(j.status, j.reason)::text from private.judge_selection_status('closed_other', '[]'::jsonb) j),
  row('closed_other'::text, null::text)::text, '結果を記録（終了・その他）');
select * from finish();
rollback;
