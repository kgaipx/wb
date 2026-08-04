import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// 离线优先（方案方向3）：Workbox 预缓存壳 + 运行时缓存题库
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "AI公务员考前培训学习平台",
        short_name: "公考私教",
        description: "AI-native 公考私教：懂你短板、内容可信、花钱无忧",
        theme_color: "#2563eb",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/bank"),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "question-bank" },
          },
        ],
      },
    }),
  ],
  server: { port: 5173, proxy: { "/api": "http://localhost:8000" } },
});
