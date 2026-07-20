-- ============================================================
-- 메모 (memo 탭)
-- Supabase SQL Editor 에서 실행하세요. (멱등 — 여러 번 실행 안전)
--
-- 학생이 자유롭게 적는 메모. 본인 것만 읽고 쓸 수 있습니다.
-- ============================================================

create table if not exists memos (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  content text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists memos_student_updated_idx
  on memos (student_id, updated_at desc);

-- updated_at 자동 갱신 (01_schema.sql 의 set_updated_at 재사용)
drop trigger if exists memos_set_updated_at on memos;
create trigger memos_set_updated_at
  before update on memos
  for each row execute function set_updated_at();

-- RLS: 본인 메모만
alter table memos enable row level security;

drop policy if exists "memos_select_own" on memos;
create policy "memos_select_own" on memos
  for select using (student_id = auth.uid());

drop policy if exists "memos_insert_own" on memos;
create policy "memos_insert_own" on memos
  for insert with check (student_id = auth.uid());

drop policy if exists "memos_update_own" on memos;
create policy "memos_update_own" on memos
  for update using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists "memos_delete_own" on memos;
create policy "memos_delete_own" on memos
  for delete using (student_id = auth.uid());
