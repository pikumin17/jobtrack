# JobTrack

就職活動の応募・選考・予定を管理する、招待制のWebアプリです（利用者2人を想定）。

- 画面: React + TypeScript + Vite + Tailwind CSS
- データ・ログイン: Supabase（Googleログインのみ、招待制、行単位のアクセス制御 RLS）
- 公開: Vercel（Hobby・無料）

設計書はプロジェクトの共有フォルダ `design/`（v0.6）にあります。

## 運用の決まり

- **開発・運用とも0円。** 有料プラン・独自ドメイン・課金機能は、事前に持ち主の承認を得る。支払い方法はどのサービスにも登録しない。
- **本番DBへの変更は手動。** `supabase/migrations/` の SQL を、持ち主が内容を確認・承認したうえで Supabase の SQL Editor から実行する。GitHub Actions は本番に接続しない。
- **秘密情報を置かない。** ブラウザに渡すのは `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY`（公開キー）だけ。

## 手元で動かす

```bash
cp .env.example .env.local   # Supabase の URL と Publishable key を記入
npm ci
npm run dev                  # http://localhost:5173
```

## 検査

```bash
npm run lint
npm run typecheck
npm test
npm run build && npm run check:secrets
scripts/local-db/run.sh      # Postgres + pgTAP がある環境で、マイグレーションとDBテスト
```

## 本番DBの初期設定（フェーズ1）

1. `supabase/migrations/20261012000001_phase1_foundation.sql` を SQL Editor で実行
2. Authentication → Hooks で Before User Created に `public.hook_before_user_created` を登録
3. `supabase/admin/bootstrap-admin.sql` の手順で、自分を許可リストと管理者に登録
