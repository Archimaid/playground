import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const origin = 'https://try.archimaid.org';
const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const publicFile = (path: string): URL => new URL(`public${new URL(path, origin).pathname}`, root);

function attribute(selector: RegExp): string {
  const value = selector.exec(html)?.[1];
  assert.ok(value, `index.html has no ${selector.source}`);
  return value;
}

test('the canonical URL, Open Graph URL and sitemap agree', () => {
  const canonical = attribute(/<link rel="canonical" href="([^"]+)"/u);
  assert.equal(canonical, `${origin}/`);
  assert.equal(attribute(/<meta property="og:url" content="([^"]+)"/u), canonical);
  assert.match(readFileSync(publicFile('/sitemap.xml'), 'utf8'), new RegExp(`<loc>${canonical}</loc>`, 'u'));
  assert.match(readFileSync(publicFile('/robots.txt'), 'utf8'), new RegExp(`Sitemap: ${origin}/sitemap.xml`, 'u'));
});

test('the Open Graph image exists at the size the tags declare', () => {
  const image = attribute(/<meta property="og:image" content="([^"]+)"/u);
  assert.ok(image.startsWith(`${origin}/`), 'social networks need an absolute image URL');
  const png = readFileSync(publicFile(image));
  // A PNG's IHDR chunk stores the width and height as big-endian integers at bytes 16 and 20.
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(String(png.readUInt32BE(16)), attribute(/<meta property="og:image:width" content="(\d+)"/u));
  assert.equal(String(png.readUInt32BE(20)), attribute(/<meta property="og:image:height" content="(\d+)"/u));
});

test('the structured data is valid JSON describing the web application', () => {
  const json = /<script type="application\/ld\+json">([\s\S]+?)<\/script>/u.exec(html)?.[1];
  assert.ok(json);
  const data = JSON.parse(json) as Record<string, unknown>;
  assert.equal(data['@type'], 'WebApplication');
  assert.equal(data['url'], `${origin}/`);
  assert.ok(existsSync(publicFile(String(data['image']))));
});

test('every icon the page and manifest name is in public/', () => {
  const manifest = JSON.parse(readFileSync(publicFile('/site.webmanifest'), 'utf8')) as { icons: { src: string }[] };
  const linked = Array.from(html.matchAll(/<link rel="(?:icon|apple-touch-icon|manifest)" href="([^"]+)"/gu), (match) =>
    String(match[1]),
  );
  for (const path of [...linked, ...manifest.icons.map((icon) => icon.src)]) {
    assert.ok(existsSync(publicFile(path)), `${path} is missing from public/`);
  }
});
