-- ============================================================
-- 폴더(카테고리) 색상 — 메모·파일 공통
-- ============================================================
alter table memo_categories add column if not exists color text;
alter table file_categories add column if not exists color text;
