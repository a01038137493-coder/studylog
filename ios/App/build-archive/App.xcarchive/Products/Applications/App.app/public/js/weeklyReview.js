/*
 * weeklyReview.js
 * ------------------------------------------------------------
 * 주간 회고 입력(weekly-review.html) 스크립트.
 * 시간 입력/완료율 표시 제거 → 회고 내용 중심. 완료율은 내부 계산해 저장(관리자용).
 * 저장은 (student_id, week_start_date) 기준 upsert.
 * ------------------------------------------------------------
 */

let currentProfile = null;
let weekStart = null;
let weekRate = 0; // 이번 주 평균 과제 완료율 (자동)

document.addEventListener("DOMContentLoaded", async () => {
  currentProfile = await requireRole(["student"]);
  if (!currentProfile) return;

  weekStart = getWeekStartDate();
  document.getElementById("week-range").textContent =
    `${formatKoreanDate(weekStart)} 시작 주의 회고`;

  await loadWeeklyRate();
  await loadExisting();
  document.getElementById("weekly-review-form").addEventListener("submit", handleSubmit);
});

/* 이번 주 체크아웃에서 평균 과제 완료율 계산 (내부 저장용, 화면엔 표시 안 함) */
async function loadWeeklyRate() {
  const { data } = await supabaseClient
    .from("daily_checkouts")
    .select("task_completion_rate, achievement_rate")
    .eq("student_id", currentProfile.id)
    .gte("date", weekStart);

  const rows = data || [];
  if (rows.length) {
    weekRate = Math.round(
      rows.reduce((s, c) => s + toNumber(c.task_completion_rate != null ? c.task_completion_rate : c.achievement_rate), 0) / rows.length
    );
  }
}

/* 기존 회고 불러오기 */
async function loadExisting() {
  const { data } = await supabaseClient
    .from("weekly_reviews")
    .select("*")
    .eq("student_id", currentProfile.id)
    .eq("week_start_date", weekStart)
    .maybeSingle();

  if (!data) return;

  document.getElementById("edit-notice").hidden = false;
  document.getElementById("biggest_success").value = data.biggest_success ?? "";
  document.getElementById("biggest_delay").value = data.biggest_delay ?? "";
  document.getElementById("repeated_failure_reason").value = data.repeated_failure_reason ?? "";
  document.getElementById("next_week_adjustment").value = data.next_week_adjustment ?? "";
}

/* 저장 처리 */
async function handleSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "저장 중...";

  const record = {
    student_id: currentProfile.id,
    week_start_date: weekStart,
    achievement_rate: weekRate, // 과제 완료율 자동값
    biggest_success: val("biggest_success"),
    biggest_delay: val("biggest_delay"),
    repeated_failure_reason: val("repeated_failure_reason"),
    next_week_adjustment: val("next_week_adjustment"),
  };

  const { error } = await supabaseClient
    .from("weekly_reviews")
    .upsert(record, { onConflict: "student_id,week_start_date" });

  if (error) {
    showToast("저장에 실패했습니다. 다시 시도해주세요.", "error");
    btn.disabled = false;
    btn.textContent = "주간 회고 저장";
    return;
  }

  showToast("주간 회고가 저장되었습니다.", "success");
  setTimeout(() => (window.location.href = "/student.html"), 900);
}

function val(id) {
  const v = document.getElementById(id).value.trim();
  return v || null;
}
