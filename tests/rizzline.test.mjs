import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom' });
after(() => server.close());
const catalog = await server.ssrLoadModule('/components/rizzline/data/curatedLines.ts');
const engine = await server.ssrLoadModule('/components/rizzline/services/pickupLineApi.ts');
const sanitizer = await server.ssrLoadModule('/components/rizzline/utils/textSanitizer.ts');
const history = await server.ssrLoadModule('/components/rizzline/utils/browseHistory.ts');
const content = await server.ssrLoadModule('/components/rizzline/pageContent.ts');
const routes = await server.ssrLoadModule('/services/marketingRoutes.ts');

test('catalog contains unique, valid lines and accurate category pools', () => {
  assert.ok(catalog.CURATED_PICKUP_LINES.length > 1400);
  assert.equal(new Set(catalog.CURATED_PICKUP_LINES.map(line => line.text)).size, catalog.CURATED_PICKUP_LINES.length);
  for (const line of catalog.CURATED_PICKUP_LINES) {
    assert.equal(sanitizer.isCorruptedText(line.text), false);
    assert.ok(catalog.LINES_BY_CATEGORY[line.category].includes(line));
    assert.equal(line.reactions, undefined, 'web version must not invent community reaction counts');
  }
});

test('each category avoids repeating the last 30 lines', () => {
  for (const category of Object.keys(catalog.LINES_BY_CATEGORY)) {
    const lines = Array.from({ length: 31 }, () => engine.getRandomPickupLine(category).line);
    assert.equal(new Set(lines.map(line => line.id)).size, 31);
    if (category !== 'all') assert.ok(lines.every(line => line.category === category));
  }
});

test('back navigation and bounded history retain the correct line', () => {
  let state = history.createBrowseState(catalog.CURATED_PICKUP_LINES[0]);
  for (let index = 1; index <= 110; index++) state = history.appendLine(state, catalog.CURATED_PICKUP_LINES[index]);
  assert.equal(state.lines.length, 100);
  assert.equal(history.previousLine(state).lines[98].id, catalog.CURATED_PICKUP_LINES[109].id);
  state = history.appendLine(history.previousLine(state), catalog.CURATED_PICKUP_LINES[200]);
  assert.equal(state.lines[state.index].id, catalog.CURATED_PICKUP_LINES[200].id);
});

test('page renders crawlable examples, FAQs and matching schema without browser APIs', async () => {
  const { default: Page } = await server.ssrLoadModule('/components/rizzline/RizzlinePage.tsx');
  const html = renderToStaticMarkup(createElement(Page));
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  for (const category of content.RIZZLINE_CATEGORIES) {
    assert.ok(html.includes(`${category.label} pickup lines`));
    for (const example of category.examples) assert.ok(catalog.CURATED_PICKUP_LINES.some(line => line.text === example));
  }
  for (const faq of content.RIZZLINE_FAQS) assert.ok(html.includes(faq.question));
  assert.equal(content.RIZZLINE_SCHEMA['@graph'][1].url, content.RIZZLINE_SEO.url);
  assert.equal(routes.isMarketingPath('/rizzline/'), true);
  assert.equal(routes.isMarketingPath('/'), false);
});

test('production route serves an indexable page with canonical, assets and a sitemap entry', async () => {
  const html = await readFile(new URL('../dist/rizzline/index.html', import.meta.url), 'utf8');
  assert.match(html, /name="robots" content="index,follow"/);
  assert.match(html, /rel="canonical" href="https:\/\/rizzmaster\.online\/rizzline"/);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1.0"/);
  assert.match(html, /<h1\b/);
  assert.match(html, /(?:src|href)="\/assets\//);
  assert.doesNotMatch(html, /(?:src|href)="\.\/assets\//);
  const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  assert.equal((sitemap.match(/<loc>https:\/\/rizzmaster\.online\/rizzline<\/loc>/g) || []).length, 1);
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.rewrites.find(route => route.source === '/rizzline').destination, '/rizzline/index.html');
});
