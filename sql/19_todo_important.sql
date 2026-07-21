-- ============================================================
-- 할 일 중요 표시 (일반 사용자 투두)
-- Supabase SQL Editor 에서 실행하세요. (멱등 — 여러 번 실행 안전)
-- ============================================================

alter table todos add column if not exists important boolean not null default false;
