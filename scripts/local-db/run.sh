#!/usr/bin/env bash
# ローカルの Postgres（16 以上、pgTAP 入り）で、マイグレーションと pgTAP テストを実行する。
# 使い方: scripts/local-db/run.sh   （PGHOST/PGUSER などは環境変数で指定。既定は postgres ユーザーの local 接続）
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${JOBTRACK_TEST_DB:-jobtrack_test}
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)

dropdb --if-exists "$DB"
createdb "$DB"
"${PSQL[@]}" -d "$DB" -c "alter database \"$DB\" set search_path = \"\$user\", public, extensions"
"${PSQL[@]}" -d "$DB" -f scripts/local-db/supabase-stub.sql
# 適用前から既にいるユーザー（本番で以前にログインを試した場合など）を再現する
"${PSQL[@]}" -d "$DB" -c "insert into auth.users (email) values ('Preexisting@example.com')"
for f in supabase/migrations/*.sql; do
  echo "== apply $f"
  # SQL Editor と同じく、ファイル全体を1回の実行（1トランザクション）として流す
  "${PSQL[@]}" -d "$DB" -1 -f "$f"
done

echo "== re-apply guard check"
for f in supabase/migrations/*.sql; do
  if "${PSQL[@]}" -d "$DB" -1 -f "$f" 2>/dev/null; then
    echo "二重適用が止まりませんでした: $f" >&2; exit 1
  fi
done
echo "ok: 二重適用は拒否された"

pg_prove -d "$DB" supabase/tests/database/*.sql

echo "== race check"
scripts/local-db/race-check.sh "$DB"
