import type { ReactNode, CSSProperties } from "react";

export type EmptyIcon =
  | "chart"
  | "star"
  | "chat"
  | "essay"
  | "assess"
  | "exam"
  | "calendar"
  | "bulb"
  | "compass"
  | "search"
  | "card"
  | "book"
  | "check"
  | "inbox";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/* 品牌线描插画（与 .empty__icon 渐变圆同色，stroke=currentColor） */
const ART: Record<EmptyIcon, ReactNode> = {
  chart: (
    <>
      <path d="M5 19V11" {...stroke} />
      <path d="M12 19V5" {...stroke} />
      <path d="M19 19V13" {...stroke} />
      <path d="M3.5 19h17" {...stroke} />
    </>
  ),
  star: (
    <path
      d="M12 3.4l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.5l1-5.8L3.5 9.6l5.9-.9z"
      {...stroke}
    />
  ),
  chat: (
    <path
      d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16h-7l-4 4v-4H5A1.5 1.5 0 0 1 3.5 9.5v-3A1.5 1.5 0 0 1 5 5z"
      {...stroke}
    />
  ),
  essay: (
    <>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" {...stroke} />
      <path d="M14 3v4h4" {...stroke} />
      <path d="M9 12h6" {...stroke} />
      <path d="M9 15h6" {...stroke} />
    </>
  ),
  assess: (
    <>
      <circle cx="12" cy="12" r="8" {...stroke} />
      <path d="M12 4v8h8" {...stroke} />
    </>
  ),
  exam: (
    <>
      <path d="M4 9l8-4.5 8 4.5" {...stroke} />
      <path d="M5 9v8" {...stroke} />
      <path d="M9.5 9v8" {...stroke} />
      <path d="M14.5 9v8" {...stroke} />
      <path d="M19 9v8" {...stroke} />
      <path d="M3.5 20h17" {...stroke} />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="15" rx="2" {...stroke} />
      <path d="M4 10h16" {...stroke} />
      <path d="M8 3.5v4" {...stroke} />
      <path d="M16 3.5v4" {...stroke} />
    </>
  ),
  bulb: (
    <>
      <path d="M9.5 18h5" {...stroke} />
      <path d="M10.5 21h3" {...stroke} />
      <path d="M12 3a6.5 6.5 0 0 0-4 11.5c.8.8 1 1.8 1 2.5h6c0-.7.2-1.7 1-2.5A6.5 6.5 0 0 0 12 3z" {...stroke} />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" {...stroke} />
      <path d="M15.5 8.5l-2 4.5-4.5 2 2-4.5z" {...stroke} />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" {...stroke} />
      <path d="M20 20l-3.8-3.8" {...stroke} />
    </>
  ),
  card: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2.5" {...stroke} />
      <path d="M3 10h18" {...stroke} />
      <path d="M6.5 14.5h4" {...stroke} />
    </>
  ),
  book: (
    <>
      <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z" {...stroke} />
      <path d="M5 4v14" {...stroke} />
      <path d="M9 4v14" {...stroke} />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" {...stroke} />
      <path d="M8 12.5l2.8 2.8L16.5 9" {...stroke} />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" {...stroke} />
      <path d="M4 13h4l1.5 3h5L16 13h4" {...stroke} />
    </>
  ),
};

export interface EmptyStateProps {
  icon?: EmptyIcon;
  title: string;
  desc?: ReactNode;
  tight?: boolean;
  style?: CSSProperties;
  className?: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon = "inbox",
  title,
  desc,
  tight,
  style,
  className,
  action,
}: EmptyStateProps) {
  return (
    <div
      className={
        "empty" + (tight ? " empty--tight" : "") + (className ? " " + className : "")
      }
      style={style}
    >
      <div className="empty__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {ART[icon]}
        </svg>
      </div>
      <div className="empty__title">{title}</div>
      {desc != null && <div className="empty__desc">{desc}</div>}
      {action != null && <div className="empty__action">{action}</div>}
    </div>
  );
}
