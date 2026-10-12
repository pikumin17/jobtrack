-- =====================================================================
-- 初期管理者の設定（A-4）。マイグレーション 20261012000001 を適用した後に使う。
-- Supabase ダッシュボード → SQL Editor で、手順1 → (フック登録・アプリでログイン) → 手順2 の順に実行する。
-- 'you@example.com' は自分の Google アカウントのメールアドレスに置き換える。
-- =====================================================================

-- 手順1: 自分のメールを許可リストに登録する（これで招待判定フックを通れるようになる）
insert into public.allowed_emails (email, note)
values (lower(btrim('you@example.com')), '本人（管理者）')
on conflict (email) do nothing;

-- 確認: 1行表示されること
select email, revoked_at from public.allowed_emails;

-- ↓ ここで Authentication → Hooks に招待判定フックを登録し、アプリから一度Googleログインする。
--   ログインすると profiles に自分の行（role = member, status = active）ができる。

-- 手順2: 自分を管理者にする（"UPDATE 1" と出れば成功。"UPDATE 0" ならまだログインしていない）
-- update public.profiles set role = 'admin' where email = lower(btrim('you@example.com'));

-- 確認: 自分の行が role = admin, status = active になっていること
-- select email, role, status from public.profiles;
