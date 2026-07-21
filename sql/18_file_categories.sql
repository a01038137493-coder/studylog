-- ============================================================
-- 파일 카테고리 (메모 폴더와 동일 패턴)
-- Supabase SQL Editor 에서 실행하세요. (멱등 — 여러 번 실행 안전)
-- ============================================================

create table if not exists file_categories (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  created_at timestamptz default now()
);

create index if not exists file_categories_student_idx on file_categories (student_id, sort);

alter table file_categories enable row level security;

drop policy if exists "file_categories_select_own" on file_categories;
create policy "file_categories_select_own" on file_categories for select using (student_id = auth.uid());

drop policy if exists "file_categories_insert_own" on file_categories;
create policy "file_categories_insert_own" on file_categories for insert with check (student_id = auth.uid());

drop policy if exists "file_categories_update_own" on file_categories;
create policy "file_categories_update_own" on file_categories for update
  using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists "file_categories_delete_own" on file_categories;
create policy "file_categories_delete_own" on file_categories for delete using (student_id = auth.uid());

-- 파일 ↔ 카테고리 연결 (카테고리 삭제 시 미분류로)
alter table files add column if not exists category_id uuid references file_categories(id) on delete set null;
create index if not exists files_category_idx on files (student_id, category_id, created_at desc);
