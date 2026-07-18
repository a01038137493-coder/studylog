-- ============================================================
-- 스터디로그 B2C 전환 1단계: 자체 회원가입
-- Supabase SQL Editor 에서 실행하세요.
--
-- 하는 일:
--   1) 회원가입(이메일/카카오/구글) 시 profiles 행을 자동 생성하는 트리거
--      - 이름은 가입 메타데이터(name/full_name/nickname 등)에서 가져오고
--        없으면 이메일 앞부분을 사용
--      - 역할은 무조건 'student' (일반 사용자)
--   2) 본인 프로필 insert 허용 RLS 정책 (트리거 실패 시 안전망)
-- ============================================================

-- 1) 가입 시 프로필 자동 생성 트리거
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, name, status)
  values (
    new.id,
    'student',
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'preferred_username'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '학생'
    ),
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) 본인 프로필 insert 허용 (트리거가 못 만든 경우 클라이언트가 직접 생성 가능)
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own"
on profiles for insert
with check (id = auth.uid() and role = 'student');
