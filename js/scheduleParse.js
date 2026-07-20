/*
 * scheduleParse.js
 * ------------------------------------------------------------
 * 카카오톡 스크린샷 OCR 텍스트에서 일정 후보를 추출한다.
 * - 한국어 상대 날짜: 오늘/내일/모레/글피, 이번주·다음주·다다음주+요일,
 *   요일 단독, "N월 N일", 카카오 날짜 구분선 기준일 처리
 * - 시각: 오전/오후/저녁/밤/아침/새벽 + N시(반·N분), 24시간 표기,
 *   "3시나 4시" 복수 제안·오전오후 불명 → 모호 처리
 * - 문맥: 거절("안 돼")·비확정("시간 되면")·취소("취소")·변경("말고") 구분
 *
 * 사용: ScheduleParse.parse(fullText, new Date())
 *   → { candidate: {title,start,location,ambiguities,source} | null,
 *       cancelled: boolean }
 * ------------------------------------------------------------ */
(function (root) {
  "use strict";

  var WEEKDAY = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

  var REJECT = ["안 돼", "안돼", "안 되", "안되", "안될", "안 될", "어려워", "어렵", "힘들", "못 가", "못가", "못 만나"];
  var NONCOMMIT = ["언젠가", "나중에", "시간 되면", "시간되면", "시간 나면", "다음에 이야기", "다음에 얘기", "되면 보자", "되면 만나"];
  var AGREE = ["보자", "만나자", "만나요", "가자", "하자", "좋아", "콜", "오케이", "그때 봐", "거기서 봐", "예약", "확정", "봐요", "만납시다"];
  var VAGUE_TIME = ["저녁", "점심", "아침", "밤", "새벽", "퇴근후", "낮"];

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function addDays(d, n) {
    var r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  /* ---------- 카카오 날짜 구분선 (기준일 1순위) ---------- */
  function kakaoSeparator(lines, refDate) {
    var patterns = [
      /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
      /^(\d{1,2})월\s*(\d{1,2})일\s*(월|화|수|목|금|토|일)요일$/,
      /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?$/,
    ];
    for (var i = lines.length - 1; i >= 0; i--) {
      var line = lines[i].trim();
      for (var pi = 0; pi < patterns.length; pi++) {
        var m = line.match(patterns[pi]);
        if (!m) continue;
        var y, mo, da;
        if (pi === 1) { y = refDate.getFullYear(); mo = +m[1]; da = +m[2]; }
        else { y = +m[1]; mo = +m[2]; da = +m[3]; }
        if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) return new Date(y, mo - 1, da);
      }
    }
    return null;
  }

  /* ---------- 날짜 해석 ---------- */
  function resolveDate(text, ref) {
    var t = text.replace(/\s+/g, "");
    var base = startOfDay(ref);
    var amb = null;

    // 명시적 N월 N일 (연도 포함 가능)
    var m = text.match(/(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/);
    if (m) {
      var y = m[1] ? +m[1] : ref.getFullYear();
      var d = new Date(y, +m[2] - 1, +m[3]);
      if (!m[1] && d < base) d = new Date(y + 1, +m[2] - 1, +m[3]);
      return { date: d, ambiguity: null };
    }

    if (t.indexOf("오늘") >= 0) return { date: base, ambiguity: null };
    if (t.indexOf("내일") >= 0) return { date: addDays(base, 1), ambiguity: null };
    if (t.indexOf("모레") >= 0) return { date: addDays(base, 2), ambiguity: null };
    if (t.indexOf("글피") >= 0) return { date: addDays(base, 3), ambiguity: null };

    // 주 오프셋 (다다음주 → 다음주 → 이번주 순서)
    var weekOffset = t.indexOf("다다음주") >= 0 ? 2 : t.indexOf("다음주") >= 0 ? 1 : t.indexOf("이번주") >= 0 ? 0 : null;
    var wd = firstWeekday(t);

    if (weekOffset !== null) {
      // 이번 주 월요일
      var dow = (base.getDay() + 6) % 7; // 월=0
      var monday = addDays(base, -dow);
      if (wd !== null) {
        var target = addDays(monday, weekOffset * 7 + ((wd + 6) % 7));
        if (weekOffset === 0 && target < base) amb = "이번 주 해당 요일이 이미 지났습니다";
        return { date: target, ambiguity: amb };
      }
      if (t.indexOf("주말") >= 0) {
        return { date: addDays(monday, weekOffset * 7 + 5), ambiguity: null }; // 토요일
      }
      return { date: null, ambiguity: "요일이 정해지지 않았습니다" };
    }

    // 요일 단독 → 다가오는 그 요일
    if (wd !== null && (t.indexOf("요일") >= 0 || t.indexOf("욜") >= 0)) {
      for (var off = 0; off <= 7; off++) {
        var cand = addDays(base, off);
        if (cand.getDay() === wd) return { date: cand, ambiguity: null };
      }
    }

    if (t.indexOf("다음달") >= 0 || t.indexOf("월말") >= 0) {
      return { date: null, ambiguity: "날짜가 정해지지 않았습니다" };
    }
    return { date: null, ambiguity: null };
  }

  function firstWeekday(compact) {
    var keys = Object.keys(WEEKDAY);
    for (var i = 0; i < keys.length; i++) {
      var ch = keys[i];
      if (compact.indexOf(ch + "요일") >= 0 || compact.indexOf(ch + "욜") >= 0) return WEEKDAY[ch];
    }
    for (var j = 0; j < keys.length; j++) {
      var c2 = keys[j];
      if (compact.indexOf("주" + c2 + "에") >= 0 || new RegExp("주" + c2 + "$").test(compact)) return WEEKDAY[c2];
    }
    return null;
  }

  /* ---------- 시각 해석 ---------- */
  function resolveTime(text) {
    var t = text.replace(/\s+/g, "");

    if (/\d{1,2}시(나|또는|아니면)\d{1,2}시/.test(t)) {
      return { hour: null, minute: null, ambiguity: "시간이 여러 개 제안되었습니다" };
    }

    var meridiem = null;
    if (/오전|아침|새벽/.test(t)) meridiem = "am";
    if (/오후|저녁|밤|퇴근후/.test(t)) meridiem = "pm";

    var m = t.match(/([01]?[0-9]|2[0-3])시(반|[0-5]?[0-9]분)?/);
    if (m) {
      var hour = +m[1];
      var minute = 0;
      if (m[2] === "반") minute = 30;
      else if (m[2]) minute = parseInt(m[2], 10) || 0;

      if (hour >= 13) return { hour: hour, minute: minute, ambiguity: null };
      if (meridiem === "pm") return { hour: hour < 12 ? hour + 12 : hour, minute: minute, ambiguity: null };
      if (meridiem === "am") return { hour: hour === 12 ? 0 : hour, minute: minute, ambiguity: null };
      return { hour: hour, minute: minute, ambiguity: "오전·오후가 명확하지 않습니다" };
    }

    for (var i = 0; i < VAGUE_TIME.length; i++) {
      if (t.indexOf(VAGUE_TIME[i]) >= 0) {
        return { hour: null, minute: null, ambiguity: "'" + VAGUE_TIME[i] + "'은(는) 정확한 시각이 아닙니다" };
      }
    }
    return { hour: null, minute: null, ambiguity: null };
  }

  /* ---------- 장소/제목 ---------- */
  function extractLocation(sentence) {
    var idx = sentence.indexOf("에서");
    if (idx < 0) return null;
    var tokens = sentence.slice(0, idx).split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;
    var last = tokens[tokens.length - 1];
    if (last.length < 2 || /^\d+$/.test(last) || /시$|분$/.test(last)) return null;
    if (tokens.length >= 2) {
      var prev = tokens[tokens.length - 2];
      if (prev.length >= 2 && !/^\d+$/.test(prev) && !/시$|요일|주$/.test(prev)
          && ["내일", "모레", "오늘", "글피"].indexOf(prev) < 0) {
        return prev + " " + last;
      }
    }
    return last;
  }

  function shortTitle(sentence) {
    var loc = extractLocation(sentence);
    if (loc) return loc + " 약속";
    if (/회의|미팅/.test(sentence)) return "미팅";
    if (/점심/.test(sentence)) return "점심 약속";
    if (/저녁/.test(sentence)) return "저녁 약속";
    return "약속";
  }

  /* ---------- 메인 ---------- */
  function parse(fullText, now) {
    now = now || new Date();
    var lines = String(fullText || "").split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var base = kakaoSeparator(lines, now) || now;

    var sentences = String(fullText || "")
      .split(/[\n.!?]/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);

    var best = null;
    var cancelled = false;

    for (var i = 0; i < sentences.length; i++) {
      var sentence = sentences[i];
      var compact = sentence.replace(/\s+/g, "");

      if (compact.indexOf("취소") >= 0) { cancelled = true; continue; }
      if (containsAny(sentence, compact, REJECT)) continue;
      if (containsAny(sentence, compact, NONCOMMIT)) continue;

      // "A 말고 B" → 뒤쪽만
      var effective = sentence;
      var malgo = sentence.indexOf("말고");
      if (malgo >= 0) effective = sentence.slice(malgo + 2);

      var dateR = resolveDate(effective, base);
      if (!dateR.date) continue;
      var timeR = resolveTime(effective);

      var ambiguities = [];
      if (dateR.ambiguity) ambiguities.push(dateR.ambiguity);
      if (timeR.ambiguity) ambiguities.push(timeR.ambiguity);

      var start = new Date(dateR.date);
      if (timeR.hour !== null) start.setHours(timeR.hour, timeR.minute || 0, 0, 0);
      else start.setHours(9, 0, 0, 0);   // 표시용 기본값 (시트에서 수정)

      var hasAgree = AGREE.some(function (w) { return effective.indexOf(w) >= 0; });
      var score = (dateR.ambiguity ? 0 : 2) + (timeR.ambiguity ? 0 : (timeR.hour !== null ? 2 : 0)) + (hasAgree ? 1 : 0);

      var candidate = {
        title: shortTitle(effective),
        start: start,
        hasTime: timeR.hour !== null && !timeR.ambiguity,
        location: extractLocation(effective),
        ambiguities: ambiguities,
        source: sentence,
        score: score,
      };
      if (!best || candidate.score > best.score) best = candidate;
    }

    return { candidate: best, cancelled: cancelled && !best };
  }

  function containsAny(sentence, compact, list) {
    return list.some(function (w) {
      return sentence.indexOf(w) >= 0 || compact.indexOf(w.replace(/\s+/g, "")) >= 0;
    });
  }

  var api = { parse: parse, _resolveDate: resolveDate, _resolveTime: resolveTime };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ScheduleParse = api;
})(typeof window !== "undefined" ? window : globalThis);
