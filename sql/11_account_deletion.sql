-- ============================================================
-- 로그 B2C 2단계: 계정 삭제 (회원 탈퇴)
-- Supabase SQL Editor 에서 실행하세요.
--
-- 앱스토어 심사 가이드라인 5.1.1(v):
--   계정 생성이 가능한 앱은 앱 안에서 계정 삭제도 가능해야 합니다.
--
-- 하는 일:
--   - 로그인한 사용자가 자기 계정을 완전히 삭제하는 RPC
--   - auth.users 행을 지우면 profiles → 모든 기록(체크인/체크아웃/
--     주간 목표/회고 등)이 FK cascade 로 함께 삭제됩니다.
-- ============================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  delete from auth.users where id = auth.uid();
end;
$$;

-- 로그인한 사용자만 호출 가능
revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
