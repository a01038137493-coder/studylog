-- ============================================================
-- 메모 상위 고정
-- Supabase SQL Editor 에서 실행하세요. (멱등 — 여러 번 실행 안전)
-- ============================================================

alter table memos add column if not exists pinned boolean not null default false;

-- 목록 정렬용: 고정 먼저, 그다음 최근 수정순
create index if not exists memos_student_pinned_idx
  on memos (student_id, pinned desc, updated_at desc);
