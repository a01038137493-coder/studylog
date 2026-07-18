/* =====================================================
   새싹이의 정원 — 낮밤 배경 + 스프라이트 + 성장 단계
   개발용: 시간대(배경) / 성장 단계 수동 전환 버튼
   ===================================================== */

"use strict";

/* ===== 배경 (낮→밤) ===== */
const BG_DIR = "assets/배경/";
const BG_COUNT = 10;
const BG_HOLD_MS = 2600;
const BG_FADE_MS = 1100;
const BG_MODE = "pingpong";

/* ===== 장면 고정 스프라이트 (화분 + 구름) =====
   좌표 x,y,w 는 장면 대비 %, x,y = 중심 */
const POT = { src: "assets/pot.png", x: 48.6, y: 74.6, w: 37.5 };
const CLOUDS = [
  { src: "assets/구름/구름1.png", drift: true, cloud: true, x: 10, y: 12, w: 18, speed: 0.20, dir: 1 },
  { src: "assets/구름/구름2.png", drift: true, cloud: true, x: 35, y: 20, w: 22, speed: 0.14, dir: 1 },
  { src: "assets/구름/구름3.png", drift: true, cloud: true, x: 60, y: 9,  w: 16, speed: 0.24, dir: 1 },
  { src: "assets/구름/구름4.png", drift: true, cloud: true, x: 80, y: 23, w: 24, speed: 0.16, dir: 1 },
  { src: "assets/구름/구름5.png", drift: true, cloud: true, x: 95, y: 15, w: 20, speed: 0.22, dir: 1 },
];

/* ===== 성장 단계 (씨앗 → 새싹 → ...) ===== */
const PLANT_STAGES = [];

// 씨앗 1~7단계 (seed3~9): 회전 움찔움찔. 단계별 위치(y)·크기(w) 개별 조정
const SEED_STAGES = [
  { num: 3, x: 48.6, y: 60.7, w: 6.5 },   // 1단계
  { num: 4, x: 48.6, y: 60.7, w: 7.5 },   // 2단계
  { num: 5, x: 48.6, y: 61.6, w: 7.0 },   // 3단계
  { num: 6, x: 48.6, y: 62.0, w: 7.0 },   // 4단계
  { num: 7, x: 48.8, y: 62.5, w: 7.0 },   // 5단계
  { num: 8, x: 48.6, y: 62.9, w: 8.0 },   // 6단계
  { num: 9, x: 48.8, y: 63.8, w: 8.0 },   // 7단계
];
SEED_STAGES.forEach((s, idx) =>
  PLANT_STAGES.push({ name: "씨앗 " + (idx + 1) + "단계", src: "assets/seed" + s.num + ".png", wiggle: true, x: s.x, y: s.y, w: s.w, amp: 6, speed: 1.3 }));

// sprout 1~5: 스프라이트 스트립(6칸). 단계별 위치·크기 개별 조정
const SPROUT_STAGES = [
  { n: 1, x: 49.1, y: 77.3, w: 12.0 },
  { n: 2, x: 48.8, y: 74.6, w: 10.5 },
  { n: 3, x: 48.8, y: 78.2, w: 13.0 },
  { n: 4, x: 48.6, y: 77.3, w: 13.0 },
  { n: 5, x: 48.3, y: 82.7, w: 16.5 },
];
SPROUT_STAGES.forEach((s) =>
  PLANT_STAGES.push({ name: "sprout" + s.n, src: "assets/sprout" + s.n + ".png", anim: true, cols: 6, x: s.x, y: s.y, w: s.w, anchor: "bottom", fps: 1.2, mode: "pingpong" }));
// 정체모를단계: 화분 제거 + 흙더미에 옮겨심기 (뿌리 튀어나옴)
PLANT_STAGES.push({ name: "정체모를단계", src: "assets/정체모를단계1.png", anim: true, cols: 6, range: [4, 5], x: 47.6, y: 85.8, w: 16, anchor: "bottom", fps: 1.2, mode: "pingpong", hidePot: true, showSoil: true });

function seqFiles(p, a, b) { const r = []; for (let i = a; i <= b; i++) r.push(p + i + ".png"); return r; }

/* 시간대별 구름 색 보정 (배경 frame 1~10 → index 0~9) — CSS filter */
const CLOUD_TINT = [
  "brightness(1.03) saturate(1.05)",                                 // 1 맑은 낮 (거의 흰색)
  "brightness(1.0) saturate(1.05)",                                  // 2 낮
  "brightness(1.0) sepia(0.12) saturate(1.15) hue-rotate(-4deg)",    // 3
  "brightness(0.99) sepia(0.25) saturate(1.3) hue-rotate(-8deg)",    // 4 살짝 따뜻
  "brightness(0.97) sepia(0.42) saturate(1.55) hue-rotate(-12deg)",  // 5 금빛
  "brightness(0.95) sepia(0.55) saturate(1.75) hue-rotate(-15deg)",  // 6 금빛+
  "brightness(0.9)  sepia(0.65) saturate(1.95) hue-rotate(-18deg)",  // 7 노을
  "brightness(0.82) sepia(0.6) saturate(1.8) hue-rotate(-30deg)",    // 8 분홍빛 황혼
  "brightness(0.74) sepia(0.7) saturate(2.0) hue-rotate(-24deg)",    // 9 진한 노을
  "brightness(0.5)  sepia(0.55) saturate(1.4) hue-rotate(195deg)",   // 10 밤 (푸른빛)
];
const cloudEls = [];
let curBgIdx = 0;
function applyCloudTint() {
  const f = CLOUD_TINT[curBgIdx] || "none";
  for (const el of cloudEls) el.style.filter = f;
}

/* ==================================================== */

const layersEl = document.getElementById("layers");
const placeholder = document.getElementById("placeholder");

let anyLoaded = false;
function markReady() { anyLoaded = true; placeholder.classList.add("hidden"); }
function maybePlaceholder() { if (!anyLoaded) placeholder.classList.remove("hidden"); }

function styleSprite(el, L) {
  el.className = "sprite";
  el.style.left = L.x + "%"; el.style.top = L.y + "%"; el.style.width = L.w + "%";
  // anchor:"bottom" → (x,y)를 이미지 "밑동"으로. 항상 인라인으로 둬서 회전(wiggle) 합성 가능
  el.style.transform = (L.anchor === "bottom") ? "translate(-50%, -100%)" : "translate(-50%, -50%)";
  layersEl.appendChild(el);
}
function buildOrder(n, mode) {
  const o = []; for (let i = 0; i < n; i++) o.push(i);
  if (mode === "pingpong" && n > 1) return o.concat(o.slice(1, -1).reverse());
  return o;
}

/* ---------------- 배경 크로스페이드 + 수동 시간대 ---------------- */
const bgBase = document.createElement("img"); bgBase.className = "bg";
bgBase.style.display = "block"; bgBase.style.width = "100%";
const bgFade = document.createElement("img"); bgFade.className = "bg bg-fade";
bgFade.style.position = "absolute"; bgFade.style.left = "0"; bgFade.style.top = "0";
bgFade.style.width = "100%"; bgFade.style.opacity = "0";
bgFade.style.transition = "opacity " + BG_FADE_MS + "ms linear";
layersEl.appendChild(bgBase);
layersEl.appendChild(bgFade);

const bgFrames = [];
for (let i = 1; i <= BG_COUNT; i++) bgFrames.push(BG_DIR + i + ".png");

let bgImgs = [], bgOrder = [], bgK = 0, bgTimer = null;

(function loadBackgrounds() {
  bgOrder = buildOrder(bgFrames.length, BG_MODE);
  let pending = bgFrames.length;
  bgFrames.forEach((src, i) => {
    const im = new Image();
    im.onload = () => { bgImgs[i] = im; if (i === 0) { bgBase.src = im.src; markReady(); updateTod(); curBgIdx = 0; applyCloudTint(); } if (--pending === 0) startAuto(); };
    im.onerror = () => { bgImgs[i] = null; if (i === 0) maybePlaceholder(); if (--pending === 0) startAuto(); };
    im.src = encodeURI(src);
  });
})();

function showBgFrame(k) {
  if (!bgOrder.length) return;
  bgK = ((k % bgOrder.length) + bgOrder.length) % bgOrder.length;
  curBgIdx = bgOrder[bgK];
  applyCloudTint();
  const im = bgImgs[bgOrder[bgK]];
  if (im) {
    bgFade.src = im.src; bgFade.style.opacity = "1";
    setTimeout(() => { bgBase.src = im.src; bgFade.style.opacity = "0"; }, BG_FADE_MS);
  }
  updateTod();
}
function startAuto() { stopAuto(); bgTimer = setInterval(() => showBgFrame(bgK + 1), BG_HOLD_MS); updateTod(); }
function stopAuto() { if (bgTimer) { clearInterval(bgTimer); bgTimer = null; } }

/* ---------------- 동적 레이어 엔진 ---------------- */
const dyn = [];

function addLayer(L) {
  if (L.wiggle) return makeWiggle(L);
  if (L.anim) return makeAnim(L);
  if (L.frames) return makeFrames(L);
  if (L.drift) return makeDrift(L);
  return makeStatic(L);
}
function removeLayer(el) {
  if (!el) return;
  el.remove();
  for (let i = dyn.length - 1; i >= 0; i--) if (dyn[i].el === el) dyn.splice(i, 1);
}

function makeStatic(L) {
  const el = document.createElement("img");
  styleSprite(el, L);
  el.addEventListener("load", markReady);
  el.src = encodeURI(L.src);
  return el;
}
/* 회전 흔들림.
   - 씨앗: 한 장 이미지를 중심축으로 움찔움찔
   - 새싹/정체모를단계: 스트립의 가운데 프레임 한 장을 밑동축(anchor:bottom)으로 부드럽게 흔듦
     → 아래는 고정, 위(잎)가 흔들림 */
function makeWiggle(L) {
  const pivotBottom = (L.anchor === "bottom");
  const wig = { amp: L.amp || (pivotBottom ? 3 : 6), speed: L.speed || (pivotBottom ? 1.3 : 3.5), smooth: !!L.smooth };

  if (L.cols) {  // 스트립 → 한 프레임만 그려서 회전
    const cv = document.createElement("canvas");
    styleSprite(cv, L);
    if (pivotBottom) cv.style.transformOrigin = "50% 100%";
    const ctx = cv.getContext("2d");
    const img = new Image();
    img.onload = () => {
      const cw = img.naturalWidth / L.cols, ch = img.naturalHeight;
      cv.width = Math.round(cw); cv.height = Math.round(ch);
      const fi = (L.frame != null) ? L.frame : Math.floor(L.cols / 2);  // 가운데 프레임
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, fi * cw, 0, cw, ch, 0, 0, cv.width, cv.height);
      markReady();
      dyn.push({ el: cv, base: cv.style.transform, wiggle: wig });
    };
    img.onerror = maybePlaceholder;
    img.src = encodeURI(L.src);
    return cv;
  }

  const el = document.createElement("img");  // 단일 이미지
  styleSprite(el, L);
  if (pivotBottom) el.style.transformOrigin = "50% 100%";
  el.addEventListener("load", () => { markReady(); dyn.push({ el, base: el.style.transform, wiggle: wig }); });
  el.addEventListener("error", maybePlaceholder);
  el.src = encodeURI(L.src);
  return el;
}
function makeDrift(L) {
  const el = document.createElement("img");
  styleSprite(el, L);
  el.addEventListener("load", () => {
    markReady();
    if (L.cloud) {
      cloudEls.push(el);
      el.style.transition = "filter " + BG_FADE_MS + "ms linear";  // filter만 (left는 즉시)
      el.style.filter = CLOUD_TINT[curBgIdx] || "none";
    }
    dyn.push({ el, x: L.x, w: L.w, drift: { speed: L.speed || 1.5, dir: L.dir || 1 } });
  });
  el.addEventListener("error", maybePlaceholder);
  el.src = encodeURI(L.src);
  return el;
}
function makeAnim(L) {
  const cv = document.createElement("canvas");
  styleSprite(cv, L);
  const ctx = cv.getContext("2d");
  const img = new Image();
  img.onload = () => {
    const cols = L.cols || Math.max(1, Math.round(img.naturalWidth / img.naturalHeight));
    const cw = img.naturalWidth / cols, ch = img.naturalHeight;
    cv.width = Math.round(cw); cv.height = Math.round(ch);
    // range:[a,b] 로 재생 프레임 범위 제한 (좌우 흔들림 줄이기). 없으면 전체.
    const a = L.range ? L.range[0] : 0;
    const b = L.range ? L.range[1] : (cols - 1);
    let order = []; for (let i = a; i <= b; i++) order.push(i);
    if (L.mode === "pingpong" && order.length > 1) order = order.concat(order.slice(1, -1).reverse());
    const st = { el: cv, order, fi: 0, frameMs: 1000 / (L.fps || 6), facc: 0,
      advance: (idx) => { ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(img, idx * cw, 0, cw, ch, 0, 0, cv.width, cv.height); } };
    st.advance(order[0]); markReady(); dyn.push(st);
  };
  img.onerror = maybePlaceholder;
  img.src = encodeURI(L.src);
  return cv;
}
function makeFrames(L) {
  const el = document.createElement("img");
  styleSprite(el, L);
  const imgs = []; let pending = L.frames.length;
  L.frames.forEach((src, i) => {
    const im = new Image();
    im.onload = () => { imgs[i] = im; if (--pending === 0) ready(); };
    im.onerror = () => { imgs[i] = null; if (--pending === 0) ready(); };
    im.src = encodeURI(src);
  });
  function ready() {
    const valid = imgs.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
    if (!valid.length) { maybePlaceholder(); return; }
    markReady();
    const order = buildOrder(valid.length, L.mode).map((i) => valid[i]);
    el.src = imgs[order[0]].src;
    dyn.push({ el, order, fi: 0, frameMs: 1000 / (L.fps || 6), facc: 0, advance: (idx) => { el.src = imgs[idx].src; } });
  }
  return el;
}

let last = null;
function loop(now) {
  if (last === null) last = now;
  const dt = (now - last) / 1000; last = now;
  for (const st of dyn) {
    if (st.drift) {
      st.x += st.drift.speed * dt * st.drift.dir;
      const hw = st.w / 2;
      if (st.x > 100 + hw) st.x = -hw; else if (st.x < -hw) st.x = 100 + hw;
      st.el.style.left = st.x + "%";
    }
    if (st.wiggle) {
      const t = now * 0.001;
      const a = st.wiggle.smooth
        ? Math.sin(t * st.wiggle.speed) * st.wiggle.amp                                   // 부드러운 바람결 (잎)
        : Math.sin(t * st.wiggle.speed) * st.wiggle.amp
          + Math.sin(t * st.wiggle.speed * 2.7 + 1.3) * st.wiggle.amp * 0.35;             // 움찔움찔 (씨앗)
      st.el.style.transform = st.base + " rotate(" + a.toFixed(2) + "deg)";
    }
    if (st.order && st.order.length > 1) {
      st.facc += dt * 1000;
      if (st.facc >= st.frameMs) { st.facc = 0; st.fi = (st.fi + 1) % st.order.length; st.advance(st.order[st.fi]); }
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------------- 장면 + 성장 단계 ---------------- */
const potEl = addLayer(POT);                                           // 화분 (앞)
const soilEl = addLayer({ src: "assets/흙.png", x: 47.1, y: 77.3, w: 21 }); // 옮겨심을 흙더미 (뒤 밭)
soilEl.style.display = "none";                                         // 다자람 단계에서만 표시
CLOUDS.forEach(addLayer);

let plantEl = null, plantIdx = 0;
function setPlantStage(i) {
  plantIdx = ((i % PLANT_STAGES.length) + PLANT_STAGES.length) % PLANT_STAGES.length;
  const stage = PLANT_STAGES[plantIdx];
  if (plantEl) removeLayer(plantEl);
  plantEl = addLayer(stage);
  plantLabel = "plant(" + stage.name + ")";
  makeDraggable(plantEl, plantLabel);
  if (potEl) potEl.style.display = stage.hidePot ? "none" : "";   // 옮겨심기: 화분 숨김
  if (soilEl) {
    if (stage.showSoil) { soilEl.style.display = ""; layersEl.appendChild(soilEl); } // 식물 위로 올려 뿌리 끝을 덮음 → 뿌리가 흙에서 솟은 느낌
    else soilEl.style.display = "none";
  }
  selectEl(plantEl, plantLabel);
  updateGr();
}

/* ---------------- 개발용 버튼 ---------------- */
const todLabel = document.getElementById("todLabel");
const grLabel = document.getElementById("grLabel");
function updateTod() { if (todLabel) todLabel.textContent = (bgOrder.length ? (bgOrder[bgK] + 1) : "-") + "/" + BG_COUNT + (bgTimer ? " ▶" : " ⏸"); }
function updateGr() { if (grLabel) grLabel.textContent = (plantIdx + 1) + ". " + PLANT_STAGES[plantIdx].name; }

document.getElementById("todPrev").addEventListener("click", () => { stopAuto(); showBgFrame(bgK - 1); });
document.getElementById("todNext").addEventListener("click", () => { stopAuto(); showBgFrame(bgK + 1); });
document.getElementById("todAuto").addEventListener("click", () => { if (bgTimer) stopAuto(); else startAuto(); updateTod(); });
document.getElementById("grPrev").addEventListener("click", () => setPlantStage(plantIdx - 1));
document.getElementById("grNext").addEventListener("click", () => setPlantStage(plantIdx + 1));

/* ===== 개발용: 드래그=이동, 휠=크기, 값 실시간 표시 ===== */
const DEV_CONTROLS = true; // 시간대/단계 전환 바 표시 (드래그 모드와 독립)
const DEV_DRAG = false;   // 개발모드(드래그/좌표패널/크기버튼). true로 켜면 위치 조정 가능
let selectedEl = null, selectedLabel = "";
let plantLabel = "plant";
let coordsPanel = null;

function readVals(el) {
  return { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0, w: parseFloat(el.style.width) || 0 };
}
function fmtLine(label, el, mark) {
  const v = readVals(el);
  return (mark ? "▶ " : "  ") + (label + ":").padEnd(16) + "x:" + v.x.toFixed(1) + "  y:" + v.y.toFixed(1) + "  w:" + v.w.toFixed(1);
}
function updateReadout() {
  if (!coordsPanel) return;
  const out = [];
  if (plantEl) out.push(fmtLine(plantLabel, plantEl, selectedEl === plantEl));
  if (potEl && potEl.style.display !== "none") out.push(fmtLine("pot", potEl, selectedEl === potEl));
  if (soilEl && soilEl.style.display !== "none") out.push(fmtLine("흙", soilEl, selectedEl === soilEl));
  coordsPanel.textContent = out.join("\n");
}
function showDrag() { updateReadout(); }   // 드래그/휠 시 전체 좌표 갱신
function selectEl(el, label) { selectedEl = el; selectedLabel = label; updateReadout(); }
function resizeSelected(d) {
  if (!selectedEl) return;
  const cur = parseFloat(selectedEl.style.width) || 10;
  selectedEl.style.width = Math.max(2, cur + d).toFixed(1) + "%";
  updateReadout();
}
if (DEV_DRAG) {
  coordsPanel = document.createElement("div");
  coordsPanel.style.cssText = "position:fixed;top:10px;left:10px;z-index:60;background:rgba(20,20,22,.86);color:#ffd98a;font:12px/1.6 Consolas,monospace;white-space:pre;padding:8px 12px;border-radius:8px;box-shadow:0 3px 12px rgba(0,0,0,.4);";
  document.body.appendChild(coordsPanel);
  const bar = document.querySelector(".dev-bar");
  if (bar) {
    const minus = document.createElement("button"); minus.textContent = "크기 −"; minus.addEventListener("click", () => resizeSelected(-0.5));
    const plus = document.createElement("button"); plus.textContent = "크기 ＋"; plus.addEventListener("click", () => resizeSelected(0.5));
    bar.appendChild(minus); bar.appendChild(plus);
  }
}
function makeDraggable(el, label) {
  if (!DEV_DRAG || !el || el._drag) return;
  el._drag = true;
  el.style.pointerEvents = "auto";   // CSS에서 sprite는 pointer-events:none 이라 켜줌
  el.style.cursor = "move";
  el.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const rect = layersEl.getBoundingClientRect();
    const move = (ev) => {
      const px = (ev.clientX - rect.left) / rect.width * 100;
      const py = (ev.clientY - rect.top) / rect.height * 100;
      el.style.left = px.toFixed(1) + "%";
      el.style.top = py.toFixed(1) + "%";
      showDrag(label, el);
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      const v = readVals(el);
      console.log("[위치] " + label + " → x:" + v.x.toFixed(1) + ", y:" + v.y.toFixed(1) + ", w:" + v.w.toFixed(1));
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    selectEl(el, label);
  });
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    const cur = parseFloat(el.style.width) || 10;
    el.style.width = Math.max(2, cur + (e.deltaY < 0 ? 0.5 : -0.5)).toFixed(1) + "%";
    selectEl(el, label);
  }, { passive: false });
}

makeDraggable(potEl, "pot");
makeDraggable(soilEl, "흙");

// 시간대/단계 컨트롤 바: DEV_CONTROLS 로만 표시 (드래그 모드와 독립)
if (!DEV_CONTROLS) { const devBar = document.querySelector(".dev-bar"); if (devBar) devBar.style.display = "none"; }

setPlantStage(0);  // 씨앗부터 시작

/* ===== 우상단 버튼 + 모달 (도전과제 / 도움말) ===== */
(function () {
  // 버튼 아이콘
  const achImg = document.getElementById("achImg");
  if (achImg) achImg.src = encodeURI("assets/버튼/도전과제 버튼.png");
  const helpImg = document.getElementById("helpImg");
  if (helpImg) helpImg.src = encodeURI("assets/도움말.png");
  // 패널 이미지
  const achPanel = document.getElementById("achPanel");
  if (achPanel) achPanel.src = encodeURI("assets/도전과제.png");
  const helpPanel = document.getElementById("helpPanel");
  if (helpPanel) helpPanel.src = encodeURI("assets/도움말 메뉴.png");
  const helpBox = document.getElementById("helpBox");
  if (helpBox) helpBox.src = encodeURI("assets/박스2.png");
  // 닫기 버튼 아이콘 (모든 모달)
  document.querySelectorAll(".close-img").forEach((c) => { c.src = encodeURI("assets/닫기버튼.png"); });

  function setupModal(btnId, modalId, closeId) {
    const btn = document.getElementById(btnId);
    const modal = document.getElementById(modalId);
    const closeBtn = document.getElementById(closeId);
    const close = () => modal && modal.classList.add("hidden");
    if (btn) btn.addEventListener("click", () => modal && modal.classList.remove("hidden"));
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  }
  setupModal("achBtn", "achModal", "achClose");
  setupModal("helpBtn", "helpModal", "helpClose");

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".modal").forEach((m) => m.classList.add("hidden"));
  });
})();

/* ===== 개발용: 도전과제 박스 위치/크기 직접 조절 =====
   도전과제 모달을 연 상태에서:
   - 박스를 드래그 → 위치 이동
   - 박스 위에서 휠 → 크기(높이) 조절 (자물쇠 비율 유지)
   좌상단 패널에 box별 x / y / h 값 표시 → 알려주시면 코드에 고정 */
/* ===== 자물쇠 / 경험치 바 + 위치·크기 조절 개발모드 ===== */
(function () {
  // 이미지 연결
  document.querySelectorAll(".lock-ico").forEach((i) => { i.src = encodeURI("assets/자물쇠.png"); });
  const expBar = document.getElementById("expBar");
  if (expBar) expBar.src = encodeURI("assets/경험치 바.png");

  const DEV_EDIT = false;  // true: 드래그=이동, 휠=가로, Shift+휠=세로, 방향키=미세, 스냅/정렬
  const items = [];
  let selected = null, snapOn = true, txt = null;

  if (DEV_EDIT) {
    const panel = document.createElement("div");
    panel.style.cssText = "position:fixed;top:8px;left:8px;z-index:300;background:rgba(20,20,22,.9);color:#ffd98a;font:11px/1.5 Consolas,monospace;padding:7px 10px;border-radius:8px;max-width:360px;";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:5px;margin-bottom:5px;flex-wrap:wrap;";
    const mk = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.style.cssText = "background:#3a3a3e;color:#fff;border:1px solid #565660;border-radius:4px;padding:2px 7px;cursor:pointer;font:11px Consolas,monospace;"; b.addEventListener("click", fn); return b; };
    row.appendChild(mk("↔가로중앙", () => { if (selected) { selected.el.dataset.x = "50.0"; selected.apply(); report(); } }));
    row.appendChild(mk("↕세로중앙", () => { if (selected) { selected.el.dataset.y = "50.0"; selected.apply(); report(); } }));
    row.appendChild(mk("≡세로균등", distributeY));
    row.appendChild(mk("같은가로", sameWidth));
    const sb = mk("스냅:ON", function () { snapOn = !snapOn; this.textContent = "스냅:" + (snapOn ? "ON" : "OFF"); });
    row.appendChild(sb);
    txt = document.createElement("div"); txt.style.whiteSpace = "pre";
    panel.appendChild(row); panel.appendChild(txt);
    document.body.appendChild(panel);
  }

  function report() {
    if (!txt) return;
    txt.textContent = "드래그=이동·휠=가로·Shift+휠=세로·방향키=미세\n" +
      items.map((it) => { const d = it.el.dataset; return `${it === selected ? "▶" : " "}${it.name} x:${(+d.x).toFixed(1)} y:${(+d.y).toFixed(1)} w:${(+d.w).toFixed(1)}` + (it.useH ? ` h:${(+d.h).toFixed(1)}` : ""); }).join("\n");
  }
  function snap(v, cands) {
    if (snapOn) for (const c of cands) if (Math.abs(v - c) < 1.2) return c;
    return Math.round(v * 10) / 10;
  }
  function select(it) { if (selected) selected.el.style.outline = ""; selected = it; if (it) it.el.style.outline = "2px dashed #ffd98a"; report(); }
  function distributeY() {
    if (!selected) return;
    const g = items.filter((i) => i.group === selected.group).sort((a, b) => +a.el.dataset.y - +b.el.dataset.y);
    if (g.length < 2) return;
    const t = +g[0].el.dataset.y, b = +g[g.length - 1].el.dataset.y;
    g.forEach((it, i) => { it.el.dataset.y = (t + (b - t) * i / (g.length - 1)).toFixed(1); it.apply(); });
    report();
  }
  function sameWidth() {
    if (!selected) return;
    const w = selected.el.dataset.w;
    items.filter((i) => i.group === selected.group).forEach((it) => { it.el.dataset.w = w; it.apply(); });
    report();
  }
  function adjustable(el, parent, name, init, useH, group) {
    if (!el || !parent) return;
    el.dataset.x = init.x; el.dataset.y = init.y; el.dataset.w = init.w; if (useH) el.dataset.h = init.h;
    const apply = () => {
      el.style.position = "absolute";
      el.style.left = el.dataset.x + "%"; el.style.top = el.dataset.y + "%";
      el.style.width = el.dataset.w + "%";
      el.style.height = useH ? el.dataset.h + "%" : "auto";
      el.style.transform = "translate(-50%, -50%)";
    };
    apply();
    const it = { el, name, useH, apply, parent, group };
    items.push(it);
    if (!DEV_EDIT) return;
    el.style.pointerEvents = "auto"; el.style.cursor = "move"; el.style.zIndex = 40;
    el.addEventListener("mousedown", (e) => {
      e.preventDefault(); select(it);
      const rect = parent.getBoundingClientRect();
      const move = (ev) => {
        const rx = (ev.clientX - rect.left) / rect.width * 100, ry = (ev.clientY - rect.top) / rect.height * 100;
        const ox = items.filter((i) => i !== it && i.parent === parent).map((i) => +i.el.dataset.x).concat([50]);
        const oy = items.filter((i) => i !== it && i.parent === parent).map((i) => +i.el.dataset.y).concat([50]);
        el.dataset.x = snap(rx, ox).toFixed(1); el.dataset.y = snap(ry, oy).toFixed(1);
        apply(); report();
      };
      const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
      document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
    });
    el.addEventListener("wheel", (e) => {
      e.preventDefault(); select(it); const d = (e.deltaY < 0 ? 1 : -1);
      if (useH && e.shiftKey) el.dataset.h = Math.max(4, +el.dataset.h + d).toFixed(1);
      else el.dataset.w = Math.max(2, +el.dataset.w + d).toFixed(1);
      apply(); report();
    }, { passive: false });
  }

  const cont = document.getElementById("achContent");
  // 도전과제 박스 3개
  const boxInit = [{ x: 50.0, y: 19.7, w: 86, h: 34 }, { x: 50.0, y: 48.3, w: 86, h: 34 }, { x: 50.0, y: 77.0, w: 86, h: 34 }];
  document.querySelectorAll("#achContent .ach-box").forEach((el, i) => adjustable(el, cont, "box" + (i + 1), boxInit[i] || { x: 50, y: 50, w: 86, h: 34 }, true, "box"));
  // 자물쇠 3개 (박스 위)
  const lockInit = [{ x: 15.1, y: 19.7, w: 12 }, { x: 15.1, y: 48.3, w: 12 }, { x: 15.1, y: 77.0, w: 12 }];
  document.querySelectorAll("#achContent .lock-ico").forEach((el, i) => adjustable(el, cont, "lock" + (i + 1), lockInit[i] || { x: 15.1, y: 50, w: 12 }, false, "lock"));
  // 경험치 바 (기본 화면)
  adjustable(expBar, document.getElementById("sceneWindow"), "exp", { x: 50.0, y: 91.7, w: 60 }, false, "exp");

  if (DEV_EDIT) document.addEventListener("keydown", (e) => {
    if (!selected) return;
    const s = e.shiftKey ? 2 : 0.5, d = selected.el.dataset; let used = true;
    if (e.key === "ArrowLeft") d.x = (+d.x - s).toFixed(1);
    else if (e.key === "ArrowRight") d.x = (+d.x + s).toFixed(1);
    else if (e.key === "ArrowUp") d.y = (+d.y - s).toFixed(1);
    else if (e.key === "ArrowDown") d.y = (+d.y + s).toFixed(1);
    else used = false;
    if (used) { e.preventDefault(); selected.apply(); report(); }
  });

  report();
})();

/* ---------------- 전체화면 토글 ---------------- */
(function setupFullscreen() {
  const fsBtn = document.getElementById("fsBtn");
  if (!fsBtn) return;
  const isFs = () => document.fullscreenElement || document.webkitFullscreenElement;
  fsBtn.addEventListener("click", () => {
    if (isFs()) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const el = document.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    }
  });
  const sync = () => {
    const on = !!isFs();
    document.body.classList.toggle("fs-active", on);
    fsBtn.title = on ? "전체화면 종료" : "전체화면";
  };
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync);
})();
