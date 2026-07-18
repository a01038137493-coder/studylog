-- 09_dashboard_layout.sql
-- 학생별 대시보드 위젯 레이아웃 저장 (아이폰식 위젯 커스터마이징)
-- profiles 에 JSONB 컬럼 추가. 형태: { "v": 1, "extra": ["plant", ...] }
--   - "extra": core(고정 메인 위젯) 외에 학생이 추가한 위젯 id 목록(순서 유지)
-- 기존 정책 profiles_update_own_or_admin (id = auth.uid()) 으로 학생이 자기 행 수정 가능.
-- Supabase SQL Editor 에서 1회 실행하세요. (안 돌려도 앱은 localStorage 로 동작)

alter table public.profiles
  add column if not exists dashboard_layout jsonb;
