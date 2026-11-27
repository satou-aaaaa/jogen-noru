// SNS で貼られたときの絵（og.png 1200×630）を作る。今日の問題（答え）は入れず、遊び方の例だけ（自分・助言ロボ・最後）。
// 使い方: node tools/make-og.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  const row = (l, v, c) => `<div style="display:grid;grid-template-columns:230px 1fr 90px;gap:14px;align-items:center;font-size:30px"><span>${l}</span><span style="height:22px;border-radius:11px;background:#1d2a3f1f;overflow:hidden"><i style="display:block;height:100%;width:${v * 20}%;background:${c}"></i></span><b>${v}/5</b></div>`;
  await p.setContent(`<body style="margin:0;font-family:'Noto Sans CJK JP','IPAPGothic',sans-serif">
  <div style="width:1200px;height:630px;box-sizing:border-box;padding:48px 64px;background:#f3efe4;color:#1d2a3f;display:flex;gap:40px;align-items:center">
    <div style="flex:0 0 470px">
      <div style="font-size:30px;color:#83261a;letter-spacing:.06em">AI の助言、どこまで信じる？</div>
      <div style="font-size:80px;font-weight:900;margin-top:8px;line-height:1.2;color:#123554">助言に<br><span style="color:#b23a24">乗る？</span><br>乗らない？</div>
    </div>
    <div style="flex:1;background:#fffdf7;border:4px solid #1d2a3f;border-radius:8px;padding:30px 26px;display:flex;flex-direction:column;gap:22px">
      <div style="font-size:30px;font-weight:700">🤖 助言ロボ「右の箱」 自信 62%</div>
      ${row("自分だけ", 3, "#21704a")}
      ${row("助言ロボだけ", 4, "#1f4f7a")}
      ${row("最後", 4, "#b23a24")}
      <div style="font-size:26px;color:#4c5568">頼りすぎ？ 頼らなさすぎ？</div>
    </div>
  </div></body>`);
  await p.screenshot({ path: path.join(__dirname, "..", "og.png") });
  await b.close();
})();
