interface SpinnerProps {
  /** 直径（px），默认 16，跟随按钮字号用 14~16 即可 */
  size?: number;
  className?: string;
  /** 无障碍标签，默认「加载中」 */
  label?: string;
}

/**
 * 统一的线描旋转加载环：currentColor 描边，自动继承按钮文字色
 * （主按钮为白、幽灵/反白按钮为品牌蓝），零额外配色。
 * 用 role=status + aria-label 暴露给读屏，键盘/鼠标交互由外层按钮的 disabled 承载。
 */
export default function Spinner({ size = 16, className = "", label = "加载中" }: SpinnerProps) {
  return (
    <span
      className={"spinner" + (className ? " " + className : "")}
      style={{ width: size, height: size }}
      role="status"
      aria-label={label}
    />
  );
}
