# JobTrack 開発ルール

- 設計書（プロジェクト共有フォルダの design/）が仕様の基準。変更が必要なら先に持ち主に確認する。
- フェーズごとに進める。持ち主の明示的な開始の指示なしに次のフェーズを実装しない。
- 0円運用: 有料プラン・独自ドメイン・課金機能は事前承認。支払い方法を登録しない。
- 本番DB: マイグレーションSQLを書き、変更内容と影響を提示する。適用は持ち主が SQL Editor で行う。CI から本番に接続しない。本番の秘密情報を受け取らない・求めない。
- マイグレーションは1ファイル＝1回の実行。冒頭で private.schema_migrations を見て二重適用を止め、末尾で記録する。BEGIN/COMMIT は書かない（SQL Editor が1トランザクションで実行する）。
- 全テーブルで RLS を有効にし、ポリシーは `to authenticated` と `private.is_active_member()` を必ず含める。anon には権限を与えない。security definer 関数は `set search_path = ''`。
- 日付・時刻は src/lib/dates.ts だけを経由する（Asia/Tokyo 固定。ESLint で date-fns の直接利用を禁止）。
- `src/lib/database.types.ts` はマイグレーションに合わせて手で更新する。
- 変更後は lint・typecheck・test・build・check:secrets・scripts/local-db/run.sh を通す。
