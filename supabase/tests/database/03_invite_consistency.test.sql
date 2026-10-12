-- メール変更・招待の取り消し・再招待が重なったときの整合性（20261012000002）
--
-- 守るべき不変条件:
--   「有効（active）なプロフィールのメールは、必ず許可リストに有効な招待として存在する」
-- 逆（招待済みなのに停止）は許す。停止を解除できるのは管理者の招待・再招待だけとし、
-- メールの変更でアクセスが戻ることはない（取り消された人が、招待済みの別のメールに変えて戻れないようにするため）。
begin;
select plan(16);

-- ---------------------------------------------------------------- 準備
insert into public.allowed_emails (email) values
  ('m@example.com'), ('u@example.com'), ('x@example.com'), ('y@example.com');
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'm@example.com'),
  ('11111111-1111-1111-1111-111111111111', 'u@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'y@example.com');
update public.profiles set role = 'admin' where id = '44444444-4444-4444-4444-444444444444';

create function pg_temp.as_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444"}', true);
$$;
create function pg_temp.violations() returns integer language sql as $$
  select count(*)::int from public.profiles p
  where p.status = 'active'
    and not exists (select 1 from public.allowed_emails a where a.email = p.email and a.revoked_at is null);
$$;
create function pg_temp.u_state() returns text language sql as $$
  select email || '/' || status from public.profiles where id = '11111111-1111-1111-1111-111111111111';
$$;

select pg_temp.as_admin();

-- ---------------------------------------------------------------- 1. 取り消された人がメールを変えても戻れない
select public.admin_revoke('u@example.com');
select is(pg_temp.u_state(), 'u@example.com/suspended', '取り消すと停止になる');
update auth.users set email = 'x@example.com' where id = '11111111-1111-1111-1111-111111111111';
select is(pg_temp.u_state(), 'x@example.com/suspended',
  '取り消された人が招待済みの別のメールに変えても、停止のまま（メール変更ではアクセスは戻らない）');
select is(pg_temp.violations(), 0, '不変条件: 招待のない有効ユーザーはいない（1）');
select public.admin_invite('x@example.com');
select is(pg_temp.u_state(), 'x@example.com/active', '管理者が新しいメールを招待し直すと有効になる');

-- ---------------------------------------------------------------- 2. 有効な人が招待済みのメールに変えた後、そのメールを取り消す
update auth.users set email = 'u@example.com' where id = '11111111-1111-1111-1111-111111111111';
select is(pg_temp.u_state(), 'u@example.com/suspended', '取り消し済みの元のメールに戻すと停止になる');
select public.admin_invite('u@example.com');
select is(pg_temp.u_state(), 'u@example.com/active', '元のメールを再招待すると有効になる');
update auth.users set email = 'x@example.com' where id = '11111111-1111-1111-1111-111111111111';
select is(pg_temp.u_state(), 'x@example.com/active', '有効な人が招待済みのメールに変えた場合は有効のまま');
select public.admin_revoke('x@example.com');
select is(pg_temp.u_state(), 'x@example.com/suspended', '変更後のメールを取り消すと停止になる');
select is(pg_temp.violations(), 0, '不変条件: 招待のない有効ユーザーはいない（2）');

-- ---------------------------------------------------------------- 3. 古いメールの取り消しは、変更後のメールには及ばない
select public.admin_invite('x@example.com');
select lives_ok($$select public.admin_revoke('u@example.com')$$,
  'もう使っていない古いメールの招待を取り消せる');
select is(pg_temp.u_state(), 'x@example.com/active', '古いメールの操作は、今使っているメールの状態を変えない');

-- ---------------------------------------------------------------- 4. ほかの人が使っているメールには変えられない
select throws_ok($$update auth.users set email = 'y@example.com' where id = '11111111-1111-1111-1111-111111111111'$$,
  '23505', null, 'ほかの人のプロフィールと同じメールには変えられない（変更全体が取り消される）');
select is(pg_temp.u_state(), 'x@example.com/active', '失敗した変更の後も元の状態のまま');

-- ---------------------------------------------------------------- 5. メールが空になった場合
update auth.users set email = null where id = '22222222-2222-2222-2222-222222222222';
select is((select status from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'suspended', 'ログイン用メールが空になったら停止');

-- ---------------------------------------------------------------- 6. ランダムな操作の繰り返しでも不変条件が崩れない
create function pg_temp.fuzz(p_steps integer) returns integer language plpgsql as $$
declare
  v_emails text[] := array['u@example.com', 'x@example.com', 'z@example.com'];
  v_users  uuid[] := array['11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333']::uuid[];
  v_bad    integer := 0;
  v_email  text;
  v_op     integer;
begin
  perform setseed(0.42);
  insert into public.allowed_emails (email) values ('z@example.com') on conflict do nothing;
  insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'z@example.com');
  for i in 1..p_steps loop
    v_email := v_emails[1 + floor(random() * 3)::int];
    v_op := floor(random() * 3)::int;
    begin
      if v_op = 0 then
        perform public.admin_revoke(v_email);
      elsif v_op = 1 then
        perform public.admin_invite(v_email);
      else
        update auth.users set email = v_email where id = v_users[1 + floor(random() * 2)::int];
      end if;
    exception when others then
      null; -- 取り消し済み・重複メールなどで拒否された操作は、何も変えずに次へ
    end;
    if pg_temp.violations() > 0 then
      v_bad := v_bad + 1;
    end if;
  end loop;
  return v_bad;
end;
$$;
select is(pg_temp.fuzz(500), 0, '取り消し・招待・メール変更をランダムに500回行っても、招待のない有効ユーザーは一度も現れない');
select is(pg_temp.violations(), 0, '不変条件: 最終状態でも成り立つ');

select * from finish();
rollback;
