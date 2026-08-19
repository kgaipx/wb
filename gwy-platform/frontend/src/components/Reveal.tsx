import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  /** 渲染的标签，默认 div（如需保持语义可传 "section"/"li" 等） */
  as?: ElementType;
  className?: string;
  /** 入场延迟（ms），用于同屏多元素错峰 */
  delay?: number;
  /** 进入视口比例阈值，默认 0.12 */
  threshold?: number;
  style?: CSSProperties;
}

/**
 * 滚动入场动画：元素进入视口时由 IntersectionObserver 加 .in 触发 fx-fade-up。
 * - 渐进增强：仅当 <html> 含 .js（main.tsx 渲染前同步添加）才隐藏初始态，
 *   无 JS / 不支持 IntersectionObserver 时直接显示，绝不藏内容。
 * - 无障碍：prefers-reduced-motion 下 CSS 强制显示（见 components.css）。
 */
export default function Reveal({
  children,
  as,
  className = "",
  delay = 0,
  threshold = 0.12,
  style,
}: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.unobserve(e.target);
          }
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  const Tag = (as ?? "div") as ElementType;
  const cls = "reveal" + (shown ? " in" : "") + (className ? " " + className : "");
  const merged: CSSProperties | undefined = delay
    ? { ...style, animationDelay: `${delay}ms` }
    : style;

  return (
    <Tag ref={ref as never} className={cls} style={merged}>
      {children}
    </Tag>
  );
}
