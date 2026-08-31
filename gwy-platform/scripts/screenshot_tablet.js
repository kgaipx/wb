import { createRequire } from 'module';
import { mkdirSync } from 'fs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/hp/.workbuddy/binaries/node/workspace/node_modules/playwright-core');

const BASE = 'https://49.233.171.233';
const TOKEN = process.env.QA_TOKEN || '';
const CHROME = 'C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe';

const routes = [
  { path: '/', name: 'home' },
  { path: '/learn', name: 'learn' },
  { path: '/practice', name: 'practice' },
  { path: '/material', name: 'material' },
  { path: '/data', name: 'data' },
  { path: '/membership', name: 'membership' },
  { path: '/chat', name: 'chat' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 820, height: 1180 },
    isMobile: false,
    ignoreHTTPSErrors: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  for (const theme of ['light', 'dark']) {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.evaluate(({ tk }) => {
      localStorage.setItem('theme', tk.theme);
      if (tk.token) localStorage.setItem('access_token', tk.token);
    }, { tk: { theme, token: TOKEN } });

    for (const route of routes) {
      const url = `${BASE}${route.path}`;
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 20000 });
      } catch {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      }
      await page.waitForTimeout(1200);

      const dir = `scripts/shots/tablet/${theme}`;
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: `${dir}/${route.name}.png`, fullPage: false });
      console.log('captured', theme, route.name);
    }
  }

  await ctx.close();
  await browser.close();
  console.log('done tablet screenshots');
})();
