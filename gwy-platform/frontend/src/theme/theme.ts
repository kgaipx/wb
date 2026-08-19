// 暗色模式主题管理：localStorage 持久化 + 默认跟随系统 + 防闪白已在 index.html 内联脚本完成。
// 这里负责 React 侧的读取、切换、跟随系统变化，并同步 PWA theme-color。

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "gwy-theme-mode";
const DARK_THEME_COLOR = "#0E1117";
const LIGHT_THEME_COLOR = "#1B4FB5";

export function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function getStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* localStorage 不可用时回退 system */
  }
  return "system";
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  // 同步 PWA 地址栏主题色，避免暗色下地址栏仍是亮蓝而突兀
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
  return resolved;
}

export function setMode(mode: ThemeMode): ResolvedTheme {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* 忽略写入失败 */
  }
  return applyTheme(mode);
}

/** 仅当模式为 system 时跟随系统偏好变化；返回取消监听函数。 */
export function watchSystem(cb: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => cb();
  if (typeof mq.addEventListener === "function") mq.addEventListener("change", handler);
  else if (typeof mq.addListener === "function") mq.addListener(handler);
  return () => {
    if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", handler);
    else if (typeof mq.removeListener === "function") mq.removeListener(handler);
  };
}
