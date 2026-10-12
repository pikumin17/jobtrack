-- =====================================================================
-- 初期管理者の設定（A-4）。マイグレーション 20261012000001 を適用した後に使う。
-- Supabase ダッシュボード → SQL Editor で、手順1 → (アプリでログイン) → 手順2 の順に実行する。
-- 'you@example.com' は自分の Google アカウントのメールアドレスに置き換える（小文字で）。
-- =====================================================================

-- 手順1: 自分のメールを許可リストに登録する（これでGoogleログインできるようになる）
insert into public.allowed_emails (email, note)
values (lower('you@example.com'), '本人（管理者）')
on conflict (email) do nothing;

-- ↓ ここでアプリから一度Googleログインする。ログインすると profiles に自分の行ができる。

-- 手順2: 自分を管理者にする（1行更新されれば成功。0行ならまだログインしていない）
-- update public.profiles set role = 'admin' where email = lower('you@example.com');

-- 確認用: 自分の行が role = admin, status = active になっていること
-- select email, role, status from public.profiles;
