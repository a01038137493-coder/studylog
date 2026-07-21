-- ============================================================
-- 타임박스 (수험생 매일 반복 시간표) + 일별 완료 체크
-- ============================================================
create table if not exists timeboxes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  label text not null,
  start_time time not null,
  end_time time not null,
  sort int not null default 0,
  created_at timestamptz default now()
);
create index if not exists timeboxes_student_idx on timeboxes (student_id, start_time);
alter table timeboxes enable row level security;
drop policy if exists "timeboxes_all_own" on timeboxes;
create policy "timeboxes_all_own" on timeboxes for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());

create table if not exists timebox_checks (
  student_id uuid not null references profiles(id) on delete cascade,
  box_id uuid not null references timeboxes(id) on delete cascade,
  date date not null,
  done boolean not null default true,
  primary key (student_id, box_id, date)
);
alter table timebox_checks enable row level security;
drop policy if exists "timebox_checks_all_own" on timebox_checks;
create policy "timebox_checks_all_own" on timebox_checks for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
alter table timeboxes add column if not exists days jsonb;  -- 요일(월=0..일=6), null/[]=매일
alter table timeboxes add column if not exists color text;  -- 블록 색상(미지정 시 자동)
