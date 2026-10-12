#!/usr/bin/env bash
# 招待の取り消しと初回ログイン（ユーザー作成）が同時に起きても、「取り消したのに有効」にならないことを確かめる。
# 1つのトランザクションでは再現できないため、2つの接続を使う。run.sh から呼ばれる。
set -euo pipefail
DB=$1
P=(psql -X -q -d "$DB" -v ON_ERROR_STOP=1)
"${P[@]}" -c "insert into public.allowed_emails(email) values ('race@example.com'), ('raceadmin@example.com')"
"${P[@]}" -c "insert into auth.users(id, email) values ('99999999-9999-9999-9999-999999999999', 'raceadmin@example.com')"
"${P[@]}" -c "update public.profiles set role = 'admin' where id = '99999999-9999-9999-9999-999999999999'"
# 接続1: ユーザー作成のトランザクションを3秒開いたままにする
"${P[@]}" -c "begin; insert into auth.users(id, email) values ('98989898-9898-9898-9898-989898989898', 'race@example.com'); select pg_sleep(3); commit;" >/dev/null &
sleep 1
# 接続2: その間に管理者が取り消す
"${P[@]}" -c "begin; set local role authenticated; set local request.jwt.claims = '{\"sub\":\"99999999-9999-9999-9999-999999999999\"}'; select public.admin_revoke('race@example.com'); commit;" >/dev/null
wait
status=$("${P[@]}" -At -c "select status from public.profiles where email = 'race@example.com'")
if [ "$status" != "suspended" ]; then
  echo "NG: 取り消しと同時に作られたユーザーが $status になった" >&2
  exit 1
fi
echo "ok: 取り消しと同時に作られたユーザーは停止になる"
