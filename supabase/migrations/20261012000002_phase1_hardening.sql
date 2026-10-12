-- =====================================================================
-- JobTrack フェーズ1: 招待・プロフィールまわりの強化（再レビューの指摘対応）
-- バージョン: 20261012000002（20261012000001 の適用後に実行する）
--
-- 適用方法は 20261012000001 と同じ（設計書 05 §7）。SQL Editor に全文を貼り付けて1回で実行する。
-- 既存のテーブル・データは削除しない。関数の置き換え、トリガーの追加、権限の絞り込みだけを行う。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 二重適用の防止と前提の確認
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from private.schema_migrations where version = '20261012000001') then
    raise exception '先に 20261012000001 を適用してください。';
  end if;
  if exists (select 1 from private.schema_migrations where version = '20261012000002') then
    raise exception 'マイグレーション 20261012000002 は適用済みです。再実行は不要です。';
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 1. メールアドレスの正規化を1か所にそろえる（フック・トリガー・管理者RPCで同じ結果にする）
--    前後の空白を除いて小文字にする。形式チェックはしない（Google から来る値をそのまま受ける）
-- ---------------------------------------------------------------------
create function private.canonical_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(btrim(p_email)), '');
$$;
revoke all on function private.canonical_email(text) from public, anon, authenticated;

-- 招待されているか（有効な招待があるか）。行を共有ロックし、判定の直後に取り消しが割り込まないようにする
create function private.is_invited_email(p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.allowed_emails a
    where a.email = private.canonical_email(p_email) and a.revoked_at is null
    for share;
  return found;
end;
$$;
revoke all on function private.is_invited_email(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. ユーザー作成時のトリガー: 正規化をそろえ、取り消しとの競合を防ぐ
--    （作成と同時に取り消しが走っても、取り消し側が作成の完了を待つため「取り消したのに有効」にならない）
-- ---------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := private.canonical_email(new.email);
  v_status text;
begin
  -- メールのないユーザー（電話番号ログイン等。本アプリでは無効）は作成させない
  if v_email is null then
    raise exception 'メールアドレスのないユーザーは作成できません' using errcode = '23502';
  end if;
  v_status := case when private.is_invited_email(v_email) then 'active' else 'suspended' end;
  insert into public.profiles (id, email, status) values (new.id, v_email, v_status);
  insert into public.notification_settings (user_id, email_address) values (new.id, v_email);
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. ログイン用メールが変わったら、プロフィールのメールも追従し、招待を判定し直す
--    （招待されていないメールに変えた場合は停止。管理者の一覧・取り消しも新しいメールで扱える）
-- ---------------------------------------------------------------------
create function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := private.canonical_email(new.email);
begin
  if v_email is null then
    update public.profiles set status = 'suspended' where id = new.id;
    return new;
  end if;
  update public.profiles
    set email  = v_email,
        status = case when private.is_invited_email(v_email) then status else 'suspended' end
    where id = new.id;
  return new;
end;
$$;
revoke all on function private.handle_user_email_change() from public, anon, authenticated;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- ---------------------------------------------------------------------
-- 4. 招待RPC: 同時実行での重複エラーをなくし、停止中のプロフィールは必ず有効に戻す
-- ---------------------------------------------------------------------
create or replace function private.admin_invite(p_email text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := private.assert_admin();
  v_email    text := private.normalize_email(p_email);
  v_note     text := nullif(btrim(p_note), '');
  v_inserted boolean;
  v_revoked  timestamptz;
begin
  insert into public.allowed_emails (email, invited_by, note) values (v_email, v_actor, v_note)
    on conflict (email) do nothing;
  v_inserted := found;

  if v_inserted then
    insert into public.admin_audit_log (actor_id, action, target_email) values (v_actor, 'invite', v_email);
  else
    select revoked_at into v_revoked from public.allowed_emails where email = v_email for update;
    update public.allowed_emails
      set revoked_at = null, note = coalesce(v_note, note)
      where email = v_email;
    if v_revoked is not null then
      -- 再招待: アクセスだけを戻す。データは取り消し中も保持している（A-3）
      insert into public.admin_audit_log (actor_id, action, target_email) values (v_actor, 'restore_access', v_email);
    end if;
  end if;

  -- 招待前に停止状態で作られていたユーザー、または招待済みなのに停止になっているユーザーを有効にする
  update public.profiles set status = 'active' where email = v_email and status <> 'active';
end;
$$;

-- ---------------------------------------------------------------------
-- 5. companies: 登録時に指定できる列を、利用者が編集できる列に限る
--    （id・所有者・作成日時・更新日時・ゴミ箱の日時などを登録時に偽装できないようにする）
-- ---------------------------------------------------------------------
revoke insert on public.companies from authenticated;
grant insert (name, application_type, preference, application_status, applied_on, job_type, location, channel,
              recruit_url, mypage_url, login_id_hint, contact_person, memo)
  on public.companies to authenticated;

-- ---------------------------------------------------------------------
-- 6. 通知の送信先を変えたら、確認済みの印を外す（フェーズ3で確認メールを送る前提を守る）
-- ---------------------------------------------------------------------
create function private.notification_settings_reset_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email_address is distinct from old.email_address then
    new.email_verified_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.notification_settings_reset_verification() from public, anon, authenticated;

create trigger notification_settings_reset_verification before update on public.notification_settings
  for each row execute function private.notification_settings_reset_verification();

-- ---------------------------------------------------------------------
-- 7. 適用記録
-- ---------------------------------------------------------------------
insert into private.schema_migrations (version, description)
values ('20261012000002', 'フェーズ1: 招待・プロフィールの強化（正規化の統一、取り消しとの競合防止、メール変更の追従、登録列の制限）');
