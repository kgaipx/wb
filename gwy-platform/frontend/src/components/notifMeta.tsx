import type { JSX } from "react";

/** 通知类型 → 展示元数据（图标 / 主题色 / 分类标签）。供 header 下拉面板与
 *  通知中心独立页复用，避免两份逻辑漂移。 */
export interface NotifMeta {
  color: string;
  label: string;
  icon: JSX.Element;
}

const Crown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8l3.5 3L12 5l4.5 6L20 8l-1 10H5z" />
  </svg>
);
const Gauge = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 18a8 8 0 1 1 16 0" />
    <path d="M12 14l4-3" />
    <circle cx="12" cy="14" r="1.2" fill="currentColor" />
  </svg>
);
const Bell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

export function notifMeta(type: string): NotifMeta {
  switch (type) {
    case "membership_activated":
      return { color: "var(--success)", label: "会员", icon: <Crown /> };
    case "membership_expired":
      return { color: "var(--danger)", label: "会员", icon: <Crown /> };
    case "assessment_done":
      return { color: "var(--info)", label: "测评", icon: <Gauge /> };
    default:
      return { color: "var(--text-2)", label: "系统", icon: <Bell /> };
  }
}

/** 相对时间格式化（刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期）。 */
export function formatNotifTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} 天前`;
  return d.toLocaleDateString("zh-CN");
}
