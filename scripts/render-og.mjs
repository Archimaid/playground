// Renders public/og.png, the social preview, from the built playground: the diagram in the image is the starter
// diagram as the playground draws it. The output is committed; run `npm run og` after changing the starter or the look.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

const root = new URL('../', import.meta.url);
const output = new URL('public/og.png', root);

const colours = {
  ink: '#17171c',
  paper: '#fbfaf6',
  strategy: '#f5deaa',
  business: '#faf087',
  application: '#b8e7fc',
  technology: '#d6f8b8',
  implementation: '#ffe0e0',
  motivation: '#d9cfff',
};

function fontFace(family, file, weight) {
  const data = readFileSync(new URL(`node_modules/${file}`, root)).toString('base64');
  return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:${weight};}`;
}

const fonts = [
  fontFace(
    'Space Grotesk',
    '@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2',
    '300 700',
  ),
  fontFace('JetBrains Mono', '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2', 400),
  fontFace('JetBrains Mono', '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2', 600),
].join('');

const mark = `<svg viewBox="0 0 120 120" aria-hidden="true">${[
  [34, 14, colours.business],
  [23, 47, colours.application],
  [12, 80, colours.technology],
]
  .map(
    ([x, y, fill]) =>
      `<rect x="${x}" y="${y}" width="74" height="26" rx="9" fill="${fill}" stroke="${colours.ink}" stroke-width="6"/>`,
  )
  .join('')}</svg>`;

async function renderedStarterDiagram(browser, url) {
  const page = await browser.newPage();
  await page.goto(url);
  const svg = page.locator('#preview svg');
  await svg.locator('[data-archimate-element]').first().waitFor();
  const markup = await svg.evaluate((element) => element.outerHTML);
  await page.close();
  return markup;
}

function socialPreviewPage(diagram) {
  const stripe = ['strategy', 'business', 'application', 'technology', 'implementation', 'motivation']
    .map((layer) => `<span style="background:${colours[layer]}"></span>`)
    .join('');
  return `<!doctype html><html><head><style>
    ${fonts}
    *{box-sizing:border-box}
    html,body{margin:0;width:1200px;height:630px;overflow:hidden;color:${colours.ink};font-family:'Space Grotesk',sans-serif;
      background-color:${colours.paper};background-image:radial-gradient(#dcdad2 1.2px,transparent 1.2px);background-size:22px 22px}
    .stripe{display:grid;grid-template-columns:repeat(6,1fr);height:10px}
    .copy{position:absolute;left:64px;top:62px;width:500px}
    .brand{display:flex;align-items:center;gap:16px;font-size:40px;font-weight:700;letter-spacing:-0.03em}
    .brand svg{width:56px;height:56px}
    .chip{padding:5px 13px;border:2px solid ${colours.ink};border-radius:999px;background:#fff;font:400 18px 'JetBrains Mono',monospace;letter-spacing:0}
    h1{margin:42px 0 0;font-size:64px;line-height:1.03;letter-spacing:-0.04em;font-weight:700}
    mark{background:${colours.business};color:inherit;padding:0 0.14em;border-radius:0.16em}
    p{margin:24px 0 0;font-size:25px;line-height:1.4;color:#4a4a5c}
    .footer{position:absolute;left:64px;bottom:46px;display:flex;gap:14px;font-family:'JetBrains Mono',monospace;font-size:20px}
    .pill{padding:6px 14px;border:2px solid ${colours.ink};border-radius:999px;background:#fff}
    .panel{position:absolute;border:3px solid ${colours.ink};border-radius:22px;overflow:hidden;box-shadow:10px 10px 0 ${colours.ink}}
    .code{left:618px;top:56px;width:500px;background:#14141c;color:#ecebe7}
    .bar{display:flex;align-items:center;gap:9px;padding:14px 20px;font:400 15px 'JetBrains Mono',monospace}
    .code .bar{color:#a9a9bb;border-bottom:1px solid #2a2a36}
    .dot{width:11px;height:11px;border-radius:999px;background:#ff92b8}
    pre{margin:0;padding:16px 22px 20px;font:400 16px/27px 'JetBrains Mono',monospace;font-variant-ligatures:none}
    .kw{color:#c3b6ff}.bus{color:#f4e65e;font-weight:600}.app{color:#8fd8f8;font-weight:600}.str{color:#ffc2a8}.op{color:#ff92b8;font-weight:600}
    .card{left:676px;top:300px;width:470px;background:#fff}
    .card .bar{justify-content:space-between;color:#4a4a5c;background:${colours.paper};border-bottom:3px solid ${colours.ink}}
    .card .dot{background:#8bd34c}
    .fit{padding:3px 12px;border:2px solid ${colours.ink};border-radius:999px;background:${colours.technology};color:${colours.ink};font:600 14px 'Space Grotesk',sans-serif}
    .diagram svg{display:block;width:100% !important;height:auto !important;max-width:none !important}
  </style></head><body>
    <div class="stripe">${stripe}</div>
    <div class="copy">
      <div class="brand">${mark}Archimaid<span class="chip">Playground</span></div>
      <h1>Type the architecture.<br><mark>Watch&nbsp;it&nbsp;render.</mark></h1>
      <p>ArchiMate® diagrams as text, drawn as you type. No install, and nothing leaves your browser.</p>
    </div>
    <div class="footer"><span class="pill">try.archimaid.org</span><span class="pill">Free · open source</span></div>
    <div class="panel code">
      <div class="bar"><span class="dot"></span>diagram.mmd</div>
      <pre><span class="kw">element</span> <span class="bus">businessActor</span> customer <span class="str">"Customer"</span>
<span class="kw">element</span> <span class="app">applicationComponent</span> webshop <span class="str">"Webshop"</span>
webshop <span class="op">--&gt;</span> customer</pre>
    </div>
    <div class="panel card">
      <div class="bar"><span style="display:flex;align-items:center;gap:9px"><span class="dot"></span>My first diagram</span><span class="fit">Fit</span></div>
      <div class="diagram">${diagram}</div>
    </div>
  </body></html>`;
}

const server = await preview({ root: fileURLToPath(root), preview: { port: 0 }, logLevel: 'silent' });
const browser = await chromium.launch();
try {
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('The Vite preview server did not report a URL.');
  const diagram = await renderedStarterDiagram(browser, url);
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(socialPreviewPage(diagram), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(output, await page.screenshot({ type: 'png' }));
  console.log(`Social preview written to ${fileURLToPath(output)}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
