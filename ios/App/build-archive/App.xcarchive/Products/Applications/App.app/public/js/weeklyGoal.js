/*
 * weeklyGoal.js
 * ------------------------------------------------------------
 * 이번 주 목표 입력(weekly-goal.html).
 * 핵심 목표는 오늘 플랜처럼 1개 기본 + 원하는 만큼 추가.
 * core_goals(jsonb) 배열로 저장하고 앞 5개는 기존 컬럼에도 채워 호환.
 * ------------------------------------------------------------
 */

let currentProfile = null;
let weekStart = null;

document.addEventListener("DOMContentLoaded", async () => {
  currentProfile = await requireRole(["student"]);
  if (!currentProfile) return;

  weekStart = getWeekStartDate();
  document.getElementById("week-range").textContent =
    `${formatKoreanDate(weekStart)} 시작 주의 목표`;

  document.getElementById("add-goal").addEventListener("click", () => addGoalRow());

  const loaded = await loadExisting();
  if (!loaded) addGoalRow(); // 기본 1개

  document.getElementById("weekly-goal-form").addEventListener("submit", handleSubmit);
});

/* 핵심 목표 행 추가 */
function addGoalRow(text) {
  const list = document.getElementById("goal-list");
  const row = document.createElement("div");
  row.className = "task-row";
  row.innerHTML = `
    <div class="task-row__head">
      <span class="task-row__no">핵심 목표</span>
      <button type="button" class="task-row__del" aria-label="삭제">✕</button>
    </div>
    <input type="text" class="field__input goal-text" value="${text ? escapeHtml(text) : ""}" />`;
  row.querySelector(".task-row__del").addEventListener("click", () => {
    row.remove();
    if (document.querySelectorAll("#goal-list .task-row").length === 0) addGoalRow();
    renumberGoals();
  });
  list.appendChild(row);
  renumberGoals();
}

function renumberGoals() {
  document.querySelectorAll("#goal-list .task-row").forEach((row, i) => {
    row.querySelector(".task-row__no").textContent = `핵심 목표 ${i + 1}`;
  });
}

function getGoals() {
  return Array.from(document.querySelectorAll("#goal-list .goal-text"))
    .map((el) => el.value.trim())
    .filter((t) => t);
}

/* 기존 주간 목표 불러오기 */
async function loadExisting() {
  const { data } = await supabaseClient
    .from("weekly_goals")
    .select("*")
    .eq("student_id", currentProfile.id)
    .eq("week_start_date", weekStart)
    .maybeSingle();

  if (!data) return false;

  document.getElementById("edit-notice").hidden = false;

  let goals = Array.isArray(data.core_goals) && data.core_goals.length ? data.core_goals : null;
  if (!goals) {
    goals = [1, 2, 3, 4, 5].map((n) => data[`core_goal_${n}`]).filter((g) => g && g.trim());
  }
  if (goals.length === 0) addGoalRow();
  else goals.forEach((g) => addGoalRow(g));

  document.getElementById("weak_point").value = data.weak_point ?? "";
  document.getElementById("life_goal").value = data.life_goal ?? "";
  document.getElementById("risk_factor").value = data.risk_factor ?? "";
  return true;
}

/* 저장 처리 */
async function handleSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]");

  const goals = getGoals();
  if (goals.length === 0) {
    showToast("핵심 목표를 최소 1개 입력해주세요.", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "저장 중...";

  const record = {
    student_id: currentProfile.id,
    week_start_date: weekStart,
    core_goals: goals,
    core_goal_1: goals[0] || null,
    core_goal_2: goals[1] || null,
    core_goal_3: goals[2] || null,
    core_goal_4: goals[3] || null,
    core_goal_5: goals[4] || null,
    weak_point: val("weak_point"),
    life_goal: val("life_goal"),
    risk_factor: val("risk_factor"),
  };

  const { error } = await supabaseClient
    .from("weekly_goals")
    .upsert(record, { onConflict: "student_id,week_start_date" });

  if (error) {
    showToast("저장에 실패했습니다. 다시 시도해주세요.", "error");
    btn.disabled = false;
    btn.textContent = "주간 목표 저장";
    return;
  }

  showToast("이번 주 목표가 저장되었습니다.", "success");
  setTimeout(() => (window.location.href = "/student.html"), 900);
}

function val(id) {
  const v = document.getElementById(id).value.trim();
  return v || null;
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
