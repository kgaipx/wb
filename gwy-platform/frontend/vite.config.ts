import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 离线优先（方案方向3 / WBS 6.1）：使用手写 Service Worker（public/sw.js）实现
// 应用壳预缓存 + 题库接口运行时缓存（StaleWhileRevalidate），零额外依赖、构建稳定。
export default defineConfig({
  plugins: [react()],
  // 关闭 outDir 自动清空：规避沙箱安全删除机制对 fs.rmSync 的拦截（构建仍会覆盖写入）
  build: { emptyOutDir: false },
  server: { port: 5173, proxy: { "/api": "http://localhost:8000" } },
});
