/*
 * ghome.js — 일반 사용자 모바일 홈 (심플 투두 플래너)
 * ------------------------------------------------------------
 * general-m.html 전용. 수험생 홈(mhome.js)과 완전히 분리.
 * - 오늘 할 일: todos 테이블(sql/16) — 그 자리에서 추가·체크·삭제
 * - 어제 미완료 → "가져오기" 한 번으로 오늘로 이월
 * - 목표 D-Day(goal_date, 설정 시에만) + 오늘 일정(Apple 캘린더)
 * ------------------------------------------------------------ */
(function () {
  "use strict";

  const pad = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("g-date").textContent = formatKoreanDate();

    const profile = await requireRole(["student"]);
    if (!profile) return;
    if (!profile.onboarded) { window.location.replace("/onboarding.html"); return; }
    // 수험생이 잘못 들어오면 수험생 홈으로
    if (profile.user_type !== "general") { window.location.replace("/student-m.html"); return; }

    /* 목표 D-Day (설정한 경우에만) */
    const dd = ddayFor(profile);
    if (dd) {
      const el = document.getElementById("g-dday");
      el.innerHTML = `${esc(dd.label)} <b>${ddayText(dd.days)}</b>`;
      el.hidden = false;
    }

    const today = getTodayString();
    const yesterday = (() => {
      const [y, m, d] = today.split("-").map(Number);
      const t = new Date(y, m - 1, d - 1);
      return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
    })();

    const listEl = document.getElementById("g-list");
    const inputEl = document.getElementById("g-input");
    const countEl = document.getElementById("g-count");
    let todos = [];
    let carryover = [];

    /* ---------- 렌더 ---------- */
    function render() {
      const done = todos.filter((t) => t.done).length;
      countEl.hidden = todos.length === 0;
      countEl.textContent = `${done}/${todos.length} 완료`;

      if (!todos.length) {
        listEl.innerHTML = `<p class="gtodo__empty">오늘 할 일을 적어보세요</p>`;
        return;
      }
      listEl.innerHTML = todos.map((t) => `
        <div class="gtodo__row memo-row" data-id="${t.id}">
          <div class="memo-row__actions">
            <button type="button" class="memo-act memo-act--del" data-act="del">삭제</button>
          </div>
          <button type="button" class="gtodo__item${t.done ? " is-done" : ""}">
            <span class="gtodo__check">${t.done ? "✓" : ""}</span>
            <span class="gtodo__text">${esc(t.content)}</span>
          </button>
        </div>`).join("");

      listEl.querySelectorAll(".gtodo__row").forEach(wireRow);
    }

    /* 행 하나: 탭=완료 토글, 좌측 스와이프=삭제 */
    let openRow = null;
    const OPEN_X = -92;
    function closeOpen() {
      if (!openRow) return;
      openRow.classList.remove("is-open");
      openRow.querySelector(".gtodo__item").style.transform = "";
      openRow = null;
    }
    function wireRow(row) {
      const card = row.querySelector(".gtodo__item");
      let sx = 0, sy = 0, dx = 0, dir = null, active = false, moved = false;
      const setX = (x) => { card.style.transform = x ? `translateX(${x}px)` : ""; };

      card.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (openRow && openRow !== row) closeOpen();
        sx = e.clientX; sy = e.clientY; dx = 0; dir = null; active = true; moved = false;
        card.style.transition = "none";
      });
      card.addEventListener("pointermove", (e) => {
        if (!active) return;
        const mx = e.clientX - sx, my = e.clientY - sy;
        if (!dir) {
          if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
          if (Math.abs(my) > Math.abs(mx)) { active = false; return; }
          dir = "x";
          try { card.setPointerCapture(e.pointerId); } catch (err) {}
        }
        moved = true;
        const base = row.classList.contains("is-open") ? OPEN_X : 0;
        dx = Math.max(OPEN_X - 30, Math.min(0, base + mx));
        setX(dx);
      });
      const finish = () => {
        if (!active) return;
        active = false;
        card.style.transition = "";
        if (dir !== "x") return;
        if (dx < OPEN_X / 2) { setX(OPEN_X); row.classList.add("is-open"); openRow = row; }
        else { setX(0); row.classList.remove("is-open"); if (openRow === row) openRow = null; }
      };
      card.addEventListener("pointerup", finish);
      card.addEventListener("pointercancel", finish);

      card.addEventListener("click", async () => {
        if (moved) { moved = false; return; }
        if (row.classList.contains("is-open")) { closeOpen(); return; }
        const todo = todos.find((t) => t.id === row.dataset.id);
        if (!todo) return;
        todo.done = !todo.done;             // 낙관적 갱신
        render();
        const { error } = await supabaseClient.from("todos")
          .update({ done: todo.done }).eq("id", todo.id);
        if (error) { todo.done = !todo.done; render(); }
      });

      row.querySelector("[data-act=del]").addEventListener("click", async () => {
        const id = row.dataset.id;
        const { error } = await supabaseClient.from("todos").delete().eq("id", id);
        if (!error) { todos = todos.filter((t) => t.id !== id); openRow = null; render(); }
      });
    }

    /* ---------- 추가 ---------- */
    async function addTodo(content) {
      const text = content.trim();
      if (!text) return;
      const { data, error } = await supabaseClient.from("todos")
        .insert({ student_id: profile.id, content: text, date: today, sort: todos.length })
        .select().single();
      if (!error && data) { todos.push(data); render(); }
    }
    inputEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.isComposing) return;   // 한글 조합 중 Enter 무시
      e.preventDefault();
      const v = inputEl.value;
      inputEl.value = "";
      addTodo(v);
    });
    inputEl.addEventListener("blur", () => {
      if (inputEl.value.trim()) { const v = inputEl.value; inputEl.value = ""; addTodo(v); }
    });

    /* ---------- 로드 + 어제 이월 ---------- */
    async function load() {
      const { data } = await supabaseClient.from("todos")
        .select("*").eq("student_id", profile.id).eq("date", today)
        .order("sort").order("created_at");
      todos = data || [];
      render();

      const { data: prev } = await supabaseClient.from("todos")
        .select("*").eq("student_id", profile.id).eq("date", yesterday).eq("done", false);
      carryover = prev || [];
      const box = document.getElementById("g-carry");
      if (carryover.length) {
        document.getElementById("g-carry-text").textContent =
          `어제 못 끝낸 할 일 ${carryover.length}개가 있어요`;
        box.hidden = false;
      } else {
        box.hidden = true;
      }
    }

    document.getElementById("g-carry-btn").addEventListener("click", async () => {
      const ids = carryover.map((t) => t.id);
      const { error } = await supabaseClient.from("todos")
        .update({ date: today }).in("id", ids);
      if (!error) {
        document.getElementById("g-carry").hidden = true;
        await load();
      }
    });

    await load();
    if (window.hideAppLoader) hideAppLoader();

    /* ---------- 오늘 일정 (Apple 캘린더, 앱에서만) ---------- */
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
            document.getElementById("g-events-list").innerHTML =
              result.slice(0, 3).map((ev) => {
                const t = new Date(ev.startDate);
                const time = ev.isAllDay ? "종일" : fmtTime12(t);
                return `<div class="fcal-ev"><span class="fcal-ev__time">${time}</span><span class="fcal-ev__title">${esc(ev.title || "(제목 없음)")}</span></div>`;
              }).join("") +
              (result.length > 3 ? `<a href="/calendar.html" class="mtoday__more">+ ${result.length - 3}개 더 보기</a>` : "");
            document.getElementById("g-events").hidden = false;
          }
        }
      }
    } catch (e) {}
  });
})();
