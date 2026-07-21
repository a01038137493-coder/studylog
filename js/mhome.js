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
    // 일반 사용자는 전용 홈으로 (수험생 홈과 완전 분리)
    if (profile.user_type === "general") { window.location.replace("/general-m.html"); return; }

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
      const rows = tasks.slice(0, MAX).map((t, i) => {
        const subs = (Array.isArray(t.subtasks) ? t.subtasks : []).map((s, j) => {
          const txt = typeof s === "string" ? s : (s && s.text) || "";
          if (!txt) return "";
          const on = !!prog.sub[i + "-" + j];
          return `
        <button type="button" class="mtoday__subrow${on ? " is-done" : ""}" data-subtask="${i}-${j}">
          <span class="mtoday__subcheck">${on ? "✓" : ""}</span>
          <span class="mtoday__sub-text">${esc(txt)}</span>
        </button>`;
        }).join("");
        return `
        <button type="button" class="mtoday__task${prog.done[i] ? " is-done" : ""}" data-task="${i}">
          <span class="mtoday__check">${prog.done[i] ? "✓" : ""}</span>
          <span class="mtoday__task-text">${t.subject ? `<b>[${esc(subjectLabel(t.subject))}]</b> ` : ""}${esc(t.text || "")}</span>
        </button>${subs}`;
      }).join("");
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
      box.querySelectorAll("[data-subtask]").forEach((row) => {
        row.addEventListener("click", () => {
          const k = row.dataset.subtask;
          const p = loadProg();
          p.sub[k] = !p.sub[k];
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

    /* ---------- 일정 블록: 오늘 + 다가오는 7일 ---------- */
    /* ---------- 타임박스: 매일 반복 시간표, 오늘 체크 + 현재 블록 강조 ---------- */
    (async function renderTimeboxes() {
      const card = document.getElementById("tbox");
      const tlist = document.getElementById("tbox-list");
      if (!card || !tlist) return;
      const tbToday = getTodayString();
      const { data: boxes } = await supabaseClient.from("timeboxes")
        .select("*").eq("student_id", profile.id).order("start_time");
      if (!boxes || !boxes.length) return;
      const dow = (new Date().getDay() + 6) % 7;   // 월=0
      const todays = boxes.filter((b) =>
        !Array.isArray(b.days) || !b.days.length || b.days.includes(dow));
      if (!todays.length) return;
      const { data: checks } = await supabaseClient.from("timebox_checks")
        .select("box_id, done").eq("student_id", profile.id).eq("date", tbToday);
      const doneSet = new Set((checks || []).filter((c) => c.done).map((c) => c.box_id));
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

      /* 세로 시간축 그리드 — 블록 범위에 맞춰 앞뒤 정시로 확장 */
      const PX = 46;                                        // 1시간당 픽셀
      const gs = Math.floor(Math.min(...todays.map((b) => toMin(b.start_time))) / 60) * 60;
      const ge = Math.ceil(Math.max(...todays.map((b) => toMin(b.end_time))) / 60) * 60;
      const H = ((ge - gs) / 60) * PX;
      const y = (min) => ((min - gs) / 60) * PX;

      let ghtml = "";
      for (let m = gs; m <= ge; m += 60) {
        ghtml += `<div class="tgrid__hour" style="top:${y(m)}px"><span>${String(m / 60).padStart(2, "0")}</span></div>`;
        if (m < ge) ghtml += `<div class="tgrid__half" style="top:${y(m + 30)}px"></div>`;
      }
      ghtml += todays.map((b) => {
        const s = toMin(b.start_time), e = toMin(b.end_time);
        const cur = nowMin >= s && nowMin < e;
        const on = doneSet.has(b.id);
        const h = Math.max(20, y(e) - y(s) - 2);
        const slim = h < 36;
        return `
        <button type="button" class="tgrid__block${cur ? " is-now" : ""}${on ? " is-done" : ""}${slim ? " tgrid__block--slim" : ""}"
                data-box="${b.id}" style="top:${y(s) + 1}px; height:${h}px">
          ${slim ? "" : `<span class="tgrid__time">${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)}</span>`}
          <span class="tgrid__label">${on ? "✓ " : ""}${esc(b.label)}</span>
        </button>`;
      }).join("");
      if (nowMin >= gs && nowMin <= ge) {
        ghtml += `<div class="tgrid__now" style="top:${y(nowMin)}px"></div>`;
      }
      tlist.innerHTML = `<div class="tgrid" style="height:${H + 14}px">${ghtml}</div>`;
      card.hidden = false;
      tlist.querySelectorAll("[data-box]").forEach((row) => {
        row.addEventListener("click", async () => {
          const id = row.dataset.box;
          const next = !doneSet.has(id);
          if (next) doneSet.add(id); else doneSet.delete(id);
          row.classList.toggle("is-done", next);
          row.querySelector(".tbox__check").textContent = next ? "✓" : "";
          await supabaseClient.from("timebox_checks").upsert({
            student_id: profile.id, box_id: id, date: tbToday, done: next,
          });
        });
      });
    })();
  });
})();
