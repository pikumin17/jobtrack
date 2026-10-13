-- =====================================================================
-- JobTrack フェーズ1追加: アカウント完全削除（設計書 v0.9、A-9）
-- バージョン: 20261013000001（20261012000002 の適用後に実行する）
--
-- 適用方法は既存と同じ（設計書 05 §7）。SQL Editor に全文を貼り付けて1回で実行する。
-- 既存の行は削除・変更しない。関数の追加、監査ログの列と制約の変更だけを行う。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 二重適用の防止と前提の確認
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from private.schema_migrations where version = '20261012000002') then
    raise exception '先に 20261012000002 を適用してください。';
  end if;
  if exists (select 1 from private.schema_migrations where version = '20261013000001') then
    raise exception 'マイグレーション 20261013000001 は適用済みです。再実行は不要です。';
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 1. 監査ログ: 完全削除した人の対象メールを消せるようにし、削除の操作を記録できるようにする
--    （既存の行はそのまま。delete_account の行は対象メールを持たない）
-- ---------------------------------------------------------------------
alter table public.admin_audit_log alter column target_email drop not null;
alter table public.admin_audit_log drop constraint admin_audit_log_action_check;
alter table public.admin_audit_log add constraint admin_audit_log_action_check
  check (action in ('invite', 'revoke', 'restore_access', 'delete_account'));
alter table public.admin_audit_log add constraint admin_audit_log_delete_has_no_email
  check (action <> 'delete_account' or target_email is null);

-- ---------------------------------------------------------------------
-- 2. 完全削除RPC（管理者だけ。取り消し済みの、管理者以外のアカウントだけ）
--    1回の呼び出し＝1トランザクション。途中で失敗したら何も消えない。
-- ---------------------------------------------------------------------
create function private.admin_delete_account(p_email text, p_confirm_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor        uuid := private.assert_admin();
  v_email        text := private.normalize_email(p_email);
  v_revoked      timestamptz;
  v_uid          uuid;
  v_log_deleted  integer;
  v_user_deleted boolean := false;
begin
  -- 二重確認: 画面で再入力したメールを DB 側でも照合する
  if private.canonical_email(p_confirm_email) is distinct from v_email then
    raise exception '確認用のメールアドレスが一致しません' using errcode = '22023';
  end if;

  select revoked_at into v_revoked from public.allowed_emails where email = v_email for update;
  if not found then
    raise exception '招待が見つかりません' using errcode = 'P0002';
  end if;
  if v_revoked is null then
    raise exception '先に招待を取り消してください' using errcode = '55000';
  end if;

  select p.id into v_uid from public.profiles p where p.email = v_email for update;
  if v_uid is null then
    select u.id into v_uid from auth.users u where lower(btrim(u.email)) = v_email limit 1;
  end if;
  if v_uid = v_actor or exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'admin') then
    raise exception '管理者のアカウントは削除できません' using errcode = '42501';
  end if;

  -- Supabase の認証記録（ログイン履歴。メール・IPアドレスを含む）。削除権限がない環境では消さずに残し、結果で知らせる
  if to_regclass('auth.audit_log_entries') is not null
     and has_table_privilege('auth.audit_log_entries', 'DELETE') then
    delete from auth.audit_log_entries e
     where lower(e.payload ->> 'actor_username') = v_email
        or lower(e.payload -> 'traits' ->> 'user_email') = v_email
        or (v_uid is not null and (e.payload ->> 'actor_id' = v_uid::text
                                   or e.payload -> 'traits' ->> 'user_id' = v_uid::text));
    get diagnostics v_log_deleted = row_count;
  end if;

  -- ログイン情報。profiles と、その user_id にぶら下がる全データ（企業・通知設定など）が連動して消える
  if v_uid is not null then
    delete from auth.users where id = v_uid;
    v_user_deleted := found;
  end if;

  delete from public.allowed_emails where email = v_email;

  -- 監査ログの匿名化: 対象メールを NULL にする（ハッシュ等も残さないので復元できない）。日時と操作の種類は残す
  update public.admin_audit_log set target_email = null where target_email = v_email;
  insert into public.admin_audit_log (actor_id, action, target_email) values (v_actor, 'delete_account', null);

  return jsonb_build_object('auth_user_deleted', v_user_deleted, 'auth_log_entries_deleted', v_log_deleted);
end;
$$;
revoke all on function private.admin_delete_account(text, text) from public, anon;
grant execute on function private.admin_delete_account(text, text) to authenticated;

create function public.admin_delete_account(p_email text, p_confirm_email text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.admin_delete_account(p_email, p_confirm_email);
$$;
revoke all on function public.admin_delete_account(text, text) from public, anon;
grant execute on function public.admin_delete_account(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. 適用記録
-- ---------------------------------------------------------------------
insert into private.schema_migrations (version, description)
values ('20261013000001', 'フェーズ1追加: アカウント完全削除（取り消し済みのみ、監査ログの匿名化）');
