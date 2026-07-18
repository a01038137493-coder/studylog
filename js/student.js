/*
 * student.js
 * ------------------------------------------------------------
 * 학생 홈(student.html) 스크립트.
 * - 로그인 + student 권한 확인
 * - 상단: 이름/날짜/D-day/체크인·체크아웃 상태
 *   · (4) 오늘 타임블록이 있으면 "다음 블록" 표시
 *   · (5) 체크아웃 완료 후 목표시간/실제시간/달성률/타임블록 완료율 표시
 * - "오늘 플랜 입력 → 오늘 성과 기록" 흐름을 카드로 명확히 보여주고,
 *   가장 중요한 "오늘 플랜 입력" 카드를 강조한다.
 * ------------------------------------------------------------
 */

document.addEventListener("DOMContentLoaded", async () => {
  // 네트워크가 필요 없는 영역은 인증을 기다리지 않고 먼저 그린다 → 첫 화면이 즉시 완성된 모습
  document.getElementById("today-date").textContent = formatKoreanDate();
  renderCalendar();

  // 오늘의 한마디
  const q = todaysQuote();
  document.getElementById("daily-quote").innerHTML = `
    <p class="daily-quote__text">“${escapeHtml(q.t)}”</p>
    <span class="daily-quote__author">${escapeHtml(q.a)}</span>`;

  const dday = getDdayToSuneung();
  const ddayEl = document.getElementById("dday");
  ddayEl.textContent = dday > 0 ? `D-${dday}` : dday === 0 ? "D-DAY" : `D+${Math.abs(dday)}`;

  const profile = await requireRole(["student"]);
  if (!profile) return;

  document.getElementById("student-name").textContent = profile.name + " 님";

  const today = getTodayString();

  // 오늘 체크인/체크아웃 조회 (타임박스 포함)
  const [checkinRes, checkoutRes] = await Promise.all([
    supabaseClient
      .from("daily_checkins")
      .select("*")
      .eq("student_id", profile.id)
      .eq("date", today)
      .maybeSingle(),
    supabaseClient
      .from("daily_checkouts")
      .select("*")
      .eq("student_id", profile.id)
      .eq("date", today)
      .maybeSingle(),
  ]);

  const checkin = checkinRes.data || null;
  const checkout = checkoutRes.data || null;
  const hasCheckin = !!checkin;
  const hasCheckout = !!checkout;

  updateFlowMeta(checkin, checkout);
  updateResultStrip(checkin, checkout);
  highlightNextAction(hasCheckin, hasCheckout);
  renderHeroTasks(checkin, profile.id);  // 명언 자리에 오늘 과제 현황 (과제 없으면 명언 유지)

  // 대시보드 위젯 커스터마이징 (롱프레스 → 흔들림/삭제/추가)
  if (window.initDashboard) await initDashboard(profile);

  // 데이터·레이아웃 준비 완료 → 로딩 스플래시 종료
  if (window.hideAppLoader) hideAppLoader();
});

/* (3) 플랜/성과 카드 안에 요약 메타 표시 */
function updateFlowMeta(checkin, checkout) {
  const inMeta = document.getElementById("checkin-meta");
  const outMeta = document.getElementById("checkout-meta");

  if (checkin) {
    const taskCount = Array.isArray(checkin.tasks) && checkin.tasks.length
      ? checkin.tasks.length
      : [1, 2, 3].filter((n) => checkin[`task_${n}`]).length;
    inMeta.textContent = `핵심 과제 ${taskCount}개 · 추가·수정`;
    inMeta.classList.add("flow-card__meta--done");
  } else {
    inMeta.textContent = "아직 작성 전 · 지금 입력";
  }

  if (checkout) {
    const rate = Math.round(toNumber(checkout.task_completion_rate ?? checkout.achievement_rate));
    outMeta.textContent = `완료율 ${rate}% 기록됨`;
    outMeta.classList.add("flow-card__meta--done");
  } else if (checkin) {
    outMeta.textContent = "이제 기록할 수 있어요";
  } else {
    outMeta.textContent = "플랜 입력 후 가능";
  }
}

/* 체크아웃 완료 후 결과 요약 스트립 (과제 완료 중심) */
function updateResultStrip(checkin, checkout) {
  const el = document.getElementById("result-strip");
  if (!checkout) {
    el.hidden = true;
    return;
  }

  // 과제 상태 배열 (task_results 우선, 없으면 기존 컬럼)
  let statuses = Array.isArray(checkout.task_results) && checkout.task_results.length
    ? checkout.task_results.map((r) => r.status)
    : null;
  if (!statuses) {
    const taskNs = [1, 2, 3].filter((n) => checkin && checkin[`task_${n}`]);
    statuses = taskNs.map((n) => checkout[`task_${n}_status`] || (checkout[`task_${n}_done`] ? "completed" : "missed"));
  }
  const done = statuses.filter((s) => s === "completed").length;
  const partial = statuses.filter((s) => s === "partial").length;
  const missed = statuses.length - done - partial;
  const rate = Math.round(toNumber(checkout.task_completion_rate ?? checkout.achievement_rate));

  el.hidden = false;
  el.innerHTML = `
    ${resultItem("과제 완료율", rate + "%")}
    ${resultItem("완료", done)}
    ${resultItem("일부", partial)}
    ${resultItem("미완료", missed)}
  `;
}

function resultItem(label, value) {
  return `<div class="result-strip__item">
    <span class="result-strip__label">${label}</span>
    <span class="result-strip__value">${value}</span>
  </div>`;
}

/*
 * 다음에 해야 할 행동 강조 (하나만).
 * - 체크인 전 → 오늘 플랜 입력
 * - 체크인 O, 체크아웃 X → 오늘 성과 기록
 * - 월요일(체크인 후) → 이번 주 목표
 * - 금요일(체크아웃 후) → 주간 회고
 */
function highlightNextAction(hasCheckin, hasCheckout) {
  const weekday = getTodayWeekday();
  const ids = {
    checkin: document.getElementById("act-checkin"),
    checkout: document.getElementById("act-checkout"),
    weeklyGoal: document.getElementById("act-weekly-goal"),
    weeklyReview: document.getElementById("act-weekly-review"),
  };

  let target = null;
  if (!hasCheckin) target = ids.checkin;
  else if (!hasCheckout) target = ids.checkout;

  if (weekday === 1 && hasCheckin) target = ids.weeklyGoal;
  else if (weekday === 5 && hasCheckout) target = ids.weeklyReview;

  if (target) target.classList.add("is-next");
}

/* 왼쪽 미니멀 달력 (이번 달, 오늘은 빨간 점) */
function renderCalendar() {
  const el = document.getElementById("calendar");
  if (!el) return;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const today = now.getDate();
  const firstDow = new Date(year, month, 1).getDay(); // 0=일
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dows = ["일", "월", "화", "수", "목", "금", "토"];

  let cells = dows.map((d) => `<div class="calendar__dow">${d}</div>`).join("");
  for (let i = 0; i < firstDow; i++) cells += `<div class="calendar__cell"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today;
    cells += `<div class="calendar__cell${isToday ? " calendar__cell--today" : ""}">${d}</div>`;
  }
  el.innerHTML = `
    <div class="calendar__title">${year}년 ${month + 1}월</div>
    <div class="calendar__grid">${cells}</div>`;
}

/* ============================================================
 * 명언 자리에 '오늘 과제 현황' 표시 (탭으로 완료 토글).
 * - 완료 상태는 날짜별 localStorage 에 저장 (과제 위젯과 동일 키 → 동기화)
 * - 과제가 없으면(체크인 전) 기존 명언을 그대로 둠
 * ============================================================ */
function heroProgKey(pid) { return `dt_taskprog_${pid}_${getTodayString()}`; }
function heroLoadProg(pid) {
  try { return JSON.parse(localStorage.getItem(heroProgKey(pid))) || { done: {}, sub: {} }; }
  catch (e) { return { done: {}, sub: {} }; }
}
function heroSaveProg(pid, p) {
  try { localStorage.setItem(heroProgKey(pid), JSON.stringify(p)); } catch (e) {}
  // 과제 위젯 등 같은 진행상태를 보는 다른 컴포넌트에 즉시 반영 요청
  try { window.dispatchEvent(new CustomEvent("dt-taskprog-changed")); } catch (e) {}
}

// 다른 컴포넌트(과제 위젯)의 변경 → 메인 '오늘 과제' 카드 즉시 동기화
let heroRerender = null;

function renderHeroTasks(checkin, pid) {
  const box = document.getElementById("daily-quote");
  if (!box) return;
  let tasks = checkin && Array.isArray(checkin.tasks) && checkin.tasks.length ? checkin.tasks : null;
  if (!tasks && checkin) tasks = [1, 2, 3].map((n) => ({ text: checkin[`task_${n}`] })).filter((t) => t.text);
  if (!tasks || !tasks.length) return;  // 과제 없으면 명언 유지

  box.classList.add("daily-quote--tasks");
  const prog0 = heroLoadProg(pid);
  let cursor = tasks.findIndex((_, i) => !prog0.done[i]);   // 첫 미완료 과제부터
  if (cursor < 0) cursor = 0;
  let animating = false;
  const SWIPE_MS = 230;
  const SLIDE = 64;                                          // 슬라이드 이동 거리(px)
  const REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const render = () => {
    const prog = heroLoadProg(pid);
    const n = tasks.length;
    const done = tasks.reduce((a, _, i) => a + (prog.done[i] ? 1 : 0), 0);
    const pct = n ? Math.round((done / n) * 100) : 0;
    if (cursor > n - 1) cursor = n - 1;
    const t = tasks[cursor];
    const subs = Array.isArray(t.subtasks) ? t.subtasks.map((s) => (typeof s === "string" ? s : s && s.text)).filter(Boolean) : [];
    const sd = prog.sub[cursor] || {};

    box.innerHTML = `
      <div class="hero-tasks hero-tasks--focus">
        <div class="hero-tasks__head">
          <span class="hero-tasks__label">오늘 과제</span>
          <span class="hero-tasks__count">${done}/${n} 완료</span>
        </div>
        <div class="hero-tasks__bar"><div class="hero-tasks__fill" style="width:${pct}%"></div></div>
        <div class="hero-focus">
          <div class="hero-focus__main">
            <div class="hero-focus__task${prog.done[cursor] ? " is-done" : ""}" data-core>
              ${t.subject ? `<span class="hero-tasks__subject">${escapeHtml(subjectLabel(t.subject))}</span>` : ""}
              <span class="hero-focus__title">${escapeHtml(t.text || "")}</span>
              <span class="hero-focus__check">${prog.done[cursor] ? "✓" : ""}</span>
            </div>
            ${subs.length ? `<ul class="hero-focus__subs">${subs.map((s, j) => `
              <li class="hero-focus__sub${sd[j] ? " is-done" : ""}" data-sub="${j}">
                <span class="hero-focus__subtext">${escapeHtml(s)}</span>
                <span class="hero-focus__subcheck">${sd[j] ? "✓" : ""}</span>
              </li>`).join("")}</ul>` : ""}
          </div>
        </div>
        ${n > 1 ? `<div class="hero-focus__dots">${tasks.map((_, i) => `<button type="button" class="hero-focus__dot${i === cursor ? " is-active" : ""}" data-dot="${i}" aria-label="${i + 1}번째 과제"></button>`).join("")}</div>` : ""}
      </div>`;

    box.querySelector("[data-core]").addEventListener("click", () => {
      const p = heroLoadProg(pid);
      if (p.done[cursor]) delete p.done[cursor]; else p.done[cursor] = true;
      heroSaveProg(pid, p);
      render();   // 완료해도 현재 과제에 그대로 머무름(자동 이동 없음)
    });
    box.querySelectorAll(".hero-focus__sub").forEach((li) => {
      li.addEventListener("click", () => {
        const j = li.dataset.sub;
        const p = heroLoadProg(pid);
        if (!p.sub[cursor]) p.sub[cursor] = {};
        if (p.sub[cursor][j]) delete p.sub[cursor][j]; else p.sub[cursor][j] = true;
        heroSaveProg(pid, p);
        render();
      });
    });
    box.querySelectorAll(".hero-focus__dot").forEach((d) => {
      d.addEventListener("click", () => {
        const target = Number(d.dataset.dot);
        if (target !== cursor) goTo(target, target > cursor ? 1 : -1);
      });
    });
  };

  // 방향성 슬라이드: 현재 카드를 진행 방향으로 밀어내고, 새 카드를 반대편에서 밀어 넣는다.
  function goTo(target, dir) {
    const n = tasks.length;
    if (n <= 1 || animating) return;
    target = ((target % n) + n) % n;
    if (target === cursor) return;
    const main = box.querySelector(".hero-focus__main");
    if (REDUCE || !main) { cursor = target; render(); return; }
    animating = true;
    main.style.transition = "none";
    void main.offsetWidth;                                   // 현재 위치(드래그 오프셋 포함) 고정
    main.style.transition = `transform ${SWIPE_MS}ms cubic-bezier(.22,.61,.36,1), opacity ${SWIPE_MS}ms ease`;
    main.style.transform = `translateX(${dir > 0 ? -SLIDE : SLIDE}px)`;
    main.style.opacity = "0";
    setTimeout(() => {
      cursor = target;
      render();
      const m2 = box.querySelector(".hero-focus__main");
      if (m2) {
        m2.style.transition = "none";
        m2.style.transform = `translateX(${dir > 0 ? SLIDE : -SLIDE}px)`;
        m2.style.opacity = "0";
        void m2.offsetWidth;                                // reflow
        m2.style.transition = `transform ${SWIPE_MS}ms cubic-bezier(.22,.61,.36,1), opacity ${SWIPE_MS}ms ease`;
        m2.style.transform = "translateX(0)";
        m2.style.opacity = "1";
        setTimeout(() => { m2.style.transition = ""; m2.style.transform = ""; m2.style.opacity = ""; }, SWIPE_MS + 30);
      }
      animating = false;
    }, SWIPE_MS);
  }

  // 좌우 스와이프(터치/마우스). 끄는 동안 카드가 손가락을 따라오고, 임계값을 넘기면 슬라이드 전환.
  let sx = 0, sy = 0, swiping = false, justSwiped = false, dragMain = null;
  box.addEventListener("pointerdown", (e) => {
    if (animating) return;
    sx = e.clientX; sy = e.clientY; swiping = false;
    dragMain = box.querySelector(".hero-focus__main");
  });
  box.addEventListener("pointermove", (e) => {
    if (animating || !dragMain) return;
    const rdx = e.clientX - sx, dy = Math.abs(e.clientY - sy);
    if (!swiping && Math.abs(rdx) > 10 && Math.abs(rdx) > dy) swiping = true;  // 가로 우세할 때만 스와이프
    if (swiping && tasks.length > 1) {
      dragMain.style.transition = "none";
      dragMain.style.transform = `translateX(${rdx * 0.55}px)`;                // 살짝 저항감
      dragMain.style.opacity = String(1 - Math.min(Math.abs(rdx) / 260, 0.4));
    }
  });
  box.addEventListener("pointerup", (e) => {
    const main = dragMain; dragMain = null;
    if (!swiping) return;
    const dx = e.clientX - sx, n = tasks.length;
    if (n > 1 && Math.abs(dx) > 44) {
      justSwiped = true;
      goTo(cursor + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);    // 왼쪽=다음, 오른쪽=이전
    } else if (main) {                                       // 임계값 미달 → 제자리로 복귀
      main.style.transition = `transform ${SWIPE_MS}ms cubic-bezier(.22,.61,.36,1), opacity ${SWIPE_MS}ms ease`;
      main.style.transform = "translateX(0)";
      main.style.opacity = "1";
    }
  });
  box.addEventListener("pointercancel", () => {
    if (dragMain) { dragMain.style.transition = ""; dragMain.style.transform = ""; dragMain.style.opacity = ""; }
    dragMain = null; swiping = false;
  });
  box.addEventListener("click", (e) => {            // 스와이프 직후의 클릭(체크 토글) 차단
    if (justSwiped) { e.stopPropagation(); e.preventDefault(); justSwiped = false; }
  }, true);

  // 과제 위젯/다른 탭에서 진행상태가 바뀌면 이 카드도 즉시 다시 그림 (한 번만 바인딩)
  heroRerender = render;
  if (!window.__heroSyncBound) {
    window.__heroSyncBound = true;
    window.addEventListener("dt-taskprog-changed", () => { if (heroRerender) heroRerender(); });
    window.addEventListener("storage", (e) => {
      if (e.key && e.key.indexOf("dt_taskprog_") === 0 && heroRerender) heroRerender();
    });
  }

  render();
}

/* ---- 헬퍼 ---- */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
