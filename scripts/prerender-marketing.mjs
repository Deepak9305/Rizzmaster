import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const distRoot = join(projectRoot, 'dist');
const contentPath = join(projectRoot, 'services', 'marketingContent.ts');
const legalPath = join(projectRoot, 'services', 'marketingLegal.ts');
const shellPath = join(distRoot, 'index.html');

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const escapeAttribute = escapeHtml;

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
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`;
  return import(moduleUrl);
};

const loadMarketingContent = () => loadTypeScriptModule(contentPath);
const loadMarketingLegal = () => loadTypeScriptModule(legalPath);

const replaceTag = (html, pattern, replacement) => html.replace(pattern, replacement);

const dateLabel = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric'
});

const renderBullets = (bullets = []) => bullets.length
  ? `<ul class="mt-6 space-y-3 rounded-2xl border border-pink-300/10 bg-pink-300/[0.04] p-5 text-sm leading-7 text-white/65">${bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>`
  : '';

const renderResources = (post) => post.resources?.length
  ? `<section class="rounded-3xl border border-amber-300/15 bg-amber-300/[0.04] p-5 md:p-6"><p class="text-xs font-black uppercase tracking-[0.2em] text-amber-200/80">Further reading</p><p class="mt-3 text-sm leading-6 text-white/50">For more perspective on communication, boundaries, and healthy relationship patterns:</p><div class="mt-4 flex flex-col gap-2">${post.resources.map((resource) => `<a href="${escapeAttribute(resource.url)}" target="_blank" rel="noreferrer" class="text-sm font-bold text-amber-100/80">${escapeHtml(resource.label)} -&gt;</a>`).join('')}</div></section>`
  : '';

const renderRelated = (post, posts) => posts
  .filter((candidate) => candidate.slug !== post.slug)
  .slice(0, 3)
  .map((related) => `<a href="/blog/${escapeAttribute(related.slug)}" class="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><span class="text-xs font-bold uppercase tracking-[0.18em] text-pink-300/80">${escapeHtml(related.category)}</span><h3 class="mt-3 text-lg font-bold text-white">${escapeHtml(related.title)}</h3><p class="mt-2 text-sm leading-6 text-white/50">${escapeHtml(related.excerpt)}</p><span class="mt-4 inline-block text-sm font-bold text-pink-200">Read the guide -&gt;</span></a>`)
  .join('');

const renderArticle = (post, posts) => {
  const articleSections = post.sections.map((section) => `<section><h2 class="text-2xl font-bold tracking-tight text-white md:text-3xl">${escapeHtml(section.heading)}</h2>${section.paragraphs.map((paragraph) => `<p class="mt-5 text-base leading-8 text-white/60">${escapeHtml(paragraph)}</p>`).join('')}${renderBullets(section.bullets)}</section>`).join('');
  const internalLinks = posts
    .filter((candidate) => candidate.slug !== post.slug)
    .slice(0, 3)
    .map((related) => `<a href="/blog/${escapeAttribute(related.slug)}" class="rounded-full border border-white/10 bg-black/20 px-3.5 py-2 text-xs font-bold text-white/65">${escapeHtml(related.title)} -&gt;</a>`)
    .join('');

  return `<main class="marketing-container marketing-page-padding"><a href="/blog" class="mb-10 inline-flex items-center gap-2 text-sm font-bold text-white/45">&lt;- Back to the blog</a><article class="mx-auto max-w-3xl"><div class="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-white/35"><span class="text-pink-300/80">${escapeHtml(post.category)}</span><span aria-hidden="true">&bull;</span><span>${escapeHtml(post.readingTime)}</span><span aria-hidden="true">&bull;</span><time datetime="${escapeAttribute(post.date)}">${escapeHtml(dateLabel(post.date))}</time></div><h1 class="mt-6 text-4xl font-black leading-[1.05] tracking-[-0.04em] text-white md:text-6xl">${escapeHtml(post.title)}</h1><p class="mt-7 text-lg leading-8 text-white/55">${escapeHtml(post.description)}</p>${post.image ? `<figure class="mt-9 overflow-hidden rounded-3xl border border-pink-300/15 bg-black/20"><img src="${escapeAttribute(post.image)}" alt="${escapeAttribute(post.imageAlt || post.title)}" class="aspect-[16/9] w-full object-cover"><figcaption class="border-t border-white/10 px-5 py-3 text-xs text-white/35">A better follow-up is clear, calm, and gives the other person room to choose.</figcaption></figure>` : ''}<div class="mt-10 space-y-5"><aside class="relative overflow-hidden rounded-3xl border border-pink-300/20 bg-pink-500/[0.08] p-6"><p class="text-xs font-black uppercase tracking-[0.2em] text-pink-200/80">Quick answer</p><p class="mt-3 text-base leading-7 text-white/75">${escapeHtml(post.excerpt)}</p></aside><nav aria-label="Related dating guides" class="rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6"><p class="text-xs font-black uppercase tracking-[0.2em] text-pink-200/75">Continue reading</p><div class="mt-4 flex flex-wrap gap-2.5">${internalLinks}</div></nav>${renderResources(post)}</div><div class="mt-12 space-y-12">${articleSections}</div><section class="mt-16 rounded-3xl border border-pink-300/15 bg-pink-500/[0.08] p-7"><p class="text-xs font-bold uppercase tracking-[0.22em] text-pink-200/75">Need a second opinion?</p><h2 class="mt-3 text-2xl font-bold text-white">Turn the situation into a send-ready reply.</h2><p class="mt-3 max-w-xl text-sm leading-6 text-white/50">Rizz Master helps you find the right words without losing your personality.</p><a href="https://play.google.com/store/apps/details?id=app.vercel.rizzmaster&amp;pcampaignid=web_share" class="mt-6 inline-flex rounded-2xl bg-pink-500 px-5 py-3.5 text-sm font-bold text-white">Get it on Google Play</a></section><section class="mt-20 border-t border-white/10 pt-12"><p class="text-xs font-black uppercase tracking-[0.2em] text-pink-200/75">Keep reading</p><h2 class="mt-3 text-2xl font-black text-white md:text-3xl">More help for your next text</h2><div class="mt-7 grid gap-4 md:grid-cols-3">${renderRelated(post, posts)}</div></section></article></main><footer class="marketing-container border-t border-white/10 py-10 text-sm text-white/45"><a href="/blog">Blog</a> <a href="/privacy" class="ml-4">Privacy</a> <a href="/terms" class="ml-4">Terms</a> <a href="/support" class="ml-4">Support</a></footer>`;
};

const renderBlogIndex = (posts) => `<main class="marketing-container marketing-page-padding"><div class="max-w-3xl"><p class="text-xs font-bold uppercase tracking-[0.28em] text-pink-300/80">The Rizz Master blog</p><h1 class="mt-5 text-5xl font-black tracking-[-0.04em] text-white md:text-7xl">Better texts start with a better next move.</h1><p class="mt-6 max-w-2xl text-lg leading-8 text-white/55">Practical texting and dating advice for the conversations you want to handle with a little more confidence.</p></div><div class="mt-16 grid gap-5 md:grid-cols-2">${posts.map((post) => `<article class="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><a href="/blog/${escapeAttribute(post.slug)}">${post.image ? `<img src="${escapeAttribute(post.image)}" alt="${escapeAttribute(post.imageAlt || post.title)}" class="aspect-[16/9] w-full rounded-2xl object-cover">` : ''}<p class="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-pink-300/80">${escapeHtml(post.category)} &bull; ${escapeHtml(post.readingTime)}</p><h2 class="mt-3 text-xl font-bold text-white">${escapeHtml(post.title)}</h2><p class="mt-3 text-sm leading-6 text-white/55">${escapeHtml(post.excerpt)}</p><span class="mt-5 inline-block text-sm font-bold text-pink-200">Read the guide -&gt;</span></a></article>`).join('')}</div></main><footer class="marketing-container border-t border-white/10 py-10 text-sm text-white/45"><a href="/landing">Rizz Master</a> <a href="/privacy" class="ml-4">Privacy</a> <a href="/terms" class="ml-4">Terms</a> <a href="/support" class="ml-4">Support</a></footer>`;

const renderLegalPage = (page) => {
  const sections = page.sections.map((section) => `<section class="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8"><h2 class="text-xl font-bold text-white">${escapeHtml(section.heading)}</h2>${(section.paragraphs || []).map((paragraph) => `<p class="mt-3 text-sm leading-7 text-white/55">${escapeHtml(paragraph)}</p>`).join('')}${section.bullets?.length ? `<ul class="mt-4 space-y-2 text-sm leading-7 text-white/55">${section.bullets.map((bullet) => `<li class="flex gap-3"><span class="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-pink-300" aria-hidden="true"></span><span>${escapeHtml(bullet)}</span></li>`).join('')}</ul>` : ''}</section>`).join('');
  return `<main class="marketing-container marketing-page-padding"><a href="/landing" class="mb-10 inline-flex items-center gap-2 text-sm font-bold text-white/45">&lt;- Back home</a><div class="max-w-3xl"><p class="text-xs font-bold uppercase tracking-[0.28em] text-pink-300/80">${escapeHtml(page.eyebrow)}</p><h1 class="mt-5 text-5xl font-black tracking-[-0.04em] text-white md:text-7xl">${escapeHtml(page.title)}</h1><p class="mt-6 text-lg leading-8 text-white/55">${escapeHtml(page.intro)}</p><p class="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-white/30">Last updated ${escapeHtml(page.updatedAt)}</p></div><div class="mt-12 max-w-3xl space-y-5">${sections}</div><a href="${escapeAttribute(page.actionHref)}" class="mt-8 inline-flex rounded-2xl border border-white/15 bg-white/[0.05] px-5 py-3.5 text-sm font-bold text-white">${escapeHtml(page.actionLabel)}</a></main><footer class="marketing-container border-t border-white/10 py-10 text-sm text-white/45"><a href="/landing">Rizz Master</a> <a href="/blog" class="ml-4">Blog</a> <a href="/privacy" class="ml-4">Privacy</a> <a href="/terms" class="ml-4">Terms</a> <a href="/support" class="ml-4">Support</a></footer>`;
};

const setArticleMetadata = (html, post) => {
  const title = `${post.title} | Rizz Master`;
  const canonical = `https://rizzmaster.online/blog/${post.slug}`;
  const metadata = {
    title,
    description: post.description,
    keywords: post.keywords.join(', '),
    type: 'article',
    url: canonical,
    image: post.image ? `https://rizzmaster.online${post.image}` : ''
  };

  let result = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(metadata.title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${escapeAttribute(metadata.description)}" />`)
    .replace(/<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${escapeAttribute(metadata.title)}" />`)
    .replace(/<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${escapeAttribute(metadata.description)}" />`)
    .replace(/<meta\s+property="og:type"[^>]*>/i, `<meta property="og:type" content="${metadata.type}" />`)
    .replace(/<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${escapeAttribute(metadata.url)}" />`)
    .replace(/<link\s+rel="canonical"[^>]*>/i, '');

  result = result.replace('</head>', `<meta name="keywords" content="${escapeAttribute(metadata.keywords)}" />\n<link rel="canonical" href="${escapeAttribute(metadata.url)}" />\n${metadata.image ? `<meta property="og:image" content="${escapeAttribute(metadata.image)}" />` : ''}\n<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updatedAt,
    keywords: post.keywords.join(', '),
    articleSection: post.category,
    ...(post.image ? { image: metadata.image } : {}),
    author: { '@type': 'Organization', name: 'Rizz Master' },
    publisher: { '@type': 'Organization', name: 'Rizz Master' },
    mainEntityOfPage: canonical
  })}</script>\n</head>`);

  return result;
};

const setIndexMetadata = (html) => html
  .replace(/<title>[\s\S]*?<\/title>/i, '<title>Rizz Master Blog | Better texts, better dates</title>')
  .replace(/<meta\s+name="description"[^>]*>/i, '<meta name="description" content="Practical texting, dating app, opener, and profile advice for better conversations." />')
  .replace(/<meta\s+property="og:title"[^>]*>/i, '<meta property="og:title" content="Rizz Master Blog | Better texts, better dates" />')
  .replace(/<meta\s+property="og:description"[^>]*>/i, '<meta property="og:description" content="Practical texting, dating app, opener, and profile advice for better conversations." />')
  .replace(/<meta\s+property="og:type"[^>]*>/i, '<meta property="og:type" content="website" />')
  .replace(/<meta\s+property="og:url"[^>]*>/i, '<meta property="og:url" content="https://rizzmaster.online/blog" />')
  .replace(/<div id="root">[\s\S]*?<\/div>\s*<\/body>/i, `<div id="root" data-prerendered="true">${renderBlogIndex(BLOG_POSTS)}</div>\n</body>`)
  .replace('</head>', '<link rel="canonical" href="https://rizzmaster.online/blog" />\n<script type="application/ld+json">{"@context":"https://schema.org","@type":"CollectionPage","name":"Rizz Master Blog","url":"https://rizzmaster.online/blog"}</script>\n</head>');

const setLegalMetadata = (html, key, page) => {
  const canonical = `https://rizzmaster.online/${key}`;
  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.title,
    description: page.intro,
    url: canonical,
  }).replaceAll('<', '\\u003c');
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(page.title)} | Rizz Master</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${escapeAttribute(page.intro)}" />`)
    .replace(/<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${escapeAttribute(page.title)} | Rizz Master" />`)
    .replace(/<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${escapeAttribute(page.intro)}" />`)
    .replace(/<meta\s+property="og:type"[^>]*>/i, '<meta property="og:type" content="website" />')
    .replace(/<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${escapeAttribute(canonical)}" />`)
    .replace(/<link\s+rel="canonical"[^>]*>/i, '')
    .replace(/<div id="root">[\s\S]*?<\/div>\s*<\/body>/i, `<div id="root" data-prerendered="true">${renderLegalPage(page)}</div>\n</body>`)
    .replace('</head>', `<link rel="canonical" href="${escapeAttribute(canonical)}" />\n<script type="application/ld+json">${schema}</script>\n</head>`);
};

const createPageShell = (shell, body) => shell
  .replace(/(\s(?:src|href)=")\.\/assets\//g, '$1/assets/')
  .replace(/(\s(?:src|href)=")\.\/logo\.png/g, '$1/logo.png')
  .replace(/<div id="root">[\s\S]*?<\/div>\s*<\/body>/i, `<div id="root" data-prerendered="true">${body}</div>\n</body>`);

const writePage = async (route, html) => {
  const outputPath = join(distRoot, route, 'index.html');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, 'utf8');
};

const { BLOG_POSTS } = await loadMarketingContent();
const { MARKETING_LEGAL_PAGES } = await loadMarketingLegal();
const shell = await readFile(shellPath, 'utf8');

await writePage('blog', setIndexMetadata(createPageShell(shell, renderBlogIndex(BLOG_POSTS))));
for (const post of BLOG_POSTS) {
  await writePage(`blog/${post.slug}`, setArticleMetadata(createPageShell(shell, renderArticle(post, BLOG_POSTS)), post));
}

for (const [key, page] of Object.entries(MARKETING_LEGAL_PAGES)) {
  await writePage(key, setLegalMetadata(createPageShell(shell, renderLegalPage(page)), key, page));
}

console.log(`Prerendered ${BLOG_POSTS.length} blog articles, the blog index, and legal pages.`);

