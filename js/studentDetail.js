/*
 * studentDetail.js
 * ------------------------------------------------------------
 * 학생 상세(student-detail.html) 스크립트. 관리자/컨설턴트만 접근.
 * URL 파라미터 ?id=학생ID 로 대상 학생을 받는다.
 *
 * 표시:
 *   - 기본 정보 / 좌석 / 목표 대학 등
 *   - 최근 7일 평균 달성률, 자습 시간, 과목별 시간
 *   - 미완료 사유 이력
 *   - 이번 주 목표 / 최근 주간 회고
 *   - 상담(개입) 기록 조회 및 추가
 * 기능:
 *   - 관리 등급 변경
 *   - 개입 기록 추가
 * ------------------------------------------------------------
 */

let adminProfile = null;
let studentId = null;

document.addEventListener("DOMContentLoaded", async () => {
  adminProfile = await requireRole(["admin", "counselor"]);
  if (!adminProfile) return;

  studentId = new URLSearchParams(window.location.search).get("id");
  if (!studentId) {
    document.getElementById("load-error").hidden = false;
    return;
  }

  await loadProfile();
  await loadRecentStats();
  await loadPlanQuality();
  await loadWeekly();
  await loadInterventions();

  document.getElementById("management_level").addEventListener("change", updateManagementLevel);
  document.getElementById("intervention-form").addEventListener("submit", addIntervention);
});

/* 기본 프로필 */
async function loadProfile() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", studentId)
    .single();

  if (error || !data) {
    document.getElementById("load-error").hidden = false;
    return;
  }

  document.getElementById("profile-card").hidden = false;
  setText("p-name", data.name);
  setText("p-seat", data.seat_number || "—");
  setText("p-phone", data.phone || "—");
  setText("p-univ", data.target_university || "—");
  setText("p-major", data.target_major || "—");
  setText("p-score", data.target_score || "—");
  setText("p-status", statusLabel(data.status));
  document.getElementById("management_level").value = data.management_level || "basic";
}

/* 최근 7일 통계 + 과목별 완료율 + 미완료 사유 */
async function loadRecentStats() {
  const sevenDaysAgo = dateNDaysAgo(6);
  const [coRes, ciRes] = await Promise.all([
    supabaseClient.from("daily_checkouts").select("*").eq("student_id", studentId).gte("date", sevenDaysAgo).order("date", { ascending: false }),
    supabaseClient.from("daily_checkins").select("*").eq("student_id", studentId).gte("date", sevenDaysAgo),
  ]);
  const list = coRes.data || [];
  const checkins = ciRes.data || [];
  const ciMap = new Map(checkins.map((c) => [c.date, c]));

  // 과제 단위 레코드 (subject, score)
  const recs = [];
  let completedCount = 0;
  list.forEach((co) => {
    const ci = ciMap.get(co.date);
    if (!ci) return;
    [1, 2, 3].forEach((n) => {
      if (!ci[`task_${n}`]) return;
      const st = co[`task_${n}_status`] || (co[`task_${n}_done`] ? "completed" : "missed");
      const score = TASK_STATUS[st] ? TASK_STATUS[st].score : 0;
      if (st === "completed") completedCount++;
      recs.push({ subject: ci[`task_${n}_subject`] || "기타", score });
    });
  });

  // 평균 과제 완료율 / 완료 과제 수
  if (list.length === 0) {
    setText("s-rate", "기록 없음");
    setText("s-hours", "0개");
  } else {
    const avg = Math.round(list.reduce((s, c) => s + toNumber(c.task_completion_rate != null ? c.task_completion_rate : c.achievement_rate), 0) / list.length);
    const rateEl = document.getElementById("s-rate");
    rateEl.textContent = `${avg}%`;
    rateEl.className = "stat__value " + rateColorClass(avg);
    setText("s-hours", `${completedCount}개`);
  }

  // 과목별 과제 완료율
  const wrap = document.getElementById("subject-breakdown");
  const agg = {};
  recs.forEach((r) => {
    agg[r.subject] = agg[r.subject] || { sum: 0, n: 0 };
    agg[r.subject].sum += r.score;
    agg[r.subject].n += 1;
  });
  const rows = Object.entries(agg).map(([label, v]) => ({ label, pct: Math.round((v.sum / v.n) * 100), n: v.n })).sort((a, b) => b.n - a.n);
  if (!rows.length) {
    wrap.innerHTML = `<p class="muted">최근 7일 평가된 과제가 없습니다.</p>`;
  } else {
    wrap.innerHTML = rows
      .map(
        (r) => `
      <div class="bar-row">
        <span class="bar-row__label">${escapeHtml(r.label)}</span>
        <div class="bar-row__track"><div class="bar-row__fill ${rateColorClass(r.pct)}" style="width:${r.pct}%"></div></div>
        <span class="bar-row__value">${r.pct}%</span>
      </div>`
      )
      .join("");
  }

  // 미완료 사유 이력
  const fList = document.getElementById("failure-history");
  const counts = {};
  list.forEach((c) => {
    if (c.failure_reason) counts[c.failure_reason] = (counts[c.failure_reason] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) {
    fList.innerHTML = `<li class="muted">최근 미완료 사유 기록이 없습니다.</li>`;
  } else {
    fList.innerHTML = sorted
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
}

/* 계획 품질 점수 (관리자 전용 분석값) — 최근 14일 체크인 기준 */
async function loadPlanQuality() {
  const box = document.getElementById("plan-quality-box");
  const fourteenAgo = dateNDaysAgo(13);
  const { data } = await supabaseClient
    .from("daily_checkins")
    .select("*")
    .eq("student_id", studentId)
    .gte("date", fourteenAgo)
    .order("date", { ascending: false });

  const rows = (data || []).filter((r) => r.plan_quality_score != null);
  if (rows.length === 0) {
    box.innerHTML = `<p class="muted">최근 계획 품질 데이터가 없습니다.</p>`;
    return;
  }

  const avg = Math.round(rows.reduce((s, r) => s + toNumber(r.plan_quality_score), 0) / rows.length);
  const latest = rows[0];
  const mismatchDays = rows.filter((r) => Math.abs(toNumber(r.time_mismatch)) > 0.01).length;

  box.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><span class="stat__label">최근 14일 평균</span><span class="stat__value ${qualityColor(avg)}">${avg}<small style="font-size:0.9rem;color:var(--muted)">/100</small></span></div>
      <div class="stat"><span class="stat__label">최근 (${formatKoreanDate(latest.date)})</span><span class="stat__value ${qualityColor(toNumber(latest.plan_quality_score))}">${toNumber(latest.plan_quality_score)}</span></div>
    </div>
    <p class="muted" style="margin-top:12px;">기록 ${rows.length}일 · 시간 배분 불일치 ${mismatchDays}일</p>`;
}

function qualityColor(score) {
  return score >= 80 ? "rate-good" : score >= 50 ? "rate-mid" : "rate-low";
}

/* 이번 주 목표 / 최근 주간 회고 */
async function loadWeekly() {
  const weekStart = getWeekStartDate();

  const { data: goal } = await supabaseClient
    .from("weekly_goals")
    .select("*")
    .eq("student_id", studentId)
    .eq("week_start_date", weekStart)
    .maybeSingle();

  const goalWrap = document.getElementById("weekly-goal");
  if (!goal) {
    goalWrap.innerHTML = `<p class="muted">이번 주 목표가 없습니다.</p>`;
  } else {
    let cores = Array.isArray(goal.core_goals) && goal.core_goals.length ? goal.core_goals : null;
    if (!cores) cores = [goal.core_goal_1, goal.core_goal_2, goal.core_goal_3, goal.core_goal_4, goal.core_goal_5].filter((g) => g && g.trim() !== "");
    goalWrap.innerHTML = `
      ${goal.weak_point ? `<div class="kv"><span class="kv__key">약점</span><span class="kv__val">${escapeHtml(goal.weak_point)}</span></div>` : ""}
      ${cores.length ? `<ul class="goal-list">${cores.map((g) => `<li>🎯 ${escapeHtml(g)}</li>`).join("")}</ul>` : `<p class="muted">핵심 목표 없음</p>`}
    `;
  }

  const { data: review } = await supabaseClient
    .from("weekly_reviews")
    .select("*")
    .eq("student_id", studentId)
    .order("week_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const reviewWrap = document.getElementById("weekly-review");
  if (!review) {
    reviewWrap.innerHTML = `<p class="muted">작성된 주간 회고가 없습니다.</p>`;
  } else {
    reviewWrap.innerHTML = `
      <p class="review-week">${formatKoreanDate(review.week_start_date)} 시작 주 · 달성률 ${toNumber(review.achievement_rate)}%
        ${review.needs_consulting ? '<span class="tag tag--alert">상담요청</span>' : ""}</p>
      ${kvField("가장 잘한 것", review.biggest_success)}
      ${kvField("가장 밀린 것", review.biggest_delay)}
      ${kvField("반복 실패 원인", review.repeated_failure_reason)}
      ${kvField("다음 주 전략", review.next_week_adjustment)}
    `;
  }
}

/* 개입 기록 목록 */
async function loadInterventions() {
  const { data } = await supabaseClient
    .from("interventions")
    .select("*")
    .eq("student_id", studentId)
    .order("date", { ascending: false });

  const list = document.getElementById("intervention-list");
  if (!data || data.length === 0) {
    list.innerHTML = `<li class="muted">아직 상담/개입 기록이 없습니다.</li>`;
    return;
  }
  list.innerHTML = data
    .map(
      (it) => `
    <li class="timeline__item">
      <div class="timeline__date">${formatKoreanDate(it.date)}</div>
      <div class="timeline__body">
        ${it.trigger_reason ? `<span class="tag">${escapeHtml(it.trigger_reason)}</span>` : ""}
        ${it.action_type ? `<span class="tag tag--blue">${escapeHtml(it.action_type)}</span>` : ""}
        ${it.note ? `<p class="timeline__note">${escapeHtml(it.note)}</p>` : ""}
        ${it.followup_date ? `<p class="timeline__followup">후속: ${formatKoreanDate(it.followup_date)}</p>` : ""}
      </div>
    </li>`
    )
    .join("");
}

/* 관리 등급 변경 */
async function updateManagementLevel(e) {
  const level = e.target.value;
  const { error } = await supabaseClient
    .from("profiles")
    .update({ management_level: level })
    .eq("id", studentId);
  showToast(error ? "등급 변경에 실패했습니다." : "관리 등급이 변경되었습니다.", error ? "error" : "success");
}

/* 개입 기록 추가 */
async function addIntervention(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "저장 중...";

  const record = {
    student_id: studentId,
    counselor_id: adminProfile.id,
    date: getTodayString(),
    trigger_reason: val("trigger_reason"),
    action_type: val("action_type"),
    note: val("note"),
    followup_date: document.getElementById("followup_date").value || null,
  };

  const { error } = await supabaseClient.from("interventions").insert(record);

  btn.disabled = false;
  btn.textContent = "개입 기록 추가";

  if (error) {
    showToast("저장에 실패했습니다.", "error");
    return;
  }
  showToast("개입 기록이 추가되었습니다.", "success");
  e.target.reset();
  await loadInterventions();
}

/* ---- 헬퍼 ---- */
function statusLabel(status) {
  return { active: "재원", paused: "휴원", left: "퇴원" }[status] || status || "—";
}
function kvField(label, value) {
  if (!value) return "";
  return `<div class="kv"><span class="kv__key">${label}</span><span class="kv__val">${escapeHtml(value)}</span></div>`;
}
function setText(id, value) {
  document.getElementById(id).textContent = value;
}
function val(id) {
  const v = document.getElementById(id).value.trim();
  return v || null;
}
function dateNDaysAgo(n) {
  const d = new Date(getTodayString());
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function roundHalf(n) {
  return Math.round(n * 2) / 2;
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
