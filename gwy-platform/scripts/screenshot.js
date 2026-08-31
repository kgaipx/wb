#!/usr/bin/env node
/**
 * 全站视觉截图（22 路由 × 亮/暗 = 44 张，移动端 390×844 全页）。
 * 用途：人眼审查自动审计抓不到的视觉问题（层级/间距/对齐/配色/空状态）。
 * 用法：QA_TOKEN="<token>" node scripts/screenshot.js
 * 输出：scripts/shots/<theme>/<route>.png
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
const OUT = "scripts/shots";

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let done = 0;
for (const theme of THEMES) {
  mkdirSync(`${OUT}/${theme}`, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  await page.evaluate(({ t, tk }) => { localStorage.setItem("gwy-theme-mode", t); if (tk) localStorage.setItem("access_token", tk); }, { t: theme, tk: TOKEN });
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: "load", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1300);
    const file = `${OUT}/${theme}/${route === "/" ? "home" : route.replace(/^\//, "")}.png`;
    await page.screenshot({ path: file, fullPage: true }).catch(() => {});
    done++;
    console.log(`shot ${theme}/${route} -> ${file}`);
  }
  await ctx.close();
}
await browser.close();
console.log(`\nDONE ${done} screenshots (2026-09-01 visual review pass)`);
