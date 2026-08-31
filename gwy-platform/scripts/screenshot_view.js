#!/usr/bin/env node
/** 截移动端视口图（非 fullPage），便于人眼审查首屏 */
import { createRequire } from "module";
import { mkdirSync } from "fs";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/hp/.workbuddy/binaries/node/workspace/node_modules/playwright-core");

const BASE = process.env.QA_BASE || "https://49.233.171.233";
const CHROME = process.env.QA_CHROME || "C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe";
const TOKEN = process.env.QA_TOKEN || "";
const OUT = "scripts/shots/viewport";

const pairs = [
  ["material", "/material"],
  ["practice", "/practice"],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
await page.evaluate(({ tk }) => { if (tk) localStorage.setItem("access_token", tk); }, { tk: TOKEN });
for (const [name, route] of pairs) {
  await page.goto(BASE + route, { waitUntil: "load", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(`${name} -> ${file}`);
}
await ctx.close();
await browser.close();
