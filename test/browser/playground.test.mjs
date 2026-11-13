import assert from 'node:assert/strict';
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
  assert.match(await page.locator('.problems-summary').textContent(), /Valid · 4 elements, 4 relationships/u);
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
    assert.match(await page.locator('.problems-summary').textContent(), /^Valid/u, option.label);
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
  assert.equal(await page.locator('#preview').getAttribute('data-state'), 'stale');
  assert.equal(await renderedElements(page).count(), 4);
  await close();
});

test('a share link opens the same diagram in a new visit', async () => {
  const first = await openPlayground();
  await renderedElements(first.page).first().waitFor();
  await first.page.selectOption('#examples', 'nested-components');
  await first.page.locator('.problems-summary', { hasText: '4 elements' }).waitFor();
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
