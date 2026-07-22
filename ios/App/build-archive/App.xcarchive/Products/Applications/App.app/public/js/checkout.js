/*
 * checkout.js  (v4 - 과제 완료 중심 / 가변 과제)
 * ------------------------------------------------------------
 * 시간 기록 없이 핵심 과제 완료율만 기록.
 *   과제별: 완료 / 일부 완료 / 미완료
 * task_completion_rate = (completed*1 + partial*0.5) / 과제수 * 100
 * 결과는 task_results(jsonb) + 앞 3개 기존 컬럼에 저장(호환).
 * ------------------------------------------------------------
 */

let currentProfile = null;
let taskList = []; // [{i, text, block}]

document.addEventListener("DOMContentLoaded", async () => {
  currentProfile = await requireRole(["student"]);
  if (!currentProfile) return;

  document.getElementById("page-date").textContent = formatKoreanDate() + " 성과 기록";
  const today = getTodayString();

  const { data: checkin } = await supabaseClient
    .from("daily_checkins")
    .select("*")
    .eq("student_id", currentProfile.id)
    .eq("date", today)
    .maybeSingle();

  if (!checkin) {
    document.getElementById("no-checkin").hidden = false;
    return;
  }

  document.getElementById("checkout-form").hidden = false;
  renderFailureReasons();
  renderTaskStatus(checkin);
  setupSelfScore();

  await loadExistingCheckout();
  updateCarryoverNote();

  document.getElementById("checkout-form").addEventListener("submit", handleSubmit);
});

/* 미완료 사유 select */
function renderFailureReasons() {
  const select = document.getElementById("failure_reason");
  FAILURE_REASONS.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    select.appendChild(opt);
  });
}

/* 체크인 과제 → 완료/일부/미완료 3단계 (가변 개수) */
function renderTaskStatus(checkin) {
  const wrap = document.getElementById("task-status-list");

  // tasks 배열 우선, 없으면 기존 task_1~3
  let tasks = Array.isArray(checkin.tasks) && checkin.tasks.length ? checkin.tasks : null;
  if (!tasks) {
    tasks = [1, 2, 3]
      .map((n) => ({ text: checkin[`task_${n}`], block: checkin[`task_${n}_block`] || null }))
      .filter((t) => t.text);
  }
  taskList = tasks.map((t, i) => ({
    i, text: t.text, block: t.block, subject: t.subject || null,
    subtasks: Array.isArray(t.subtasks) ? t.subtasks.map((s) => (typeof s === "string" ? s : s && s.text)).filter(Boolean) : [],
  }));

  if (taskList.length === 0) {
    wrap.innerHTML = `<p class="muted">오늘 입력한 핵심 과제가 없습니다.</p>`;
    return;
  }

  wrap.innerHTML = taskList
    .map(
      (t) => `
    <div class="task-status">
      <div class="task-status__head">
        ${t.subject ? `<span class="task-status__subject">${escapeHtml(subjectLabel(t.subject))}</span>` : ""}
        ${t.block ? `<span class="task-status__block">${blockLabel(t.block)}</span>` : ""}
        <span class="task-status__text">${escapeHtml(t.text)}</span>
      </div>
      ${t.subtasks.length ? `<ul class="task-status__subs">${t.subtasks.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>` : ""}
      <div class="seg3" data-i="${t.i}">
        <button type="button" class="seg3-btn seg3-btn--done" data-status="completed">완료</button>
        <button type="button" class="seg3-btn seg3-btn--partial" data-status="partial">일부 완료</button>
        <button type="button" class="seg3-btn seg3-btn--missed" data-status="missed">미완료</button>
      </div>
      <input type="hidden" id="task_status_${t.i}" />
    </div>`
    )
    .join("");

  wrap.querySelectorAll(".seg3").forEach((seg) => {
    const i = seg.dataset.i;
    const hidden = document.getElementById(`task_status_${i}`);
    seg.querySelectorAll(".seg3-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        hidden.value = btn.dataset.status;
        seg.querySelectorAll(".seg3-btn").forEach((b) => b.classList.remove("seg3-btn--active"));
        btn.classList.add("seg3-btn--active");
        updateCarryoverNote();
      });
    });
  });

  // 대시보드/위젯에서 체크한 진행상태를 자동으로 반영 (저장된 체크아웃이 있으면 그게 우선)
  prefillTaskStatusFromProgress();
}

/* 과제 상태 버튼 UI 설정 (기존 활성 해제 후 해당 상태 활성) */
function setTaskStatusUI(i, st) {
  const seg = document.querySelector(`.seg3[data-i="${i}"]`);
  if (!seg) return;
  seg.querySelectorAll(".seg3-btn").forEach((b) => b.classList.remove("seg3-btn--active"));
  const btn = seg.querySelector(`.seg3-btn[data-status="${st}"]`);
  const hidden = document.getElementById(`task_status_${i}`);
  if (btn && hidden) { hidden.value = st; btn.classList.add("seg3-btn--active"); }
}

/* 오늘 대시보드에서 체크한 완료/서브 진행상태(localStorage) → 체크아웃 상태 자동 선택.
 * - 과제 완료 체크됨 → '완료'
 * - 미완료지만 서브과제 일부 체크 → '일부 완료'
 * - 아무 것도 없으면 미선택(사용자가 직접 선택) */
function prefillTaskStatusFromProgress() {
  let prog;
  try { prog = JSON.parse(localStorage.getItem(`dt_taskprog_${currentProfile.id}_${getTodayString()}`)) || {}; }
  catch (e) { prog = {}; }
  const done = prog.done || {}, sub = prog.sub || {};
  taskList.forEach((t) => {
    if (done[t.i]) { setTaskStatusUI(t.i, "completed"); return; }
    const sd = sub[t.i] || {};
    const anySub = t.subtasks.length && Object.keys(sd).some((k) => sd[k]);
    if (anySub) setTaskStatusUI(t.i, "partial");
  });
}

/* 오늘 자기평가 1~10 슬라이더 (컨디션 슬라이더와 동일 디자인 언어) */
const SELF_WORDS = {
  10: "최고", 9: "아주 잘함", 8: "잘함", 7: "괜찮음", 6: "보통",
  5: "조금 아쉬움", 4: "아쉬움", 3: "부족", 2: "많이 부족", 1: "최악",
};
function selfWord(v) {
  return SELF_WORDS[Math.max(1, Math.min(10, Math.round(Number(v) || 0)))] || "보통";
}

function setupSelfScore() {
  const range = document.getElementById("self_range");
  range.addEventListener("input", () => setSelfScoreUI(toNumber(range.value)));
  setSelfScoreUI(toNumber(document.getElementById("self_score").value) || 6);
}

function setSelfScoreUI(value) {
  const v = Math.max(1, Math.min(10, Math.round(Number(value) || 6)));
  const word = selfWord(v);

  document.getElementById("self_score").value = v;
  const range = document.getElementById("self_range");
  range.value = v;
  document.getElementById("self-val").textContent = v;
  document.getElementById("self-face").textContent = conditionFace(v);   // 슬라이더와 동일 표정
  document.getElementById("self-word").textContent = word;
  range.setAttribute("aria-valuetext", `${v}점 ${word}`);

  // 값 구간에 따라 강조색/채움(fill) 전환 — .cond-slider 토큰 그대로 재사용
  const slider = document.getElementById("self-slider");
  if (slider) {
    const prev = slider.dataset.selfV;
    slider.dataset.level = v <= 4 ? "low" : v <= 6 ? "mid" : "high";

    // thumb 폭 보정 fill (끝이 thumb 중심에 정렬). 폭을 못 구하면 단순 비율 폴백.
    const frac = (v - 1) / 9;
    const w = range.clientWidth;
    const thumb = parseFloat(getComputedStyle(slider).getPropertyValue("--cond-thumb")) || 28;
    const pct = w > thumb ? ((thumb / 2 + (w - thumb) * frac) / w) * 100 : frac * 100;
    slider.style.setProperty("--cond-pct", `${pct}%`);

    // 값이 실제로 바뀌었을 때만 숫자/표정 pop
    if (prev !== undefined && Number(prev) !== v) {
      slider.classList.remove("is-bump");
      void slider.offsetWidth;
      slider.classList.add("is-bump");
    }
    slider.dataset.selfV = v;
  }

  // 1~10 눈금 점등
  const ticks = document.getElementById("self-ticks");
  if (ticks) {
    ticks.querySelectorAll("span").forEach((t, i) => {
      const n = i + 1;
      t.classList.toggle("is-on", n <= v);
      t.classList.toggle("is-cur", n === v);
    });
  }
}

function computeRate() {
  if (taskList.length === 0) return 0;
  const total = taskList.reduce((sum, t) => {
    const st = document.getElementById(`task_status_${t.i}`).value;
    return sum + (TASK_STATUS[st] ? TASK_STATUS[st].score : 0);
  }, 0);
  return Math.round((total / taskList.length) * 100);
}

/* 완료 외(일부/미완료) 과제 → 내일 자동 이월. 미리보기 안내 */
function carryoverTasks() {
  return taskList
    .filter((t) => {
      const s = document.getElementById(`task_status_${t.i}`).value;
      return s === "partial" || s === "missed";
    })
    .map((t) => t.text);
}

function updateCarryoverNote() {
  const list = carryoverTasks();
  const el = document.getElementById("carryover-note");
  if (list.length) {
    el.hidden = false;
    el.textContent = "내일로 자동 이월: " + list.join(", ");
  } else {
    el.hidden = true;
  }
}

/* 기존 체크아웃 불러오기 */
async function loadExistingCheckout() {
  const { data } = await supabaseClient
    .from("daily_checkouts")
    .select("*")
    .eq("student_id", currentProfile.id)
    .eq("date", getTodayString())
    .maybeSingle();
  if (!data) return;

  document.getElementById("edit-notice").hidden = false;

  const results = Array.isArray(data.task_results) ? data.task_results : null;
  taskList.forEach((t) => {
    let st = "";
    if (results && results[t.i]) st = results[t.i].status;
    else if (t.i < 3) st = data[`task_${t.i + 1}_status`] || (data[`task_${t.i + 1}_done`] ? "completed" : "");
    if (st) setTaskStatusUI(t.i, st);   // 저장된 체크아웃 값이 자동 반영보다 우선
  });
  document.getElementById("failure_reason").value = data.failure_reason || "";
  document.getElementById("reflection").value = data.reflection || "";
  if (data.self_score) setSelfScoreUI(data.self_score);
}

/* 저장 */
async function handleSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "저장 중...";

  const rate = computeRate();
  const results = taskList.map((t) => ({ status: document.getElementById(`task_status_${t.i}`).value || "missed" }));
  const statusAt = (idx) => (results[idx] ? results[idx].status : null);
  const carry = carryoverTasks(); // 일부완료 + 미완료만 자동 이월 (완료는 제외)

  const record = {
    student_id: currentProfile.id,
    date: getTodayString(),
    task_results: results,
    task_1_status: statusAt(0),
    task_2_status: statusAt(1),
    task_3_status: statusAt(2),
    task_1_done: statusAt(0) === "completed",
    task_2_done: statusAt(1) === "completed",
    task_3_done: statusAt(2) === "completed",
    task_completion_rate: rate,
    achievement_rate: rate,
    failure_reason: document.getElementById("failure_reason").value || null,
    carryover_tasks: carry,
    carryover_task: carry.join(", ") || null,
    self_score: toNumber(document.getElementById("self_score").value) || 6,
    reflection: document.getElementById("reflection").value.trim() || null,
  };

  const { error } = await supabaseClient
    .from("daily_checkouts")
    .upsert(record, { onConflict: "student_id,date" });

  if (error) {
    showToast("저장에 실패했습니다. 다시 시도해주세요.", "error");
    btn.disabled = false;
    btn.textContent = "오늘 성과 저장";
    return;
  }

  showToast("오늘 성과가 저장되었습니다.", "success");
  setTimeout(() => (window.location.href = "/student.html"), 900);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
