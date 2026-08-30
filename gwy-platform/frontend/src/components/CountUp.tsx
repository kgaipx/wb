import { CSSProperties, useEffect, useRef, useState } from "react";

type CountUpProps = {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  style?: CSSProperties;
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** 数字滚动动效：从上一值平滑滚动到目标值，缓动用 easeOutCubic，贴近 iOS 数字过渡观感。 */
export default function CountUp({
  value,
  duration = 900,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
  style,
}: CountUpProps) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = from + (value - from) * easeOutCubic(t);
      setDisplay(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        setDisplay(value);
        fromRef.current = value;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  const shown = decimals > 0 ? display.toFixed(decimals) : Math.round(display).toString();
  return (
    <span className={className} style={style}>
      {prefix}
      {shown}
      {suffix}
    </span>
  );
}
