-- ============================================================
-- 일반 사용자용 할 일 (심플 투두 플래너)
-- Supabase SQL Editor 에서 실행하세요. (멱등 — 여러 번 실행 안전)
--
-- 수험생의 체크인/체크아웃과 완전히 분리된 단순 구조.
-- date 기준으로 하루 단위 관리, 미완료는 앱에서 다음날 이월(date 갱신).
-- ============================================================

create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  done boolean not null default false,
  date date not null default (now() at time zone 'Asia/Seoul')::date,
  sort int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists todos_student_date_idx on todos (student_id, date, sort);

drop trigger if exists todos_set_updated_at on todos;
create trigger todos_set_updated_at
  before update on todos
  for each row execute function set_updated_at();

alter table todos enable row level security;

drop policy if exists "todos_select_own" on todos;
create policy "todos_select_own" on todos for select using (student_id = auth.uid());

drop policy if exists "todos_insert_own" on todos;
create policy "todos_insert_own" on todos for insert with check (student_id = auth.uid());

drop policy if exists "todos_update_own" on todos;
create policy "todos_update_own" on todos for update
  using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists "todos_delete_own" on todos;
create policy "todos_delete_own" on todos for delete using (student_id = auth.uid());
