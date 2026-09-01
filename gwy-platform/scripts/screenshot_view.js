#!/usr/bin/env node
/**
 * 视口截图（22 路由 × 亮/暗 = 44 张，移动端 390×1500 ≈ 1.5 屏）。
 * 用途：人眼审查首屏/次屏的视觉层级、间距、对齐、配色、空状态。
 * 用法：QA_TOKEN="<token>" node scripts/screenshot_view.js
 * 输出：scripts/shots/view/<theme>/<route>.png
 */
import { createRequire } from "module";
import { mkdirSync } from "fs";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/hp/.workbuddy/binaries/node/workspace/node_modules/playwright-core");

const BASE = process.env.QA_BASE || "https://49.233.171.233";
const CHROME = process.env.QA_CHROME || "C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe";
const TOKEN = process.env.QA_TOKEN || "";
const THEMES = ["light", "dark"];
const ROUTES = [
  "/", "/login", "/learn", "/practice", "/exam", "/assessment", "/wrong",
  "/favorites", "/profile", "/plan", "/review", "/membership", "/essay",
  "/data", "/search", "/material", "/reinforce", "/predict", "/flashcards",
  "/admin", "/notifications", "/chat",
];
const OUT = "scripts/shots/view";

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let done = 0;
for (const theme of THEMES) {
  mkdirSync(`${OUT}/${theme}`, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 1500 },
    isMobile: true, hasTouch: true, ignoreHTTPSErrors: true, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  await page.evaluate(({ t, tk }) => {
    localStorage.setItem("gwy-theme-mode", t);
    if (tk) localStorage.setItem("access_token", tk);
  }, { t: theme, tk: TOKEN });
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: "load", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1400);
    const file = `${OUT}/${theme}/${route === "/" ? "home" : route.replace(/^\//, "")}.png`;
    await page.screenshot({ path: file }).catch(() => {});
    done++;
  }
  await ctx.close();
}
await browser.close();
console.log(`\nDONE ${done} viewport screenshots`);
