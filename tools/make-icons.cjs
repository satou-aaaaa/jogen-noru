// アプリのアイコン（icon-192.png・icon-512.png）を作る。紺の地に、助言ロボの吹き出しと、2つに分かれた点の箱。
// 使い方: node tools/make-icons.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const s of [192, 512]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<body style="margin:0"><svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="#123554"/>
      <rect x="12" y="44" width="34" height="40" rx="5" fill="#fffdf7"/><rect x="54" y="44" width="34" height="40" rx="5" fill="#fffdf7"/>
      <g fill="#1d2a3f"><circle cx="20" cy="54" r="3"/><circle cx="32" cy="58" r="3"/><circle cx="24" cy="70" r="3"/><circle cx="38" cy="74" r="3"/><circle cx="62" cy="56" r="3"/><circle cx="78" cy="62" r="3"/><circle cx="68" cy="74" r="3"/></g>
      <path d="M22 12 h56 a6 6 0 0 1 6 6 v12 a6 6 0 0 1 -6 6 h-30 l-8 7 v-7 h-18 a6 6 0 0 1 -6 -6 v-12 a6 6 0 0 1 6 -6z" fill="#b23a24"/>
      <text x="50" y="30" font-size="16" font-weight="900" fill="#fff" text-anchor="middle" font-family="sans-serif">?</text></svg></body>`);
    await p.screenshot({ path: path.join(__dirname, "..", `icon-${s}.png`), clip: { x: 0, y: 0, width: s, height: s } });
  }
  await b.close();
})();
