-- ============================================================
-- 디턴로그 - 핵심 과제 가변 개수 (jsonb 배열)
-- SQL Editor 에서 실행하세요. (멱등)
--
-- 학생이 원하는 만큼 과제를 추가할 수 있도록 배열로 저장.
--   daily_checkins.tasks       = [{"text":"...","block":"morning"}, ...]
--   daily_checkouts.task_results = [{"status":"completed"}, ...]  (체크인 tasks 순서와 동일)
-- 기존 task_1~3 / task_1~3_status 컬럼은 호환을 위해 앞 3개를 계속 채운다.
-- ============================================================

alter table daily_checkins add column if not exists tasks jsonb default '[]'::jsonb;
alter table daily_checkouts add column if not exists task_results jsonb default '[]'::jsonb;
