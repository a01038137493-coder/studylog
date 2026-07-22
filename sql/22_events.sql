-- 핀로그 자체 일정 (계정 동기화용)
-- 기존에는 Apple 캘린더(EventKit, 기기 로컬)에만 저장돼 기기 간 동기화가 안 됐다.
-- 새 일정은 이 테이블에 저장하고, Apple 캘린더 일정은 읽기 표시만 한다.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  alert_min int,            -- 분 오프셋 (0=정시, -5=5분 전 ... null=알림 없음)
  repeat text check (repeat in ('daily', 'weekly', 'monthly', 'yearly')),
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

drop policy if exists events_all_own on public.events;
create policy events_all_own on public.events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists events_user_start on public.events (user_id, start_at);
