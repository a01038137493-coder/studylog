-- ============================================================
-- 메모 카테고리 (노션식 폴더)
-- Supabase SQL Editor 에서 실행하세요. (멱등 — 여러 번 실행 안전)
--
-- 카테고리 삭제 시 소속 메모는 삭제되지 않고 '미분류'로 남는다(set null).
-- ============================================================

create table if not exists memo_categories (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  created_at timestamptz default now()
);

create index if not exists memo_categories_student_idx on memo_categories (student_id, sort);

alter table memo_categories enable row level security;

drop policy if exists "memo_categories_select_own" on memo_categories;
create policy "memo_categories_select_own" on memo_categories for select using (student_id = auth.uid());

drop policy if exists "memo_categories_insert_own" on memo_categories;
create policy "memo_categories_insert_own" on memo_categories for insert with check (student_id = auth.uid());

drop policy if exists "memo_categories_update_own" on memo_categories;
create policy "memo_categories_update_own" on memo_categories for update
  using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists "memo_categories_delete_own" on memo_categories;
create policy "memo_categories_delete_own" on memo_categories for delete using (student_id = auth.uid());

-- 메모 ↔ 카테고리 연결
alter table memos add column if not exists category_id uuid references memo_categories(id) on delete set null;
create index if not exists memos_category_idx on memos (student_id, category_id, updated_at desc);
