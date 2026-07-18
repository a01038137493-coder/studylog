/*
 * utils.js
 * ------------------------------------------------------------
 * 앱 전반에서 쓰는 공통 유틸 함수 모음.
 * - 날짜 처리 (오늘, 이번 주 월요일, D-day)
 * - 달성률 계산
 * - 토스트(알림) 표시
 * - 과목/사유 목록 상수
 * ------------------------------------------------------------
 */

/* 수능 날짜 (D-day 계산용). 매년 수정하세요. 2026 수능: 2026-11-19 */
const SUNEUNG_DATE = "2026-11-19";

/* 과목 정의 — 입력/표시에 공통으로 사용 */
const SUBJECTS = [
  { key: "korean", label: "국어" },
  { key: "math", label: "수학" },
  { key: "english", label: "영어" },
  { key: "inquiry1", label: "탐구1" },
  { key: "inquiry2", label: "탐구2" },
];

/* 오늘의 한마디 (날짜별 자동 로테이션) */
const QUOTES = [
  { a: "아리스토텔레스", t: "우리는 반복하는 행동으로 만들어진다." },
  { a: "소크라테스", t: "스스로를 아는 것이 모든 공부의 시작이다." },
  { a: "플라톤", t: "배움은 영혼을 밝은 곳으로 돌리는 일이다." },
  { a: "공자", t: "멈추지 않는다면 느려도 괜찮다." },
  { a: "맹자", t: "작은 선택이 쌓여 큰 사람이 된다." },
  { a: "노자", t: "천 리 길도 한 걸음에서 시작된다." },
  { a: "장자", t: "흔들리지 않는 마음이 가장 먼 길을 간다." },
  { a: "세네카", t: "시간은 부족한 것이 아니라 흘려보내는 것이다." },
  { a: "마르쿠스 아우렐리우스", t: "오늘 할 일에 집중하는 사람이 내일을 이긴다." },
  { a: "에픽테토스", t: "내가 통제할 수 있는 것에 힘을 써라." },
  { a: "레오나르도 다빈치", t: "단순함은 깊은 노력 끝에 남는 힘이다." },
  { a: "미켈란젤로", t: "위대한 결과는 매일의 작은 수고에서 태어난다." },
  { a: "갈릴레오 갈릴레이", t: "의심하고 확인하는 사람이 더 멀리 본다." },
  { a: "아이작 뉴턴", t: "오늘의 집중은 내일의 시야를 넓힌다." },
  { a: "벤저민 프랭클린", t: "오늘을 준비한 사람이 내일을 덜 두려워한다." },
  { a: "칸트", t: "스스로 생각하는 용기가 배움의 시작이다." },
  { a: "괴테", t: "할 수 있다고 믿는 순간 행동은 시작된다." },
  { a: "니체", t: "넘어짐은 끝이 아니라 더 강한 나를 만드는 과정이다." },
  { a: "쇼펜하우어", t: "조용히 견디는 힘이 결국 차이를 만든다." },
  { a: "루소", t: "배움은 남을 따라가는 일이 아니라 나를 깨우는 일이다." },
  { a: "링컨", t: "오늘의 최선이 내일의 가능성을 만든다." },
  { a: "처칠", t: "포기하지 않는 태도는 재능보다 오래 간다." },
  { a: "루스벨트", t: "할 수 있다고 믿는 마음이 절반의 길을 연다." },
  { a: "헬렌 켈러", t: "어둠 속에서도 앞으로 가는 사람이 빛을 만난다." },
  { a: "마더 테레사", t: "작은 일도 성실히 하면 삶은 달라진다." },
  { a: "간디", t: "미래는 오늘 무엇을 하느냐에 달려 있다." },
  { a: "만델라", t: "끝나기 전까지는 늘 불가능해 보인다." },
  { a: "마틴 루터 킹 주니어", t: "계단 전체가 보이지 않아도 첫걸음은 내딛어라." },
  { a: "스티브 잡스", t: "오래 버티는 힘은 좋아하는 이유에서 나온다." },
  { a: "빌 게이츠", t: "꾸준한 개선이 가장 현실적인 성장이다." },
  { a: "아인슈타인", t: "중요한 것은 질문을 멈추지 않는 것이다." },
  { a: "마리 퀴리", t: "두려움보다 이해하려는 마음이 먼저다." },
  { a: "에디슨", t: "실패는 다시 시도할 방법을 알려준다." },
  { a: "테슬라", t: "집중은 보이지 않는 가능성을 현실로 바꾼다." },
  { a: "다윈", t: "살아남는 것은 가장 꾸준히 적응하는 사람이다." },
  { a: "파스퇴르", t: "준비된 사람에게 기회는 더 자주 보인다." },
  { a: "파인만", t: "이해했다면 스스로 설명할 수 있어야 한다." },
  { a: "칼 세이건", t: "작은 호기심이 큰 세계를 연다." },
  { a: "제인 구달", t: "매일의 행동은 작아 보여도 방향을 만든다." },
  { a: "스티븐 호킹", t: "한계보다 중요한 것은 계속 생각하는 힘이다." },
  { a: "톨스토이", t: "오늘의 성실함이 삶의 방향을 바꾼다." },
  { a: "도스토옙스키", t: "고통을 견디는 시간도 나를 만든다." },
  { a: "빅토르 위고", t: "꾸준히 나아가는 사람에게 길은 열린다." },
  { a: "헤르만 헤세", t: "자신에게 이르는 길은 매일의 선택으로 이어진다." },
  { a: "셰익스피어", t: "준비된 마음은 흔들림 속에서도 길을 찾는다." },
  { a: "버지니아 울프", t: "자기만의 시간을 지키는 사람이 자기 삶을 만든다." },
  { a: "카프카", t: "길은 걸어가는 동안 조금씩 드러난다." },
  { a: "알베르 카뮈", t: "견디는 사람은 자기 안의 힘을 발견한다." },
  { a: "생텍쥐페리", t: "중요한 것은 눈에 보이는 결과보다 보이지 않는 방향이다." },
  { a: "파울로 코엘료", t: "진심으로 원하는 일은 오늘의 행동으로 증명된다." },
];
/* 날짜 기반 결정적 선택 (하루 동안 고정, 매일 바뀜) */
function todaysQuote() {
  const d = new Date(getTodayString());
  const dayNum = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return QUOTES[((dayNum % QUOTES.length) + QUOTES.length) % QUOTES.length];
}

/* 학습 시간 블록 (시간 직접 입력 대신 고정 블록 선택) */
const STUDY_BLOCKS = [
  { key: "morning", label: "오전", start: "09:00", end: "12:00" },
  { key: "after_lunch", label: "점심 직후", start: "13:00", end: "14:30" },
  { key: "afternoon", label: "오후", start: "14:30", end: "17:30" },
  { key: "evening", label: "저녁", start: "19:00", end: "22:00" },
];
function blockLabel(key) {
  const b = STUDY_BLOCKS.find((x) => x.key === key);
  return b ? b.label : "";
}
function subjectLabel(key) {
  const s = SUBJECTS.find((x) => x.key === key);
  return s ? s.label : "";
}

/* 컨디션 1~10 점 표현 */
const LOW_CONDITION_MAX = 4; // 이 값 이하면 '저조'
const CONDITION_WORDS = {
  10: "최상", 9: "매우 좋음", 8: "좋음", 7: "괜찮음", 6: "보통",
  5: "애매함", 4: "나쁨", 3: "많이 나쁨", 2: "매우 나쁨", 1: "최악",
};
function conditionText(score) {
  return CONDITION_WORDS[Math.max(1, Math.min(10, Math.round(Number(score) || 0)))] || "보통";
}
function conditionFace(score) {
  const s = Math.round(Number(score) || 0);
  if (s <= 2) return "😣";
  if (s <= 4) return "😟";
  if (s === 5) return "😐";
  if (s === 6) return "🙂";
  if (s <= 8) return "😊";
  return "😄";
}

/* 핵심 과제 완료 상태 (completed=1, partial=0.5, missed=0) */
const TASK_STATUS = {
  completed: { label: "완료", score: 1 },
  partial: { label: "일부 완료", score: 0.5 },
  missed: { label: "미완료", score: 0 },
};

/* 체크아웃 미완료 사유 선택지 */
const FAILURE_REASONS = [
  "목표를 과하게 잡음",
  "예상보다 문제가 어려움",
  "개념 이해 부족",
  "오답 정리에 시간 초과",
  "졸음/컨디션 저하",
  "집중력 저하",
  "과목 회피",
  "질문 해결 지연",
  "외부 일정",
  "계획 변경",
  "기타",
];

/* 로컬 기준 오늘 날짜를 YYYY-MM-DD 로 반환 */
function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* 특정 날짜가 속한 주의 월요일을 YYYY-MM-DD 로 반환 (주 시작 = 월요일) */
function getWeekStartDate(dateInput) {
  const date = dateInput ? new Date(dateInput) : new Date();
  const day = date.getDay(); // 0=일, 1=월 ... 6=토
  const diff = day === 0 ? -6 : 1 - day; // 일요일이면 지난 월요일
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* 오늘 요일 숫자 (0=일 ... 6=토) */
function getTodayWeekday() {
  return new Date().getDay();
}

/* 수능까지 남은 일수 (D-day). 음수면 지난 것 */
function getDdayToSuneung() {
  const today = new Date(getTodayString());
  const target = new Date(SUNEUNG_DATE);
  const diffMs = target - today;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/* 날짜를 'M월 D일 (요일)' 형식으로 보기 좋게 */
function formatKoreanDate(dateString) {
  const date = dateString ? new Date(dateString) : new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${days[date.getDay()]})`;
}

/*
 * 하루 목표 달성률 계산.
 * planned 가 0이면 0 으로 처리한다. 반환값은 정수 % (반올림).
 */
function calcAchievementRate(actualTotalHours, plannedTotalHours) {
  const planned = Number(plannedTotalHours) || 0;
  const actual = Number(actualTotalHours) || 0;
  if (planned <= 0) return 0;
  return Math.round((actual / planned) * 100);
}

/* 화면 표시는 최대 150% 까지만 (시각적 게이지 등) */
function clampRateForDisplay(rate) {
  return Math.min(Number(rate) || 0, 150);
}

/* 과제 완료율 = 완료 task / 입력된 task * 100 */
function calcTaskCompletionRate(tasks, dones) {
  const inputCount = tasks.filter((t) => t && t.trim() !== "").length;
  if (inputCount === 0) return 0;
  const doneCount = dones.filter(Boolean).length;
  return Math.round((doneCount / inputCount) * 100);
}

/* 숫자 입력값을 안전하게 number 로 (빈 값/NaN 은 0) */
function toNumber(value) {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

/*
 * 화면 하단에 잠깐 떴다 사라지는 토스트 메시지.
 * type: 'success' | 'error' | 'info'
 */
function showToast(message, type = "info") {
  let toast = document.getElementById("app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast toast--${type} toast--show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.className = "toast";
  }, 2600);
}

/* 달성률에 따른 색상 클래스 (성공=초록, 보통=네이비, 경고=주황) */
function rateColorClass(rate) {
  if (rate >= 80) return "rate-good";
  if (rate >= 50) return "rate-mid";
  return "rate-low";
}

/* ============================================================
 * 로딩 스플래시 제어 (모든 페이지 공용)
 * ------------------------------------------------------------
 * - 페이지에 #app-loader 가 있으면 데이터 준비 후 hideAppLoader() 호출로 부드럽게 제거.
 * - 너무 빨리 끝나면 깜빡이므로 최소 노출시간(MIN) 보장.
 * - 명시적 호출이 없을 때를 대비한 안전장치(타임아웃)도 둔다.
 * ============================================================ */
window.__loaderStart = window.__loaderStart || Date.now();

function hideAppLoader() {
  const el = document.getElementById("app-loader");
  if (!el || el.classList.contains("is-hidden")) return;
  const MIN = 350; // 최소 노출(ms) — 순간 깜빡임 방지
  const wait = Math.max(0, MIN - (Date.now() - window.__loaderStart));
  setTimeout(() => {
    el.classList.add("is-hidden");
    setTimeout(() => el.remove(), 500); // opacity 트랜지션 후 DOM 제거
  }, wait);
}
window.hideAppLoader = hideAppLoader;

/* 안전장치: 6초 내 명시적 종료가 없으면 강제로 로더 제거(멈춤 방지) */
setTimeout(hideAppLoader, 6000);

/* ============================================================
 * 전체화면 토글 (페이지에 #fsBtn 있으면 자동 연결)
 * - 스터디로그는 반응형이라 풀스크린 시 화면을 자연스럽게 꽉 채움.
 * - Esc 또는 버튼으로 해제.
 * ============================================================ */
function setupFullscreen() {
  const btn = document.getElementById("fsBtn");
  if (!btn) return;
  const isFs = () => document.fullscreenElement || document.webkitFullscreenElement;
  btn.addEventListener("click", () => {
    if (isFs()) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const el = document.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    }
  });
  const sync = () => {
    const on = !!isFs();
    btn.title = on ? "전체화면 종료" : "전체화면";
    btn.classList.toggle("is-fs", on);
  };
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync);
}
if (document.readyState !== "loading") setupFullscreen();
else document.addEventListener("DOMContentLoaded", setupFullscreen);
