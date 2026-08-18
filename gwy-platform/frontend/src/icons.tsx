/** 共享图标（与 App.tsx 内联图标风格一致）。 */
const stroke = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const UserIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);

export const LockIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const MailIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

export const CrownIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M3 8l4 4 5-7 5 7 4-4-1.5 11H4.5z" />
  </svg>
);

/* ===== 线描功能图标（统一 currentColor，随主题/容器变色）===== */

export const RobotIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <rect x="5" y="9" width="14" height="10" rx="2.5" />
    <path d="M12 9V6" />
    <circle cx="12" cy="5" r="1.2" />
    <circle cx="9.5" cy="14" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="14" r="1.2" fill="currentColor" stroke="none" />
    <path d="M9 18v1.5M15 18v1.5" />
  </svg>
);

export const PenIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" />
    <path d="M14 6l3 3" />
  </svg>
);

export const ChartIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M4 20V11" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M3.5 20h17" />
  </svg>
);

export const RepeatIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M17 2l3 3-3 3" />
    <path d="M3 11V9a4 4 0 0 1 4-4h13" />
    <path d="M7 22l-3-3 3-3" />
    <path d="M21 13v2a4 4 0 0 1-4 4H4" />
  </svg>
);

export const TargetIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const InfinityIcon = () => (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M8 8.5C6 8.5 4.5 10.1 4.5 12S6 15.5 8 15.5c2 0 3-1.8 4-3.5 1-1.7 2-3.5 4-3.5 2 0 3.5 1.6 3.5 3.5S18 15.5 16 15.5c-2 0-3-1.8-4-3.5-1-1.7-2-3.5-4-3.5z" />
  </svg>
);
