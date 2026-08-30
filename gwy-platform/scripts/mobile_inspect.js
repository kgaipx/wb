#!/usr/bin/env node
/**
 * 全站移动端 QA 巡检（light + dark × 全部路由 × iPhone 12 视口 390×844 DPR3）
 *
 * 检查每页：页面级横向溢出（documentElement.scrollWidth > innerWidth）、
 *          渲染是否空白（#root 子节点数）、console error / pageerror / 4xx·5xx 资源。
 * 用法：
 *   export PATH="<managed node dir>:$PATH"
 *   QA_TOKEN="<access_token>" node scripts/mobile_inspect.js
 * （QA_TOKEN 可用 curl 注册临时账号获取：
 *   curl -k -X POST https://49.233.171.233/api/auth/register -H "Content-Type: application/json" \
 *     -d '{"email":"qa_<ts>@wbtest.local","password":"test123456","nickname":"QA巡检"}'
 *   自签证书 → 浏览器/脚本需 ignoreHTTPSErrors；控制台报 "SSL certificate error" 为测试环境噪音，
 *   非应用缺陷。带登录态的页面用普通账号 token 即可；/review /admin 的 403 属角色守卫预期行为。）
 */
import { createRequire } from "module";
import { writeFileSync } from "fs";
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

// 角色守卫接口的 403/404 属预期（普通账号不可见），不视为缺陷
const EXPECTED_BAD = [/\/content\/review\//, /\/admin\//, /\/ai\/plan$/];

const results = [];
const browser = await chromium.launch({ executablePath: CHROME, headless: true });

for (const theme of THEMES) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  await page.evaluate(({ t, tk }) => {
    localStorage.setItem("gwy-theme-mode", t);
    if (tk) localStorage.setItem("access_token", tk);
  }, { t: theme, tk: TOKEN });

  for (const route of ROUTES) {
    const consoleErrors = [];
    const httpBad = [];
    let pageError = "";
    const onConsole = (m) => {
      const t = m.text();
      if (t.includes("SSL certificate error")) return; // 自签证书测试噪音
      consoleErrors.push(t.slice(0, 200));
    };
    const onPageError = (e) => { pageError = (e.message || String(e)).slice(0, 200); };
    const onResponse = (r) => {
      if (r.status() >= 400 && !EXPECTED_BAD.some((re) => re.test(r.url()))) {
        httpBad.push(r.status() + " " + r.url().replace(BASE, "").slice(0, 90));
      }
    };
    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("response", onResponse);

    await page.goto(BASE + route, { waitUntil: "load", timeout: 20000 })
      .catch((e) => consoleErrors.push("NAV: " + e.message.slice(0, 120)));
    await page.waitForTimeout(1000);

    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      children: document.getElementById("root")?.children.length || 0,
      h2: document.querySelector("h2, .hero__title, .page-title")?.textContent?.trim()?.slice(0, 24) || "",
    })).catch(() => ({ sw: 0, iw: 0, children: 0, h2: "" }));

    results.push({
      theme, route,
      overflow: m.sw > m.iw + 1, sw: m.sw, iw: m.iw,
      blank: m.children === 0, h2: m.h2,
      ce: consoleErrors, pe: pageError, bad: httpBad.slice(0, 2),
    });

    page.removeListener("console", onConsole);
    page.removeListener("pageerror", onPageError);
    page.removeListener("response", onResponse);
  }
  await context.close();
}
await browser.close();

// 汇总
const pad = (s, n) => String(s).padEnd(n);
console.log(pad("route", 16) + pad("theme", 6) + pad("overflow", 10) + pad("blank", 6) + "consoleErr  pageErr  httpBad  header");
let fails = 0;
for (const r of results) {
  const flag = r.overflow || r.blank || r.ce.length || r.pe || r.bad.length;
  if (flag) fails++;
  console.log(
    pad(r.route, 16) + pad(r.theme, 6) + pad(r.overflow ? "OVERFLOW!" : "ok", 10) +
    pad(r.blank ? "BLANK!" : "ok", 6) + pad(r.ce.length, 10) + pad(r.pe || "-", 8) +
    pad(r.bad.join(",") || "-", 10) + (r.h2 || "-") + (flag ? "  <<<" : "")
  );
}
console.log(`\nTOTAL flagged: ${fails}/${results.length}`);
writeFileSync("_qa_report.json", JSON.stringify(results, null, 2));
process.exit(fails ? 1 : 0);
