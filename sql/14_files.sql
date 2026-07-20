-- ============================================================
-- 파일 보관함 (파일 탭)
-- Supabase SQL Editor 에서 실행하세요. (멱등 — 여러 번 실행 안전)
--
-- - storage 비공개 버킷 'memo-files' (파일당 25MB 제한)
-- - 경로 규칙: <auth.uid()>/<타임스탬프>-<파일명>  → 본인 폴더만 접근
-- - public.files: 목록/검색용 메타데이터
-- ============================================================

-- 1) 버킷
insert into storage.buckets (id, name, public, file_size_limit)
values ('memo-files', 'memo-files', false, 26214400)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- 2) 스토리지 접근 정책: 자기 폴더(첫 경로 = 본인 uid)만
drop policy if exists "memo_files_select_own" on storage.objects;
create policy "memo_files_select_own" on storage.objects for select
  using (bucket_id = 'memo-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "memo_files_insert_own" on storage.objects;
create policy "memo_files_insert_own" on storage.objects for insert
  with check (bucket_id = 'memo-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "memo_files_update_own" on storage.objects;
create policy "memo_files_update_own" on storage.objects for update
  using (bucket_id = 'memo-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "memo_files_delete_own" on storage.objects;
create policy "memo_files_delete_own" on storage.objects for delete
  using (bucket_id = 'memo-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- 3) 메타데이터 테이블
create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  path text not null unique,
  mime text,
  size bigint,
  created_at timestamptz default now()
);

create index if not exists files_student_created_idx on files (student_id, created_at desc);

alter table files enable row level security;

drop policy if exists "files_select_own" on files;
create policy "files_select_own" on files for select using (student_id = auth.uid());

drop policy if exists "files_insert_own" on files;
create policy "files_insert_own" on files for insert with check (student_id = auth.uid());

drop policy if exists "files_delete_own" on files;
create policy "files_delete_own" on files for delete using (student_id = auth.uid());

-- 4) 계정 삭제 시 파일 정리
--    storage 테이블은 직접 DELETE 가 금지되어 있어(42501) 트리거로 지울 수 없다.
--    → 앱(js/supabaseClient.js deleteMyAccount)에서 Storage API 로 먼저 지운 뒤
--      delete_my_account() 를 호출한다. files 테이블 행은 FK cascade 로 삭제된다.
