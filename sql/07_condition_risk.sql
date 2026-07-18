-- ============================================================
-- 디턴로그 - 컨디션 1~10 + 위험요소 다중선택
-- SQL Editor 에서 실행하세요. (멱등)
-- ============================================================

-- 1) 컨디션 점수 1~10 허용 (기존 1~5 제약 제거 후 재생성)
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

-- 2) 위험 요소 다중 선택 저장용 배열
alter table daily_checkins add column if not exists risk_factors jsonb default '[]'::jsonb;
