#!/usr/bin/env bash
# 本物の Supabase（認証サービス・API込み、CI の使い捨て環境）で、アカウント完全削除を端から端まで確かめる（03 §8.1 S-22）。
# 前提: `supabase start` 済み。使うキーは Supabase CLI のローカル専用の値で、本番の秘密情報ではない。本番には接続しない。
set -euo pipefail
cd "$(dirname "$0")/../.."

eval "$(supabase status -o env | grep -E '^(API_URL|DB_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q -At)
PASS='E2e-password-123!'
M=m-e2e@example.com T=t-e2e@example.com B=b-e2e@example.com
fail() { echo "NG: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }

# API を呼ぶ。標準出力に「HTTP状態 本文」を返す
call() { # method path token [json]
  local out; out=$(curl -sS -o /tmp/e2e-body -w '%{http_code}' -X "$1" "$API_URL$2" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $3" -H 'Content-Type: application/json' ${4:+-d "$4"})
  echo "$out $(cat /tmp/e2e-body)"
}
status_of() { echo "${1%% *}"; }
body_of() { echo "${1#* }"; }

echo "== 準備"
echo "削除RPCの持ち主: $("${PSQL[@]}" -c "select proowner::regrole from pg_proc where oid = 'private.admin_delete_account(text,text)'::regprocedure")"
"${PSQL[@]}" -c "insert into public.allowed_emails (email) values ('$M'), ('$T'), ('$B')"
for e in $M $T $B; do
  r=$(call POST /auth/v1/admin/users "$SERVICE_ROLE_KEY" "{\"email\":\"$e\",\"password\":\"$PASS\",\"email_confirm\":true}")
  [ "$(status_of "$r")" = 200 ] || fail "ユーザー作成 $e: $r"
done
"${PSQL[@]}" -c "update public.profiles set role = 'admin' where email = '$M'"
login() { call POST '/auth/v1/token?grant_type=password' "$ANON_KEY" "{\"email\":\"$1\",\"password\":\"$PASS\"}"; }
TM=$(body_of "$(login $M)" | jq -r .access_token)
TB=$(body_of "$(login $B)" | jq -r .access_token)
TL=$(body_of "$(login $T)")
TT=$(echo "$TL" | jq -r .access_token); TR=$(echo "$TL" | jq -r .refresh_token)
[ "$TT" != null ] && [ "$TR" != null ] || fail "T のログイン: $TL"
UID_T=$("${PSQL[@]}" -c "select id from auth.users where email = '$T'")
for tok in "$TM" "$TT" "$TB"; do
  r=$(call POST /rest/v1/companies "$tok" '{"name":"E2E社"}'); [ "$(status_of "$r")" = 201 ] || fail "企業登録: $r"
done

# auth スキーマで user_id 列を持つ全テーブルについて、対象者の行数を数える
auth_rows() {
  "${PSQL[@]}" -c "
    do \$\$ declare t record; n int; begin
      create temp table if not exists e2e_counts (tbl text, n int); truncate e2e_counts;
      for t in select table_name from information_schema.columns
               where table_schema = 'auth' and column_name = 'user_id' order by 1 loop
        execute format('select count(*) from auth.%I where user_id::text = %L', t.table_name, '$UID_T') into n;
        insert into e2e_counts values (t.table_name, n);
      end loop;
      insert into e2e_counts select 'users', count(*) from auth.users where id = '$UID_T';
      insert into e2e_counts select 'audit_log_entries', count(*) from auth.audit_log_entries
        where payload::text like '%$UID_T%' or payload::text like '%\"$T\"%';
    end \$\$;
    select string_agg(tbl || '=' || n, ' ' order by tbl) from e2e_counts;"
}
echo "削除前の auth の行数: $(auth_rows)"
ADMIN_BEFORE=$("${PSQL[@]}" -c "select md5(string_agg(row_to_json(x)::text, '|' order by x::text)) from (
  select p.* from public.profiles p where p.email <> '$T') x")

echo "== 権限の確認"
r=$(call POST /rest/v1/rpc/admin_revoke "$TM" "{\"p_email\":\"$T\"}"); [ "$(status_of "$r")" = 204 ] || fail "取り消し: $r"
r=$(call POST /rest/v1/rpc/admin_delete_account "$TB" "{\"p_email\":\"$T\",\"p_confirm_email\":\"$T\"}")
[ "$(status_of "$r")" -ge 400 ] && ok "一般ユーザーは削除できない ($(status_of "$r"))" || fail "一般ユーザーが削除できた: $r"
r=$(call POST /rest/v1/rpc/admin_delete_account "$TT" "{\"p_email\":\"$T\",\"p_confirm_email\":\"$T\"}")
[ "$(status_of "$r")" -ge 400 ] && ok "対象者本人は削除を実行できない ($(status_of "$r"))" || fail "本人が実行できた: $r"
r=$(call POST /rest/v1/rpc/admin_delete_account "$TM" "{\"p_email\":\"$M\",\"p_confirm_email\":\"$M\"}")
[ "$(status_of "$r")" -ge 400 ] && ok "管理者は自分を削除できない ($(status_of "$r"))" || fail "自分を削除できた: $r"

echo "== 削除"
r=$(call POST /rest/v1/rpc/admin_delete_account "$TM" "{\"p_email\":\"$T\",\"p_confirm_email\":\"$T\"}")
[ "$(status_of "$r")" = 200 ] || fail "削除: $r"
echo "結果: $(body_of "$r")"
[ "$(body_of "$r" | jq -r .auth_user_deleted)" = true ] || fail "auth_user_deleted が true でない"
AFTER=$(auth_rows); echo "削除後の auth の行数: $AFTER"
echo "$AFTER" | grep -Eq '=[1-9]' && fail "auth に対象者の行が残っている"
ok "auth スキーマ（users・identities・sessions・refresh_tokens などすべて）に対象者の行がない"
LOG_DELETED=$(body_of "$r" | jq -r .auth_log_entries_deleted)
[ "$LOG_DELETED" != null ] && ok "認証記録 $LOG_DELETED 行を削除" || echo "注意: 認証記録の削除権限がなく、記録は残った"
n=$("${PSQL[@]}" -c "select count(*) from public.profiles where email = '$T'"); [ "$n" = 0 ] || fail "プロフィールが残っている"
n=$("${PSQL[@]}" -c "select count(*) from public.companies where user_id = '$UID_T'"); [ "$n" = 0 ] || fail "企業が残っている"
n=$("${PSQL[@]}" -c "select count(*) from public.allowed_emails where email = '$T'"); [ "$n" = 0 ] || fail "招待が残っている"
n=$("${PSQL[@]}" -c "select count(*) from public.admin_audit_log where target_email = '$T'"); [ "$n" = 0 ] || fail "監査ログに対象メールが残っている"
ok "プロフィール・企業・招待が消え、監査ログに対象メールが残っていない"
[ "$ADMIN_BEFORE" = "$("${PSQL[@]}" -c "select md5(string_agg(row_to_json(x)::text, '|' order by x::text)) from (select p.* from public.profiles p) x")" ] \
  || fail "管理者・ほかの人のプロフィールが変わった"
n=$("${PSQL[@]}" -c "select count(*) from public.companies c join public.profiles p on p.id = c.user_id where p.email in ('$M', '$B')")
[ "$n" = 2 ] || fail "管理者・ほかの人の企業が変わった ($n)"
ok "管理者とほかの人のプロフィール・企業は変わらない"

echo "== 削除後のログイン情報"
r=$(call POST '/auth/v1/token?grant_type=refresh_token' "$ANON_KEY" "{\"refresh_token\":\"$TR\"}")
[ "$(status_of "$r")" -ge 400 ] && ok "リフレッシュトークンで更新できない ($(status_of "$r"))" || fail "更新できた: $r"
r=$(call GET '/rest/v1/companies?select=id' "$TT")
echo "残ったアクセストークンでの企業一覧: $r"
[ "$(status_of "$r")" -ge 400 ] || [ "$(body_of "$r")" = '[]' ] || fail "残ったアクセストークンでデータが読めた"
ok "残ったアクセストークンでは何も読めない"
r=$(call GET /auth/v1/user "$TT"); echo "残ったアクセストークンでのユーザー取得: $(status_of "$r")"
# 利用者が自分で登録し直す経路（ブラウザから届く経路）は、招待判定フックが拒否する
r=$(call POST /auth/v1/signup "$ANON_KEY" "{\"email\":\"$T\",\"password\":\"$PASS\"}")
[ "$(status_of "$r")" -ge 400 ] && ok "同じメールで登録し直そうとしても招待判定フックが拒否する ($(status_of "$r"))" || fail "登録し直せた: $r"
n=$("${PSQL[@]}" -c "select count(*) from auth.users where email = '$T'"); [ "$n" = 0 ] || fail "登録し直しでユーザーが作られた"
# 管理用の秘密キーでの作成（ブラウザからは使えない経路）はフックを通らない。作られても招待がないので停止状態になる
r=$(call POST /auth/v1/admin/users "$SERVICE_ROLE_KEY" "{\"email\":\"$T\",\"password\":\"$PASS\",\"email_confirm\":true}")
echo "参考: 管理用キーでの作成: $(status_of "$r")"
if [ "$(status_of "$r")" = 200 ]; then
  st=$("${PSQL[@]}" -c "select status from public.profiles where email = '$T'")
  [ "$st" = suspended ] && ok "管理用キーで作り直しても、招待がないので停止状態（データは使えない）" || fail "作り直したユーザーが停止状態でない: $st"
fi
echo "すべて成功"
