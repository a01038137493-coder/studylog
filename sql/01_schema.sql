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
