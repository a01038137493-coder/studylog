-- ============================================================
-- 디턴로그 - 테스트 계정 프로필 연결 (선택)
--
-- 사용법:
--   1) 먼저 Supabase 대시보드 > Authentication > Users > "Add user" 로
--      아래 이메일의 계정 3개를 만듭니다. (비밀번호 지정 + "Auto Confirm User" 체크)
--        - student1@ditton.test
--        - student2@ditton.test
--        - admin@ditton.test
--   2) 그 다음 이 파일을 SQL Editor 에서 실행하면,
--      이메일을 기준으로 profiles 에 역할이 자동 연결됩니다.
--      (auth.users 의 UID 를 직접 복사할 필요가 없습니다)
--
-- 이미 있으면 역할/이름만 갱신합니다 (on conflict do update).
-- ============================================================

insert into profiles (id, role, name, seat_number, target_university, target_major, status)
select u.id, v.role, v.name, v.seat_number, v.target_university, v.target_major, 'active'
from (values
  ('student1@ditton.test', 'student', '김학생', 'A-01', '서울대학교', '경영학과'),
  ('student2@ditton.test', 'student', '이학생', 'A-02', '연세대학교', '컴퓨터공학과'),
  ('admin@ditton.test',    'admin',   '원장',   null,   null,        null)
) as v(email, role, name, seat_number, target_university, target_major)
join auth.users u on u.email = v.email
on conflict (id) do update
  set role = excluded.role,
      name = excluded.name,
      seat_number = excluded.seat_number,
      target_university = excluded.target_university,
      target_major = excluded.target_major,
      status = 'active';

-- 연결 결과 확인
select p.name, p.role, p.seat_number, u.email
from profiles p join auth.users u on u.id = p.id
order by p.role, p.name;
