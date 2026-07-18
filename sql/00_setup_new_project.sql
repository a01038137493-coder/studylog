-- ============================================================
-- 로그(Log) — 새 Supabase 프로젝트 통합 셋업
-- 디턴로그와 분리된 '로그' 전용 프로젝트를 만들 때 이 파일 하나만
-- SQL Editor 에서 실행하면 됩니다. (전부 멱등 — 재실행 안전)
-- 포함: 01_schema + 02_rls + 99_apply_all + 09_dashboard_layout + 10_b2c_signup
-- ============================================================

-- ============================================================
-- 디턴로그 (Goal Tracker) - 데이터베이스 스키마
-- Supabase SQL Editor 에서 이 파일을 먼저 실행하세요.
-- 모든 테이블은 created_at, updated_at 을 가집니다.
-- ============================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------
-- 1) profiles : 사용자(학생/관리자/컨설턴트) 프로필
--    id 는 auth.users 의 id 와 동일하게 사용합니다.
-- ----------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'admin', 'counselor')),
  name text not null,
  phone text,
  seat_number text,
  target_university text,
  target_major text,
  target_score text,
  management_level text default 'basic',
  status text default 'active' check (status in ('active', 'paused', 'left')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------
-- 2) weekly_goals : 주간 목표 (월요일 작성)
-- ----------------------------------------------------------
create table if not exists weekly_goals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  week_start_date date not null,
  total_study_hour_goal numeric default 0,
  korean_hour_goal numeric default 0,
  math_hour_goal numeric default 0,
  english_hour_goal numeric default 0,
  inquiry1_hour_goal numeric default 0,
  inquiry2_hour_goal numeric default 0,
  core_goal_1 text,
  core_goal_2 text,
  core_goal_3 text,
  core_goal_4 text,
  core_goal_5 text,
  weak_point text,
  life_goal text,
  risk_factor text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(student_id, week_start_date)
);

-- ----------------------------------------------------------
-- 3) daily_checkins : 오늘 목표 입력 (등원 시)
-- ----------------------------------------------------------
create table if not exists daily_checkins (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  date date not null default current_date,
  checkin_time timestamptz default now(),
  planned_total_hours numeric default 0,
  planned_korean_hours numeric default 0,
  planned_math_hours numeric default 0,
  planned_english_hours numeric default 0,
  planned_inquiry1_hours numeric default 0,
  planned_inquiry2_hours numeric default 0,
  task_1 text,
  task_2 text,
  task_3 text,
  risk_today text,
  condition_score int check (condition_score between 1 and 5),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(student_id, date)
);

-- ----------------------------------------------------------
-- 4) daily_checkouts : 오늘 성과 기록 (하원 전)
-- ----------------------------------------------------------
create table if not exists daily_checkouts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  date date not null default current_date,
  checkout_time timestamptz default now(),
  actual_total_hours numeric default 0,
  actual_korean_hours numeric default 0,
  actual_math_hours numeric default 0,
  actual_english_hours numeric default 0,
  actual_inquiry1_hours numeric default 0,
  actual_inquiry2_hours numeric default 0,
  task_1_done boolean default false,
  task_2_done boolean default false,
  task_3_done boolean default false,
  achievement_rate numeric default 0,
  failure_reason text,
  carryover_task text,
  self_score int check (self_score between 1 and 5),
  reflection text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(student_id, date)
);

-- ----------------------------------------------------------
-- 5) weekly_reviews : 주간 회고 (토요일/주 마지막 등원일)
-- ----------------------------------------------------------
create table if not exists weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  week_start_date date not null,
  actual_total_hours numeric default 0,
  achievement_rate numeric default 0,
  biggest_success text,
  biggest_delay text,
  repeated_failure_reason text,
  next_week_adjustment text,
  needs_consulting boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(student_id, week_start_date)
);

-- ----------------------------------------------------------
-- 6) interventions : 상담 / 개입 기록 (관리자/컨설턴트 작성)
-- ----------------------------------------------------------
create table if not exists interventions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  counselor_id uuid references profiles(id),
  date date not null default current_date,
  trigger_reason text,
  action_type text,
  note text,
  followup_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------
-- updated_at 자동 갱신 트리거
-- ----------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'weekly_goals', 'daily_checkins',
    'daily_checkouts', 'weekly_reviews', 'interventions'
  ]
  loop
    execute format('drop trigger if exists trg_set_updated_at on %I', t);
    execute format(
      'create trigger trg_set_updated_at before update on %I
       for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

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

-- ============================================================
-- 디턴로그 - 통합 마이그레이션 (UI 확정 후 한 번만 실행)
-- 현재 프론트엔드(과제 중심 / 가변 과제 / 컨디션 1~10 / 위험 다중선택)에
-- 필요한 컬럼·제약을 전부 보장합니다. 전부 멱등(여러 번 실행해도 안전).
-- 01_schema.sql, 02_rls.sql 은 이미 적용된 상태라고 가정합니다.
-- ============================================================

-- ---- 분석값 / 과목(레거시) / 과제 블록 ----
alter table daily_checkins add column if not exists risk_category text;
alter table daily_checkins add column if not exists plan_quality_score int;
alter table daily_checkins add column if not exists subject_total_hours numeric;
alter table daily_checkins add column if not exists time_mismatch numeric;
alter table daily_checkins add column if not exists task_1_subject text;
alter table daily_checkins add column if not exists task_2_subject text;
alter table daily_checkins add column if not exists task_3_subject text;
alter table daily_checkins add column if not exists task_1_block text;
alter table daily_checkins add column if not exists task_2_block text;
alter table daily_checkins add column if not exists task_3_block text;

-- ---- 시간 블록(자동) / 가변 과제 배열 ----
alter table daily_checkins  add column if not exists time_blocks jsonb default '[]'::jsonb;
alter table daily_checkins  add column if not exists tasks jsonb default '[]'::jsonb;

-- ---- 위험 요소 다중 선택 ----
alter table daily_checkins add column if not exists risk_factors jsonb default '[]'::jsonb;

-- ---- 주간 목표: 가변 핵심 목표 배열 ----
alter table weekly_goals add column if not exists core_goals jsonb default '[]'::jsonb;

-- ---- 컨디션 1~10 허용 (기존 1~5 제약 제거 후 재생성) ----
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'daily_checkins'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%condition_score%'
  loop
    execute format('alter table daily_checkins drop constraint %I', c);
  end loop;
end $$;
alter table daily_checkins
  add constraint daily_checkins_condition_score_check check (condition_score between 1 and 10);

-- ---- 체크아웃: 과제 완료 상태 / 완료율 / 결과 배열 ----
alter table daily_checkouts add column if not exists time_blocks_done jsonb default '[]'::jsonb;
alter table daily_checkouts add column if not exists task_1_status text;
alter table daily_checkouts add column if not exists task_2_status text;
alter table daily_checkouts add column if not exists task_3_status text;
alter table daily_checkouts add column if not exists task_completion_rate numeric;
alter table daily_checkouts add column if not exists task_results jsonb default '[]'::jsonb;
alter table daily_checkouts add column if not exists carryover_tasks jsonb default '[]'::jsonb;

-- 09_dashboard_layout.sql
-- 학생별 대시보드 위젯 레이아웃 저장 (아이폰식 위젯 커스터마이징)
-- profiles 에 JSONB 컬럼 추가. 형태: { "v": 1, "extra": ["plant", ...] }
--   - "extra": core(고정 메인 위젯) 외에 학생이 추가한 위젯 id 목록(순서 유지)
-- 기존 정책 profiles_update_own_or_admin (id = auth.uid()) 으로 학생이 자기 행 수정 가능.
-- Supabase SQL Editor 에서 1회 실행하세요. (안 돌려도 앱은 localStorage 로 동작)

alter table public.profiles
  add column if not exists dashboard_layout jsonb;

-- ============================================================
-- 로그 B2C 전환 1단계: 자체 회원가입
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
