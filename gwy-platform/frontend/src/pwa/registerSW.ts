// 注册 PWA Service Worker（离线优先，方案方向3 / WBS 6.1）
// vite-plugin-pwa 在构建时生成 virtual:pwa-register
import { registerSW as register } from "virtual:pwa-register";

export function registerSW() {
  if (import.meta.env.DEV) return; // 开发期不注册，避免热更新干扰
  register({
    immediate: true,
    onRegisteredSW(swUrl) {
      console.info("[PWA] service worker registered:", swUrl);
    },
  });
}
