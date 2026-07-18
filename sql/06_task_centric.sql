-- ============================================================
-- 디턴로그 - 과제 중심 전환 (시간 입력 제거)
-- SQL Editor 에서 실행하세요. (기존 데이터 영향 없음, 멱등)
--
-- 독학재수학원은 공부 시간이 고정 → 시간 입력 대신
-- "오늘 끝낼 과제 + 블록(오전/점심직후/오후/저녁) + 완료 상태"로 관리한다.
-- ============================================================

-- 체크인: 과제별 시간 블록 (morning / after_lunch / afternoon / evening)
alter table daily_checkins add column if not exists task_1_block text;
alter table daily_checkins add column if not exists task_2_block text;
alter table daily_checkins add column if not exists task_3_block text;

-- 체크아웃: 과제 완료 상태 (completed / partial / missed) + 완료율
alter table daily_checkouts add column if not exists task_1_status text;
alter table daily_checkouts add column if not exists task_2_status text;
alter table daily_checkouts add column if not exists task_3_status text;
alter table daily_checkouts add column if not exists task_completion_rate numeric;
