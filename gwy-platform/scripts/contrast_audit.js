#!/usr/bin/env node
/**
 * 全站文字对比度审计（22 路由 × 亮/暗 = 44 次加载）
 * 遍历可见文本叶子节点，计算与「有效背景」的 WCAG 对比度：
 *   普通文字 >= 4.5:1，大字(>=18.66px 或 >=14px 且粗体) >= 3:1。
 * 有效背景：自元素向上收集 backgroundColor 层并合成；遇渐变则取渐变色stop最坏情况；
 *           遇图片背景(url)则跳过该节点（避免误报）。
 * 用法：QA_TOKEN="<token>" node scripts/contrast_audit.js
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

// 浏览器内注入的审计逻辑
const AUDIT = () => {
  const parse = (c) => {
    if (!c) return null;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(",").map((s) => parseFloat(s)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    const h = c.match(/#([0-9a-f]{3,8})/i);
    if (h) {
      let s = h[1]; if (s.length === 3) s = s.split("").map((x) => x + x).join("");
      if (s.length === 6) s += "ff";
      return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16), a: parseInt(s.slice(6, 8), 16) / 255 };
    }
    return null;
  };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  // 从渐变字符串提取「有效」底色：丢弃高光/透明叠层（如 rgba(255,255,255,.22) 镜面光泽），
  // 只保留真正构成背景实色的色标，避免白字叠白光被误判为 ratio=1。
  const gradColors = (g) => {
    const cols = [];
    const re = /(rgba?\([^)]+\)|#[0-9a-f]{3,8})/gi; let m;
    while ((m = re.exec(g))) {
      const c = parse(m[1]); if (!c) continue;
      if (c.a < 0.3) continue;            // 透明叠层（如白光 .22）跳过
      if (lum(c) > 0.93) continue;        // 近白色高光跳过
      cols.push(c);
    }
    return cols;
  };
  // 有效背景：返回 {solid?:{r,g,b}} 或 {stops:[...]} 或 null
  const effBg = (el) => {
    const layers = [];
    let p = el;
    while (p) {
      const s = getComputedStyle(p);
      if (s.backgroundImage && s.backgroundImage !== "none") {
        if (/url\(/i.test(s.backgroundImage)) return null; // 图片背景，跳过
        const cols = gradColors(s.backgroundImage);
        if (cols.length) {
          // 关键修复：已向上收集到的半透明实色层（如黑色/深蓝玻璃按钮背景）
          // 必须叠加到渐变之上，否则会漏算元素自身半透明背景，
          // 把「白字压在深色玻璃上」误判为「白字压亮渐变」而报假阳性。
          if (layers.length) {
            const blended = cols.map((c) => {
              let acc = c;
              for (let i = layers.length - 1; i >= 0; i--) acc = blend(layers[i], acc);
              return acc;
            });
            return { stops: blended };
          }
          return { stops: cols }; // 渐变（已剔除高光）：交由上层取最坏
        }
        return null; // 渐变仅含高光/透明层 → 无法判定，跳过该节点
      }
      const bc = parse(s.backgroundColor);
      if (bc && bc.a > 0) { layers.push(bc); if (bc.a >= 0.999) break; }
      p = p.parentElement;
    }
    let acc = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) acc = blend(layers[i], acc);
    return { solid: acc };
  };
  const out = [];
  document.querySelectorAll("body *").forEach((el) => {
    const txt = (el.textContent || "").trim();
    if (!txt || el.children.length > 0) return;
    if (el.closest && el.closest(".fab")) return; // FAB 标签为绝对定位，视觉背景是页面而非蓝色圆，跳过误报
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) return;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || parseFloat(s.opacity) < 0.6) return;
    const fg = parse(s.color); if (!fg) return;
    const bg = effBg(el); if (!bg) return;
    const size = parseFloat(s.fontSize);
    const bold = parseInt(s.fontWeight) >= 700;
    const large = size >= 18.66 || (size >= 14 && bold);
    const need = large ? 3 : 4.5;
    let best = 21, worst = 21;
    const apply = (bgc) => { const rr = ratio(fg, bgc); if (rr < worst) worst = rr; if (rr < best) best = rr; };
    if (bg.solid) apply(bg.solid); else bg.stops.forEach(apply);
    if (worst < need) out.push({ t: txt.slice(0, 40), size: Math.round(size), bold, large, need, ratio: +worst.toFixed(2), cls: (el.className && typeof el.className === "string") ? el.className.split(" ").slice(0, 3).join(".") : "" });
  });
  return out;
};

const results = [];
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
for (const theme of THEMES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  await page.evaluate(({ t, tk }) => { localStorage.setItem("gwy-theme-mode", t); if (tk) localStorage.setItem("access_token", tk); }, { t: theme, tk: TOKEN });
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: "load", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1100);
    let issues = [];
    try { issues = await page.evaluate(AUDIT); } catch (e) { issues = [{ t: "EVAL_ERR:" + e.message.slice(0, 60), size: 0, bold: false, large: false, need: 0, ratio: 0, cls: "" }]; }
    results.push({ theme, route, count: issues.length, issues });
    console.log(`${theme.padEnd(5)} ${route.padEnd(14)} 对比度问题: ${issues.length}`);
  }
  await ctx.close();
}
await browser.close();

const total = results.reduce((a, r) => a + r.count, 0);
console.log(`\nTOTAL 对比度问题: ${total} (覆盖 ${results.length} 次加载)`);
writeFileSync("_contrast_report.json", JSON.stringify(results, null, 2));
process.exit(0);
