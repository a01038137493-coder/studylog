-- ============================================================
-- 사용자 유형 (수험생 / 일반)
-- Supabase SQL Editor 에서 실행하세요. (멱등 — 여러 번 실행 안전)
--
-- user_type : 'exam'(수험생, 기본) | 'general'(일반)
-- goal_date / goal_label : 일반 사용자가 직접 정하는 목표일
--   (수험생은 js/utils.js 의 SUNEUNG_DATE 를 그대로 사용)
-- onboarded : 온보딩 완료 여부 (false 면 가입 후 온보딩 화면으로)
-- ============================================================

alter table profiles add column if not exists user_type text not null default 'exam';
alter table profiles add column if not exists goal_date date;
alter table profiles add column if not exists goal_label text;
alter table profiles add column if not exists onboarded boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_user_type_check'
  ) then
    alter table profiles
      add constraint profiles_user_type_check check (user_type in ('exam', 'general'));
  end if;
end $$;

-- 기존 사용자는 온보딩을 이미 지난 것으로 간주 (재로그인 시 방해하지 않도록)
update profiles set onboarded = true where onboarded = false and created_at < now();
