import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const contentPath = join(projectRoot, 'services', 'marketingContent.ts');
const sitemapPath = join(projectRoot, 'public', 'sitemap.xml');
const siteUrl = 'https://rizzmaster.online';

const loadTypeScriptModule = async (sourcePath) => {
  const source = await readFile(sourcePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      removeComments: true
    },
    fileName: sourcePath
  }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(transpiled).toString('base64'));
};

const page = (path, lastmod, changefreq, priority) => [
  '  <url>',
  '    <loc>' + siteUrl + path + '</loc>',
  '    <lastmod>' + lastmod + '</lastmod>',
  '    <changefreq>' + changefreq + '</changefreq>',
  '    <priority>' + priority + '</priority>',
  '  </url>'
].join('\n');

const { BLOG_POSTS } = await loadTypeScriptModule(contentPath);
const latestPostDate = BLOG_POSTS.reduce((latest, post) => post.date > latest ? post.date : latest, '1970-01-01');
const entries = [
  page('/', latestPostDate, 'weekly', '1.0'),
  page('/rizzline-pickup-lines', '2026-10-23', 'monthly', '0.9'),
  page('/landing', latestPostDate, 'weekly', '1.0'),
  page('/blog', latestPostDate, 'weekly', '0.9'),
  ...BLOG_POSTS.map((post) => page('/blog/' + post.slug, post.updatedAt || post.date, 'monthly', '0.85')),
  page('/privacy', '2026-09-15', 'yearly', '0.3'),
  page('/terms', '2026-09-15', 'yearly', '0.3'),
  page('/support', '2026-09-15', 'yearly', '0.4')
];

const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + entries.join('\n')
  + '\n</urlset>\n';

await writeFile(sitemapPath, sitemap, 'utf8');
console.log('Generated sitemap with ' + entries.length + ' URLs (' + BLOG_POSTS.length + ' blog articles).');
