/*
 * admin.js  (v3 - 과제 완료 중심)
 * ------------------------------------------------------------
 * 시간 달성률이 아니라 "핵심 과제 완료율"과 미완료 패턴을 본다.
 *   - 체크인/체크아웃 미작성
 *   - 오늘 과제 완료율 50% 이하
 *   - 최근 3일 컨디션 저조
 *   - 이월 과제 누적 / 위험 요소 반복
 *   - 과목별 과제 완료율 / 블록별 미완료율 (최근 7일)
 * ------------------------------------------------------------
 */

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireRole(["admin", "counselor"]);
  if (!profile) return;

  document.getElementById("admin-name").textContent = profile.name + " 님";
  document.getElementById("today-date").textContent = formatKoreanDate() + " 현황";

  const today = getTodayString();
  const threeAgo = dateNDaysAgo(2);
  const sevenAgo = dateNDaysAgo(6);
  const weekStart = getWeekStartDate();

  const [studentsRes, checkins7Res, checkouts7Res, reviewsRes] = await Promise.all([
    supabaseClient.from("profiles").select("*").eq("role", "student").eq("status", "active"),
    supabaseClient.from("daily_checkins").select("*").gte("date", sevenAgo),
    supabaseClient.from("daily_checkouts").select("*").gte("date", sevenAgo),
    supabaseClient.from("weekly_reviews").select("student_id,achievement_rate,needs_consulting").eq("week_start_date", weekStart),
  ]);

  const students = studentsRes.data || [];
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const checkins7 = checkins7Res.data || [];
  const checkouts7 = checkouts7Res.data || [];

  const todayCheckins = checkins7.filter((c) => c.date === today);
  const todayCheckouts = checkouts7.filter((c) => c.date === today);
  const checkinIds = new Set(todayCheckins.map((c) => c.student_id));
  const checkoutIds = new Set(todayCheckouts.map((c) => c.student_id));

  // 미작성
  const checkinMiss = students.filter((s) => !checkinIds.has(s.id));
  const checkoutMiss = students.filter((s) => checkinIds.has(s.id) && !checkoutIds.has(s.id));

  // 오늘 과제 완료율 50% 이하
  const lowRate = todayCheckouts
    .map((c) => ({ student: studentMap.get(c.student_id), rate: rateOf(c) }))
    .filter((x) => x.student && x.rate <= 50)
    .map((x) => ({ student: x.student, extra: `${x.rate}%` }));

  // 최근 3일 컨디션 2점 이하 2회 이상
  const condCount = {};
  checkins7
    .filter((c) => c.date >= threeAgo)
    .forEach((c) => {
      if (toNumber(c.condition_score) > 0 && toNumber(c.condition_score) <= 2)
        condCount[c.student_id] = (condCount[c.student_id] || 0) + 1;
    });
  const lowCond = Object.entries(condCount)
    .filter(([, n]) => n >= 2)
    .map(([id, n]) => ({ student: studentMap.get(id), extra: `${n}회` }))
    .filter((x) => x.student);

  // 이월 과제 누적 (최근 7일 carryover 2회 이상)
  const carryCount = {};
  checkouts7.forEach((c) => {
    if (c.carryover_task && c.carryover_task.trim())
      carryCount[c.student_id] = (carryCount[c.student_id] || 0) + 1;
  });
  const carryover = Object.entries(carryCount)
    .filter(([, n]) => n >= 2)
    .map(([id, n]) => ({ student: studentMap.get(id), extra: `${n}회` }))
    .filter((x) => x.student);

  // 위험 요소 반복 (최근 7일 같은 risk_category 3회 이상)
  const riskCount = {}; // id -> {category: n}
  checkins7.forEach((c) => {
    const cat = c.risk_category;
    if (!cat) return;
    riskCount[c.student_id] = riskCount[c.student_id] || {};
    riskCount[c.student_id][cat] = (riskCount[c.student_id][cat] || 0) + 1;
  });
  const riskRepeat = [];
  Object.entries(riskCount).forEach(([id, cats]) => {
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 3 && studentMap.get(id))
      riskRepeat.push({ student: studentMap.get(id), extra: `${top[0]} ${top[1]}회` });
  });

  // 상담 필요 (needs_consulting OR 위험 조건)
  const reviews = reviewsRes.data || [];
  const consultIds = new Set();
  reviews.forEach((r) => r.needs_consulting && consultIds.add(r.student_id));
  [lowRate, lowCond, carryover, riskRepeat].forEach((arr) => arr.forEach((x) => consultIds.add(x.student.id)));

  // 평균 과제 완료율
  const avgRate = todayCheckouts.length
    ? Math.round(todayCheckouts.reduce((s, c) => s + rateOf(c), 0) / todayCheckouts.length)
    : 0;

  // ===== 렌더 =====
  setText("kpi-total", students.length);
  setText("kpi-checkin", checkinIds.size);
  setText("kpi-checkout", checkoutIds.size);
  setText("kpi-checkin-miss", checkinMiss.length);
  setText("kpi-checkout-miss", checkoutMiss.length);
  setText("kpi-avg-rate", todayCheckouts.length ? `${avgRate}%` : "—");
  setText("kpi-consult", consultIds.size);

  renderStudentList("list-checkin-miss", "cnt-checkin-miss", checkinMiss.map((s) => ({ student: s })));
  renderStudentList("list-checkout-miss", "cnt-checkout-miss", checkoutMiss.map((s) => ({ student: s })));
  renderStudentList("list-low-rate", "cnt-low-rate", lowRate);
  renderStudentList("list-low-cond", "cnt-low-cond", lowCond);
  renderStudentList("list-carryover", "cnt-carryover", carryover);
  renderStudentList("list-risk", "cnt-risk", riskRepeat);

  renderDailyCompletion(checkouts7);
  renderBlockIncomplete(checkins7, checkouts7);
  renderAllStudents(students, checkinIds, checkoutIds);
});

/* 체크아웃의 완료율 (task_completion_rate, 없으면 achievement_rate) */
function rateOf(c) {
  return Math.round(toNumber(c.task_completion_rate != null ? c.task_completion_rate : c.achievement_rate));
}

/* 체크인+체크아웃을 student+date 로 묶어 (block, status) 추출 (가변 과제) */
function buildTaskRecords(checkins7, checkouts7) {
  const outMap = new Map();
  checkouts7.forEach((c) => outMap.set(c.student_id + "|" + c.date, c));
  const recs = [];
  checkins7.forEach((ci) => {
    const co = outMap.get(ci.student_id + "|" + ci.date);
    if (!co) return;
    const tasks = Array.isArray(ci.tasks) && ci.tasks.length
      ? ci.tasks
      : [1, 2, 3].map((n) => ({ text: ci[`task_${n}`], block: ci[`task_${n}_block`] || null })).filter((t) => t.text);
    const results = Array.isArray(co.task_results) ? co.task_results : null;
    tasks.forEach((t, i) => {
      let st = results && results[i] ? results[i].status : (i < 3 ? co[`task_${i + 1}_status`] || (co[`task_${i + 1}_done`] ? "completed" : "missed") : "missed");
      const score = TASK_STATUS[st] ? TASK_STATUS[st].score : 0;
      recs.push({ block: t.block || null, score });
    });
  });
  return recs;
}

/* 일자별 평균 완료율 (최근 7일) */
function renderDailyCompletion(checkouts7) {
  const wrap = document.getElementById("subject-completion");
  const byDate = {};
  checkouts7.forEach((c) => {
    byDate[c.date] = byDate[c.date] || { sum: 0, n: 0 };
    byDate[c.date].sum += rateOf(c);
    byDate[c.date].n += 1;
  });
  const dates = Object.keys(byDate).sort().slice(-7);
  if (!dates.length) {
    wrap.innerHTML = `<p class="muted">최근 완료율 데이터가 없습니다.</p>`;
    return;
  }
  wrap.innerHTML = dates
    .map((d) => {
      const v = byDate[d];
      const pct = Math.round(v.sum / v.n);
      const md = d.slice(5).replace("-", "/");
      return `
      <div class="bar-row">
        <span class="bar-row__label">${md}</span>
        <div class="bar-row__track"><div class="bar-row__fill ${rateColorClass(pct)}" style="width:${pct}%"></div></div>
        <span class="bar-row__value">${pct}%</span>
      </div>`;
    })
    .join("");
}

/* 블록별 미완료율 (오전/점심직후/오후/저녁) */
function renderBlockIncomplete(checkins7, checkouts7) {
  const wrap = document.getElementById("block-incomplete");
  const recs = buildTaskRecords(checkins7, checkouts7).filter((r) => r.block);
  const agg = {};
  recs.forEach((r) => {
    agg[r.block] = agg[r.block] || { incomplete: 0, n: 0 };
    agg[r.block].incomplete += 1 - r.score; // missed=1, partial=0.5
    agg[r.block].n += 1;
  });
  const rows = STUDY_BLOCKS.filter((b) => agg[b.key]).map((b) => ({
    label: b.label,
    pct: Math.round((agg[b.key].incomplete / agg[b.key].n) * 100),
  }));
  if (!rows.length) {
    wrap.innerHTML = `<p class="muted">최근 7일 블록 데이터가 없습니다.</p>`;
    return;
  }
  wrap.innerHTML = rows
    .map(
      (r) => `
    <div class="bar-row">
      <span class="bar-row__label">${r.label}</span>
      <div class="bar-row__track"><div class="bar-row__fill ${r.pct >= 50 ? "rate-low" : r.pct >= 25 ? "rate-mid" : "rate-good"}" style="width:${r.pct}%"></div></div>
      <span class="bar-row__value">${r.pct}%</span>
    </div>`
    )
    .join("");
}

/* 학생 리스트 카드 */
function renderStudentList(listId, countId, items) {
  const ul = document.getElementById(listId);
  if (countId) setText(countId, items.length);
  if (items.length === 0) {
    ul.innerHTML = `<li class="student-list__empty">해당 학생 없음 👍</li>`;
    return;
  }
  ul.innerHTML = items
    .map(
      ({ student, extra }) => `
    <li class="student-list__item">
      <a href="/student-detail.html?id=${student.id}" class="student-list__link">
        <span class="student-list__name">${escapeHtml(student.name)}</span>
        ${student.seat_number ? `<span class="student-list__seat">${escapeHtml(student.seat_number)}</span>` : ""}
        ${extra ? `<span class="student-list__extra">${escapeHtml(extra)}</span>` : ""}
      </a>
    </li>`
    )
    .join("");
}

function renderAllStudents(students, checkinIds, checkoutIds) {
  const ul = document.getElementById("list-all");
  if (students.length === 0) {
    ul.innerHTML = `<li class="student-list__empty">등록된 학생이 없습니다.</li>`;
    return;
  }
  ul.innerHTML = students
    .sort((a, b) => a.name.localeCompare(b.name, "ko"))
    .map((s) => {
      const inDone = checkinIds.has(s.id);
      const outDone = checkoutIds.has(s.id);
      return `
      <li class="student-list__item">
        <a href="/student-detail.html?id=${s.id}" class="student-list__link">
          <span class="student-list__name">${escapeHtml(s.name)}</span>
          ${s.seat_number ? `<span class="student-list__seat">${escapeHtml(s.seat_number)}</span>` : ""}
          <span class="state-badge ${inDone ? "state-badge--on" : "state-badge--off"}">체크인</span>
          <span class="state-badge ${outDone ? "state-badge--on" : "state-badge--off"}">체크아웃</span>
        </a>
      </li>`;
    })
    .join("");
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
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
