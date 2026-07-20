/*
 * md.js — 최소 마크다운 렌더러 (메모 미리보기용)
 * ------------------------------------------------------------
 * 지원: 제목(#~######), 굵게/기울임/취소선, 인라인 코드, 코드블록,
 *       인용문, 구분선, 순서/비순서 목록, 체크박스([ ] / [x]),
 *       링크, [[위키링크]], #태그
 * 보안: 입력을 먼저 전부 이스케이프한 뒤 태그를 만들어 XSS 차단.
 * ------------------------------------------------------------
 */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function inline(t) {
    return t
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
        (_, target, label) => `<a href="#" class="md-wikilink" data-link="${target.trim()}">${(label || target).trim()}</a>`)
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|\s)(#[^\s#.,!?]+)/g, '$1<span class="md-tag" data-tag="$2">$2</span>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>");
  }

  function render(src) {
    const lines = esc(String(src ?? "")).split("\n");
    const out = [];
    let list = null;       // 'ul' | 'ol' | null
    let inCode = false;
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

    for (let raw of lines) {
      if (/^```/.test(raw)) {
        closeList();
        out.push(inCode ? "</code></pre>" : '<pre class="md-code"><code>');
        inCode = !inCode;
        continue;
      }
      if (inCode) { out.push(raw + "\n"); continue; }

      if (!raw.trim()) { closeList(); continue; }

      let m;
      if ((m = raw.match(/^(#{1,6})\s+(.*)$/))) {
        closeList();
        const lv = m[1].length;
        out.push(`<h${lv} class="md-h md-h${lv}">${inline(m[2])}</h${lv}>`);
      } else if (/^(---|\*\*\*|___)\s*$/.test(raw)) {
        closeList();
        out.push('<hr class="md-hr" />');
      } else if ((m = raw.match(/^&gt;\s?(.*)$/))) {
        closeList();
        out.push(`<blockquote class="md-quote">${inline(m[1])}</blockquote>`);
      } else if ((m = raw.match(/^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/))) {
        if (list !== "ul") { closeList(); out.push('<ul class="md-list md-list--task">'); list = "ul"; }
        const done = m[1].toLowerCase() === "x";
        out.push(`<li class="md-task${done ? " is-done" : ""}"><span class="md-task__box">${done ? "✓" : ""}</span>${inline(m[2])}</li>`);
      } else if ((m = raw.match(/^\s*[-*+]\s+(.*)$/))) {
        if (list !== "ul") { closeList(); out.push('<ul class="md-list">'); list = "ul"; }
        out.push(`<li>${inline(m[1])}</li>`);
      } else if ((m = raw.match(/^\s*\d+\.\s+(.*)$/))) {
        if (list !== "ol") { closeList(); out.push('<ol class="md-list">'); list = "ol"; }
        out.push(`<li>${inline(m[1])}</li>`);
      } else {
        closeList();
        out.push(`<p class="md-p">${inline(raw)}</p>`);
      }
    }
    closeList();
    if (inCode) out.push("</code></pre>");
    return out.join("\n");
  }

  /* 첫 줄을 제목으로 (마크다운 기호 제거) */
  function titleOf(src) {
    const first = String(src ?? "").split("\n").find((l) => l.trim()) || "";
    return first.replace(/^#{1,6}\s*/, "").replace(/[*_~`]/g, "").trim() || "(빈 메모)";
  }

  /* 본문에서 #태그 수집 */
  function tagsOf(src) {
    const set = new Set();
    String(src ?? "").replace(/(^|\s)#([^\s#.,!?]+)/g, (_, __, t) => set.add(t));
    return [...set];
  }

  window.MD = { render, titleOf, tagsOf, esc };
})();
