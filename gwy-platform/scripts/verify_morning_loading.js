import { createRequire } from 'module';
import { mkdirSync } from 'fs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/hp/.workbuddy/binaries/node/workspace/node_modules/playwright-core');

const BASE = 'https://49.233.171.233';
const TOKEN = process.env.QA_TOKEN || '';
const CHROME = 'C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe';

const todayKey = () => {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 820, height: 1180 },
    isMobile: false,
    ignoreHTTPSErrors: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // intercept morning report and delay it so loading state is visible
  await page.route('**/api/ai/morning-report*', async (route) => {
    await new Promise(r => setTimeout(r, 2500));
    await route.continue();
  });

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.evaluate(({ tk }) => {
    localStorage.setItem('theme', 'light');
    if (tk) localStorage.setItem('access_token', tk);
  }, { tk: TOKEN });

  await page.evaluate(({ key }) => {
    localStorage.removeItem(key);
  }, { key: `gwy_morning_${todayKey()}` });

  await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);

  mkdirSync('scripts/shots/verify', { recursive: true });
  await page.screenshot({ path: 'scripts/shots/verify/morning_loading_tablet.png', fullPage: false });

  const info = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.card .muted'));
    const row = rows.find(el => el.textContent?.includes('晨报生成中'));
    const textSpan = Array.from(row?.querySelectorAll('span') || []).find(el => el.textContent?.includes('晨报生成中'));
    return {
      found: !!row,
      rowDisplay: row?.style.display,
      rowGap: row?.style.gap,
      textWhiteSpace: textSpan?.style.whiteSpace,
      textContent: textSpan?.textContent,
      textRect: textSpan?.getBoundingClientRect(),
    };
  });
  console.log(JSON.stringify(info, null, 2));

  await ctx.close();
  await browser.close();
})();
