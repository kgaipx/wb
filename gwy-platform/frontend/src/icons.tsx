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
