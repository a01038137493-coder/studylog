-- 할 일 태그 (중요 플래그처럼 작성 시트에서 붙이는 색상 라벨)
create table if not exists public.todo_tags (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  color text,
  sort int default 0,
  created_at timestamptz not null default now()
);

alter table public.todo_tags enable row level security;

drop policy if exists todo_tags_all_own on public.todo_tags;
create policy todo_tags_all_own on public.todo_tags
  for all using (auth.uid() = student_id) with check (auth.uid() = student_id);

alter table public.todos add column if not exists tag_id uuid references public.todo_tags(id) on delete set null;
