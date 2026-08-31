#!/usr/bin/env node
/** 验证 /material 分页：按钮存在、点击后加载更多 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/hp/.workbuddy/binaries/node/workspace/node_modules/playwright-core");

const CHROME = "C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe";
const TOKEN = process.env.QA_TOKEN || "";
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto("https://49.233.171.233/", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
await page.evaluate(({ tk }) => { if (tk) localStorage.setItem("access_token", tk); }, { tk: TOKEN });
await page.goto("https://49.233.171.233/material", { waitUntil: "load", timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1200);
const before = await page.evaluate(() => ({
  count: document.querySelectorAll('.mat-card').length,
  listH: document.querySelector('.mat-list')?.getBoundingClientRect().height || 0,
  btn: Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('加载更多'))?.textContent || 'NO_BTN',
}));
console.log("BEFORE:", before);
const btn = page.locator('button:has-text("加载更多")');
if (await btn.count()) {
  await btn.click();
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({
    count: document.querySelectorAll('.mat-card').length,
    listH: document.querySelector('.mat-list')?.getBoundingClientRect().height || 0,
    btn: Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('加载更多'))?.textContent || 'NO_BTN',
  }));
  console.log("AFTER :", after);
}
await ctx.close();
await browser.close();
