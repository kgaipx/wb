import type { CSSProperties, ReactNode } from "react";
import Spinner from "./Spinner";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/* 警告三角：与 EmptyState 同款品牌线描风格，stroke=currentColor（由 .empty--err 染成危险色） */
const ALERT = (
  <>
    <path d="M12 3.5l9 15.5H3z" {...stroke} />
    <path d="M12 10v4" {...stroke} />
    <path d="M12 17h.01" {...stroke} />
  </>
);

export interface ErrorStateProps {
  title?: string;
  desc?: ReactNode;
  onRetry?: () => void;
  retryText?: string;
  retryBusy?: boolean;
  tight?: boolean;
  style?: CSSProperties;
  className?: string;
}

export default function ErrorState({
  title = "加载失败",
  desc = "网络开小差了，请稍后重试。",
  onRetry,
  retryText = "重新加载",
  retryBusy = false,
  tight,
  style,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={"empty empty--err" + (tight ? " empty--tight" : "") + (className ? " " + className : "")}
      style={style}
      role="alert"
    >
      <div className="empty__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {ALERT}
        </svg>
      </div>
      <div className="empty__title">{title}</div>
      {desc != null && <div className="empty__desc">{desc}</div>}
      {onRetry && (
        <div className="empty__action">
          <button
            className={"btn btn--primary btn--sm" + (retryBusy ? " btn--loading" : "")}
            onClick={onRetry}
            disabled={retryBusy}
          >
            {retryBusy && <Spinner size={14} />}
            {retryText}
          </button>
        </div>
      )}
    </div>
  );
}
