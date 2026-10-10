import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const webBuild = join(projectRoot, 'dist');
const mobileBuild = join(projectRoot, 'dist-mobile');

// Capacitor still needs a local web directory for the native fallback, but
// the Android app normally loads server.url. Keep the app shell and its
// chunks while leaving website-only pages and media in the Vercel build.
const excludedDirectories = new Set(['blog', 'landing', 'privacy', 'rizzline', 'support', 'terms']);
const excludedFiles = new Set([
  'manifest.webmanifest',
  'robots.txt',
  'sitemap.xml',
  'logo.png',
  'rizzline-logo.png',
  'rizzmaster-hero-poster.png',
]);

async function copyMobileBundle(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (excludedDirectories.has(entry.name) || excludedFiles.has(entry.name)) continue;
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyMobileBundle(from, to);
    } else if (entry.isFile()) {
      await cp(from, to);
    }
  }
}

await stat(webBuild);
await rm(mobileBuild, { recursive: true, force: true });
await copyMobileBundle(webBuild, mobileBuild);

const sizeOf = async directory => {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) total += await sizeOf(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
};

const bytes = await sizeOf(mobileBuild);
console.log(`[mobile-bundle] Created ${mobileBuild} (${(bytes / 1024 / 1024).toFixed(2)} MB).`);
