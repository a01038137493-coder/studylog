-- 할 일별 메모 (웹 홈 우측 업무 메모 패널)
alter table public.todos add column if not exists note text;
