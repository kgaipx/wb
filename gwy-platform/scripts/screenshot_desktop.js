#!/usr/bin/env node
import { createRequire } from "module";
import { mkdirSync } from "fs";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/hp/.workbuddy/binaries/node/workspace/node_modules/playwright-core");

const BASE = process.env.QA_BASE || "https://49.233.171.233";
const CHROME = process.env.QA_CHROME || "C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe";
const TOKEN = process.env.QA_TOKEN || "";
const THEMES = ["light", "dark"];
const ROUTES = ["/", "/learn", "/practice", "/material", "/data", "/membership", "/chat", "/login", "/profile", "/plan", "/review", "/exam", "/assessment", "/flashcards", "/wrong", "/favorites", "/essay", "/search", "/reinforce", "/predict", "/notifications", "/admin"];
const OUT = "scripts/shots/desktop";

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
for (const theme of THEMES) {
  mkdirSync(`${OUT}/${theme}`, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  await page.evaluate(({ t, tk }) => { localStorage.setItem("gwy-theme-mode", t); if (tk) localStorage.setItem("access_token", tk); }, { t: theme, tk: TOKEN });
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: "load", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1400);
    const file = `${OUT}/${theme}/${route === "/" ? "home" : route.replace(/^\//, "")}.png`;
    await page.screenshot({ path: file }).catch(() => {});
  }
  await ctx.close();
}
await browser.close();
console.log("done desktop screenshots");
