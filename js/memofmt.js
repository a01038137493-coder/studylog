/*
 * memofmt.js — 아이폰 메모장식 서식 유틸
 * ------------------------------------------------------------
 * memos.content 에는 제한된 HTML만 저장한다. 저장 전(clean)과
 * 표시 전(toHtml) 양쪽에서 허용 태그만 남겨 XSS를 차단한다.
 * ------------------------------------------------------------
 */
(function () {
  const ALLOWED = {
    B: [], STRONG: [], I: [], EM: [], U: [], S: [], STRIKE: [], DEL: [],
    BR: [], DIV: [], P: [], UL: [], OL: [], LI: [],
    H1: [], H2: [], SPAN: ["class"],
  };

  /* 저장용: 허용 태그/속성만 남기고 정리 */
  function clean(html) {
    const doc = document.implementation.createHTMLDocument("");
    doc.body.innerHTML = String(html ?? "");

    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) return;                     // 텍스트는 그대로
        if (n.nodeType !== 1) { n.remove(); return; }     // 주석 등 제거

        const tag = n.tagName;
        if (!ALLOWED[tag]) {                              // 비허용 태그는 내용만 살림
          const parent = n.parentNode;
          while (n.firstChild) parent.insertBefore(n.firstChild, n);
          n.remove();
          return;
        }
        // 허용 속성만 남기고, class 는 메모 전용 클래스만 통과
        [...n.attributes].forEach((a) => {
          const ok = ALLOWED[tag].includes(a.name) &&
            (a.name !== "class" || /^(memo-check|memo-check__box|memo-check__text|is-done)( |$)/.test(a.value));
          if (!ok) n.removeAttribute(a.name);
        });
        walk(n);
      });
    };
    walk(doc.body);
    return doc.body.innerHTML.trim();
  }

  /* 표시용: 저장된 값이 옛 평문(마크다운/줄바꿈)이어도 안전하게 HTML로 */
  function toHtml(content) {
    const s = String(content ?? "");
    const looksHtml = /<(div|p|br|ul|ol|li|h1|h2|b|strong|i|em|u|s|span)\b/i.test(s);
    if (looksHtml) return clean(s);
    const esc = (t) => t.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    return s.split("\n").map((line) => `<div>${esc(line) || "<br>"}</div>`).join("");
  }

  /* 목록/일반 텍스트로 표시할 때 쓰는 순수 텍스트 */
  function toText(content) {
    const doc = document.implementation.createHTMLDocument("");
    doc.body.innerHTML = toHtml(content);
    doc.body.querySelectorAll("div, p, li, h1, h2, br").forEach((el) => el.insertAdjacentText("beforebegin", "\n"));
    doc.body.querySelectorAll(".memo-check__box").forEach((el) => el.remove());
    return doc.body.textContent.replace(/\n{2,}/g, "\n").trim();
  }

  function isEmpty(content) {
    return toText(content).length === 0;
  }

  /* 제목/소제목/본문 블록 전환 */
  function applyBlock(kind) {
    const tag = kind === "title" ? "H1" : kind === "head" ? "H2" : "DIV";
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === 3) node = node.parentNode;
    const cur = node.closest("h1, h2, div, p, li");
    // 이미 같은 형식이면 본문으로 되돌린다 (토글)
    const next = cur && cur.tagName === tag ? "div" : tag.toLowerCase();
    document.execCommand("formatBlock", false, next);
  }

  /* 체크리스트 한 줄 삽입 */
  function insertCheck() {
    document.execCommand(
      "insertHTML", false,
      '<div class="memo-check"><span class="memo-check__box" contenteditable="false"></span><span class="memo-check__text"> </span></div>'
    );
  }

  window.MemoFmt = { clean, toHtml, toText, isEmpty, applyBlock, insertCheck };
})();
