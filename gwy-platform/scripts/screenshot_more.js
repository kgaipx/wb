#!/usr/bin/env node
import { createRequire } from "module";
import { mkdirSync } from "fs";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/hp/.workbuddy/binaries/node/workspace/node_modules/playwright-core");

const BASE = process.env.QA_BASE || "https://49.233.171.233";
const CHROME = process.env.QA_CHROME || "C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe";
const TOKEN = process.env.QA_TOKEN || "";
const THEMES = ["light", "dark"];
const OUT = "scripts/shots/more";

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
for (const theme of THEMES) {
  mkdirSync(`${OUT}/${theme}`, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  await page.evaluate(({ t, tk }) => { localStorage.setItem("gwy-theme-mode", t); if (tk) localStorage.setItem("access_token", tk); }, { t: theme, tk: TOKEN });
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  // click "更多" tab (last nav item)
  const more = await page.locator(".nav-link", { hasText: "更多" }).first();
  if (await more.count()) await more.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${theme}/more_sheet.png` });
}
await browser.close();
console.log("done more sheet screenshots");
