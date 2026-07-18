-- ============================================================
-- 디턴로그 - 타임박스(시간 블록) 컬럼 추가
-- SQL Editor 에서 실행하세요. (기존 데이터에 영향 없음, 멱등)
--
--  daily_checkins.time_blocks      : 오늘 계획한 시간 블록 배열
--    예) [{"start":"09:00","end":"10:30","label":"수학"}, ...]
--  daily_checkouts.time_blocks_done: 블록별 완료 여부 배열 (체크인 블록과 같은 순서)
--    예) [true, false, true, ...]
-- ============================================================

alter table daily_checkins
  add column if not exists time_blocks jsonb default '[]'::jsonb;

alter table daily_checkouts
  add column if not exists time_blocks_done jsonb default '[]'::jsonb;
