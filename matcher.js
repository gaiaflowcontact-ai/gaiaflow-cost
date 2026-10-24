/* Gaia Flow 成本計算器 — 口述/文字辨識核心
 * 1. parse(text)        拆出 [{raw, name, grams}]
 * 2. createMatcher(...)  對應食材總表，回傳候選與信心
 * 瀏覽器與 Node 共用（Node 用來跑測試）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GFMatcher = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- 文字前處理 ----------
  const UNIT_RE = "公克|公斤|克|毫升|kg|g|ml|cc";
  const UNIT_MUL = { 公克: 1, 克: 1, g: 1, 公斤: 1000, kg: 1000, 毫升: 1, ml: 1, cc: 1 };
  const CN_DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

  function cnToNumber(s) {
    if (s === "半") return 0.5;
    const parts = s.split(/[點点]/);
    let total = 0, section = 0, num = 0, lastUnit = 0, zero = false;
    for (const ch of parts[0]) {
      if (ch in CN_DIGIT) { if (CN_DIGIT[ch] === 0) zero = true; num = CN_DIGIT[ch]; continue; }
      const u = ch === "十" ? 10 : ch === "百" ? 100 : ch === "千" ? 1000 : 0;
      if (u) { section += (num || (u === 10 ? 1 : 0)) * u; num = 0; lastUnit = u; zero = false; continue; }
      if (ch === "萬" || ch === "万") { total += (section + num) * 10000; section = 0; num = 0; lastUnit = 0; }
    }
    // 口語「一百五」= 150、「一千二」= 1200（「一百零五」仍是 105）
    if (num && lastUnit >= 100 && !zero) num *= lastUnit / 10;
    let v = total + section + num;
    if (parts[1]) {
      const frac = [...parts[1]].map((c) => (c in CN_DIGIT ? CN_DIGIT[c] : "")).join("");
      if (frac) v = parseFloat(v + "." + frac);
    }
    return v;
  }

  function preprocess(text) {
    let t = String(text || "").normalize("NFKC");
    // 中文數字只在後面接單位時轉換，避免「九層塔」「三蔬料」「四季檸檬」被誤轉
    t = t.replace(new RegExp("([零〇一二兩两三四五六七八九十百千萬万點点]+|半)\\s*(" + UNIT_RE + ")", "gi"),
      (m, n, u) => cnToNumber(n) + u);
    return t;
  }

  const LEAD_WORDS = ["還有", "以及", "然後", "另外", "最後", "接著", "再加", "加上", "和", "跟", "與", "及", "再", "加", "放", "用", "要"];
  const TRAIL_WORDS = ["大概", "大約", "約", "差不多", "每", "各", "共", "要", "放", "加"];
  const SEP_CHARS = /[\s、,，;；。.!！?？:：\-–—~～]+/g;

  function cleanName(s) {
    let n = s.replace(SEP_CHARS, " ").trim();
    let changed = true;
    while (changed) {
      changed = false;
      n = n.trim();
      for (const w of LEAD_WORDS) if (n.startsWith(w) && n.length > w.length) { n = n.slice(w.length); changed = true; }
      for (const w of TRAIL_WORDS) if (n.endsWith(w) && n.length > w.length) { n = n.slice(0, -w.length); changed = true; }
    }
    return n.replace(/\s+/g, "").trim();
  }

  function splitEach(name) {
    // 「鹽和糖各5克」→ 鹽、糖
    return name.split(/和|跟|與|及|、/).map(cleanName).filter(Boolean);
  }

  function parse(text) {
    const t = preprocess(text);
    const chunks = t.split(/[\n\r、,，;；。]+/);
    const out = [];
    const numRe = new RegExp("(\\d+(?:\\.\\d+)?)\\s*(" + UNIT_RE + ")?\\s*(左右)?", "gi");
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      let last = 0, m, found = false;
      numRe.lastIndex = 0;
      while ((m = numRe.exec(chunk))) {
        const before = chunk.slice(last, m.index);
        const unit = (m[2] || "g").toLowerCase();
        const grams = parseFloat(m[1]) * (UNIT_MUL[unit] || UNIT_MUL[m[2]] || 1);
        const hasEach = /各/.test(before);
        const name = cleanName(before);
        last = numRe.lastIndex;
        if (!name) {
          // 數字前沒有名稱：補給上一項沒有克數的品項
          const prev = out[out.length - 1];
          if (prev && prev.grams == null) { prev.grams = round(grams); prev.raw += m[0]; }
          continue;
        }
        found = true;
        const names = hasEach ? splitEach(name) : [name];
        for (const n of names) out.push({ raw: (before + m[0]).trim(), name: n, grams: round(grams) });
      }
      const rest = cleanName(chunk.slice(last));
      if (rest) out.push({ raw: chunk.slice(last).trim(), name: rest, grams: null });
      else if (!found && !out.length) { /* nothing */ }
    }
    return out;
  }

  function round(x) { return Math.round(x * 1000) / 1000; }

  // ---------- 對應 ----------
  function norm(s) {
    return String(s || "").normalize("NFKC").toLowerCase().replace(/[\s()（）\[\]【】「」'"`·・.,，、\-_/]+/g, "");
  }
  function stripParens(s) { return String(s || "").replace(/[(（][^)）]*[)）]/g, ""); }

  function buildPinyinIndex(pinyinData) {
    const idx = new Map();
    if (!pinyinData) return idx;
    for (const sy of Object.keys(pinyinData)) {
      for (const ch of pinyinData[sy]) {
        let set = idx.get(ch);
        if (!set) idx.set(ch, (set = new Set()));
        set.add(sy);
      }
    }
    return idx;
  }

  function levenshtein(a, b) {
    a = [...a]; b = [...b];
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0]; dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return dp[b.length];
  }

  function createMatcher(items, opts) {
    opts = opts || {};
    const py = buildPinyinIndex(opts.pinyin);
    // 台灣口音／語音輸入常混淆：zh/z、ch/c、sh/s、in/ing、en/eng（例：素薯粉 → 樹薯粉）
    const fuzz = (y) => y.replace(/^([zcs])h/, "$1").replace(/(i|e)ng$/, "$1n");
    const pyOf = (s) => [...s].map((ch) => {
      const set = py.get(ch);
      return set ? new Set([...set].map(fuzz)) : new Set([ch]);
    });
    const isSubseq = (k, q) => { // q 的字依序出現在 k 裡
      let i = 0; const ka = [...k];
      for (const ch of q) { i = ka.indexOf(ch, i); if (i < 0) return false; i++; }
      return true;
    };
    const same = (A, B) => { for (const x of A) if (B.has(x)) return true; return false; };
    const pyEqual = (a, b) => a.length === b.length && a.every((s, i) => same(s, b[i]));
    const pyContains = (hay, nd) => {
      if (nd.length > hay.length) return false;
      for (let i = 0; i + nd.length <= hay.length; i++) {
        let ok = true;
        for (let j = 0; j < nd.length; j++) if (!same(hay[i + j], nd[j])) { ok = false; break; }
        if (ok) return true;
      }
      return false;
    };

    const byId = new Map();
    const entries = items.map((it, i) => {
      const key = it.id || "row" + i;
      const e = { item: it, key, keys: [], aliasKeys: [] };
      const add = (s, list) => { const k = norm(s); if (k && !list.includes(k)) list.push(k); };
      add(it.name, e.keys);
      add(stripParens(it.name), e.keys);
      for (const part of String(it.name).split(/[\s(（)）]+/)) if ([...norm(part)].length >= 2) add(part, e.keys);
      for (const a of it.alias || []) add(a, e.aliasKeys);
      e.py = e.keys.map(pyOf);
      if (it.id) byId.set(it.id, e);
      return e;
    });
    for (const [alias, id] of Object.entries(opts.aliases || {})) {
      const e = byId.get(id);
      if (e) { const k = norm(alias); if (k && !e.aliasKeys.includes(k)) e.aliasKeys.push(k); }
    }

    function scoreEntry(e, q, qpy) {
      const ql = [...q].length;
      let best = 0, how = "";
      const take = (s, h) => { if (s > best) { best = s; how = h; } };
      if (e.aliasKeys.includes(q)) take(98, "別名");
      e.keys.forEach((k, i) => {
        const kl = [...k].length, kpy = e.py[i];
        if (k === q) take(i === 0 ? 100 : 96, "完全相同");
        else if (pyEqual(kpy, qpy)) take(88, "同音");
        if (k !== q && k.includes(q)) take(60 + 25 * ql / kl, "部分符合");
        if (k !== q && kl >= 2 && q.includes(k)) take(55 + 25 * kl / ql, "部分符合");
        else if (k !== q && kl === 1 && ql <= 3 && q.includes(k)) take(48 + 10 / ql, "部分符合"); // 老薑 → 薑
        if (ql >= 3 && kl > ql && !k.includes(q) && isSubseq(k, q)) take(60 + 30 * ql / kl, "部分符合");
        if (ql >= 2 && kpy.length > qpy.length && pyContains(kpy, qpy)) take(50 + 20 * ql / kl, "同音");
        if (kl >= 2 && qpy.length > kpy.length && pyContains(qpy, kpy)) take(45 + 20 * kl / ql, "同音");
        if (ql >= 2) {
          const sim = 1 - levenshtein(k, q) / Math.max(kl, ql);
          if (sim >= 0.5) take(52 * sim, "相似");
        }
      });
      for (const a of e.aliasKeys) if (a !== q && ql >= 2 && a.includes(q)) take(55, "別名");
      if (best && !(e.item.ppg > 0)) best -= 3; // 同分時優先有價格的品項
      return { score: best, how };
    }

    function match(name, memory) {
      const q = norm(name);
      if (!q) return { status: "none", candidates: [] };
      const qpy = pyOf(q);
      const memId = memory && memory[q];
      const scored = [];
      for (const e of entries) {
        let { score, how } = scoreEntry(e, q, qpy);
        if (memId && e.item.id === memId) { score = 101; how = "上次選擇"; }
        if (score >= 30) scored.push({ item: e.item, score: Math.round(score * 10) / 10, how });
      }
      scored.sort((a, b) => b.score - a.score || (b.item.ppg > 0) - (a.item.ppg > 0) || a.item.name.length - b.item.name.length);
      const candidates = scored.slice(0, 6);
      const top = candidates[0], second = candidates[1];
      let status = "none";
      if (top) {
        const gap = second ? top.score - second.score : 100;
        const userChosen = top.how === "別名" || top.how === "上次選擇";
        if ((userChosen && gap > 0) || (top.score >= 85 && gap >= 8) || (top.score >= 75 && gap >= 10) || (top.score >= 65 && gap >= 20)) status = "ok";
        else if (top.score >= 45) status = "check";
      }
      return { status, candidates };
    }

    function search(text, limit) {
      const q = norm(text);
      if (!q) return [];
      return match(q).candidates.slice(0, limit || 8);
    }

    return { match, search, norm, byId: (id) => (byId.get(id) || {}).item };
  }

  return { parse, preprocess, cnToNumber, createMatcher, norm };
});
