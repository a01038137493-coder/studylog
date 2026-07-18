-- ============================================================
-- 디턴로그 (Goal Tracker) - RLS (Row Level Security) 정책
-- 01_schema.sql 실행 후 이 파일을 실행하세요.
--
-- 규칙:
--   - 학생은 자기 데이터만 읽고 쓸 수 있다.
--   - 관리자(admin)와 컨설턴트(counselor)는 모든 학생 데이터를 읽고 쓸 수 있다.
--   - 개입(intervention) 기록 작성/수정은 관리자/컨설턴트만 가능하다.
-- ============================================================

alter table profiles enable row level security;
alter table weekly_goals enable row level security;
alter table daily_checkins enable row level security;
alter table daily_checkouts enable row level security;
alter table weekly_reviews enable row level security;
alter table interventions enable row level security;

-- 현재 로그인 사용자가 관리자/컨설턴트인지 판별하는 헬퍼 함수
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('admin', 'counselor')
  );
$$;

-- ---------------- profiles ----------------
drop policy if exists "profiles_select_own_or_admin" on profiles;
create policy "profiles_select_own_or_admin"
on profiles for select
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on profiles;
create policy "profiles_update_own_or_admin"
on profiles for update
using (id = auth.uid() or public.is_admin());

-- ---------------- weekly_goals ----------------
drop policy if exists "weekly_goals_select_own_or_admin" on weekly_goals;
create policy "weekly_goals_select_own_or_admin"
on weekly_goals for select
using (student_id = auth.uid() or public.is_admin());

drop policy if exists "weekly_goals_insert_own_or_admin" on weekly_goals;
create policy "weekly_goals_insert_own_or_admin"
on weekly_goals for insert
with check (student_id = auth.uid() or public.is_admin());

drop policy if exists "weekly_goals_update_own_or_admin" on weekly_goals;
create policy "weekly_goals_update_own_or_admin"
on weekly_goals for update
using (student_id = auth.uid() or public.is_admin());

-- ---------------- daily_checkins ----------------
drop policy if exists "daily_checkins_select_own_or_admin" on daily_checkins;
create policy "daily_checkins_select_own_or_admin"
on daily_checkins for select
using (student_id = auth.uid() or public.is_admin());

drop policy if exists "daily_checkins_insert_own_or_admin" on daily_checkins;
create policy "daily_checkins_insert_own_or_admin"
on daily_checkins for insert
with check (student_id = auth.uid() or public.is_admin());

drop policy if exists "daily_checkins_update_own_or_admin" on daily_checkins;
create policy "daily_checkins_update_own_or_admin"
on daily_checkins for update
using (student_id = auth.uid() or public.is_admin());

-- ---------------- daily_checkouts ----------------
drop policy if exists "daily_checkouts_select_own_or_admin" on daily_checkouts;
create policy "daily_checkouts_select_own_or_admin"
on daily_checkouts for select
using (student_id = auth.uid() or public.is_admin());

drop policy if exists "daily_checkouts_insert_own_or_admin" on daily_checkouts;
create policy "daily_checkouts_insert_own_or_admin"
on daily_checkouts for insert
with check (student_id = auth.uid() or public.is_admin());

drop policy if exists "daily_checkouts_update_own_or_admin" on daily_checkouts;
create policy "daily_checkouts_update_own_or_admin"
on daily_checkouts for update
using (student_id = auth.uid() or public.is_admin());

-- ---------------- weekly_reviews ----------------
drop policy if exists "weekly_reviews_select_own_or_admin" on weekly_reviews;
create policy "weekly_reviews_select_own_or_admin"
on weekly_reviews for select
using (student_id = auth.uid() or public.is_admin());

drop policy if exists "weekly_reviews_insert_own_or_admin" on weekly_reviews;
create policy "weekly_reviews_insert_own_or_admin"
on weekly_reviews for insert
with check (student_id = auth.uid() or public.is_admin());

drop policy if exists "weekly_reviews_update_own_or_admin" on weekly_reviews;
create policy "weekly_reviews_update_own_or_admin"
on weekly_reviews for update
using (student_id = auth.uid() or public.is_admin());

-- ---------------- interventions ----------------
drop policy if exists "interventions_select_own_or_admin" on interventions;
create policy "interventions_select_own_or_admin"
on interventions for select
using (student_id = auth.uid() or public.is_admin());

drop policy if exists "interventions_insert_admin_only" on interventions;
create policy "interventions_insert_admin_only"
on interventions for insert
with check (public.is_admin());

drop policy if exists "interventions_update_admin_only" on interventions;
create policy "interventions_update_admin_only"
on interventions for update
using (public.is_admin());
