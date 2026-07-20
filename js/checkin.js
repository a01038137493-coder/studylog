/*
 * checkin.js  (v4 - 과제 중심 / 가변 과제 / 컨디션 1~10 / 위험 다중선택)
 * ------------------------------------------------------------
 *   Step 1: 오늘 끝낼 핵심 과제 (원하는 만큼 추가, 과목 입력 없음, 블록 선택)
 *   Step 2: 컨디션(1~10 슬라이더) + 위험 요소(다중 선택)
 *   완료:   요약 + 한 줄 조언
 *
 * 과제는 tasks(jsonb) 배열로 저장하고, 앞 3개는 기존 컬럼에도 채워 호환.
 * 공부 시간은 학원 고정값으로 내부 저장(학생 비노출).
 * ------------------------------------------------------------
 */

let currentProfile = null;
let selectedRisks = [];
let step = 1;

const DEFAULT_STUDY_HOURS = 12;
const DEFAULT_WEIGHTS = { korean: 2, math: 3, english: 1.5, inquiry1: 0.75, inquiry2: 0.75 };
const RISK_OPTIONS = ["졸림", "휴대폰/SNS", "집중력 저하", "컨디션 난조", "과목 미루기", "기타"];

document.addEventListener("DOMContentLoaded", async () => {
  currentProfile = await requireRole(["student"]);
  if (!currentProfile) return;

  document.getElementById("planned_total_hours").value = DEFAULT_STUDY_HOURS;
  autoAllocate(DEFAULT_STUDY_HOURS);

  document.getElementById("add-task").addEventListener("click", () => addTaskRow());
  renderRiskChips();
  setupConditionSlider();
  setupNav();
  setupTaskReorder();

  const carryover = await fetchCarryover();
  const loaded = await loadExistingCheckin();
  if (!loaded) {
    // 새 체크인: 어제 이월 과제(일부완료/미완료)들을 자동으로 주황 과제로, 없으면 빈 1개
    if (carryover.length) carryover.forEach((txt) => addTaskRow({ text: txt, carryover: true }));
    else addTaskRow();
  }

  setConditionUI(toNumber(document.getElementById("condition_score").value) || 6);
  showStep(1);
});

/* 과목 시간 자동 배분 (내부 저장 호환용) */
function autoAllocate(total) {
  const keys = SUBJECTS.map((s) => s.key);
  const wsum = keys.reduce((a, k) => a + (DEFAULT_WEIGHTS[k] || 0), 0) || 1;
  const units = Math.round((Number(total) || 0) * 2);
  const raw = keys.map((k) => ((DEFAULT_WEIGHTS[k] || 0) / wsum) * units);
  const base = raw.map(Math.floor);
  let rem = units - base.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f);
  for (let j = 0; j < rem && order.length; j++) base[order[j % order.length].i]++;
  keys.forEach((k, i) => (document.getElementById(`planned_${k}_hours`).value = base[i] * 0.5));
}

/* ============================================================
 * Step 1 - 핵심 과제 (가변)
 * ============================================================ */
function subjectOptions(selected) {
  return (
    `<option value="">과목</option>` +
    SUBJECTS.map((s) => `<option value="${s.key}"${s.key === selected ? " selected" : ""}>${s.label}</option>`).join("")
  );
}

function addTaskRow(task) {
  const wrap = document.getElementById("task-cards");
  const row = document.createElement("div");
  row.className = "task-row" + (task && task.carryover ? " task-row--carryover" : "");
  row.innerHTML = `
    <div class="task-row__head">
      <div class="task-row__lead">
        <span class="task-row__grip" role="button" aria-label="드래그하여 순서 변경" title="드래그하여 순서 변경">⠿</span>
        <span class="task-row__no">핵심 과제${task && task.carryover ? ' <span class="task-row__tag">어제 이월</span>' : ""}</span>
      </div>
      <div class="task-row__actions">
        <button type="button" class="task-row__add-sub" aria-label="서브 과제 추가">＋ 서브</button>
        <button type="button" class="task-row__del" aria-label="삭제">✕</button>
      </div>
    </div>
    <div class="task-row__main">
      <select class="field__input field__select field__select--sm task-subject" aria-label="과목 선택">${subjectOptions(task && task.subject)}</select>
      <input type="text" class="field__input task-text" placeholder="오늘 끝낼 핵심 과제" value="${task && task.text ? escapeHtml(task.text) : ""}" />
    </div>
    <div class="task-subs"></div>`;

  // 서브 과제 추가 (+ 버튼)
  const subs = row.querySelector(".task-subs");
  row.querySelector(".task-row__add-sub").addEventListener("click", () => addSubtask(subs, "", true));

  // 삭제 (최소 1개 유지)
  row.querySelector(".task-row__del").addEventListener("click", () => {
    row.remove();
    if (document.querySelectorAll("#task-cards .task-row").length === 0) addTaskRow();
    renumberTasks();
  });

  // 기존 서브 과제 복원
  (task && Array.isArray(task.subtasks) ? task.subtasks : []).forEach((st) => {
    addSubtask(subs, typeof st === "string" ? st : st && st.text);
  });

  wrap.appendChild(row);
  renumberTasks();
}

/* 서브 과제 한 줄 추가 (focusNew=true면 새로 만든 입력에 포커스) */
function addSubtask(subs, text, focusNew) {
  // 한글(IME) 조합 중에 포커스를 옮기면 조합 중이던 글자가 새 입력칸에
  // 딸려 들어가는 iOS WebKit 문제 → 먼저 blur 로 조합을 확정한 뒤
  // 다음 프레임에 새 입력칸으로 포커스를 옮긴다.
  if (focusNew && document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
  const sub = document.createElement("div");
  sub.className = "task-sub";
  sub.innerHTML = `
    <span class="task-sub__bullet" aria-hidden="true">↳</span>
    <input type="text" class="field__input task-sub__text" placeholder="세부 할 일" value="${text ? escapeHtml(text) : ""}" />
    <button type="button" class="task-sub__del" aria-label="서브 과제 삭제">✕</button>`;
  sub.querySelector(".task-sub__del").addEventListener("click", () => sub.remove());
  subs.appendChild(sub);
  if (focusNew) setTimeout(() => sub.querySelector(".task-sub__text").focus(), 0);
}

function renumberTasks() {
  document.querySelectorAll("#task-cards .task-row").forEach((row, i) => {
    const no = row.querySelector(".task-row__no");
    const tag = no.querySelector(".task-row__tag");
    no.textContent = `핵심 과제 ${i + 1} `;
    if (tag) no.appendChild(tag);
  });
}

/* 핵심 과제 카드를 그립(⠿)으로 끌어 순서 변경 (터치/마우스 공용).
 * 끄는 카드는 손가락을 따라오고, 다른 카드의 중심을 지나면 그 자리로 DOM 이동한다.
 * getTasks()가 DOM 순서대로 읽으므로 저장 순서에도 그대로 반영된다. */
function setupTaskReorder() {
  const wrap = document.getElementById("task-cards");
  if (!wrap) return;
  let drag = null, pid = null, grabY = 0;

  // DOM 위치가 바뀌어도 카드가 손가락 아래 그대로 보이도록 transform 기준을 다시 잡는다.
  function reanchor(clientY, prevVisualTop) {
    drag.style.transform = "";
    const keep = prevVisualTop - drag.getBoundingClientRect().top;
    grabY = clientY - keep;
    drag.style.transform = `translateY(${keep}px)`;
  }

  function endDrag() {
    if (!drag) return;
    const row = drag;
    drag = null; pid = null;
    document.body.classList.remove("is-reordering");
    row.style.transition = "transform 0.18s cubic-bezier(.22,.61,.36,1)";
    row.style.transform = "translateY(0px)";        // 최종 자리에 부드럽게 안착
    const cleanup = () => {
      row.classList.remove("task-row--dragging");
      row.style.transition = ""; row.style.transform = "";
      row.removeEventListener("transitionend", cleanup);
    };
    row.addEventListener("transitionend", cleanup);
    setTimeout(cleanup, 260);                        // transitionend 누락 대비 안전망
    renumberTasks();
  }

  wrap.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(".task-row__grip");
    if (!handle) return;
    const row = handle.closest(".task-row");
    if (!row || !wrap.contains(row)) return;
    e.preventDefault();
    drag = row; pid = e.pointerId; grabY = e.clientY;
    try { handle.setPointerCapture(pid); } catch (_) {}
    row.classList.add("task-row--dragging");
    document.body.classList.add("is-reordering");
  });

  wrap.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== pid) return;
    drag.style.transition = "none";
    drag.style.transform = `translateY(${e.clientY - grabY}px)`;
    const dr = drag.getBoundingClientRect();
    const dragMid = dr.top + dr.height / 2;
    const sibs = Array.from(wrap.querySelectorAll(".task-row")).filter((r) => r !== drag);
    for (const sib of sibs) {
      const r = sib.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      const sibBeforeDrag = drag.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_PRECEDING;
      if (sibBeforeDrag && dragMid < mid) {           // 위 이웃 중심보다 올라감 → 그 앞으로
        wrap.insertBefore(drag, sib);
        reanchor(e.clientY, dr.top);
        break;
      }
      if (!sibBeforeDrag && dragMid > mid) {          // 아래 이웃 중심보다 내려감 → 그 뒤로
        wrap.insertBefore(drag, sib.nextSibling);
        reanchor(e.clientY, dr.top);
        break;
      }
    }
  });

  wrap.addEventListener("pointerup", endDrag);
  wrap.addEventListener("pointercancel", endDrag);
}

function getTasks() {
  return Array.from(document.querySelectorAll("#task-cards .task-row")).map((row) => ({
    text: row.querySelector(".task-text").value.trim(),
    subject: row.querySelector(".task-subject").value || null,
    subtasks: Array.from(row.querySelectorAll(".task-sub__text"))
      .map((i) => i.value.trim())
      .filter(Boolean),
  }));
}

/* 어제 이월 과제 목록 가져오기 (일부완료/미완료 자동 이월) */
async function fetchCarryover() {
  const yesterday = dateAddDays(getTodayString(), -1);
  const { data } = await supabaseClient
    .from("daily_checkouts")
    .select("carryover_tasks,carryover_task")
    .eq("student_id", currentProfile.id)
    .eq("date", yesterday)
    .maybeSingle();
  if (!data) return [];
  if (Array.isArray(data.carryover_tasks) && data.carryover_tasks.length) return data.carryover_tasks;
  if (data.carryover_task && data.carryover_task.trim())
    return data.carryover_task.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

/* ============================================================
 * Step 2 - 컨디션(슬라이더) + 위험요소(다중)
 * ============================================================ */
function setupConditionSlider() {
  const range = document.getElementById("condition_range");
  range.addEventListener("input", () => setConditionUI(toNumber(range.value)));
}

function setConditionUI(value) {
  const v = Math.max(1, Math.min(10, Math.round(Number(value) || 6)));
  const word = conditionText(v);

  // 계약: 별도 hidden #condition_score + range + 리드아웃 갱신
  document.getElementById("condition_score").value = v;
  const range = document.getElementById("condition_range");
  range.value = v;
  document.getElementById("cond-val").textContent = v;
  document.getElementById("cond-face").textContent = conditionFace(v);
  document.getElementById("cond-word").textContent = word;
  document.getElementById("cond-low-notice").hidden = v > LOW_CONDITION_MAX;

  // 접근성: 보조기기에 점수+단어 함께 전달
  range.setAttribute("aria-valuetext", `${v}점 ${word}`);

  // 값 구간에 따라 강조색/채움(fill) 전환 (낮음·보통·좋음)
  const slider = document.querySelector(".cond-slider");
  if (slider) {
    const prev = slider.dataset.condV;
    slider.dataset.level = v <= 4 ? "low" : v <= 6 ? "mid" : "high";

    // thumb 폭을 보정한 fill 퍼센트 (fill 끝이 thumb 중심에 정렬되도록).
    // 트랙 폭을 못 구하면(패널이 숨겨진 초기 렌더) 단순 비율로 폴백.
    const frac = (v - 1) / 9;
    const w = range.clientWidth;
    const thumb = parseFloat(getComputedStyle(slider).getPropertyValue("--cond-thumb")) || 28;
    let pct;
    if (w > thumb) {
      const usable = w - thumb;               // thumb 중심이 이동하는 실제 범위
      pct = ((thumb / 2 + usable * frac) / w) * 100;
    } else {
      pct = frac * 100;
    }
    slider.style.setProperty("--cond-pct", `${pct}%`);

    // 값이 실제로 바뀌었을 때만 숫자/페이스 pop (reduced-motion 시 CSS가 무력화)
    if (prev !== undefined && Number(prev) !== v) {
      slider.classList.remove("is-bump");
      void slider.offsetWidth;                // 강제 리플로우로 애니메이션 재시작
      slider.classList.add("is-bump");
    }
    slider.dataset.condV = v;
  }

  // 1~10 눈금 점등 (현재값까지 on, 현재값은 강조)
  const ticks = document.getElementById("cond-ticks");
  if (ticks) {
    ticks.querySelectorAll("span").forEach((t, i) => {
      const n = i + 1;
      t.classList.toggle("is-on", n <= v);
      t.classList.toggle("is-cur", n === v);
    });
  }
}

function renderRiskChips() {
  const wrap = document.getElementById("risk-chips");
  const custom = document.getElementById("risk_custom");
  wrap.innerHTML = RISK_OPTIONS.map((r) => `<button type="button" class="chip" data-risk="${r}">${r}</button>`).join("");
  wrap.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.risk;
      const i = selectedRisks.indexOf(val);
      if (i >= 0) {
        selectedRisks.splice(i, 1);
        btn.classList.remove("chip--active");
      } else {
        selectedRisks.push(val);
        btn.classList.add("chip--active");
      }
      const hasEtc = selectedRisks.includes("기타");
      custom.hidden = !hasEtc;
      if (!hasEtc) custom.value = "";
    });
  });
}

function resolveRisk() {
  const custom = document.getElementById("risk_custom").value.trim();
  const factors = [];
  selectedRisks.forEach((r) => {
    if (r === "기타") {
      if (custom) factors.push(custom);
    } else {
      factors.push(r);
    }
  });
  const primary = selectedRisks.find((r) => r !== "기타") || (selectedRisks.includes("기타") ? "기타" : null);
  return { risk_factors: factors, risk_today: factors.join(", ") || null, risk_category: primary };
}

/* ============================================================
 * 단계 이동
 * ============================================================ */
function setupNav() {
  document.getElementById("nav-prev").addEventListener("click", () => showStep(step - 1));
  document.getElementById("nav-next").addEventListener("click", onNext);
}

function showStep(n) {
  step = Math.max(1, Math.min(2, n));
  [1, 2].forEach((i) => (document.getElementById(`panel-${i}`).hidden = i !== step));
  document.querySelectorAll("#wizard-progress .wstep").forEach((d) => {
    const s = Number(d.dataset.step);
    d.classList.toggle("is-active", s === step);
    d.classList.toggle("is-done", s < step);
  });
  document.getElementById("nav-prev").hidden = step === 1;
  document.getElementById("nav-next").textContent = step === 2 ? "오늘 플랜 저장" : "다음";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function onNext() {
  if (step === 1) {
    if (getTasks().every((t) => !t.text)) {
      showToast("핵심 과제를 최소 1개 입력해주세요.", "error");
      return;
    }
    // 제목 없이 과목/서브만 채운 과제 방지 (저장 시 조용히 사라지는 데이터 손실 차단)
    const orphan = findOrphanTaskInput();
    if (orphan) {
      showToast("제목이 비어 있는 과제가 있어요. 제목을 입력해주세요.", "error");
      orphan.focus();
      return;
    }
    showStep(2);
  } else {
    handleSubmit();
  }
}

// 본문(제목)은 비었는데 과목 선택 또는 서브 과제가 있는 행의 제목 입력칸을 반환
function findOrphanTaskInput() {
  for (const row of document.querySelectorAll("#task-cards .task-row")) {
    const textInput = row.querySelector(".task-text");
    if (textInput.value.trim()) continue;
    const hasSubject = !!row.querySelector(".task-subject").value;
    const hasSub = Array.from(row.querySelectorAll(".task-sub__text")).some((i) => i.value.trim());
    if (hasSubject || hasSub) return textInput;
  }
  return null;
}

/* ============================================================
 * 내부 계산 (관리자용)
 * ============================================================ */
function computePlanQuality(tasks, cond, risk) {
  const filled = tasks.filter((t) => t.text).length;
  let score = Math.round((Math.min(filled, 3) / 3) * 50);
  if (risk.risk_factors.length) score += 25;
  if (cond > 0) score += 25;
  return Math.min(score, 100);
}

function buildAdvice(cond) {
  if (cond <= LOW_CONDITION_MAX) return "오늘은 컨디션이 낮습니다. 핵심 과제 완료를 우선하세요.";
  return "오늘 플랜이 정리됐어요. 퇴실 전 성과 기록을 잊지 마세요.";
}

/* ============================================================
 * 저장
 * ============================================================ */
async function handleSubmit() {
  const btn = document.getElementById("nav-next");
  btn.disabled = true;
  btn.textContent = "저장 중...";

  const tasks = getTasks().filter((t) => t.text);
  const cond = toNumber(document.getElementById("condition_score").value) || 6;
  const risk = resolveRisk();
  const score = computePlanQuality(tasks, cond, risk);
  const today = getTodayString();

  const record = {
    student_id: currentProfile.id,
    date: today,
    planned_total_hours: toNumber(document.getElementById("planned_total_hours").value),
    tasks: tasks,
    // 호환: 앞 3개 기존 컬럼에도 저장
    task_1: tasks[0] ? tasks[0].text : null,
    task_2: tasks[1] ? tasks[1].text : null,
    task_3: tasks[2] ? tasks[2].text : null,
    time_blocks: [],
    risk_factors: risk.risk_factors,
    risk_today: risk.risk_today,
    risk_category: risk.risk_category,
    condition_score: cond,
    plan_quality_score: score,
    subject_total_hours: SUBJECTS.reduce((a, s) => a + toNumber(document.getElementById(`planned_${s.key}_hours`).value), 0),
    time_mismatch: 0,
  };
  SUBJECTS.forEach((s) => {
    record[`planned_${s.key}_hours`] = toNumber(document.getElementById(`planned_${s.key}_hours`).value);
  });

  const { error } = await supabaseClient
    .from("daily_checkins")
    .upsert(record, { onConflict: "student_id,date" });

  if (error) {
    showToast("저장에 실패했습니다. 다시 시도해주세요.", "error");
    btn.disabled = false;
    btn.textContent = "오늘 플랜 저장";
    return;
  }

  showCompletion(tasks, cond, risk);
}

function showCompletion(tasks, cond, risk) {
  [1, 2].forEach((i) => (document.getElementById(`panel-${i}`).hidden = true));
  document.getElementById("wnav").hidden = true;
  document.getElementById("wizard-progress").hidden = true;
  document.getElementById("edit-note").hidden = true;

  document.getElementById("done-summary").innerHTML = `
    ${doneRow("핵심 과제", `${tasks.length}개`)}
    ${doneRow("주의 요소", risk.risk_today ? escapeHtml(risk.risk_today) : "없음")}
    ${doneRow("컨디션", `${cond}점 · ${conditionText(cond)}`)}
  `;
  document.getElementById("done-advice").textContent = buildAdvice(cond);
  document.getElementById("panel-done").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function doneRow(label, value) {
  return `<div class="wdone__row"><span>${label}</span><b>${value}</b></div>`;
}

/* ============================================================
 * 기존 체크인 불러오기 (수정 모드)
 * ============================================================ */
async function loadExistingCheckin() {
  const { data } = await supabaseClient
    .from("daily_checkins")
    .select("*")
    .eq("student_id", currentProfile.id)
    .eq("date", getTodayString())
    .maybeSingle();
  if (!data) return false;

  document.getElementById("edit-note").hidden = false;

  // 내부 시간값 복원
  if (toNumber(data.planned_total_hours)) {
    document.getElementById("planned_total_hours").value = toNumber(data.planned_total_hours);
    SUBJECTS.forEach((s) => {
      const v = toNumber(data[`planned_${s.key}_hours`]);
      if (v) document.getElementById(`planned_${s.key}_hours`).value = v;
    });
  }

  // 과제 복원 (tasks 배열 우선, 없으면 기존 컬럼)
  let tasks = Array.isArray(data.tasks) && data.tasks.length ? data.tasks : null;
  if (!tasks) {
    tasks = [1, 2, 3]
      .map((n) => ({ text: data[`task_${n}`], block: data[`task_${n}_block`] || null }))
      .filter((t) => t.text);
  }
  if (tasks.length === 0) addTaskRow();
  else tasks.forEach((t) => addTaskRow(t));

  // 컨디션 (기존 5점제 데이터도 그대로 사용)
  if (data.condition_score) setConditionUI(data.condition_score);

  // 위험 요소 (risk_factors 우선)
  let factors = Array.isArray(data.risk_factors) && data.risk_factors.length ? data.risk_factors : null;
  if (!factors && data.risk_today) factors = data.risk_today.split(",").map((s) => s.trim()).filter(Boolean);
  (factors || []).forEach((f) => {
    if (RISK_OPTIONS.includes(f) && f !== "기타") {
      selectedRisks.push(f);
      markRiskChip(f);
    } else {
      if (!selectedRisks.includes("기타")) {
        selectedRisks.push("기타");
        markRiskChip("기타");
      }
      const custom = document.getElementById("risk_custom");
      custom.hidden = false;
      custom.value = f;
    }
  });

  return true;
}

function markRiskChip(label) {
  document.querySelectorAll("#risk-chips .chip").forEach((c) => {
    if (c.dataset.risk === label) c.classList.add("chip--active");
  });
}

/* ============================================================
 * 헬퍼
 * ============================================================ */
function dateAddDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
