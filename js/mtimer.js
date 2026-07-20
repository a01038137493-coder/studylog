/*
 * mtimer.js
 * ------------------------------------------------------------
 * 모바일 다크 홈 전용 공부 스톱워치.
 * - 날짜별 누적 시간을 localStorage 에 저장 (기기 로컬)
 * - 실행 중 앱을 닫아도 startedAt 기준으로 이어서 계산
 * ------------------------------------------------------------
 */
(function () {
  const disp = document.getElementById("mtimer-time");
  const btn = document.getElementById("mtimer-btn");
  if (!disp || !btn) return;

  const d = new Date();
  const key =
    "dt_mtimer_" +
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0");

  let acc = 0;          // 누적 초
  let startedAt = null; // 실행 중이면 시작 시각(ms)
  let tick = null;

  try {
    const s = JSON.parse(localStorage.getItem(key) || "{}");
    if (typeof s.acc === "number") acc = s.acc;
    if (typeof s.startedAt === "number") startedAt = s.startedAt;
  } catch (e) {}

  function total() {
    return acc + (startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0);
  }
  function fmt(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify({ acc, startedAt })); } catch (e) {}
  }
  function render() {
    disp.textContent = fmt(total());
    btn.classList.toggle("is-running", !!startedAt);
  }
  function start() {
    if (startedAt) return;
    startedAt = Date.now();
    save();
    tick = setInterval(render, 1000);
    render();
  }
  function pause() {
    if (!startedAt) return;
    acc = total();
    startedAt = null;
    save();
    clearInterval(tick);
    render();
  }

  btn.addEventListener("click", () => (startedAt ? pause() : start()));
  if (startedAt) tick = setInterval(render, 1000);
  render();

  /* 상단 D-Day/날짜: student.js 가 채우는 숨겨진 상태카드 값을 미러링 */
  function mirror(srcId, dstId) {
    const src = document.getElementById(srcId);
    const dst = document.getElementById(dstId);
    if (!src || !dst) return;
    const sync = () => { if (src.textContent.trim()) dst.textContent = src.textContent; };
    sync();
    new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
  }
  mirror("dday", "mtimer-dday");
  mirror("today-date", "mtimer-date");
})();
