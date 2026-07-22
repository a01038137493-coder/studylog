/*
 * history.js
 * ------------------------------------------------------------
 * 내 기록 보기(my-history.html) — 과제 완료 중심.
 *   - 최근 7일 평균 과제 완료율 / 완료 과제 수
 *   - 최근 7일 일자별 완료율
 *   - 미완료 사유 TOP 3
 *   - 이번 주 핵심 목표 / 최근 주간 회고
 * ------------------------------------------------------------
 */

/* 기간 필터: 0 = 전체 */
const PERIOD_LABEL = { 7: "최근 7일", 15: "최근 15일", 30: "최근 1달", 90: "최근 3달", 0: "전체 기간" };

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireRole(["student"]);
  if (!profile) return;

  async function load(days) {
    document.querySelectorAll(".period-label").forEach((el) => {
      el.textContent = PERIOD_LABEL[days] || "최근 7일";
    });

    let q = supabaseClient
      .from("daily_checkouts")
      .select("*")
      .eq("student_id", profile.id)
      .order("date", { ascending: false });
    if (days > 0) q = q.gte("date", dateNDaysAgo(days - 1));

    let qc = supabaseClient
      .from("daily_checkins")
      .select("date, condition_score, risk_factors, tasks")
      .eq("student_id", profile.id)
      .order("date", { ascending: false });
    if (days > 0) qc = qc.gte("date", dateNDaysAgo(days - 1));

    const [{ data: checkouts }, { data: checkins }] = await Promise.all([q, qc]);
    const list = checkouts || [];
    const cins = checkins || [];
    const cinByDate = {};
    cins.forEach((c) => { cinByDate[c.date] = c; });

    renderSummary(list);
    renderSummaryExtra(list, cins);
    renderDaily(list, days, cinByDate);
    renderWeekday(list);
    renderRiskImpact(list, cins);
    renderFailureTop(list);
  }

  document.querySelectorAll("#period .period__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#period .period__btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      load(Number(btn.dataset.days));
    });
  });

  await load(7);
  await renderWeeklyGoals(profile.id);
  await renderRecentReview(profile.id);
});

/* 체크아웃 1건의 완료율 */
function rateOf(c) {
  return Math.round(toNumber(c.task_completion_rate != null ? c.task_completion_rate : c.achievement_rate));
}
/* 체크아웃 1건의 완료(completed) 과제 수 */
function completedCount(c) {
  if (Array.isArray(c.task_results)) return c.task_results.filter((r) => r.status === "completed").length;
  return [1, 2, 3].filter((n) => c[`task_${n}_status`] === "completed" || c[`task_${n}_done`]).length;
}

/* 요약: 평균 완료율, 완료 과제 수 */
function renderSummary(list) {
  if (list.length === 0) {
    document.getElementById("stat-rate").textContent = "기록 없음";
    document.getElementById("stat-done").textContent = "0개";
    return;
  }
  const avg = Math.round(list.reduce((s, c) => s + rateOf(c), 0) / list.length);
  const done = list.reduce((s, c) => s + completedCount(c), 0);
  const rateEl = document.getElementById("stat-rate");
  rateEl.textContent = `${avg}%`;
  rateEl.className = "stat__value " + rateColorClass(avg);
  document.getElementById("stat-done").textContent = `${done}개`;
}

/* 요약 보조: 기록일 수 + 평균 컨디션 */
function renderSummaryExtra(list, cins) {
  document.getElementById("stat-days").textContent = list.length ? `${list.length}일` : "0일";
  const conds = cins.map((c) => toNumber(c.condition_score)).filter((n) => n > 0);
  document.getElementById("stat-cond").textContent = conds.length
    ? `${(conds.reduce((a, b) => a + b, 0) / conds.length).toFixed(1)}점`
    : "—";
}

/* 요일별 평균 완료율 — 어느 요일에 무너지는지 */
function renderWeekday(list) {
  const wrap = document.getElementById("weekday-stats");
  if (!list.length) { wrap.innerHTML = `<p class="muted">기록이 없습니다.</p>`; return; }
  const names = ["월", "화", "수", "목", "금", "토", "일"];
  const sum = Array(7).fill(0), cnt = Array(7).fill(0);
  list.forEach((c) => {
    const [y, m, d] = c.date.split("-").map(Number);
    const dow = (new Date(y, m - 1, d).getDay() + 6) % 7;   // 월=0
    sum[dow] += rateOf(c); cnt[dow]++;
  });
  wrap.innerHTML = names.map((nm, i) => {
    if (!cnt[i]) return `
      <div class="bar-row"><span class="bar-row__label">${nm}</span>
        <div class="bar-row__track"></div><span class="bar-row__value muted">—</span></div>`;
    const pct = Math.round(sum[i] / cnt[i]);
    return `
      <div class="bar-row"><span class="bar-row__label">${nm}</span>
        <div class="bar-row__track"><div class="bar-row__fill ${rateColorClass(pct)}" style="width:${pct}%"></div></div>
        <span class="bar-row__value">${pct}%</span></div>`;
  }).join("");
}

/* 위험 요소 영향 — 자주 고른 위험과 그날의 평균 완료율 */
function renderRiskImpact(list, cins) {
  const ul = document.getElementById("risk-impact");
  const rateByDate = {};
  list.forEach((c) => { rateByDate[c.date] = rateOf(c); });
  const overall = list.length ? Math.round(list.reduce((s, c) => s + rateOf(c), 0) / list.length) : 0;

  const days = {};   // risk → [해당일 완료율...]
  cins.forEach((c) => {
    const risks = Array.isArray(c.risk_factors) ? c.risk_factors : [];
    risks.forEach((r) => {
      if (!days[r]) days[r] = [];
      if (rateByDate[c.date] != null) days[r].push(rateByDate[c.date]);
    });
  });
  const sorted = Object.entries(days).sort((a, b) => b[1].length - a[1].length).slice(0, 3);
  if (!sorted.length) {
    ul.innerHTML = `<li class="muted">선택한 위험 요소 기록이 없습니다.</li>`;
    return;
  }
  ul.innerHTML = sorted.map(([risk, rates], i) => {
    const avg = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
    const diff = avg != null ? avg - overall : null;
    const diffTxt = diff == null ? "" :
      ` · 평균 ${avg}% (${diff >= 0 ? "+" : ""}${diff}%p)`;
    return `
    <li class="rank-list__item">
      <span class="rank-list__rank">${i + 1}</span>
      <span class="rank-list__name">${escapeHtml(risk)}</span>
      <span class="rank-list__count">${rates.length}회${diffTxt}</span>
    </li>`;
  }).join("");
}

/* 일자별 완료율 (긴 기간은 최근 30일만 그린다 — 막대가 너무 촘촘해지는 것 방지) */
function renderDaily(list, days, cinByDate) {
  const wrap = document.getElementById("daily-completion");
  if (list.length === 0) {
    wrap.innerHTML = `<p class="muted">${PERIOD_LABEL[days] || "선택한 기간"} 기록이 없습니다.</p>`;
    return;
  }
  const MAX_BARS = 30;
  const trimmed = list.length > MAX_BARS ? list.slice(0, MAX_BARS) : list;   // list는 최신순
  const rows = [...trimmed].sort((a, b) => a.date.localeCompare(b.date));
  const note = list.length > MAX_BARS
    ? `<p class="muted bar-list__note">기록 ${list.length}일 중 최근 ${MAX_BARS}일만 표시</p>`
    : "";
  wrap.innerHTML = note + rows
    .map((c, i) => {
      const pct = rateOf(c);
      const md = c.date.slice(5).replace("-", "/");
      return `
      <div class="bar-row bar-row--tap" data-i="${i}">
        <span class="bar-row__label">${md}</span>
        <div class="bar-row__track"><div class="bar-row__fill ${rateColorClass(pct)}" style="width:${pct}%"></div></div>
        <span class="bar-row__value">${pct}%</span>
      </div>
      <div class="dayx" hidden>${dayDetailHtml(c, cinByDate[c.date])}</div>`;
    })
    .join("");

  wrap.querySelectorAll(".bar-row--tap").forEach((row) => {
    row.addEventListener("click", () => {
      const dx = row.nextElementSibling;
      const open = dx.hidden;
      wrap.querySelectorAll(".dayx").forEach((d) => { d.hidden = true; });
      dx.hidden = !open;
    });
  });
}

/* 하루 상세: 과제 결과 + 컨디션 + 자기평가 + 회고 */
function dayDetailHtml(c, cin) {
  const badge = (s, done) =>
    (s === "completed" || s === "done" || done) ? "✅" : (s === "partial" ? "🔶" : "⬜️");
  let tasks = "";
  const plans = cin && Array.isArray(cin.tasks) ? cin.tasks : [];
  const subsOf = (i) => {
    const subs = plans[i] && Array.isArray(plans[i].subtasks) ? plans[i].subtasks : [];
    return subs.map((s) => {
      const t = typeof s === "string" ? s : (s && s.text) || "";
      const done = s && typeof s === "object" && s.done;
      return `<div class="dayx__sub">↳ ${done ? "✅ " : ""}${escapeHtml(t)}</div>`;
    }).join("");
  };
  if (Array.isArray(c.task_results) && c.task_results.length) {
    tasks = c.task_results.map((r, i) =>
      `<div class="dayx__task">${badge(r.status)} ${escapeHtml(r.text || "")}</div>${subsOf(i)}`).join("");
  } else if (plans.length) {
    tasks = plans.map((p, i) =>
      `<div class="dayx__task">${badge(null)} ${escapeHtml(p.text || "")}</div>${subsOf(i)}`).join("");
  } else {
    tasks = [1, 2, 3]
      .filter((n) => cin && cin["task_" + n] || c["task_" + n + "_status"] != null || c["task_" + n + "_done"] != null)
      .map((n) => `<div class="dayx__task">${badge(c["task_" + n + "_status"], c["task_" + n + "_done"])} 과제 ${n}</div>`)
      .join("");
  }
  const meta = [];
  if (cin && toNumber(cin.condition_score) > 0) meta.push(`컨디션 ${cin.condition_score}/10`);
  if (toNumber(c.self_score) > 0) meta.push(`자기평가 ${c.self_score}/10`);
  const risks = cin && Array.isArray(cin.risk_factors) && cin.risk_factors.length
    ? `<span class="dayx__risk">⚠ ${cin.risk_factors.map(escapeHtml).join(" · ")}</span>` : "";
  return `
    ${tasks || '<p class="muted">과제 상세가 없습니다.</p>'}
    <div class="dayx__meta">${meta.join(" · ")} ${risks}</div>
    ${c.reflection ? `<p class="dayx__note">"${escapeHtml(c.reflection)}"</p>` : ""}`;
}

/* 미완료 사유 TOP 3 */
function renderFailureTop(list) {
  const ul = document.getElementById("failure-top");
  const counts = {};
  list.forEach((c) => {
    if (c.failure_reason) counts[c.failure_reason] = (counts[c.failure_reason] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (sorted.length === 0) {
    ul.innerHTML = `<li class="muted">최근 미완료 사유 기록이 없습니다.</li>`;
    return;
  }
  ul.innerHTML = sorted
    .map(
      ([reason, n], i) => `
    <li class="rank-list__item">
      <span class="rank-list__rank">${i + 1}</span>
      <span class="rank-list__name">${escapeHtml(reason)}</span>
      <span class="rank-list__count">${n}회</span>
    </li>`
    )
    .join("");
}

/* 이번 주 핵심 목표 */
async function renderWeeklyGoals(studentId) {
  const wrap = document.getElementById("weekly-goals");
  const weekStart = getWeekStartDate();
  const { data } = await supabaseClient
    .from("weekly_goals")
    .select("*")
    .eq("student_id", studentId)
    .eq("week_start_date", weekStart)
    .maybeSingle();

  if (!data) {
    wrap.innerHTML = `<p class="muted">이번 주 목표가 아직 없습니다.</p>`;
    return;
  }
  let goals = Array.isArray(data.core_goals) && data.core_goals.length ? data.core_goals : null;
  if (!goals) goals = [1, 2, 3, 4, 5].map((n) => data[`core_goal_${n}`]).filter((g) => g && g.trim());

  if (goals.length === 0) {
    wrap.innerHTML = `<p class="muted">이번 주 핵심 목표가 비어 있습니다.</p>`;
    return;
  }
  wrap.innerHTML = `<ul class="goal-list">${goals.map((g) => `<li>🎯 ${escapeHtml(g)}</li>`).join("")}</ul>`;
}

/* 최근 주간 회고 */
async function renderRecentReview(studentId) {
  const wrap = document.getElementById("recent-review");
  const { data } = await supabaseClient
    .from("weekly_reviews")
    .select("*")
    .eq("student_id", studentId)
    .order("week_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    wrap.innerHTML = `<p class="muted">아직 작성한 주간 회고가 없습니다.</p>`;
    return;
  }
  wrap.innerHTML = `
    <p class="review-week">${formatKoreanDate(data.week_start_date)} 시작 주</p>
    ${field("가장 잘한 것", data.biggest_success)}
    ${field("가장 밀린 것", data.biggest_delay)}
    ${field("반복 실패 원인", data.repeated_failure_reason)}
    ${field("다음 주 전략", data.next_week_adjustment)}
  `;
}

function field(label, value) {
  if (!value) return "";
  return `<div class="kv"><span class="kv__key">${label}</span><span class="kv__val">${escapeHtml(value)}</span></div>`;
}

function dateNDaysAgo(n) {
  const d = new Date(getTodayString());
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
