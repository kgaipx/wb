#!/usr/bin/env node
/** 诊断页面异常高度：输出 scrollHeight、body 直子元素高度、最高的 10 个元素 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/hp/.workbuddy/binaries/node/workspace/node_modules/playwright-core");

const BASE = process.env.QA_BASE || "https://49.233.171.233";
const CHROME = process.env.QA_CHROME || "C:/Users/hp/AppData/Local/Google/Chrome/Application/chrome.exe";
const TOKEN = process.env.QA_TOKEN || "";
const routes = ["/material", "/practice", "/learn", "/plan", "/profile", "/reinforce", "/predict", "/flashcards"];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
await page.evaluate(({ tk }) => { if (tk) localStorage.setItem("access_token", tk); }, { tk: TOKEN });

for (const route of routes) {
  await page.goto(BASE + route, { waitUntil: "load", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const data = await page.evaluate(() => {
    const rect = (el) => el.getBoundingClientRect();
    const cls = (el) => typeof el.className === "string" ? el.className.slice(0, 60) : "";
    const all = Array.from(document.querySelectorAll("body *"));
    const heights = all.map(el => ({ tag: el.tagName, cls: cls(el), h: rect(el).height })).filter(x => x.h > 50);
    heights.sort((a, b) => b.h - a.h);
    const bodyChildren = Array.from(document.body.children).map(el => ({ tag: el.tagName, cls: cls(el), h: rect(el).height }));
    return {
      scrollHeight: document.documentElement.scrollHeight,
      bodyHeight: document.body.getBoundingClientRect().height,
      bodyChildren,
      top10: heights.slice(0, 10),
    };
  });
  console.log(`\n=== ${route} ===`);
  console.log(`scrollHeight=${data.scrollHeight}px  bodyHeight=${Math.round(data.bodyHeight)}px`);
  console.log("body children heights:");
  for (const c of data.bodyChildren) console.log(`  ${c.tag} .${c.cls}  h=${Math.round(c.h)}`);
  console.log("top 10 tall elements:");
  for (const e of data.top10.slice(0, 10)) console.log(`  ${e.tag} .${e.cls}  h=${Math.round(e.h)}`);
}
await ctx.close();
await browser.close();
