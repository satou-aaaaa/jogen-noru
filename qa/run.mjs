// 助言に乗る？乗らない？の検査。問題の作り方（全種類×たくさんの種：答えを図の数・長さから別に数え直す・点が重ならず箱に入る・
// 比が難しさの範囲・助言ロボの自信と当たり方）・今日の5問と上級の組み方（3年分：5問中4問だけ助言が当たる）・とことんの並び・
// 通しで遊ぶ（①自分だけ→②助言→③最後の答え→2段目）・ヒント・続きから・上級・練習・とことん・見くらべ帳・実績・カレンダー・あとから・
// 文字の大きさ・言い方・スマホ幅・PWA・引き継ぎ・見やすさを確かめる。
// 使い方: node qa/run.mjs   失敗があれば終了コード 1。結果は qa-report/report.md。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkCore } from "./core-check.mjs";
import { checkTransfer } from "./transfer-check.mjs";
import { checkSwStall } from "./sw-check.mjs";
import { checkDepth } from "./depth-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) });
const firstClose = async (q) => { if (await q.locator("#howto[open]").count()) await q.click("#howto-ok"); if (await q.evaluate(() => !!(window.Core && Core.coach && Core.coach.active()))) { await q.evaluate(() => { Core.coach.leave(); scrollTo(0, 0); }); await q.waitForTimeout(100); } }; // はじめての練習の吹き出しをやめてホームへ（sync-template の migrateFirstQa が足した）
const G = createRequire(import.meta.url)(path.join(root, "data.js"));

const PINS = "dot0:30-22:88o,dot1:28-24:84o,len1:512-479:79o,len2:572-600:57o,mix2:21-23:61x,mix1:23-19:75o,len1:626-587:81o,dot2:38-40:58o,dot2:37-40:62x,mix2:25-27:64o;len0:590-687:96o,dot1:27-23:81o,mix1:26-31:82o,dot2:31-33:56o,len2:634-612:60x,mix1:29-24:82o,mix1:32-28:80o,dot2:28-26:61o,len2:623-647:65x,dot2:41-38:68o;mix0:23-31:93o,mix1:31-28:79x,dot1:30-35:83o,len2:485-508:65o,dot2:27-29:66o,dot1:39-34:77o,mix1:26-22:86x,len2:581-557:63o,dot2:33-35:56o,len2:623-601:62o"; // 過去の日の問題の印（変わったら過去の日の問題が変わっている。data.js を直したら作り直して PR に理由を書く）

const FIGPIN = "7e5c1596"; // 過去の日の図（点・線・矢羽）の印。PINS と同じく、data.js を直して変わったら作り直して PR に理由を書く

// ---- 1. 問題の作り方（ブラウザを使わない）----
// 答えはゲームとは別に、図そのもの（点の数・線の端の座標）から数え直す
const BOXW = { dot: 100, mix: 180 };
const lenOf = (s) => Math.hypot(s[2] - s[0], s[3] - s[1]);
function solveQ(P) {
  if (P.type === "dot") { const l = P.box.L.length, r = P.box.R.length; return { ans: l > r ? "L" : r > l ? "R" : null, a: Math.min(l, r), b: Math.max(l, r) }; }
  if (P.type === "mix") { const c = P.box.M.filter((p) => p[3] === "C").length, t = P.box.M.filter((p) => p[3] === "T").length; return { ans: c > t ? "C" : t > c ? "T" : null, a: Math.min(c, t), b: Math.max(c, t) }; }
  const l = lenOf(P.lines.L), r = lenOf(P.lines.R); return { ans: l > r ? "L" : r > l ? "R" : null, a: Math.min(l, r), b: Math.max(l, r) };
}
// 点が箱からはみ出さず、たがいに重ならない
function placedOk(pts, w) {
  for (let i = 0; i < pts.length; i++) { const [x, y, r] = pts[i]; if (x - r < 1 || x + r > w - 1 || y - r < 1 || y + r > 99) return false; for (let j = 0; j < i; j++) if (Math.hypot(pts[j][0] - x, pts[j][1] - y) < pts[j][2] + r) return false; }
  return true;
}
{
  const bad = {}, N = 400, keys = new Set();
  const CONFQ = [[88, 97], [74, 86], [56, 68]], CNT = [[1.25, 1.4], [1.12, 1.2], [1.05, 1.09]], LEN = [[1.12, 1.18], [1.06, 1.09], [1.03, 1.05]]; // 難しさの範囲（ゲームとは別に書く）
  for (const k of G.KINDS) {
    for (let s = 0; s < N; s++) {
      const tag = `${k.id}|qa${s}`, P = G.make(tag), why = [], q = solveQ(P);
      keys.add(G.keyOf(P));
      if (!q.ans || q.ans !== P.ans) why.push("答えが図の数・長さと合わない");
      if (P.type !== "len") {
        const boxes = P.type === "dot" ? [P.box.L, P.box.R] : [P.box.M];
        if (!boxes.every((b) => placedOk(b, BOXW[P.type]))) why.push("点が重なる・箱からはみ出す");
        const [lo, hi] = CNT[k.lv], r = q.b / q.a;
        if (!(q.b - q.a >= (k.lv === 2 ? 2 : 1) && (r <= hi + 0.05 || q.b - q.a <= 2) && (r >= lo - 0.03 || q.b - q.a <= 3))) why.push(`数の比が難しさの範囲でない ${q.a}-${q.b}`);
      } else {
        const [lo, hi] = LEN[k.lv], r = q.b / q.a;
        if (r < lo - 0.002 || r > hi + 0.002) why.push(`長さの比が難しさの範囲でない ${r.toFixed(3)}`);
        if ([...P.lines.L, ...P.lines.R].some((v) => v < 2 || v > 98)) why.push("線が箱からはみ出す");
        if (k.lv === 2) { const longer = P.ans; if (!P.fins || P.fins[longer] !== "in" || P.fins[longer === "L" ? "R" : "L"] !== "out") why.push("むずかしいの矢羽が、長い線に内向き・短い線に外向きでない"); }
        else if (P.fins) why.push("矢羽はむずかしいだけ");
      }
      const [c0, c1] = CONFQ[k.lv];
      if (!(P.conf >= c0 && P.conf <= c1)) why.push("自信が難しさの範囲でない");
      if (!P.opts.includes(P.ai) || (P.ai === P.ans) !== P.aiOk) why.push("助言ロボの答えと当たりが合わない");
      if (!P.src.length || P.src.some((x) => !Array.isArray(x) || !/^https:\/\/(arxiv\.org\/abs\/|doi\.org\/)/.test(x[1]))) why.push("出典が無い");
      if (JSON.stringify(G.make(tag)) !== JSON.stringify(P)) why.push("同じ種で同じにならない");
      { const o = G.make(tag + "|o"), x = G.make(tag + "|x"); if (!o.aiOk || o.ai !== P.ans || x.aiOk || x.ai === P.ans || JSON.stringify(o.box || o.lines) !== JSON.stringify(P.box || P.lines)) why.push("当たり・外れの印で図が変わる・印どおりにならない"); }
      if (why.length && !bad[k.id]) bad[k.id] = why.join("・") + "：" + tag;
    }
  }
  check(`問題：${G.KINDS.length}種類×${N}の種で、答えを図の数・長さから数え直して合う・点が重ならず箱に入る・比と自信が難しさの範囲・助言ロボの答えと当たりが合う・出典がある`, Object.keys(bad).length === 0, JSON.stringify(bad));
  check("問題：種類は9（点の数・丸と三角・線の長さ×難しさ3）", G.KINDS.length === 9 && [0, 1, 2].map((l) => G.kindsOf(l).length).join() === "3,3,3");
  check("問題は300種類以上（game-dev.md F6）", keys.size >= 300, keys.size);
  check("作れない鍵（無い種類・constructor・種が無い）は null", [G.make("constructor|1"), G.make("nai|1"), G.make("dot0")].every((x) => x === null));
  // 種に | が入っても作れる（終わりの o・x だけが当たり外れの印。shared-workflows game-props の CI で "mix2|x|y" が作れず落ちた）
  check("種に | が入っても問題が作れ、終わりの o・x だけを当たり外れの印とみる", ["mix2|x|y", "dot0|1|z", "len1|a|b|c"].every((t) => { const P = G.make(t); return P && P.ans && JSON.stringify(P) === JSON.stringify(G.make(t)); }) && G.make("dot1|a|b|o").aiOk === true && G.make("dot1|a|b|x").aiOk === false && JSON.stringify(G.make("dot1|a|b|o").box) === JSON.stringify(G.make("dot1|a|b").box));
  // 練習・とことんの助言ロボは、自信の%くらいの割合で当たる（難しさごとに3000問ずつ）
  const cal = [0, 1, 2].map((lv) => { let n = 0, ok = 0, c = 0; for (const id of G.kindsOf(lv)) for (let s = 0; s < 1000; s++) { const P = G.make(`${id}|cal${s}`); n++; ok += P.aiOk ? 1 : 0; c += P.conf / 100; } return [ok / n, c / n]; });
  check("練習の助言ロボは、自信の%どおりに当たる（難しさごとに差 2%以内）・自信が低いほど外れやすい", cal.every(([a, c]) => Math.abs(a - c) < 0.02) && cal[0][0] > cal[1][0] && cal[1][0] > cal[2][0], cal.map((x) => x.map((v) => v.toFixed(3)).join("/")).join(" "));
  // 2段目の答え：最後の答えが助言と同じか × 助言が当たりか（ゲームとは別に書いた表）
  const T = { "1,1": "use", "1,0": "over", "0,0": "self", "0,1": "under" }; let g2 = true;
  for (const k of G.KINDS) for (let s = 0; s < 20; s++) { const P = G.make(`${k.id}|g${s}`); for (const f of P.opts) if (G.grpOf(P, f) !== T[`${f === P.ai ? 1 : 0},${P.aiOk ? 1 : 0}`]) g2 = false; }
  check("2段目「この問のあなたは？」の答えは、助言と同じか×助言が当たりかの4つ（乗って当たり・乗って外れ・乗らずに当たり・乗らずに外れ）", g2 && Object.keys(G.GROUPS).join() === "use,over,self,under");
  const longWhy = Object.entries(G.WHY).filter(([, v]) => [...v].length > 100).map(([k]) => k);
  check("説明は100字以内・全部の種類にある（やさしい日本語。一文を短く）", !longWhy.length && G.KINDS.every((k) => G.WHY[k.id]), longWhy.join(","));
}
{
  // 今日の5問・上級の組み方（3年分）
  const bad = [], cover = new Set(); let wrongLow = 0, wrongAll = 0, sameAsPrev = 0, prev = "";
  const d0 = Date.parse("2026-11-27");
  for (let i = 0; i < 365 * 3; i++) {
    const d = new Date(d0 + i * 864e5).toISOString().slice(0, 10);
    for (const [name, list, lvs] of [["今日", G.dailyTags(d), "0,1,1,2,2"], ["上級", G.hardTags(d), "1,1,2,2,2"]]) {
      const Ps = list.map((t) => G.make(t)), types = new Set(Ps.map((P) => P.type));
      if (Ps.length !== 5 || Ps.some((P) => !P) || Ps.map((P) => P.lv).join() !== lvs || types.size !== 3) { bad.push(d + " " + name); continue; }
      if (Ps.filter((P) => P.aiOk).length !== 4 || list.filter((t) => t.endsWith("|o")).length !== 4) bad.push(d + " " + name + " 当たりが4問でない");
      const w = Ps.find((P) => !P.aiOk); wrongAll++; if (w.conf < 70) wrongLow++;
      if (name === "今日") { const body = Ps.map((P) => JSON.stringify([P.kind, P.box, P.lines, P.fins, P.ai, P.conf])).join(); if (body === prev) sameAsPrev++; prev = body; } // タグには日付が入るので、出た図・助言そのものでくらべる（CodeRabbit #1）
      if (i < 60) Ps.forEach((P) => cover.add(P.kind));
    }
    if (JSON.stringify(G.dailyTags(d)) !== JSON.stringify(G.dailyTags(d))) bad.push(d + " 同じにならない");
  }
  check("今日の5問（やさしい1・ふつう2・むずかしい2）と上級（ふつう2・むずかしい3）を3年分作れる・3つの見くらべが必ず入る・助言ロボは5問中4問だけ当たる", bad.length === 0, bad.slice(0, 5).join(","));
  check("外れる1問は、自信の低い問題（70%未満）が半分より多い（自信が低いときに外れやすい）", wrongLow / wrongAll > 0.5, `${wrongLow}/${wrongAll}`);
  check("2か月のうちに9種類が全部出る・前の日と同じ組の日が無い", cover.size === 9 && sameAsPrev === 0, `${cover.size}種類・前の日と同じ ${sameAsPrev}日`);
  // 過去の日の問題が変わらない（data.js を直したときの見張り）
  const snap = ["2026-11-27", "2026-11-28", "2027-01-01"].map((d) => [...G.dailyTags(d), ...G.hardTags(d)].map((t) => { const P = G.make(t); return `${P.kind}:${P.v}:${P.conf}${P.aiOk ? "o" : "x"}`; }).join(",")).join(";");
  check("過去の日（2026-11-27・11-28・2027-01-01）の5問と上級5問が作ったときのまま（種類・範囲・乱数の順を変えると変わる）", snap === PINS, snap);
  // 数・長さが同じでも、点の位置や線の向きが変われば図は変わる。図そのもの（点・線の端・矢羽）も印でくらべる（CodeRabbit #1）
  const fig = ["2026-11-27", "2026-11-28", "2027-01-01"].flatMap((d) => [...G.dailyTags(d), ...G.hardTags(d)]).map((t) => { const P = G.make(t); return JSON.stringify([P.box || null, P.lines || null, P.fins || null]); }).join(";");
  let hf = 2166136261; for (let i = 0; i < fig.length; i++) { hf ^= fig.charCodeAt(i); hf = Math.imul(hf, 16777619) >>> 0; }
  check("過去の日の図そのもの（点の位置・線の端・矢羽）も作ったときのまま", hf.toString(16) === FIGPIN, hf.toString(16));
}

// ---- 2. ファイルの中身 ----
const html = readFileSync(path.join(root, "index.html"), "utf8"), gen = readFileSync(path.join(root, "data.js"), "utf8"), readme = readFileSync(path.join(root, "README.md"), "utf8");
const own = html.replace(/<!-- (a11y|store|core|kiroku):begin[\s\S]*?\1:end -->/g, ""); // ひな形の写しを除いた、このゲームの所
const ext = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https:\/\/fonts\.googleapis\.com(\/|$)|^https:\/\/ko-fi\.com\/satouaaaaa$/.test(u));
check("外から読むのは文字（Google Fonts）だけ。スクリプト・広告・解析を入れない（出典のリンクは押したときに開くだけ）", ext.length === 0 && ![...html.matchAll(/<script[^>]+src="([^"]+)"/g)].some((m) => /^https?:/.test(m[1])), ext.join(","));
check("CSP で通信先を自分だけにしている", /connect-src 'self'/.test(html) && !/connect-src[^;"]*https/.test(html));
check("Math.random は練習・とことんの種だけ（今日の5問・上級は日付の乱数。data.js には無い）", (own.match(/Math\.random/g) || []).length === 2 && !/Math\.random/.test(gen));
check("乱数は sort の比較の中で引かない（ブラウザで引く回数が変わる）", !/\.sort\(\s*\([^)]*\)\s*=>[^\n;]*\b(R|rng|rand|Math\.random)\s*\(/.test(html + gen));
{ const inl = html.split("<script>").slice(1).map((x) => x.split("</" + "script>")[0]).join("\n"); // index.html の中の script も見る（nemuri-kotsu#1 で行の途中に // を入れて画面が動かなくなった）
  check("一行の式の途中にコメント // を足さない（行の残りが消える。rosen-hitofude 2026-11-04・nemuri-kotsu#1）", !/;\s*\/\/[^\n]*;\s*\w/.test((gen + "\n" + inl).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"))); }
check("言い方：「絶対」「必ず当たる」と言い切らない", !/絶対|必ず当た|100%当た/.test(own + gen + readme));
{ const howto = (html.match(/<dialog id="howto"[\s\S]*?<\/dialog>/) || [""])[0], ab = (html.match(/function about\(\)[\s\S]*?\n}/) || [""])[0], dis = (t) => /架空/.test(t) && /実在の AI 製品/.test(t);
  check("言い方：遊び方・「このゲームについて」・README のどれにも、助言ロボが架空で実在の AI 製品と関係ないことがある", dis(howto) && dis(ab) && dis(readme), `遊び方 ${dis(howto)}・について ${dis(ab)}・README ${dis(readme)}`); }
check("実在の AI 製品・会社の名前を出さない", !/ChatGPT|OpenAI|Gemini|Copilot|Claude|Anthropic|Bard|Siri|Alexa|GPT-\d/i.test((own + gen + readme).replace(/<meta name="claude:[^>]*>/g, "")));
check("写し元（屋台の値下げ合戦）の言葉が残っていない（game-dev.md A 手順5）", !/屋台|値下げ|性格帳|囚人|Axelrod|アクセルロッド|お返し屋|ytn|yatai|かけひき|縁日|\d軒/.test(own + gen + readme));
check("画面にお笑いの言葉を入れない（本物っぽく）", !/お笑い|ギャグ|ツッコミ|なんでやねん|（うそ）/.test(html + gen));
{ const ab = (html.match(/function about\(\)[\s\S]*?\n}/) || [""])[0];
  check("このゲームについて：出典の行（Parasuraman & Riley 1997・Bansal ほか 2021 ほか）があり、研究の解釈が分かれる所は言い切らない", /G\.SRC/.test(ab) && Object.keys(G.SRC).length >= 4 && /Parasuraman/.test(G.SRC.pr[0]) && /1997/.test(G.SRC.pr[0]) && /10\.1518\/001872097778543886/.test(G.SRC.pr[1]) && /Bansal/.test(G.SRC.bansal[0]) && /2006\.14779/.test(G.SRC.bansal[1]) && /解釈は分かれ|解釈が分かれ/.test(ab)); }
check("引き継ぎ：transfer.js をゲームの script より前に、このゲームの記録のキー（記録・文字・復習）だけで読む・depth.js も前に読む", /<script src="transfer\.js" data-game="jogen-noru" data-keys="jgn-v1,jgn-fs,jgn-depth"><\/script>\s*<script src="depth\.js" data-game="jogen-noru" data-key="jgn-depth"><\/script>\s*<\/head>/.test(html) && html.indexOf('src="transfer.js"') < html.indexOf('src="data.js"') && /data-hk/.test(html) && existsSync(path.join(root, "transfer.js")));
check("好きなだけ遊べる：チケット・回数の上限・🔒で開くモードを入れない（game-dev.md F1・F2）", !/🎫|チケット|すると開く|🔒/.test(own) && !/\blife\b|ELIFE/.test(own));
check("時間制限を入れない（タイマーで答えを締め切らない）", !/制限時間|残り時間|setInterval/.test(own + gen));
{ const og = (k) => (html.match(new RegExp(`<meta (?:property|name)="${k}" content="([^"]+)"`)) || [])[1] || "";
  const png = readFileSync(path.join(root, "og.png"));
  check("SNS で貼ると絵と題が出る（OGP・1200×630・絶対URL）", og("og:title") && og("og:description") && og("og:image") === "https://satou-aaaaa.github.io/jogen-noru/og.png" && og("twitter:card") === "summary_large_image" && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630); }
{ const fy = readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/feedback.yml"), "utf8");
  check("感想フォームの name が3字以上（2字だとフォームが出ない。shared-workflows incidents/2026-11-05-feedback-form-not-shown.md）", [...((fy.match(/^name:\s*(.+)$/m) || [])[1] || "").trim()].length >= 3);
  check("感想フォームは名前・メールを聞かない", /id: fun/.test(fy) && !/id: (name|email|mail)/.test(fy) && /labels: \["感想"\]/.test(fy)); }
check("README の URL のすぐ後ろに全角の字を続けない（Link check が URL の一部と読む）", !/https?:\/\/[\x21-\x7e]*[^\x00-\x7f]/.test(readme.replace(/\]\(https?:\/\/[^)\s]+\)/g, "").replace(/<https?:\/\/[^>\s]+>/g, "")));
{ const sw = readFileSync(path.join(root, "sw.js"), "utf8"), mf = JSON.parse(readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  const shell = JSON.parse(sw.match(/SHELL = (\[[^\]]+\])/)[1]);
  check("PWA：sw.js は画面のファイルを全部保存し（引き継ぎの transfer.js・深さの depth.js も）、取り直して保存し、外へ何も送らない", ["./index.html", "./data.js", "./transfer.js", "./depth.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"].every((f) => shell.includes(f)) && /cache: "reload"/.test(sw) && !/https?:\/\//.test(sw.replace(/^\/\/.*$/gm, "")));
  { const st = await checkSwStall(sw); check("PWA：通信が止まっても4秒ほどで保存した画面に切り替わり、少しずつ届く受信は待ち、何も無ければ60秒で返す（shared-workflows template/qa/sw-check.mjs）", st.ok, JSON.stringify(st)); }
  check("PWA：manifest にアイコン2つと名前がある", mf.name === "助言に乗る？乗らない？" && mf.icons.length >= 2 && mf.start_url === "./"); }

// ---- 3. ブラウザで遊ぶ ----
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname), f = path.join(root, p === "/" ? "index.html" : p);
  if ((f !== root && !f.startsWith(root + path.sep)) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
async function newPage(w = 390, ctx) {
  const c = ctx || await browser.newContext({ viewport: { width: w, height: 800 } });
  await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
  await p.goto(url); await p.waitForTimeout(200);
  return p;
}
const closeHow = async (p) => { await firstClose(p); };
const mem = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("jgn-v1") || "{}"));
// 答え・ちがう答え（2つのうちの答えでないほう）
const optOf = (p, ok) => p.evaluate((ok) => { const P = __nm.cur().P; return ok ? P.ans : P.opts.find((o) => o !== P.ans); }, ok);
const stepNow = (p) => p.evaluate(() => __nm.cur() && __nm.cur().step);
const step1 = async (p, ok = true) => p.click(`#choices .ch[data-o="${await optOf(p, ok)}"]`);
const step2 = async (p, ok = true) => p.click(`#final .ch[data-o="${await optOf(p, ok)}"]`);
const grpNow = (p) => p.evaluate(() => { const c = __nm.cur(); return __nm.G.grpOf(c.P, c.a2); });
const wrongGrp = (p) => p.evaluate(() => { const c = __nm.cur(), r = __nm.G.grpOf(c.P, c.a2); return Object.keys(__nm.G.GROUPS).find((x) => x !== r && !c.w2.includes(x)); });
const why = async (p) => { await p.waitForSelector(".verdict, .why button"); if (await p.locator(".verdict").count()) return; await p.click(`.why button[data-g="${await grpNow(p)}"]`); };
async function solve(p, { self = true, fin = true, w2 = 0 } = {}) {
  if (await stepNow(p) === 1) await step1(p, self);
  if (await stepNow(p) === 2) await step2(p, fin);
  for (let i = 0; i < w2; i++) await p.click(`.why button[data-g="${await wrongGrp(p)}"]`);
  await why(p);
  await p.waitForSelector(".verdict");
}

try {
  // はじめて：遊び方が出る・文字の大きさ
  const p = await newPage();
  check("はじめて開くと遊び方が出る", await p.locator("#core-coach").waitFor({ timeout: 3000 }).then(() => true, () => false));
  { const c = await browser.newContext(); const r = await c.newPage(); await r.goto(url); await r.waitForTimeout(200); let again = 0;
    for (let i = 0; i < 10; i++) { await r.evaluate(() => localStorage.clear()); await r.reload(); await r.waitForTimeout(200); await r.keyboard.press("Escape"); await r.reload(); await r.waitForTimeout(200); again += await r.locator("#howto[open]").count(); }
    check("遊び方を Esc で閉じてすぐ読み直しても出ない（10回）", again === 0);
  { const c = await browser.newContext(); const r = await c.newPage(); const big = []; // 題が h1{flex:1} で縦に伸び（伸びない形と比べて4pxより高ければ失敗）、iPad の縦で大きなすき間が出た（shared-workflows incidents/2026-11-07-title-stretched.md）
    for (const [w, h] of [[820, 1180], [390, 844], [1280, 800]]) { await r.setViewportSize({ width: w, height: h }); await r.goto(url); await r.waitForTimeout(200); await r.keyboard.press("Escape"); await r.waitForTimeout(100);
      const v = await r.evaluate(() => { const e = [...document.querySelectorAll(".title")].find((x) => x.offsetParent); if (!e) return null; const h = e.getBoundingClientRect().height; const f = e.style.flex; e.style.flex = "none"; const n = e.getBoundingClientRect().height; e.style.flex = f; return h - n; });
      if (v === null || v > 4) big.push(`${w}x${h}:${v === null ? "題なし" : "+" + Math.round(v) + "px"}`); }
    check("ホームの題は縦長の画面でも縦に伸びない（820×1180・390×844・1280×800）", big.length === 0, big.join(" ")); await c.close(); }
    await r.evaluate(() => localStorage.clear()); await r.reload(); await r.waitForTimeout(200);
    check("はじめての練習が始まったその場で「見た」が残る", await r.evaluate(() => { return Object.keys(localStorage).some((k) => { try { return JSON.parse(localStorage.getItem(k)).tut === true; } catch { return false; } }); })); await firstClose(r);
    await r.reload(); await r.waitForTimeout(200); check("遊び方を「わかった」で閉じてすぐ読み直しても出ない（その場で残す）", await r.locator("#howto[open]").count() === 0); await c.close(); }
  await firstClose(p);
  check("文字の大きさ：はじめは「大きい」（19px）", await p.evaluate(() => getComputedStyle(document.documentElement).fontSize) === "19px");
  await p.click('.fsrow button[data-fs="3"]');
  await p.reload(); await p.waitForTimeout(150);
  check("文字の大きさ：「とても大きい」にすると開き直しても残る", await p.evaluate(() => getComputedStyle(document.documentElement).fontSize) === "23px" && await p.locator('.fsrow button[data-fs="3"][aria-pressed="true"]').count() === 1);
  await p.click('.fsrow button[data-fs="2"]');
  check("ホームに今日のきほんが出る", (await p.textContent("#tip")).includes("今日のきほん"));

  // 今日の5問：1問目は最後の答えを外し2段目も1回まちがえる、2問目は補助線のヒント、ほかはそのまま
  await p.click("#go-d");
  const tags = await p.evaluate(() => __nm.load().runs.d.list);
  check("今日の5問は日付から決まる（data.js の dailyTags と同じ）", JSON.stringify(tags) === JSON.stringify(G.dailyTags(TODAY)));
  check("①の画面：図（SVG）・問い・押せる答え2つ（高さ56px以上）・助言はまだ出ない", await p.locator("#card svg.fig").count() === 1 && await p.locator("#choices .ch").count() === 2 && (await p.$$eval("#choices .ch", (b) => b.map((x) => x.getBoundingClientRect().height))).every((h) => h >= 56) && await p.locator("#robo").count() === 0 && (await p.textContent("#card .sit")).length > 5);
  check("図には読み上げ用の名前がある（role=img）", (await p.getAttribute("svg.fig", "role")) === "img" && ((await p.getAttribute("svg.fig", "aria-label")) || "").length > 5);
  await step1(p, false);
  check("②の画面：自分の答えと、助言ロボの答え・自信（%の数字とメーター）・助言に乗る／乗らないの2つ", await p.locator("#robo").count() === 1 && /自信 \d+%/.test(await p.textContent("#robo")) && await p.locator("#robo .meter").count() === 1 && await p.locator("#final .ch").count() === 2 && (await p.textContent("#final")).includes("助言に乗る") && (await p.textContent("#final")).includes("助言に乗らない") && (await p.textContent("#mine")).includes("あなた"));
  check("②の「🔊 読む」は、助言ロボの答えと自信の数字も読む（CodeRabbit #1）", await p.evaluate(() => { const c = __nm.cur(), r = document.querySelector("#robo[data-a11y-say]"); return !!r && (r.getAttribute("aria-label") || "").includes(`自信 ${c.P.conf}%`) && (r.getAttribute("aria-label") || "").includes(c.P.labels[c.P.ai]); }));
  check("②では、自分だけの答えが当たりかをまだ見せない", !/当たり|外れ/.test(await p.textContent("#card")) && (await p.textContent("#msg")) === "");
  check("「助言に乗る」は助言ロボの答えのほうに付く", await p.evaluate(() => { const c = __nm.cur(); return document.querySelector(`#final .ch[data-o="${c.P.ai}"]`).textContent.includes("助言に乗る"); }));
  await p.reload(); await p.waitForTimeout(150); await p.click("#go-d");
  check("②の途中で閉じても、同じ問題の②から続く（自分の答えはそのまま）", await p.locator("#robo").count() === 1 && await p.evaluate(() => __nm.cur().i === 0 && !!__nm.cur().a1));
  await step2(p, false);
  check("③：最後の答えが外れなら ✕ と正解・自分だけと助言ロボの当たり外れ（文字でも）・2段目の4つ", /✕/.test(await p.textContent("#msg")) && (await p.textContent("#msg")).includes("正解") && await p.getAttribute("#msg", "role") === "status" && /(当たり|外れ)/.test(await p.textContent("#mine")) && await p.locator(".why button").count() === 4);
  await p.click(`.why button[data-g="${await wrongGrp(p)}"]`);
  check("2段目でまちがえると ✕ の印と「ちがう」の文字（色だけで分けない）", await p.locator(".why button.ng").count() === 1 && (await p.evaluate(() => getComputedStyle(document.querySelector(".why button.ng"), "::after").content)).includes("ちがう") && /✕/.test(await p.textContent("#msg")));
  await p.reload(); await p.waitForTimeout(150); await p.click("#go-d");
  check("③の途中で閉じても続きから（2段目のまちがいの印のまま）", await p.locator(".why button.ng").count() === 1 && await p.evaluate(() => __nm.cur().i) === 0);
  await why(p); await p.waitForSelector(".verdict");
  check("答え合わせ：外れ・図の数（長さ）・3つの答え・この問のあなた・説明・出典のリンク・★1（外れ1＋2段目のまちがい1）", /外れ/.test(await p.textContent(".verdict .hd")) && (await p.textContent("#cnt")).length > 3 && (await p.textContent(".verdict .cmp")).includes("最後") && (await p.textContent(".verdict")).includes("この問のあなた") && (await p.textContent(".verdict .why")).length > 15 && await p.locator(".verdict .src a").count() >= 2 && (await p.getAttribute(".verdict .stars", "aria-label")) === "星1つ");
  await p.click("#next");
  check("次の問題へ進むと、フォーカスが問題（#card）に移る", await p.evaluate(() => document.activeElement && document.activeElement.id) === "card");
  await p.click("#hint");
  check("ヒントは補助線（区切りの線・目もり）を出す（答えは言わない）・1回まで", (await p.locator("svg.fig .gd").count()) + (await p.locator("svg.fig .tk").count()) > 0 && (await p.textContent("#hintbox")).includes("💡") && await p.locator("#hint:disabled").count() === 1);
  await p.reload(); await p.waitForTimeout(150); await p.click("#go-d");
  check("補助線は、閉じて開き直しても出たまま", (await p.locator("svg.fig .gd").count()) + (await p.locator("svg.fig .tk").count()) > 0);
  await solve(p);
  check("ヒント1回は★2", (await p.getAttribute(".verdict .stars", "aria-label")) === "星2つ");
  await p.click("#next");
  for (let i = 2; i < 5; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  const s1 = await mem(p);
  check("5問で結果：今日の記録に1問ごとのまちがい（2・1・0・0・0）と、自分だけ・助言・最後の当たり（0か1）", JSON.stringify(s1.days[TODAY]?.m) === "[2,1,0,0,0]" && ["s", "a", "f", "g"].every((k) => s1.days[TODAY][k].length === 5) && s1.days[TODAY].f.join() === "0,1,1,1,1" && s1.days[TODAY].a.reduce((a, b) => a + b) === 4);
  check("結果に、自分だけ・助言ロボだけ・最後の3つの正答率と、頼りすぎ・頼らなさすぎの回数", await p.locator("#team .tb").count() === 3 && (await p.textContent("#team")).includes("自分だけ") && (await p.textContent("#team")).includes("助言ロボだけ") && /頼りすぎ \d+回・頼らなさすぎ \d+回/.test(await p.textContent("#rely")) && /この回のあなたは (頼りすぎ|頼らなさすぎ|うまく使えた|頼りすぎと頼らなさすぎの両方)/.test(await p.textContent("#rely")));
  { const d = s1.days[TODAY]; let over = 0, under = 0; for (let j = 0; j < 5; j++) { if (d.g[j] && !d.a[j]) over++; if (!d.g[j] && d.a[j]) under++; }
    check("頼りすぎ（外れた助言と同じ最後の答え）・頼らなさすぎ（当たった助言とちがう最後の答え）の数が記録と合う", (await p.textContent("#rely")).includes(`頼りすぎ ${over}回・頼らなさすぎ ${under}回`), await p.textContent("#rely")); }
  const share = await p.textContent(".share");
  check("シェアの文に答え・問題を出さない（印と正答率だけ）", /第\d+回/.test(share) && /🟢/.test(share) && /自分だけ \d\/5/.test(share) && !/左の箱|右の箱|丸|三角|線/.test(share), share);
  check("まちがいのある日は Ko-fi の一言を出さない", await p.locator(".kofi").count() === 0);
  check("結果に「あと少しの実績」と、続けて遊ぶ・上級のボタン", await p.locator("#achnext").count() === 1 && await p.locator("#go-e").count() === 1 && await p.locator("#go-h").count() === 1);
  check("見くらべ帳に答えた種類が載る・これまでの数が増える", Object.values(s1.dex).reduce((a, b) => a + b) === 5 && s1.tot.n === 5 && s1.cb.h[0] + s1.cb.m[0] + s1.cb.l[0] === 5);
  await p.click("#back");
  check("今日を終えたら、ホームは「今日の結果を見る」と上級", (await p.textContent("#go-d")).includes("結果") && await p.locator("#go-h").count() === 1);
  // 上級：ヒントなし・5問
  await p.click("#go-h");
  check("上級はヒントのボタンが無い・5問", await p.locator("#hint").count() === 0 && (await p.evaluate(() => __nm.load().runs.h.list.length)) === 5);
  for (let i = 0; i < 5; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  check("上級の記録は hdays に入る", (await mem(p)).hdays[TODAY]?.m.length === 5);
  // 練習：記録を増やさない
  await p.click("#back"); await p.click("#go-p"); await p.click('.lv button[data-t="2"]');
  const before = await mem(p);
  for (let i = 0; i < 5; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  const after = await mem(p);
  check("練習は今日の記録を増やさない（見くらべ帳の数はふえる）", JSON.stringify(after.days) === JSON.stringify(before.days) && Object.values(after.dex).reduce((a, b) => a + b) === Object.values(before.dex).reduce((a, b) => a + b) + 5);
  check("練習の結果にも3つの正答率", await p.locator("#team .tb").count() === 3);
  // 見くらべ帳：助言ロボの自信ごとの表・種類を押すと、その種類だけで練習
  await p.click("#back"); await p.click("#go-dex");
  // ブラウザの「戻る」「進む」で、URL と画面が合う（CodeRabbit #1：進むで #book のままホームが出た）
  await p.goBack(); await p.waitForTimeout(150); await p.goForward(); await p.waitForTimeout(150);
  check("「戻る」のあと「進む」で、見くらべ帳が出る（URL も #book）", await p.locator("#cbt").count() === 1 && new URL(p.url()).hash === "#book", p.url());
  check("見くらべ帳に、助言ロボの自信ごとの表（高い・ふつう・低い）と、これまでの3つの正答率", await p.locator("#cbt tr").count() === 4 && await p.locator("#team .tb").count() === 3);
  const firstKind = await p.getAttribute(".book button", "data-k");
  await p.click(".book button");
  check("見くらべ帳の種類を押すと、その種類だけで練習", (await p.evaluate(() => __nm.load().runs.p.list)).every((t) => t.startsWith(firstKind + "|")));
  // とことん：まちがえてもヒントを使っても続き、「ここで降りる」で終わる（game-dev.md F1）
  await p.click("#back"); await p.click("#go-e");
  check("とことんは60問の並びから・ライフ（🌸・🎫）が無い", (await p.evaluate(() => __nm.load().runs.e.list.length)) === 60 && !("life" in await p.evaluate(() => __nm.load().runs.e)) && await p.locator("#quit").count() === 1);
  await solve(p); await p.click("#next"); await solve(p); await p.click("#next");
  await solve(p, { fin: false }); await p.click("#next");
  await p.click("#hint"); await solve(p, { w2: 1 }); await p.click("#next");
  check("とことんは外れ・ヒント・まちがいでも終わらない", await p.locator("#card").count() === 1 && await p.evaluate(() => __nm.load().runs.e.res.length) === 4);
  await p.reload(); await p.waitForTimeout(200);
  check("とことんは閉じても続きから", (await p.textContent("#go-e")).includes("続きから"));
  await p.click("#go-e");
  {
    // 別のタブでこの回を終えて新しい回を始めていたら、古い画面の「ここで降りる」は新しい回を終えない（funka-level #1 の CodeRabbit）
    const keep0 = await p.evaluate(() => __nm.load().runs.e);
    await p.evaluate(() => __nm.save((s) => { s.runs.e = Object.assign({}, s.runs.e, { id: "other-tab-run", res: [] }); }));
    await p.click("#quit"); await p.waitForTimeout(150);
    check("古い画面の「ここで降りる」は、別のタブで始めた新しい回を終えない", (await p.evaluate(() => __nm.load().runs.e && __nm.load().runs.e.id)) === "other-tab-run");
    await p.evaluate((r) => __nm.save((s) => { s.runs.e = r; }), keep0);
    await p.evaluate(() => __nm.play("e"));
  }
  await p.click("#quit"); await p.waitForTimeout(150);
  check("「ここで降りる」で終わり、まちがいなしの数（2問）が自己ベストに残る・3つの正答率も出る", (await mem(p)).ebest === 2 && (await p.textContent("#eres")).includes("4問") && !("e" in (await mem(p)).runs && (await mem(p)).runs.e) && await p.locator("#team .tb").count() === 3);
  {
    // とことんの並びを何百回作って、1回の中で同じ問題が無い・続けて同じ種類が無い・足しても重ならない
    const r = await p.evaluate(() => { const K = __nm.G, bad = []; for (let n = 0; n < 300; n++) { const l = __nm.endlessList(), more = l.concat(__nm.moreList(l)); const ks = more.map((t) => K.keyOf(K.make(t))); if (new Set(ks).size !== ks.length) bad.push("重なり"); if (more.some((t, i) => i && t.split("|")[0] === more[i - 1].split("|")[0])) bad.push("同じ種類が続く"); if (l.length !== 60 || more.length !== 100) bad.push("数" + l.length + "/" + more.length); } return bad; });
    check("とことんの並び300回：60問＋足した40問で同じ問題も同じ種類の連続も無い（game-dev.md F6）", r.length === 0, r.slice(0, 3).join(","));
  }
  {
    // 引き継ぎコードなどで数の所に文字が入っても、画面に HTML として出さない（2026-11-05 CodeRabbit）
    const q = await newPage(); await closeHow(q);
    await q.evaluate(() => { const s = JSON.parse(localStorage.getItem("jgn-v1")) || { v: 1 }; s.ebest = '<img id="xss" src=x>'; s.dex = { e: '"><b id="xss2">' }; s.tot = { n: '<i id="xss4">' }; s.cb = { h: ["<b id=xss5>", 1, 1] }; s.runs = { e: { mode: "e", id: '"><i id="xss3">', date: "2026-11-07", list: ["dot1|1"], res: [] }, h: { list: "bad", res: [] }, p: { mode: "p", id: "y", date: "2026-11-07", list: ["constructor|1"], res: [] }, d: { mode: "d", id: "z", date: "x", list: ["dot1|1"], res: [] }, "a:2026-11-06": { mode: "a", id: "a1", date: "2026-11-06", list: ["dot1|1"], res: [null] }, "a:2026-11-05": { mode: "a", id: "a2", date: "2026-11-05", list: "bad", res: [] }, "a:2026-11-04": { mode: "a", id: "a3", date: "2026-11-04", list: ["dot1|1", "dot1|2"], res: [{ m: 0 }], cur: "x" } }; s.days = { "2026-11-07": { m: "x" }, bad: { m: [0] }, "2026-02-30": { m: [0] } }; localStorage.setItem("jgn-v1", JSON.stringify(s)); });
    await q.reload(); await q.waitForTimeout(250);
    const st = await q.evaluate(() => __nm.load());
    check("記録の形を直す：数の所の文字は0に・形のちがう途中経過と日ごとの記録は捨てる", st.ebest === 0 && st.dex.e === 0 && st.tot.n === 0 && st.cb.h[0] === 0 && st.runs.e && !("h" in st.runs) && !("p" in st.runs) && !("d" in st.runs) && !("a:2026-11-06" in st.runs) && !("a:2026-11-05" in st.runs) && st.runs["a:2026-11-04"] && st.runs["a:2026-11-04"].cur === null && Object.keys(st.days).length === 0);
    await q.click("#go-e").catch(() => {}); await q.waitForTimeout(150);
    {
      // 知らない mode や、置き場とちがう mode の途中経過は捨てる（ホームが出なくなるのを防ぐ。2026-11-07 CodeRabbit）
      const z = await newPage(); await closeHow(z);
      await z.evaluate(() => { const s = JSON.parse(localStorage.getItem("jgn-v1")) || { v: 1 }; s.v = 1; s.runs = { d: { mode: "x", date: "2026-11-07", list: [], res: [] }, h: { mode: "d", date: "2026-11-07", list: [], res: [] } }; localStorage.setItem("jgn-v1", JSON.stringify(s)); });
      await z.reload(); await z.waitForTimeout(200);
      const r = await z.evaluate(() => __nm.load().runs);
      check("知らない mode の途中経過は捨て、ホームが出る", !("d" in r) && !("h" in r) && await z.locator("#go-d").count() === 1);
      // 別のタブで終えたまま記録していない上級の回は、次の回を始める前に記録する
      await z.evaluate(() => { const s = __nm.load(), y = "2026-11-06", G = __nm.G; s.runs.h = { mode: "h", date: y, list: G.hardTags(y), res: [0, 1, 2, 3, 4].map(() => ({ m: 0, s: 1, a: 1, f: 1, g: 1 })), cur: null, id: "old" }; localStorage.setItem("jgn-v1", JSON.stringify(s)); });
      await z.reload(); await z.waitForTimeout(200); await z.evaluate(() => __nm.start("h"));
      check("終えたまま残った前の日の回は、上書きする前に記録する", !!(await mem(z)).hdays["2026-11-06"]);
      // とことんで足せる問題が無くても、くり返し呼んで固まらない
      const ok = await z.evaluate(() => { const s = __nm.load(); s.runs.e = { mode: "e", date: __nm.todayKey(), list: ["dot1|1", "mix0|1"], res: [{ m: 0 }, { m: 0 }], cur: null, id: "e1" }; localStorage.setItem("jgn-v1", JSON.stringify(s)); const ml = __nm.setMore(() => []); try { __nm.play("e"); return true; } catch (e) { return String(e); } finally { __nm.setMore(ml); } });
      check("とことんで足せる問題が無くても固まらずに終える", ok === true && await z.locator("#eres").count() === 1, String(ok));
      await z.context().close();
    }
    check("記録の文字を HTML として出さない", await q.locator("#xss, #xss2, #xss3, #xss4, #xss5").count() === 0);
    await q.context().close();
  }
  // 実績・このゲームについて
  await p.click("#back"); await p.click("#go-ach");
  check("実績は14個で、腕前・集める・続けるの3つの組", await p.locator(".ach").count() === 14 && await p.locator(".agrp").count() === 3 && await p.locator(".ach.got").count() >= 3);
  check("達成した実績は ✓ の文字も付く（色だけで分けない）", (await p.textContent(".ach.got b")).startsWith("✓"));
  await p.click("#back"); await p.click("#f-about");
  { const t = await p.textContent("#about");
    check("このゲームについて：助言ロボは架空・頼りすぎ／頼らなさすぎ・出典（題名・年・リンク）が4つ以上", t.includes("架空") && t.includes("実在の AI 製品") && t.includes("頼りすぎ") && t.includes("Parasuraman") && t.includes("1997") && t.includes("Bansal") && await p.locator("#srcs a").count() >= 4 && await p.locator('#srcs a[href="https://arxiv.org/abs/2006.14779"]').count() === 1 && await p.locator('#srcs a[href="https://doi.org/10.1518/001872097778543886"]').count() === 1); }
  await p.context().close();

  // まちがいなしの日は Ko-fi を1回だけ
  {
    const q = await newPage(); await closeHow(q); await q.click("#go-d");
    for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
    await q.waitForTimeout(150);
    check("全部まちがいなしで初めて終えたときだけ Ko-fi の一言", await q.locator(".kofi").count() === 1 && (await q.textContent(".big")).includes("まちがいなし"));
    check("自分だけでも全部当てると、自分だけ 5/5・最後 5/5（助言は4/5）", (await q.textContent("#team")).replace(/\s/g, "").includes("自分だけ") && /5\/5[\s\S]*4\/5[\s\S]*5\/5/.test(await q.textContent("#team")));
    await q.click("#back"); await q.click("#go-d");
    check("結果をもう一度見ても Ko-fi は出さない", await q.locator(".kofi").count() === 0);
    await q.context().close();
  }

  // カレンダー・あとから：過去の日の記録を置いて見る。第1回から日がたっていなくても見られるよう、時計を10日進める
  {
    const SHIFT = 10 * 864e5, TODAY = new Date(Date.now() + 9 * 3600e3 + SHIFT).toISOString().slice(0, 10), dayBefore = (n) => new Date(Date.parse(TODAY) - n * 864e5).toISOString().slice(0, 10);
    const cx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    await cx.addInitScript((sh) => { const o = Date.now; Date.now = () => o() + sh; }, SHIFT);
    const q = await newPage(390, cx);
    await q.evaluate(([d2, d3]) => { localStorage.setItem("jgn-v1", JSON.stringify({ v: 1, tut: true, days: { [d2]: { m: [0, 0, 0, 0, 0], k: [] }, [d3]: { m: [1, 0, 0, 2, 0], k: [] } }, hdays: {}, adays: {}, dex: {}, runs: {}, kofi: {}, ach: {}, ebest: 0 })); }, [dayBefore(2), dayBefore(3)]);
    await q.reload(); await q.waitForTimeout(150);
    check("ホームの「続けて」は、きのうを休んだら — （休んだ日を責めない）", (await q.textContent(".stats")).includes("—"));
    await q.click("#go-cal");
    const lateList = await q.evaluate(() => __nm.lateDays(__nm.load()));
    const exp = [1, 4, 5, 6, 7].map(dayBefore).filter((d) => d >= "2026-11-27");
    check("カレンダー：取りこぼした過去7日（第1回より後）を押せる", JSON.stringify(lateList) === JSON.stringify(exp), lateList.join(","));
    check("カレンダー：遊んだ日は★の数の文字も付く", (await q.locator(".cal .c.p3").count()) + (await q.locator(".cal .c.p2").count()) + (await q.locator(".cal .c.p1").count()) >= (dayBefore(3).slice(0, 7) === TODAY.slice(0, 7) ? 2 : 0));
    if (lateList.length) {
      const d = lateList[0];
      await q.evaluate((d) => { const b = document.querySelector(`.cal .miss[data-k="${d}"]`); if (b) b.click(); else { const m = document.querySelector(".calnav #prev"); m && m.click(); } }, d);
      if (!(await q.locator("#card").count())) await q.click(`.cal .miss[data-k="${d}"]`);
      check("あとから：その日の今日の5問と同じ問題", JSON.stringify(await q.evaluate((d) => __nm.load().runs["a:" + d].list, d)) === JSON.stringify(G.dailyTags(d)));
      for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
      await q.waitForTimeout(150);
      const s = await mem(q);
      check("あとからは adays に入り、今日の記録・続けた日には数えない", s.adays[d] && !s.days[d] && (await q.locator(".share").count()) === 0 && (await q.locator(".kofi").count()) === 0);
    } else check("あとから：遊べる日がある", false, "第1回の日から日がたっていない");
    await q.context().close();
  }

  // 終えた回（gone）がある側の保存に失敗し、別のタブが古い回を新しく保存しても、終えた回を戻さない（shindo-yomi PR #1 の CodeRabbit。GameStore の after で落とす）
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const g = await newPage(390, ctx);
    const left = await g.evaluate(() => {
      const r = { mode: "e", date: __nm.todayKey(), list: ["dot1|1", "mix0|1"], res: [{ m: 0 }], cur: null, id: "gone1" };
      const base = __nm.load();
      const a = JSON.parse(JSON.stringify(base)); a.runs.e = null; a.gone = { gone1: 1 }; a.t = 100;
      const b = JSON.parse(JSON.stringify(base)); b.runs.e = r; b.t = 200;
      localStorage.setItem("jgn-v1", JSON.stringify(b)); __nm.setMem(JSON.stringify(a));
      try { return __nm.load().runs.e; } finally { __nm.setMem(null); }
    });
    check("終えた回は、別のタブが新しく保存した古い写しから戻さない", !left, JSON.stringify(left));
    await ctx.close();
  }
  // 同じ問題の途中で、保存に失敗した側と保存できた側の答え・まちがいを合わせる（CodeRabbit shindo-yomi#1）
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const g = await newPage(390, ctx);
    const got = await g.evaluate(() => {
      const base = __nm.load(), mk = (c) => ({ mode: "p", date: __nm.todayKey(), list: ["dot1|m1", "mix0|m1"], res: [], cur: { i: 0, tag: "dot1|m1", ...c }, id: "mg1" });
      const a = JSON.parse(JSON.stringify(base)); a.runs.p = mk({ a1: "L", a2: "R", w2: ["use"], g: 1 }); a.t = 100;
      const b = JSON.parse(JSON.stringify(base)); b.runs.p = mk({ a1: null, a2: null, w2: ["self"], g: 0 }); b.t = 200;
      localStorage.setItem("jgn-v1", JSON.stringify(b)); __nm.setMem(JSON.stringify(a));
      try { return __nm.load().runs.p.cur; } finally { __nm.setMem(null); }
    });
    check("同じ問題の途中なら、保存に失敗した側の答え・ヒント・2段目のまちがいも消さずに合わせる", got && got.a1 === "L" && got.a2 === "R" && got.g === 1 && got.w2.includes("use") && got.w2.includes("self"), JSON.stringify(got));
    const n = await g.evaluate(() => { __nm.save((s) => { s.runs.p = { mode: "p", date: __nm.todayKey(), list: ["dot1|s1", "mix0|s1"], res: [], cur: null, id: "sc1" }; }); __nm.play("p"); __nm.sureCount(true); __nm.sureCount(true); return __nm.load().runs.p.ds; });
    check("「自信あり」の数は1問につき1回だけ（2つのタブで同じ問題に答えても2回足さない）", n && n.n === 1 && n.ok === 1, JSON.stringify(n));
    await ctx.close();
  }

  // 古いタブ：同じ問題を2つのタブで開き、片方で答えたら、もう片方は二重に入れない
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const a = await newPage(390, ctx); await closeHow(a); await a.click("#go-d");
    const b = await ctx.newPage(); b.on("pageerror", (e) => errors.push(e.message)); await b.goto(url); await b.waitForTimeout(150); await b.click("#go-d");
    await solve(a);
    await b.click("#choices .ch >> nth=0"); // 古いタブ b は1問目の①のまま。押しても、a が答えた1問目を二重に数えない
    await b.waitForTimeout(200);
    const s = await mem(a);
    check("古いタブで同じ問題に答えても二重に数えない", s.runs.d.res.length === 1 && Object.values(s.dex).reduce((x, y) => x + y) === 1);
    // 別のタブで先に決めた自分の答えを、古いタブの答えで上書きしない
    await a.click("#next"); await b.goto(url); await b.waitForTimeout(150); await b.click("#go-d");
    const first = await optOf(a, true); await a.click(`#choices .ch[data-o="${first}"]`);
    await b.click(`#choices .ch[data-o="${await optOf(b, false)}"]`); await b.waitForTimeout(100);
    check("古いタブの答えで、別のタブが先に決めた自分の答えを上書きしない", (await mem(a)).runs.d.cur.a1 === first && await b.evaluate(() => __nm.cur().a1) === first);
    // ヒントの数は、別のタブで使った分も減らさない
    await a.goto(url); await a.waitForTimeout(150); await a.click("#go-d"); await a.click("#hint");
    await step2(b, true); await b.waitForTimeout(100);
    check("別のタブで使ったヒントを減らさない", (await mem(a)).runs.d.cur.g === 1);
    await why(b); await b.waitForTimeout(150);
    check("答え合わせの時も別のタブのヒントを合わせて数える（★2）", (await mem(b)).runs.d.res[1].m === 1);
    await ctx.close();
  }

  // 1問を深くする（shared-workflows routines/game-dev.md「1問を深くする」）：自信をかける・2段目「この問のあなたは？」・復習
  {
    const q = await newPage(); await closeHow(q);
    await q.evaluate((tags) => __nm.save((s) => { s.runs.p = { mode: "p", date: __nm.todayKey(), list: tags, res: [], cur: null, id: "dp" }; }), ["dot1|dp1|x", "mix0|dp2|o", "len1|dp3|o"]);
    await q.evaluate(() => { Depth.runStart(); __nm.play("p"); });
    const sb = await q.$eval("#dp-sure", (b) => [b.getBoundingClientRect().height, b.getAttribute("aria-pressed"), b.textContent]);
    check("自信のボタン：高さ44px以上・はじめは押していない", sb[0] >= 44 && sb[1] === "false", sb.join(","));
    await q.click("#dp-sure");
    check("自信のボタンを押すと ✓ が出る（色だけで分けない）", (await q.getAttribute("#dp-sure", "aria-pressed")) === "true" && (await q.textContent("#dp-sure")).includes("✓"));
    await step1(q, false);
    check("自信ありで自分の答えを外しても、②では知らせない（助言を見る前に答えを明かさない）", (await q.textContent("#msg")) === "" && await q.locator("#robo").count() === 1);
    await step2(q, false);
    check("最後の答えを外したその時に復習へ入る（解き終えずにやめても残る。2026-11-11 CodeRabbit）", await q.evaluate(() => { const d = JSON.parse(localStorage.getItem("jgn-depth") || "{}"); return !!(d.rv && d.rv[__nm.cur().tag]); }));
    check("③で2段目「この問のあなたは？」が4つ出る（押せる所は44px以上）", await q.locator(".why button").count() === 4 && await q.locator(".verdict").count() === 0 && (await q.$$eval(".why button", (b) => b.every((x) => Math.round(x.getBoundingClientRect().height) >= 44))));
    check("2段目の読み上げは、2段目の問いと4つの選び肢だけ（1段目の選び肢を読まない。funka-level #1 の CodeRabbit）", await q.evaluate(() => { const e = [...document.querySelectorAll("[data-a11y-say]")]; return e.length === 5 && e[0].textContent.includes("あなた") && e.slice(1).every((x) => x.matches(".why button")); }));
    check("2段目の間は、最後の答えは押せない", await q.evaluate(() => [...document.querySelectorAll("#final .ch")].every((b) => b.disabled)));
    await q.reload(); await q.waitForTimeout(150); await q.evaluate(() => __nm.play("p"));
    check("2段目の途中で閉じても、2段目から続く", await q.locator(".why button").count() === 4);
    await q.click(`.why button[data-g="${await wrongGrp(q)}"]`);
    check("2段目でまちがえると ✕ ちがう・決まり方（助言と同じか・助言が当たりか）が出る", await q.locator(".why button.ng").count() === 1 && (await q.textContent("#msg")).includes("✕") && (await q.textContent("#msg")).includes("助言が当たった"));
    await q.click("#hint");
    const ng1 = await q.locator(".why button:disabled").count();
    check("2段目のヒントは、まちがえたものとは別のちがうものを消す（ヒントを使って何も消えないことが無い。2026-11-11 CodeRabbit）", ng1 === 2 && await q.locator(".why button:not(:disabled)").count() === 2, ng1);
    await q.reload(); await q.waitForTimeout(150); await q.evaluate(() => __nm.play("p"));
    check("2段目のヒントで消したものは、閉じて開き直しても消えたまま（ヒントも押せないまま）", await q.locator(".why button:disabled").count() === ng1 && ng1 >= 1 && await q.locator("#hint:disabled").count() === 1 && (await q.textContent("#hintbox")).includes("消しました"));
    await why(q); await q.waitForSelector(".verdict");
    const m0 = await q.evaluate(() => __nm.load().runs.p.res[0].m);
    check("★は最後の答えの外れ・2段目のまちがい・ヒントを合わせて数える（1＋1＋1＝3）", m0 === 3, m0);
    check("答え合わせに、自信ありで自分だけの答えが外れたことが出る", (await q.textContent(".verdict")).includes("自分だけの答えは外れ"));
    check("外れた助言に乗って外したので、この問のあなたは「乗って外れ」（頼りすぎ）", (await q.textContent(".verdict")).includes("この問のあなた：乗って外れ"));
    await q.click("#next");
    await solve(q); await q.click("#next");
    await step1(q, true); await step2(q, true);
    check("どの問題も2段目「この問のあなたは？」が出る", await q.locator(".why button").count() === 4);
    await why(q); await q.waitForSelector(".verdict");
    await q.click("#next"); await q.waitForTimeout(150);
    check("終えた直後の結果に「自信ありの当たり」が出る", (await q.textContent("#surestat")).includes("0/1"));
    const dp = await q.evaluate(() => JSON.parse(localStorage.getItem("jgn-depth") || "{}"));
    check("外した・ヒントを使った問題だけ復習に入る", Object.keys(dp.rv || {}).join() === "dot1|dp1|x", Object.keys(dp.rv || {}).join(","));
    await q.evaluate(() => { const d = JSON.parse(localStorage.getItem("jgn-depth")); for (const k in d.rv) d.rv[k].due = "2026-01-01"; localStorage.setItem("jgn-depth", JSON.stringify(d)); });
    await q.goto(url); await q.waitForTimeout(150);
    check("日の来た復習があると、ホームに「復習 1問」", (await q.textContent("#go-r")).includes("復習 1問"));
    const before = await mem(q);
    await q.click("#go-r");
    check("復習の画面は「復習」と出る・同じ問題（同じ図・同じ助言）", (await q.textContent("header")).includes("復習") && await q.evaluate(() => __nm.cur().tag) === "dot1|dp1|x");
    await solve(q); await q.click("#next"); await q.waitForTimeout(150);
    const after = await mem(q), dp2 = await q.evaluate(() => JSON.parse(localStorage.getItem("jgn-depth")));
    check("復習を終えると結果は「復習」・今日の記録は増えない・シェアは出ない", (await q.textContent("h1")).includes("復習") && JSON.stringify(after.days) === JSON.stringify(before.days) && await q.locator("#share").count() === 0);
    { const r1 = dp2.rv && dp2.rv["dot1|dp1|x"], d3 = new Date(Date.parse(TODAY + "T00:00:00Z") + 3 * 864e5).toISOString().slice(0, 10);
      check("復習で一度で正解すると、次は3日後へ進む（同じ問題が残り、段は1・期限はちょうど3日後。toukyu-yomi #1 の CodeRabbit）", !!r1 && r1.s === 1 && r1.due === d3, JSON.stringify(r1)); }
    await q.goto(url); await q.waitForTimeout(150);
    check("復習を終えたら、ホームの「復習」は消える", await q.locator("#go-r").count() === 0);
    await q.evaluate(() => { const d = JSON.parse(localStorage.getItem("jgn-depth")); d.rv["nai|1"] = { s: 0, due: "2026-01-01", t: 1 }; d.rv["constructor|x"] = { s: 0, due: "2026-01-01", t: 2 }; localStorage.setItem("jgn-depth", JSON.stringify(d)); });
    await q.goto(url); await q.waitForTimeout(150);
    check("作り直せない鍵（無い種類・constructor）は復習に数えず、ホームも出る", await q.locator("#go-d").count() === 1 && await q.locator("#go-r").count() === 0);
    // 別のタブで答えを進めていたら、この画面もそこから・別のタブで先に進んだ古い画面は復習の段を戻さない（2026-11-11 CodeRabbit）
    { const tq = "dot1|dq1";
      await q.goto(url); await q.waitForTimeout(150);
      await q.evaluate((t) => { __nm.save((s) => { s.runs.p = { mode: "p", date: __nm.todayKey(), list: [t], res: [], cur: null, id: "dq" }; }); __nm.play("p"); }, tq);
      await q.evaluate((t) => __nm.save((s) => { const P = __nm.G.make(t); s.runs.p.cur = { i: 0, tag: t, a1: P.ans, a2: P.ans, g: 0, h2: 0, w2: [] }; }), tq);
      await q.click("#hint"); await q.waitForTimeout(100); await q.evaluate(() => __nm.play("p"));
      check("別のタブで③へ進んでいたら、この画面も③になる", await q.locator(".why button").count() === 4 && await q.evaluate(() => __nm.cur().step) === 3);
      await q.evaluate((t) => { __nm.save((s) => { s.runs.p.res.push({ m: 0 }); s.runs.p.cur = null; }); const d = JSON.parse(localStorage.getItem("jgn-depth")); d.rv[t] = { s: 2, due: "2099-01-01", t: 9 }; localStorage.setItem("jgn-depth", JSON.stringify(d)); }, tq);
      const hintHit = await q.evaluate(() => { const h = document.querySelector("#hint"); if (!h) return false; h.disabled = false; h.click(); return true; }); await q.waitForTimeout(50);
      check("古い画面にヒントがあり、押せた（押さずに次へ進まない。CodeRabbit #1）", hintHit);
      check("別のタブで先に進んだ古い画面でヒントを押しても、復習の段は戻らない", await q.evaluate((t) => JSON.parse(localStorage.getItem("jgn-depth")).rv[t].s, tq) === 2);
    }
    // 復習の途中でヒントを使って日の来た問題が0になっても、ホームの「復習の続きから」で戻れる（2026-11-11 CodeRabbit）
    { const rk = Object.keys(dp2.rv)[0];
      await q.evaluate((k) => { const d = JSON.parse(localStorage.getItem("jgn-depth")); d.rv = { [k]: { s: 0, due: "2026-01-01", t: 3 } }; localStorage.setItem("jgn-depth", JSON.stringify(d)); }, rk);
      await q.goto(url); await q.waitForTimeout(150); await q.click("#go-r"); await q.click("#hint");
      await q.evaluate(() => __nm.save((s) => { s.runs.r.date = "2026-01-02"; }));
      await q.goto(url); await q.waitForTimeout(150);
      check("復習の途中でヒントを使って日の来た問題が0になっても・日が替わっても、ホームの「復習の続きから」で戻れる", ((await q.locator("#go-r").count()) ? await q.textContent("#go-r") : "").includes("続きから"));
      if (await q.locator("#go-r").count()) { await q.click("#go-r"); check("復習の続きは同じ問題・使ったヒントはそのまま", await q.evaluate(() => __nm.cur().tag) === rk && await q.evaluate(() => __nm.cur().g) === 1); }
    }
    await q.context().close();
  }
  // スマホ幅・とても大きい文字でもはみ出さない・押す所は44px以上
  {
    const bad = [], small = [];
    for (const [w, fs] of [[320, 3], [390, 2], [320, 1]]) {
      const q = await newPage(w); await closeHow(q);
      await q.evaluate((fs) => (localStorage.setItem("jgn-fs", String(fs)), localStorage.setItem("a11y-v1", JSON.stringify({ ...JSON.parse(localStorage.getItem("a11y-v1") || "{}"), fs: undefined }))), fs); await q.reload(); await q.waitForTimeout(150);
      for (const go of [null, "#go-d", "s1", "s2", "solve", "#go-cal", "#go-dex", "#go-ach", "#go-e"]) {
        if (go === "s1") await step1(q, true);
        else if (go === "s2") await step2(q, false);
        else if (go === "solve") await solve(q);
        else if (go) { await q.goto(url); await q.waitForTimeout(100); await q.click(go); }
        await q.waitForTimeout(100);
        const ov = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (ov > 0) bad.push(`${w}px 文字${fs} ${go || "ホーム"} ${ov}px`);
        small.push(...(await q.$$eval("button:not([disabled]), a[href]", (bs) => bs.filter((b) => b.checkVisibility() && !b.closest(".cal")).filter((b) => Math.round(b.getBoundingClientRect().height) < 44).map((b) => (b.id || b.className || b.textContent).slice(0, 20)))).map((x) => `${w}/${fs}/${go}:${x}`));
      }
      await q.context().close();
    }
    check("幅320px・とても大きい文字でも横にはみ出さない", bad.length === 0, bad.join(" / "));
    check("押せる所は高さ44px以上", small.length === 0, [...new Set(small)].slice(0, 8).join(","));
  }

  // 見やすさの設定を全部入れても、ページの一番下まで動ける（読み上げの class が html に当たって固まった。2026-11-05）
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 } });
    await ctx.addInitScript(() => localStorage.setItem("a11y-v1", JSON.stringify({ read: true, cvd: true, calm: true, say: true, ruby: true })));
    const q = await newPage(390, ctx); await closeHow(q);
    const r = await q.evaluate(() => { window.scrollTo(0, 1e5); const f = document.querySelector("footer").getBoundingClientRect(); return [scrollY, Math.round(f.bottom), innerHeight, getComputedStyle(document.documentElement).position]; });
    check("見やすさの設定を全部入れても、いちばん下まで動ける（html が固定されない）", r[0] > 0 && r[1] <= r[2] && r[3] === "static", r.join(","));
    await ctx.close();
  }
  // キーボードだけで遊べる（Tab と Enter）
  {
    const q = await newPage(); await closeHow(q);
    // focus() で飛ばさず、Tab だけでたどり着けるかを見る（tabindex="-1" などで届かないと落ちる。CodeRabbit #1）
    const tabTo = async (sel) => { await q.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.scrollTo(0, 0); }); for (let n = 0; n < 60; n++) { await q.keyboard.press("Tab"); if (await q.evaluate((s) => !!document.activeElement && document.activeElement.matches(s), sel)) return true; } return false; };
    const reach = [];
    reach.push(await tabTo("#go-d")); await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    reach.push(await tabTo(`#choices .ch[data-o="${await optOf(q, true)}"]`)); await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    reach.push(await tabTo(`#final .ch[data-o="${await optOf(q, true)}"]`)); await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    reach.push(await tabTo(`.why button[data-g="${await grpNow(q)}"]`)); await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    check("キーボードだけ（Tab で選び Enter）で①②③と2段目を答えられる", reach.every(Boolean) && await q.locator(".verdict").count() === 1, reach.join(","));
    await q.context().close();
  }
} catch (e) { check("ブラウザでの検査が最後まで動く", false, e.stack.split("\n").slice(0, 3).join(" ")); }

// 深さの部品（shared-workflows template/qa/depth-check.mjs）
{ const e = await checkDepth(readFileSync(path.join(root, "depth.js"), "utf8")); check("depth.js（自信をかける・復習）の動き", e.length === 0, e.join(" / ")); }
// 途中で押せずに止まっても、例外を落ちた項目にしてレポートまで進む（CodeRabbit #1）
{ const q = await newPage(); try { await closeHow(q);
  check("保存に失敗したら、保存できるまで帯（#savewarn）で知らせ続け、保存できたら消す", await q.evaluate(async () => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error("full"); }; __nm.save(() => {}); __nm.save(() => {}); const one = document.querySelectorAll("#savewarn").length === 1 && document.getElementById("savewarn").textContent.includes("保存できませんでした"); await new Promise((r) => setTimeout(r, 1500)); const stay = !!document.getElementById("savewarn"); Storage.prototype.setItem = orig; __nm.save(() => {}); return one && stay && !document.getElementById("savewarn"); }));
  await q.evaluate(() => __nm.start("e")); await q.waitForTimeout(100);
  await solve(q);
  await q.click("#quit"); await q.waitForTimeout(150);
  check("とことんで答えた直後でも「ここで降りる」が効き、その問題も数える", (await q.textContent("#eres")).includes("1問"), await q.textContent("body"));
  // 保存に失敗したまま「ここで降りる」を押しても、保存してあった途中の回を戻さない（CodeRabbit kumo-namae#1）
  await q.evaluate(() => __nm.start("e")); await q.waitForTimeout(100);
  await solve(q);
  { const eid = await q.evaluate(() => __nm.load().runs.e.id);
    await q.evaluate(() => { window.__origSet = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error("full"); }; });
    await q.click("#quit"); await q.waitForTimeout(150);
    const back = await q.evaluate(() => { const r = __nm.load().runs.e; return r ? r.id : null; });
    await q.evaluate(() => { Storage.prototype.setItem = window.__origSet; __nm.save(() => {}); });
    check("保存に失敗したまま「ここで降りる」を押しても、終えた回が「とことんの続き」に戻らない", back === null && (await q.evaluate(() => __nm.load().runs.e)) === null, `${eid} → ${back}`); }
  } catch (e) { check("保存の失敗・ここで降りるの検査が最後まで動く", false, e.message.split("\n")[0]); } finally { await q.close().catch(() => {}); } }
{ const q = await newPage(); try { await closeHow(q);
  await q.evaluate(() => { localStorage.setItem("jgn-v1", JSON.stringify({ v: 1, tut: true, days: {}, hdays: {}, adays: {}, dex: { constructor: 1, toString: 2, dot1: 1 }, runs: {}, kofi: {}, ach: {}, ebest: 0 })); }); await q.reload(); await q.waitForTimeout(150);
  check("記録に constructor などの鍵が入っても、見くらべ帳と実績の種類に数えない（CodeRabbit funka-level#1）", (await q.textContent("#go-dex")).includes("1/9") && await q.evaluate(() => __nm.tally(__nm.load()).kinds) === 1, await q.textContent("#go-dex"));
  await q.evaluate(() => { localStorage.setItem("jgn-v1", JSON.stringify({ v: 1, tut: true, days: {}, hdays: {}, adays: {}, dex: {}, runs: {}, kofi: {}, ach: {}, ebest: { toString: null }, tot: { n: { toString: null } }, cb: { h: [{ toString: null }] } })); }); await q.reload(); await q.waitForTimeout(150);
  check("記録の数の所に数でも文字でもない物（{toString:null}）が入っても、ホームが出る（toppu-yomi #1 の CodeRabbit）", await q.locator("#go-dex").count() === 1);
  await q.evaluate((d) => { localStorage.setItem("jgn-v1", JSON.stringify({ v: 1, tut: true, days: {}, hdays: {}, adays: {}, dex: {}, runs: { p: { mode: "p", date: d, list: ["dot1|w2x"], res: [], cur: { i: 0, tag: "dot1|w2x", a1: "L", a2: { toString: null }, w2: [{ toString: null }, "kaze"] }, id: "w2x" } }, kofi: {}, ach: {}, ebest: 0 })); }, TODAY); await q.reload(); await q.waitForTimeout(150);
  check("途中の答え・2段目のまちがいに文字でない物（{toString:null}）が入っても、ホームが出る（toukyu-yomi #1 の CodeRabbit）", await q.locator("#go-dex").count() === 1);
  } catch (e) { check("壊れた記録の検査が最後まで動く", false, e.message.split("\n")[0]); } finally { await q.close().catch(() => {}); } }
// game-core（shared-workflows template/qa/core-check.mjs）：遊び方・感想のリンク・不具合の帯（CodeRabbit nukemichi-fusagi#1）
try {
  await checkCore({ browser, url, check, first: false }); // はじめての案内はゲームの firstClose が閉じるので、遊び方・感想・不具合の帯だけ見る
} catch (e) { check("game-core の検査が最後まで動く", false, e.message.split("\n")[0]); }
// 引き継ぎコード（shared-workflows template/qa/transfer-check.mjs）
try {
  const sample = { "jgn-v1": JSON.stringify({ v: 1, tut: true, days: { "2026-11-28": { m: [0, 1, 0, 0, 2], k: ["dot0", "mix1", "len1", "dot2", "mix2"], s: [1, 1, 0, 1, 0], a: [1, 1, 1, 0, 1], f: [1, 1, 1, 1, 0], g: [1, 1, 1, 0, 0] } }, hdays: {}, adays: {}, dex: { dot0: 1, mix1: 1, len1: 1, dot2: 1, mix2: 1 }, runs: {}, kofi: {}, ach: {}, ebest: 7, tot: { n: 5, s: 3, a: 4, f: 4, over: 0, under: 1, self: 1 }, cb: { h: [1, 1, 1], m: [2, 2, 2], l: [2, 1, 0] }, t: 1 }), "jgn-fs": "3", "jgn-depth": JSON.stringify({ v: 1, rv: { "dot1|x1": { s: 1, due: "2026-11-30", t: 5 } } }) }; // 復習の記録も引き継ぐかを見る（CodeRabbit shindo-yomi#1）
  await checkTransfer({ browser, url, game: "jogen-noru", sample, check, open: async (pg) => { await firstClose(pg); } });
} catch (e) { check("引き継ぎの検査が最後まで動く", false, e.message.split("\n")[0]); }
await browser.close();
server.close();
check("画面のエラーが無い", errors.length === 0, errors.slice(0, 3).join(" | "));

{ // 見やすさ・読みやすさ・偏り（shared-workflows template/qa/a11y.mjs の写し）
  const { spawnSync } = await import("node:child_process");
  const a = spawnSync(process.execPath, [path.join(root, "qa", "a11y.mjs")], { encoding: "utf8", env: process.env });
  check("見やすさ・読みやすさの検査（qa/a11y.mjs。中身は qa-report/a11y.md）", a.status === 0, (a.stdout.match(/^- ❌.*$/gm) || []).join(" / ") || (a.status ? a.stderr.slice(-300) : ""));
}

const ng = results.filter((r) => !r.ok);
const md = `# 助言に乗る？乗らない？ QA\n\n${results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `（${r.detail}）` : ""}`).join("\n")}\n\n${ng.length ? `❌ ${ng.length}件` : `✅ ${results.length}項目すべて通過`}\n`;
mkdirSync(path.join(root, "qa-report"), { recursive: true });
writeFileSync(path.join(root, "qa-report/report.md"), md);
console.log(md);
process.exit(ng.length ? 1 : 0);
