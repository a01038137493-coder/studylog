/*
 * mhome.js
 * ------------------------------------------------------------
 * 모바일 홈(student-m.html) 전용 위젯:
 * 1) 오늘 진행 카드 — 과제 n/N + 진행바 + 다음 할 일 1개 (탭하면 할 일 페이지)
 * 2) 스트릭 — 체크아웃 연속 기록 일수 (오늘 미기록이면 어제까지 기준으로 유지)
 * 체크 상태는 할 일 페이지와 같은 localStorage 키(dt_taskprog_*)를 읽는다.
 * ------------------------------------------------------------
 */
(function () {
  const progCard = document.getElementById("mprog");
  const streakEl = document.getElementById("mstreak");
  if (!progCard && !streakEl) return;

  const pad = (n) => String(n).padStart(2, "0");
  const shiftDate = (dstr, delta) => {
    const [y, m, d] = dstr.split("-").map(Number);
    const t = new Date(y, m - 1, d + delta);
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  };

  document.addEventListener("DOMContentLoaded", async () => {
    const profile = await getCurrentProfile();
    if (!profile) return;
    const today = getTodayString();

    /* ---------- 1) 오늘 진행 카드 ---------- */
    try {
      const { data: checkin } = await supabaseClient
        .from("daily_checkins")
        .select("tasks, task_1, task_2, task_3")
        .eq("student_id", profile.id)
        .eq("date", today)
        .maybeSingle();

      let tasks = checkin && Array.isArray(checkin.tasks) && checkin.tasks.length ? checkin.tasks : null;
      if (!tasks && checkin) tasks = [1, 2, 3].map((n) => ({ text: checkin[`task_${n}`] })).filter((t) => t.text);

      if (tasks && tasks.length) {
        const progKey = `dt_taskprog_${profile.id}_${today}`;
        const render = () => {
          let prog;
          try { prog = JSON.parse(localStorage.getItem(progKey)) || { done: {} }; }
          catch (e) { prog = { done: {} }; }
          const n = tasks.length;
          const done = tasks.reduce((a, _, i) => a + (prog.done[i] ? 1 : 0), 0);
          document.getElementById("mprog-count").textContent = `${done}/${n} 완료`;
          document.getElementById("mprog-fill").style.width = `${n ? Math.round((done / n) * 100) : 0}%`;

          const nextIdx = tasks.findIndex((_, i) => !prog.done[i]);
          const nextEl = document.getElementById("mprog-next");
          if (nextIdx === -1) {
            nextEl.textContent = "오늘 과제를 모두 끝냈어요! 🎉";
          } else {
            const t = tasks[nextIdx];
            const subj = t.subject ? `[${subjectLabel(t.subject)}] ` : "";
            nextEl.textContent = `다음 할 일 · ${subj}${t.text || ""}`;
          }
        };
        render();
        window.addEventListener("dt-taskprog-changed", render);
        progCard.hidden = false;
      }
    } catch (e) {}

    /* ---------- 2) 스트릭 (체크아웃 연속 일수) ---------- */
    try {
      const { data: outs } = await supabaseClient
        .from("daily_checkouts")
        .select("date")
        .eq("student_id", profile.id)
        .order("date", { ascending: false })
        .limit(120);

      const days = new Set((outs || []).map((r) => r.date));
      let cursor = days.has(today) ? today : shiftDate(today, -1);
      let streak = 0;
      while (days.has(cursor)) { streak++; cursor = shiftDate(cursor, -1); }

      if (streak > 0) {
        streakEl.textContent = `🔥 ${streak}일 연속 기록 중`;
        streakEl.classList.add("mstreak--on");
      } else {
        streakEl.textContent = "오늘 성과를 기록하면 스트릭이 시작돼요 🔥";
      }
      streakEl.hidden = false;
    } catch (e) {}
  });
})();
