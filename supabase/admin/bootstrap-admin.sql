-- =====================================================================
-- 初期管理者の設定（A-4）。マイグレーション 20261012000001 を適用した後に使う。
-- Supabase ダッシュボード → SQL Editor で、手順1 → (フック登録・アプリでログイン) → 手順2 の順に実行する。
-- 'you@example.com'（2か所）は自分の Google アカウントのメールアドレスに置き換える。
-- =====================================================================

-- 手順1: 自分のメールを許可リストに登録する（これで招待判定フックを通れるようになる）
insert into public.allowed_emails (email, note)
values (lower(btrim('you@example.com')), '本人（管理者）')
on conflict (email) do nothing;

-- 確認: 自分のメールが1行表示され、revoked_at が空であること
select email, revoked_at from public.allowed_emails;

-- ↓ ここで Authentication → Hooks に招待判定フックを登録し、アプリから一度Googleログインする。
--   SQL適用前から自分のユーザーがいた場合も、そのままログインしてよい（次の手順2で有効になる）。

-- 手順2: 自分を管理者にして有効にする（"UPDATE 1" と出れば成功。"UPDATE 0" ならまだログインしていない）
-- update public.profiles set role = 'admin', status = 'active' where email = lower(btrim('you@example.com'));

-- 確認: 自分の行が role = admin, status = active になっていること。ほかの人は suspended のままでよい
-- select email, role, status from public.profiles;
