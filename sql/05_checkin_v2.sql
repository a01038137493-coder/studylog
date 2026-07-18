-- ============================================================
-- 디턴로그 - 체크인 v2 (wizard) 추가 컬럼
-- SQL Editor 에서 실행하세요. (기존 데이터 영향 없음, 멱등)
--
-- 학생에게는 단순한 wizard 를 보여주되, 분석값은 내부적으로 저장한다.
-- ============================================================

alter table daily_checkins add column if not exists risk_category text;        -- 위험 요소 분류(졸림/휴대폰 등)
alter table daily_checkins add column if not exists plan_quality_score int;     -- 계획 품질 점수 (관리자용)
alter table daily_checkins add column if not exists subject_total_hours numeric; -- 과목 시간 합계
alter table daily_checkins add column if not exists time_mismatch numeric;       -- (과목 합계 − 총 목표)
alter table daily_checkins add column if not exists task_1_subject text;
alter table daily_checkins add column if not exists task_2_subject text;
alter table daily_checkins add column if not exists task_3_subject text;
