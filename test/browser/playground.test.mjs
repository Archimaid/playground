import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { preview } from 'vite';

let server;
let browser;
let baseUrl;

before(async () => {
  server = await preview({ preview: { port: 0, strictPort: false }, logLevel: 'silent' });
  baseUrl = server.resolvedUrls.local[0];
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.httpServer.close(resolve));
});

async function openPlayground(url = baseUrl) {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && pageErrors.push(message.text()));
  await page.goto(url);
  return { page, pageErrors, close: () => context.close() };
}

const renderedElements = (page) => page.locator('#preview svg [data-archimate-element]');

test('the starter diagram renders on first visit', async () => {
  const { page, pageErrors, close } = await openPlayground();
  await renderedElements(page).first().waitFor();
  assert.equal(await renderedElements(page).count(), 4);
  assert.equal(await page.locator('#status-chip').textContent(), 'Valid');
  assert.equal(await page.locator('#model-summary').textContent(), '4 elements · 4 relationships');
  assert.equal(await page.locator('#problems').isHidden(), true);
  assert.equal(await page.locator('#download').isDisabled(), false);
  assert.deepEqual(pageErrors, []);
  await close();
});

test('every example renders without problems', async () => {
  const { page, pageErrors, close } = await openPlayground();
  await renderedElements(page).first().waitFor();
  const options = await page
    .locator('#examples option:not([disabled])')
    .evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, label: node.textContent })));
  assert.ok(options.length >= 5, `expected the starter and packaged examples, got ${options.length}`);
  for (const option of options) {
    const previous = await page.locator('#preview svg').getAttribute('id');
    await page.selectOption('#examples', option.value);
    await page.waitForFunction((id) => document.querySelector('#preview svg')?.id !== id, previous);
    assert.equal(await page.locator('#status-chip').textContent(), 'Valid', option.label);
    assert.ok((await renderedElements(page).count()) > 0, `${option.label} drew no elements`);
  }
  assert.deepEqual(pageErrors, []);
  await close();
});

test('an error is listed and the last valid diagram stays visible', async () => {
  const { page, close } = await openPlayground();
  await renderedElements(page).first().waitFor();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\n  customer --> nobody');
  await page.locator('.problem.is-error').first().waitFor();
  assert.match(await page.locator('.problem.is-error').first().textContent(), /Unknown element or note "nobody"/u);
  assert.equal(await page.locator('#diagram-pane').getAttribute('data-state'), 'stale');
  assert.equal(await page.locator('#status-chip').textContent(), '1 error');
  assert.equal(await page.locator('#tab-code-badge').textContent(), '1');
  assert.equal(await renderedElements(page).count(), 4);
  await close();
});

test('a share link opens the same diagram in a new visit', async () => {
  const first = await openPlayground();
  await renderedElements(first.page).first().waitFor();
  await first.page.selectOption('#examples', 'nested-components');
  await first.page.locator('#model-summary', { hasText: '4 elements' }).waitFor();
  await first.page.click('#share');
  await first.page.locator('#toast', { hasText: 'Link copied' }).waitFor();
  const link = await first.page.evaluate(() => navigator.clipboard.readText());
  const source = await first.page.locator('.cm-content').innerText();
  await first.close();

  assert.match(link, /#code=/u);
  const second = await openPlayground(link);
  await renderedElements(second.page).first().waitFor();
  assert.equal(await second.page.locator('.cm-content').innerText(), source);
  await second.close();
});

test('zoom steps from the fitted scale and Fit restores it', async () => {
  const { page, close } = await openPlayground();
  await page.selectOption('#examples', 'cross-layer-relationships');
  await page.locator('#model-summary', { hasText: '26 elements' }).waitFor();
  await page.waitForFunction(
    () => document.querySelector('#preview svg')?.querySelectorAll('[data-archimate-element]').length === 26,
  );
  const fitted = Number.parseInt(await page.locator('#zoom-reset').textContent(), 10);
  assert.ok(fitted < 100, `a wide diagram should be fitted below 100%, got ${fitted}%`);
  await page.click('#zoom-in');
  const zoomed = Number.parseInt(await page.locator('#zoom-reset').textContent(), 10);
  assert.ok(zoomed > fitted, `zoom in should enlarge from ${fitted}%, got ${zoomed}%`);
  assert.equal(await page.locator('#zoom-fit').getAttribute('aria-pressed'), 'false');
  await page.click('#zoom-reset');
  assert.equal(await page.locator('#zoom-reset').textContent(), '100%');
  await page.click('#zoom-fit');
  assert.equal(Number.parseInt(await page.locator('#zoom-reset').textContent(), 10), fitted);
  await close();
});

test('the divider resizes the panes from the keyboard', async () => {
  const { page, close } = await openPlayground();
  const sourceWidth = () => page.locator('#code-pane').evaluate((pane) => pane.getBoundingClientRect().width);
  const before = await sourceWidth();
  await page.focus('#divider');
  await page.keyboard.press('ArrowRight');
  assert.ok((await sourceWidth()) > before);
  assert.equal(await page.locator('#divider').getAttribute('aria-valuenow'), '44');
  await close();
});

test('the notation switch rewrites the source and applies to examples loaded later', async () => {
  const { page, pageErrors, close } = await openPlayground();
  await page.selectOption('#examples', 'cross-layer-relationships');
  await page.locator('#model-summary', { hasText: '26 elements' }).waitFor();
  assert.equal(await page.locator('#notation-long').getAttribute('aria-pressed'), 'true');

  await page.click('#notation-shorthand');
  await page.locator('#toast', { hasText: 'Rewrote 32 relationships in shorthand' }).waitFor();
  assert.match(await page.locator('#toast').textContent(), /4 relationships stay in long form/u);
  assert.equal(await page.locator('#notation-shorthand').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#model-summary').textContent(), '26 elements · 36 relationships');
  assert.match(await page.locator('.cm-content').innerText(), /register ==> accept/u);

  await page.selectOption('#examples', 'order-fulfilment');
  await page.locator('#model-summary', { hasText: '2 elements' }).waitFor();
  assert.match(await page.locator('.cm-content').innerText(), /clerk @==> fulfil/u);
  assert.deepEqual(pageErrors, []);
  await close();
});

async function download(page, format, background) {
  await page.click('#download');
  await page.check(`input[name="download-background"][value="${background}"]`);
  const [file] = await Promise.all([page.waitForEvent('download'), page.click(`#download-${format}`)]);
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}

// Decodes the PNG in the page and reports its size and the alpha of the top-left pixel.
function inspectPng(page, bytes) {
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: image.width, height: image.height });
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return { width: image.width, height: image.height, cornerAlpha: context.getImageData(0, 0, 1, 1).data[3] };
  }, bytes.toString('base64'));
}

test('downloads SVG and PNG with the diagram background or a transparent one', async () => {
  const { page, pageErrors, close } = await openPlayground();
  await renderedElements(page).first().waitFor();
  const viewBox = await page
    .locator('#preview svg')
    .evaluate((svg) => [svg.viewBox.baseVal.width, svg.viewBox.baseVal.height]);

  const opaqueSvg = await download(page, 'svg', 'diagram');
  assert.equal(opaqueSvg.name, 'my-first-diagram.svg');
  const transparentSvg = await download(page, 'svg', 'transparent');
  assert.equal(transparentSvg.name, 'my-first-diagram-transparent.svg');
  const sizes = await page.evaluate(
    ([opaque, transparent]) =>
      [opaque, transparent].map((source) => {
        const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
        const canvasRects = Array.from(svg.children).filter(
          (child) =>
            child.localName === 'rect' &&
            child.getAttribute('width') === svg.getAttribute('width') &&
            child.getAttribute('height') === svg.getAttribute('height'),
        ).length;
        return { width: svg.getAttribute('width'), height: svg.getAttribute('height'), canvasRects };
      }),
    [opaqueSvg.bytes.toString('utf8'), transparentSvg.bytes.toString('utf8')],
  );
  assert.deepEqual(sizes, [
    { width: String(viewBox[0]), height: String(viewBox[1]), canvasRects: 1 },
    { width: String(viewBox[0]), height: String(viewBox[1]), canvasRects: 0 },
  ]);

  const opaquePng = await download(page, 'png', 'diagram');
  assert.equal(opaquePng.name, 'my-first-diagram.png');
  const opaque = await inspectPng(page, opaquePng.bytes);
  assert.deepEqual([opaque.width, opaque.height], [Math.round(viewBox[0] * 2), Math.round(viewBox[1] * 2)]);
  assert.equal(opaque.cornerAlpha, 255);
  const transparent = await inspectPng(page, (await download(page, 'png', 'transparent')).bytes);
  assert.equal(transparent.cornerAlpha, 0);

  assert.equal(await page.locator('#download-menu').isHidden(), true);
  assert.deepEqual(pageErrors, []);
  await close();
});

test('a share link opens on the Diagram tab on a phone, and on both panes on a desktop', async () => {
  const sharer = await openPlayground();
  await renderedElements(sharer.page).first().waitFor();
  await sharer.page.click('#share');
  await sharer.page.locator('#toast', { hasText: 'Link copied' }).waitFor();
  const link = await sharer.page.evaluate(() => navigator.clipboard.readText());
  await sharer.close();

  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const phone = await context.newPage();
  await phone.goto(link);
  await phone.locator('#preview svg [data-archimate-element]').first().waitFor();
  assert.equal(await phone.locator('#tab-diagram').getAttribute('aria-selected'), 'true');
  assert.equal(await phone.locator('#code-pane').isHidden(), true);
  await phone.goto(baseUrl);
  assert.equal(await phone.locator('#tab-code').getAttribute('aria-selected'), 'true');
  await context.close();

  const desktop = await openPlayground(link);
  await renderedElements(desktop.page).first().waitFor();
  assert.equal(await desktop.page.locator('#code-pane').isVisible(), true);
  await desktop.close();
});
