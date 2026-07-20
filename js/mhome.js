/*
 * mhome.js  (v2 — 모바일 홈 컨트롤러)
 * ------------------------------------------------------------
 * student-m.html 전용. student.js 없이 이 파일이 홈 전체를 그린다.
 * - 헤더: 날짜 + 수능 D-Day
 * - 오늘 카드(상태 전환): 플랜 전 → CTA / 플랜 후 → 과제 미니 리스트(홈에서 체크)
 *   + 성과 기록 버튼 / 체크아웃 후 → 결과 요약
 * - 스탯 한 줄: 스트릭 + 이번 주 기록 일수
 * - 오늘 일정 (Apple 캘린더, 앱에서만)
 * - 주간 목표/회고 행: 해당 요일(월/금)에 '오늘' 배지
 * ------------------------------------------------------------
 */
(function () {
  const pad = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const shiftDate = (dstr, delta) => {
    const [y, m, d] = dstr.split("-").map(Number);
    const t = new Date(y, m - 1, d + delta);
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  };

  document.addEventListener("DOMContentLoaded", async () => {
    /* 헤더 — 날짜는 네트워크 없이 즉시 */
    document.getElementById("m-date").textContent = formatKoreanDate();

    const profile = await requireRole(["student"]);
    if (!profile) return;
    if (!profile.onboarded) { window.location.replace("/onboarding.html"); return; }

    const T = terms(profile);

    /* D-Day: 수험생은 수능, 일반은 직접 정한 목표일(없으면 숨김) */
    const dd = ddayFor(profile);
    const ddayEl = document.querySelector(".mhead__dday");
    if (dd) {
      ddayEl.innerHTML = `${esc(dd.label)} <b id="m-dday">${ddayText(dd.days)}</b>`;
    } else {
      ddayEl.hidden = true;
    }

    /* 주간 목표·회고는 수험생 전용 */
    const rows = document.querySelector(".mrows");
    if (isGeneral(profile)) {
      if (rows) rows.hidden = true;
    } else {
      const dow = new Date().getDay();
      if (dow === 1) document.querySelector("#mrow-goal .mrow__badge").hidden = false;
      if (dow === 5) document.querySelector("#mrow-review .mrow__badge").hidden = false;
    }

    const today = getTodayString();
    const box = document.getElementById("mtoday");

    /* 오늘 체크인/체크아웃 병렬 조회 */
    let checkin = null, checkout = null;
    try {
      const [ci, co] = await Promise.all([
        supabaseClient.from("daily_checkins").select("*")
          .eq("student_id", profile.id).eq("date", today).maybeSingle(),
        supabaseClient.from("daily_checkouts").select("*")
          .eq("student_id", profile.id).eq("date", today).maybeSingle(),
      ]);
      checkin = ci.data; checkout = co.data;
    } catch (e) {}

    /* ---------- 오늘 카드 ---------- */
    let tasks = checkin && Array.isArray(checkin.tasks) && checkin.tasks.length ? checkin.tasks : null;
    if (!tasks && checkin) tasks = [1, 2, 3].map((n) => ({ text: checkin[`task_${n}`] })).filter((t) => t.text);

    const progKey = `dt_taskprog_${profile.id}_${today}`;
    const loadProg = () => {
      try { return JSON.parse(localStorage.getItem(progKey)) || { done: {}, sub: {} }; }
      catch (e) { return { done: {}, sub: {} }; }
    };
    const saveProg = (p) => {
      try { localStorage.setItem(progKey, JSON.stringify(p)); } catch (e) {}
      try { window.dispatchEvent(new CustomEvent("dt-taskprog-changed")); } catch (e) {}
    };

    function renderToday() {
      /* ① 체크아웃 완료 → 결과 요약 */
      if (checkout) {
        let statuses = Array.isArray(checkout.task_results) && checkout.task_results.length
          ? checkout.task_results.map((r) => r.status) : null;
        if (!statuses) {
          const ns = [1, 2, 3].filter((n) => checkin && checkin[`task_${n}`]);
          statuses = ns.map((n) => checkout[`task_${n}_status`] || (checkout[`task_${n}_done`] ? "completed" : "missed"));
        }
        const done = statuses.filter((s) => s === "completed").length;
        const partial = statuses.filter((s) => s === "partial").length;
        const missed = statuses.length - done - partial;
        const rate = Math.round(Number(checkout.task_completion_rate ?? checkout.achievement_rate) || 0);
        box.innerHTML = `
          <div class="mtoday__head">
            <span class="mtoday__title">${T.result} 완료 🎉</span>
            <a href="/my-history.html" class="mtoday__link">자세히 ›</a>
          </div>
          <p class="mtoday__rate">${rate}<small>%</small></p>
          <p class="mtoday__rate-label">${T.task} 완료율 · 완료 ${done} · 일부 ${partial} · 미완료 ${missed}</p>`;
        return;
      }

      /* ② 플랜 전 → CTA 하나만 */
      if (!tasks || !tasks.length) {
        box.innerHTML = `
          <p class="mtoday__empty-title">${T.plan}이 아직 없어요</p>
          <p class="mtoday__empty-desc">오늘 끝낼 ${T.task}를 정하면 하루가 정리됩니다</p>
          <a href="/checkin.html" class="btn btn--primary btn--block btn--lg">${T.planCta}</a>`;
        return;
      }

      /* ③ 플랜 후 → 과제 미니 리스트 (홈에서 바로 체크) + 성과 기록 */
      const prog = loadProg();
      const n = tasks.length;
      const done = tasks.reduce((a, _, i) => a + (prog.done[i] ? 1 : 0), 0);
      const pct = n ? Math.round((done / n) * 100) : 0;
      const MAX = 4;
      const rows = tasks.slice(0, MAX).map((t, i) => `
        <button type="button" class="mtoday__task${prog.done[i] ? " is-done" : ""}" data-task="${i}">
          <span class="mtoday__check">${prog.done[i] ? "✓" : ""}</span>
          <span class="mtoday__task-text">${t.subject ? `<b>[${esc(subjectLabel(t.subject))}]</b> ` : ""}${esc(t.text || "")}</span>
        </button>`).join("");
      const more = n > MAX ? `<a href="/checkin.html" class="mtoday__more">+ ${n - MAX}개 더 보기</a>` : "";

      box.innerHTML = `
        <div class="mtoday__head">
          <span class="mtoday__title">오늘</span>
          <span class="mtoday__count">${done}/${n} 완료</span>
        </div>
        <div class="mtoday__bar"><div class="mtoday__fill" style="width:${pct}%"></div></div>
        <div class="mtoday__tasks">${rows}</div>
        ${more}
        <a href="/checkout.html" class="btn btn--primary btn--block mtoday__cta">${T.resultCta}</a>`;

      box.querySelectorAll("[data-task]").forEach((row) => {
        row.addEventListener("click", () => {
          const i = Number(row.dataset.task);
          const p = loadProg();
          p.done[i] = !p.done[i];
          saveProg(p);
          renderToday();
        });
      });
    }

    renderToday();
    window.addEventListener("dt-taskprog-changed", renderToday);
    if (window.hideAppLoader) hideAppLoader();

    /* ---------- 스탯 한 줄: 스트릭 + 이번 주 기록 ---------- */
    try {
      const { data: outs } = await supabaseClient
        .from("daily_checkouts").select("date")
        .eq("student_id", profile.id)
        .order("date", { ascending: false }).limit(120);
      const days = new Set((outs || []).map((r) => r.date));

      let cursor = days.has(today) ? today : shiftDate(today, -1);
      let streak = 0;
      while (days.has(cursor)) { streak++; cursor = shiftDate(cursor, -1); }

      // 이번 주(월요일 시작) 기록 일수
      const monday = shiftDate(today, -((new Date().getDay() + 6) % 7));
      let weekCount = 0;
      for (let i = 0; i < 7; i++) if (days.has(shiftDate(monday, i))) weekCount++;

      const el = document.getElementById("mstat");
      if (streak > 0) {
        el.innerHTML = `<b>🔥 ${streak}일 연속</b> · 이번 주 ${weekCount}일 기록`;
        el.hidden = false;
      }
    } catch (e) {}

    /* ---------- 오늘 일정 (Apple 캘린더) ---------- */
    try {
      const calPlugin = window.Capacitor && window.Capacitor.Plugins
        ? window.Capacitor.Plugins.CapacitorCalendar : null;
      if (calPlugin) {
        const { result: perm } = await calPlugin.requestFullCalendarAccess();
        if (perm === "granted") {
          const [y, m, d] = today.split("-").map(Number);
          const { result } = await calPlugin.listEventsInRange({
            from: new Date(y, m - 1, d).getTime(),
            to: new Date(y, m - 1, d, 23, 59, 59).getTime(),
          });
          if (result && result.length) {
            result.sort((a, b) => a.startDate - b.startDate);
            const MAXEV = 3;
            document.getElementById("mevents-list").innerHTML =
              result.slice(0, MAXEV).map((ev) => {
                const t = new Date(ev.startDate);
                const time = ev.isAllDay ? "종일" : `${pad(t.getHours())}:${pad(t.getMinutes())}`;
                return `<div class="fcal-ev"><span class="fcal-ev__time">${time}</span><span class="fcal-ev__title">${esc(ev.title || "(제목 없음)")}</span></div>`;
              }).join("") +
              (result.length > MAXEV ? `<a href="/calendar.html" class="mtoday__more">+ ${result.length - MAXEV}개 더 보기</a>` : "");
            document.getElementById("mevents").hidden = false;
          }
        }
      }
    } catch (e) {}
  });
})();
