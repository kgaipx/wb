#!/usr/bin/env node
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/hp/.workbuddy/binaries/node/workspace/node_modules/playwright-core");

const BASE = process.env.QA_BASE || "https://49.233.171.233";
const CHROME = process.env.QA_CHROME || "C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe";
const TOKEN = process.env.QA_TOKEN || "";

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
await page.evaluate(({ tk }) => { if (tk) localStorage.setItem("access_token", tk); }, { tk: TOKEN });

for (const route of ["/learn", "/practice", "/material"]) {
  await page.goto(BASE + route, { waitUntil: "load", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const data = await page.evaluate(() => {
    const fab = document.querySelector(".fab");
    const main = document.querySelector(".app-main");
    const lastChild = main?.lastElementChild;
    const nav = document.querySelector(".nav-bar");
    const rects = {
      fab: fab?.getBoundingClientRect(),
      main: main?.getBoundingClientRect(),
      lastChild: lastChild?.getBoundingClientRect(),
      nav: nav?.getBoundingClientRect(),
      mainStyles: main ? { paddingBottom: getComputedStyle(main).paddingBottom, height: main.getBoundingClientRect().height } : null,
    };
    return rects;
  });
  console.log(`\n=== ${route} ===`);
  console.log("viewport h:", await page.evaluate(() => window.innerHeight));
  console.log("main paddingBottom:", data.mainStyles?.paddingBottom);
  console.log("main height:", data.mainStyles?.height);
  if (data.fab) console.log("FAB rect:", { top: data.fab.top, bottom: data.fab.bottom, height: data.fab.height, right: data.fab.right });
  if (data.nav) console.log("NAV rect:", { top: data.nav.top, height: data.nav.height });
  if (data.lastChild) console.log("lastChild rect:", { top: data.lastChild.top, bottom: data.lastChild.bottom, height: data.lastChild.height });
}
await ctx.close();
await browser.close();
