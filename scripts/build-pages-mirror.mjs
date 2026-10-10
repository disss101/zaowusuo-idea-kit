import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// GitHub Pages serves this repository below /zaowusuo-idea-kit/. Keep the
// hosted Site's public directory as the source of truth for its appearance.
const publicDir = new URL('../public/', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:\/)/, '');
const docsDir = new URL('../docs/', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:\/)/, '');
const assetsDir = join(docsDir, 'assets');
const sourceAssetsDir = join(publicDir, 'assets');
// Match the asset pair currently loaded by the published Site. Its checked-in
// public/index.html still references an older pair retained in public/assets.
const liveScript = 'index-Dn1eS_8t.js';
const liveStyles = 'index-BiBRtw0X.css';

for (const name of readdirSync(docsDir)) {
  if (name === '.nojekyll' || name.endsWith('.md')) continue;
  rmSync(join(docsDir, name), { recursive: true, force: true });
}
mkdirSync(assetsDir, { recursive: true });

for (const name of readdirSync(publicDir)) {
  if (name === 'assets') continue;
  copyFileSync(join(publicDir, name), join(docsDir, name));
}
for (const name of readdirSync(sourceAssetsDir)) {
  // Old hashed builds are retained in the hosted checkout, but unused by the
  // current index.html. Ship the active pair and every image it references.
  if (name.startsWith('index-') && ![liveScript, liveStyles].includes(name)) continue;
  copyFileSync(join(sourceAssetsDir, name), join(assetsDir, name));
}

function rewrite(relativePath, transform) {
  const path = join(docsDir, relativePath);
  writeFileSync(path, transform(readFileSync(path, 'utf8')));
}

rewrite('index.html', source => source
  .replaceAll('href="/favicon.svg"', 'href="./favicon.svg"')
  .replaceAll('href="/styles.css"', 'href="./styles.css"')
  .replaceAll('src="/app.js"', 'src="./app.js"')
  .replaceAll('src="/assets/', 'src="./assets/')
  .replaceAll('href="/assets/', 'href="./assets/')
  .replace('index-wc-_j_N9.js', liveScript)
  .replace('index-lwqwHeId.css', liveStyles)
  .replace('  <script type="module" src="./app.js"></script>', '  <script src="./pages-bridge.js"></script>\n  <script type="module" src="./app.js"></script>'));
rewrite('styles.css', source => source.replaceAll('/assets/', './assets/'));
rewrite('app.js', source => source.replaceAll('/assets/', './assets/'));
rewrite(`assets/${liveStyles}`, source => source.replaceAll('/assets/', './'));
rewrite(`assets/${liveScript}`, source => {
  const withoutChatGptSignIn = source.replace(
    /c\.createElement\("a",\{className:"account-secondary",href:[A-Za-z]+\},c\.createElement\(Bv,\{size:15\}\)," 使用 ChatGPT 登录"\),/,
    '',
  );
  if (withoutChatGptSignIn === source) throw new Error('Expected customer ChatGPT login link was not found in the active bundle.');
  return withoutChatGptSignIn.replaceAll('/assets/', './assets/');
});
writeFileSync(join(docsDir, 'pages-bridge.js'), readFileSync(new URL('./pages-bridge.js', import.meta.url)));
writeFileSync(join(docsDir, '.nojekyll'), '');
console.log('GitHub Pages mirror built from the current hosted public assets.');
