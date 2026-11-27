// 助言に乗る？乗らない？の問題を作る（ブラウザと node の両方で使う）。
// 1問＝その場で作る見くらべ（点の数・丸と三角・線の長さ）。①まず自分だけで答える → ②助言ロボの答えと自信（%）が出る → ③最後の答えを決める。
// 答えは作った点・線そのもので決まる（数・長さをくらべる）。助言ロボは架空。自信が低いときほど外れやすい（今日の5問・上級は5問中4問だけ当たる）。
// 考え方の出典は SRC（Parasuraman & Riley 1997・Bansal ほか 2021・Zhang ほか 2020・Vasconcelos ほか 2023）。
// 乱数 R は同じ tag なら、どの端末でも同じ点・同じ線・同じ助言になる（sort の比較の中では引かない）。
// TYPES・範囲・乱数を引く順番は、変えると過去の日の問題が変わる。公開したあとは変えず、変えるときは qa/run.mjs の PINS を作り直して PR に理由を書く。
(function (root) {
  "use strict";
  const LV = ["やさしい", "ふつう", "むずかしい"];

  // 出典（画面の「このゲームについて」と、1問ごとの説明に出す）
  const SRC = {
    pr: ["R. Parasuraman・V. Riley「Humans and Automation: Use, Misuse, Disuse, Abuse」Human Factors 39(2), 1997", "https://doi.org/10.1518/001872097778543886"],
    bansal: ["G. Bansal ほか「Does the Whole Exceed its Parts? The Effect of AI Explanations on Complementary Team Performance」CHI 2021", "https://arxiv.org/abs/2006.14779"],
    zhang: ["Y. Zhang・Q. V. Liao・R. K. E. Bellamy「Effect of Confidence and Explanation on Accuracy and Trust Calibration in AI-Assisted Decision Making」2020", "https://arxiv.org/abs/2001.02114"],
    vas: ["H. Vasconcelos ほか「Explanations Can Reduce Overreliance on AI Systems During Decision-Making」2023", "https://arxiv.org/abs/2212.06823"],
  };

  // 見くらべの種類。opts は答えの2つ（id と画面の名前）
  const TYPES = {
    dot: { name: "点の数", em: "⚫", q: "点が多いのは、どっちの箱？", opts: [["L", "左の箱"], ["R", "右の箱"]] },
    mix: { name: "丸と三角", em: "🔺", q: "多いのは、丸と三角のどっち？", opts: [["C", "● 丸"], ["T", "▲ 三角"]] },
    len: { name: "線の長さ", em: "📏", q: "長い線は、どっち？（はしの矢羽は長さに入れない）", opts: [["L", "左の線"], ["R", "右の線"]] },
  };
  // 難しさごとの「多い・長い」の比（小さいほど見分けにくい）と、助言ロボの自信（%）の範囲
  const RATIO = { cnt: [[1.25, 1.4], [1.12, 1.2], [1.05, 1.09]], len: [[1.12, 1.18], [1.06, 1.09], [1.03, 1.05]] };
  const CONF = [[88, 97], [74, 86], [56, 68]];
  // 助言ロボの当たり方：今日の5問・上級は5問中4問（8割）。練習・とことん・復習は、自信の%の確率で当たる
  const DAILY_OK = 4;

  // 1問の説明（答えのあとに出す）。100字以内
  const WHY = {
    dot0: "数のちがいが大きいと、ぱっと見でも分かります。こういう問題は、助言ロボも自信が高めです。",
    dot1: "多いほうの箱は、点を少し小さくしてあります。黒さの見た目ではなく、数でくらべます。",
    dot2: "多いほうの箱は、点を小さくしてあります。見た目の黒さは、少ないほうが濃く見えます。",
    mix0: "数のちがいが大きいと、ぱっと見でも分かります。",
    mix1: "丸と三角がまざると、数えにくくなります。補助線で区切ると数えやすくなります。",
    mix2: "ちがいは数個だけ。数えれば分かりますが、手間がかかります。手間と助言のどちらを使うかが分かれ目です。",
    len0: "長さのちがいが大きいと、向きがちがっても分かります。",
    len1: "線の向きがちがうと、長さはくらべにくくなります。",
    len2: "はしの矢羽で、長さの見え方が変わります（ミュラー・リヤー錯視）。矢じりの形（<—>）は短く、開いた形（>—<）は長く見えます。",
  };

  // part:ri:begin（shared-workflows の template/parts/data/ri.js の写し。ここでは直さない。node scripts/sync-template.mjs で写す）
  const ri = (R, a, b) => a + Math.floor(R() * (b - a + 1));
  // part:ri:end
  // part:shuffle:begin（shared-workflows の template/parts/data/shuffle.js の写し。ここでは直さない。node scripts/sync-template.mjs で写す）
  function shuffle(R, a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = ri(R, 0, i); [b[i], b[j]] = [b[j], b[i]]; } return b; }
  // part:shuffle:end
  // part:pickN:begin（shared-workflows の template/parts/data/pickN.js の写し。ここでは直さない。node scripts/sync-template.mjs で写す）
  function pickN(R, a, n) { return shuffle(R, a).slice(0, n); }
  // part:pickN:end
  // part:seedOf:begin（shared-workflows の template/parts/data/seedOf.js の写し。ここでは直さない。node scripts/sync-template.mjs で写す）
  function seedOf(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  // part:seedOf:end
  // part:rng:begin（shared-workflows の template/parts/data/rng.js の写し。ここでは直さない。node scripts/sync-template.mjs で写す）
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // part:rng:end

  // 種類＝見くらべ3つ×難しさ3つ（例 dot0・mix2・len1）
  const KINDS = [];
  for (let lv = 0; lv < 3; lv++) for (const t of Object.keys(TYPES)) KINDS.push({ id: t + lv, type: t, lv, name: `${TYPES[t].name}・${LV[lv]}`, em: TYPES[t].em });
  const BY = Object.fromEntries(KINDS.map((k) => [k.id, k]));
  const kindsOf = (lv) => KINDS.filter((k) => k.lv === lv).map((k) => k.id);

  const r2 = (x) => Math.round(x * 100) / 100;
  // 箱（w×h）の中に、重ならないように n 個の点を置く。ゆとり pad。うまく置けないときは間を少しずつつめる
  function place(R, n, rad, w, h) {
    const out = []; let gap = 1.8;
    for (let tries = 0; out.length < n; tries++) {
      if (tries > 0 && tries % 400 === 0) gap = Math.max(0.3, gap - 0.3);
      const x = r2(6 + R() * (w - 12)), y = r2(6 + R() * (h - 12));
      if (out.every((p) => Math.hypot(p[0] - x, p[1] - y) >= p[2] + rad + gap)) out.push([x, y, rad]);
    }
    return out;
  }
  // 数のちがいを作る：少ないほう a と多いほう b（b > a）
  function counts(R, lv, lo, hi) { const a = ri(R, lo, hi), [p, q] = RATIO.cnt[lv], r = p + R() * (q - p); return [a, Math.max(a + (lv === 2 ? 2 : 1), Math.round(a * r))]; }

  // 1問を作る。tag は「種類|種」か「種類|種|o（当たる）・x（外れる）」。同じ tag ならいつも同じ問題・同じ助言
  function make(tag) {
    const ps = String(tag).split("|"), kind = ps[0], k = Object.prototype.hasOwnProperty.call(BY, kind) ? BY[kind] : null;
    if (!k || ps.length < 2 || ps.length > 3 || (ps.length === 3 && ps[2] !== "o" && ps[2] !== "x")) return null;
    const R = rng(seedOf(ps[0] + "|" + ps[1])), lv = k.lv, T = TYPES[k.type];
    const P = { tag, kind, type: k.type, lv, name: k.name, em: k.em, q: T.q, opts: T.opts.map((o) => o[0]), labels: Object.fromEntries(T.opts), why: WHY[kind], src: ["pr", "bansal"].map((s) => SRC[s]) };
    if (k.type === "dot") {
      const [a, b] = counts(R, lv, 22, 40), more = R() < 0.5 ? "L" : "R", base = 2.4 + R() * 0.4;
      const radB = lv === 0 ? base : lv === 1 ? base * Math.sqrt(a / b) : base * (a / b) * 0.92; // 多いほうの点を小さく（ふつうは黒さをそろえ、むずかしいは少ないほうを濃く見せる）
      const nL = more === "L" ? b : a, nR = more === "L" ? a : b;
      P.box = { L: place(R, nL, r2(more === "L" ? radB : base), 100, 100), R: place(R, nR, r2(more === "R" ? radB : base), 100, 100) };
      P.ans = more; P.v = `${nL}-${nR}`;
    } else if (k.type === "mix") {
      const [a, b] = counts(R, lv, 16, 30), more = R() < 0.5 ? "C" : "T", nC = more === "C" ? b : a, nT = more === "C" ? a : b, rad = 2.7;
      const pts = place(R, nC + nT, rad, 180, 100), kinds = shuffle(R, Array(nC).fill("C").concat(Array(nT).fill("T")));
      P.box = { M: pts.map((p, i) => [p[0], p[1], p[2], kinds[i]]) };
      P.ans = more; P.v = `${nC}-${nT}`;
    } else {
      const s = 44 + R() * 20, [p, q] = RATIO.len[lv], l = s * (p + R() * (q - p)), more = R() < 0.5 ? "L" : "R";
      let aL = R() * 180, aR = R() * 180;
      const dA = Math.abs(aL - aR) % 180; // 線は向きが無いので 180° で一回り（170° と 10° は 20° しかちがわない。CodeRabbit #1）
      if (lv > 0 && Math.min(dA, 180 - dA) < 35) aR = (aR + 70) % 180; // 向きをちがえて、くらべにくくする
      if (lv === 0) aR = aL; // やさしいは同じ向き
      const seg = (len, deg) => { const t = (deg * Math.PI) / 180, dx = (Math.cos(t) * len) / 2, dy = (Math.sin(t) * len) / 2; return [r2(50 - dx), r2(50 - dy), r2(50 + dx), r2(50 + dy)]; };
      const lenL = more === "L" ? l : s, lenR = more === "L" ? s : l;
      P.lines = { L: seg(lenL, aL), R: seg(lenR, aR) };
      P.fins = lv === 2 ? { L: more === "L" ? "in" : "out", R: more === "R" ? "in" : "out" } : null; // 長いほうに「内向き（短く見える）」の矢羽
      P.ans = more; P.v = `${Math.round(lenL * 10)}-${Math.round(lenR * 10)}`;
    }
    // 助言ロボ：自信（%）と答え。自信の引き方は種類の乱数とは別（問題の形を変えずに当たり外れだけ決める）
    const RA = rng(seedOf(ps[0] + "|" + ps[1] + ":ai")), [c0, c1] = CONF[lv];
    P.conf = ri(RA, c0, c1);
    const roll = RA();
    P.aiOk = ps.length === 3 ? ps[2] === "o" : roll < P.conf / 100;
    P.ai = P.aiOk ? P.ans : P.opts.find((o) => o !== P.ans);
    return P;
  }
  const keyOf = (P) => `${P.kind}:${P.v}:${P.ans}`;

  // 2段目「この問のあなたは？」の4つ（最後の答えが助言と同じか × 助言が当たりか）。Parasuraman & Riley の misuse（頼りすぎ）・disuse（頼らなさすぎ）
  const GROUPS = {
    use: { name: "乗って当たり", sub: "当たった助言を使えた" },
    over: { name: "乗って外れ", sub: "頼りすぎ：外れた助言に合わせた" },
    self: { name: "乗らずに当たり", sub: "外れた助言を見ぬいた" },
    under: { name: "乗らずに外れ", sub: "頼らなさすぎ：当たった助言を捨てた" },
  };
  const grpOf = (P, fin) => (fin === P.ai ? (P.aiOk ? "use" : "over") : P.aiOk ? "under" : "self");

  // 5問の並び：見くらべ3つは必ず全部出す。難しさ lvs。助言ロボが外れる1問は、自信が低いほど選ばれやすい（重み 100−自信）
  function setOf(date, salt, lvs) {
    const R = rng(seedOf(salt + ":" + date)), t3 = Object.keys(TYPES), types = shuffle(R, t3.concat(pickN(R, t3, 2)));
    const base = types.map((t, i) => `${t}${lvs[i]}|${date}:${salt[0]}${i}`), w = base.map((t) => 100 - make(t).conf);
    let x = R() * w.reduce((a, b) => a + b, 0), bad = 0;
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) { bad = i; break; } }
    return base.map((t, i) => `${t}|${i === bad ? "x" : "o"}`);
  }
  const dailyTags = (date) => setOf(date, "day", [0, 1, 1, 2, 2]);
  const hardTags = (date) => setOf(date, "hard", [1, 1, 2, 2, 2]);

  const JGN = { KINDS, BY, TYPES, LV, SRC, RATIO, CONF, DAILY_OK, WHY, GROUPS, grpOf, kindsOf, seedOf, rng, make, keyOf, dailyTags, hardTags, pickN, shuffle };
  if (typeof module !== "undefined" && module.exports) module.exports = JGN; else root.JGN = JGN;
})(typeof self !== "undefined" ? self : this);
