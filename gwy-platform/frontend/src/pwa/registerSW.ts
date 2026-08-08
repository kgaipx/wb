// 注册手写 Service Worker（离线优先，方案方向3 / WBS 6.1）
// 开发期不注册，避免热更新干扰；生产构建产物含 /sw.js。
export function registerSW() {
  if (import.meta.env.DEV) return;
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* 注册失败不阻断主流程 */
      });
    });
  }
}
