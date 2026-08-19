// 手写 Service Worker（WBS 6.1 离线优先）：应用壳预缓存 + 题库运行时缓存
// 不依赖 workbox，避免构建期动态 require 兼容问题；离线刷题能力由此实现。
const CACHE = "gwy-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 题库接口 + 用户态接口：运行时缓存，离线可刷题且保持登录态（StaleWhileRevalidate）
  if (url.pathname.startsWith("/api/bank") || url.pathname === "/api/auth/me") {
    event.respondWith(
      caches.open(CACHE).then(async (c) => {
        const cached = await c.match(req);
        const network = fetch(req)
          .then((res) => {
            c.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 导航请求：网络优先，失败回退缓存首页
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/index.html")));
    return;
  }

  // 同源静态资源（排除 /api 与 sw.js 自身）：缓存优先，首次在线加载时写入缓存，
  // 保证离线时 JS/CSS 等应用壳依赖也能完整加载，而非只靠浏览器 HTTP 缓存兜底
  if (url.origin === self.location.origin && !url.pathname.startsWith("/api/") && !url.pathname.endsWith("/sw.js")) {
    event.respondWith(
      caches.open(CACHE).then(async (c) => {
        const cached = await c.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) c.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }
});
