-- ============================================================
-- 디턴로그 - 통합 마이그레이션 (UI 확정 후 한 번만 실행)
-- 현재 프론트엔드(과제 중심 / 가변 과제 / 컨디션 1~10 / 위험 다중선택)에
-- 필요한 컬럼·제약을 전부 보장합니다. 전부 멱등(여러 번 실행해도 안전).
-- 01_schema.sql, 02_rls.sql 은 이미 적용된 상태라고 가정합니다.
-- ============================================================

-- ---- 분석값 / 과목(레거시) / 과제 블록 ----
alter table daily_checkins add column if not exists risk_category text;
alter table daily_checkins add column if not exists plan_quality_score int;
alter table daily_checkins add column if not exists subject_total_hours numeric;
alter table daily_checkins add column if not exists time_mismatch numeric;
alter table daily_checkins add column if not exists task_1_subject text;
alter table daily_checkins add column if not exists task_2_subject text;
alter table daily_checkins add column if not exists task_3_subject text;
alter table daily_checkins add column if not exists task_1_block text;
alter table daily_checkins add column if not exists task_2_block text;
alter table daily_checkins add column if not exists task_3_block text;

-- ---- 시간 블록(자동) / 가변 과제 배열 ----
alter table daily_checkins  add column if not exists time_blocks jsonb default '[]'::jsonb;
alter table daily_checkins  add column if not exists tasks jsonb default '[]'::jsonb;

-- ---- 위험 요소 다중 선택 ----
alter table daily_checkins add column if not exists risk_factors jsonb default '[]'::jsonb;

-- ---- 주간 목표: 가변 핵심 목표 배열 ----
alter table weekly_goals add column if not exists core_goals jsonb default '[]'::jsonb;

-- ---- 컨디션 1~10 허용 (기존 1~5 제약 제거 후 재생성) ----
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'daily_checkins'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%condition_score%'
  loop
    execute format('alter table daily_checkins drop constraint %I', c);
  end loop;
end $$;
alter table daily_checkins
  add constraint daily_checkins_condition_score_check check (condition_score between 1 and 10);

-- ---- 체크아웃: 과제 완료 상태 / 완료율 / 결과 배열 ----
alter table daily_checkouts add column if not exists time_blocks_done jsonb default '[]'::jsonb;
alter table daily_checkouts add column if not exists task_1_status text;
alter table daily_checkouts add column if not exists task_2_status text;
alter table daily_checkouts add column if not exists task_3_status text;
alter table daily_checkouts add column if not exists task_completion_rate numeric;
alter table daily_checkouts add column if not exists task_results jsonb default '[]'::jsonb;
alter table daily_checkouts add column if not exists carryover_tasks jsonb default '[]'::jsonb;
