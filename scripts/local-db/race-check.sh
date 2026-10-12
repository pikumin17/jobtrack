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

# 2つ目: ログイン用メールを招待済みのメール X に変える処理と、X の取り消しが同時に起きても有効のまま残らない
"${P[@]}" -c "insert into public.allowed_emails(email) values ('race-old@example.com'), ('race-new@example.com')"
"${P[@]}" -c "insert into auth.users(id, email) values ('97979797-9797-9797-9797-979797979797', 'race-old@example.com')"
"${P[@]}" -c "begin; update auth.users set email = 'race-new@example.com' where id = '97979797-9797-9797-9797-979797979797'; select pg_sleep(3); commit;" >/dev/null &
sleep 1
"${P[@]}" -c "begin; set local role authenticated; set local request.jwt.claims = '{\"sub\":\"99999999-9999-9999-9999-999999999999\"}'; select public.admin_revoke('race-new@example.com'); commit;" >/dev/null
wait
state=$("${P[@]}" -At -c "select email || '/' || status from public.profiles where id = '97979797-9797-9797-9797-979797979797'")
if [ "$state" != "race-new@example.com/suspended" ]; then
  echo "NG: メール変更と同時に取り消したユーザーが $state になった" >&2
  exit 1
fi
echo "ok: メール変更と同時に取り消したユーザーは停止になる"

# 3つ目: 取り消しが先に始まり、その途中でメールを X に変えた場合も有効にならない
"${P[@]}" -c "insert into public.allowed_emails(email) values ('race-old2@example.com'), ('race-new2@example.com')"
"${P[@]}" -c "insert into auth.users(id, email) values ('96969696-9696-9696-9696-969696969696', 'race-old2@example.com')"
"${P[@]}" -c "begin; set local role authenticated; set local request.jwt.claims = '{\"sub\":\"99999999-9999-9999-9999-999999999999\"}'; select public.admin_revoke('race-new2@example.com'); select pg_sleep(3); commit;" >/dev/null &
sleep 1
"${P[@]}" -c "update auth.users set email = 'race-new2@example.com' where id = '96969696-9696-9696-9696-969696969696'" >/dev/null
wait
state=$("${P[@]}" -At -c "select email || '/' || status from public.profiles where id = '96969696-9696-9696-9696-969696969696'")
if [ "$state" != "race-new2@example.com/suspended" ]; then
  echo "NG: 取り消し中にメールを変えたユーザーが $state になった" >&2
  exit 1
fi
echo "ok: 取り消し中にメールを変えたユーザーは停止になる"
