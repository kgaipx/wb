interface RadarDatum {
  label: string;
  value: number; // 0~1 掌握度 / 正确率
  meta?: string; // 悬停显示的附加信息（如「作答 12 次」）
}

interface RadarSeries {
  name: string;
  color: string; // CSS 颜色（变量或 hex）
  data: RadarDatum[];
}

interface RadarChartProps {
  /** 兼容旧调用：单系列（默认名「掌握度」）。 */
  data?: RadarDatum[];
  /** 多系列（如 当前掌握度 vs 目标线），每一项是一组等轴数据。 */
  series?: RadarSeries[];
  /** 目标线（0~1），绘制虚线参考多边形并标注。 */
  target?: number;
  targetLabel?: string;
  /** 点击某个轴（知识点）时回调，常用于跳转到针对性练习。 */
  onAxisClick?: (label: string) => void;
  maxAxes?: number;
  size?: number;
}

const DEFAULT_COLOR = "var(--brand, #3b6cff)";
const TARGET_COLOR = "var(--text-3, #98a2b3)";

/** 能力图谱雷达（深化版）：支持多系列对比 + 目标线 + 轴点悬停 + 点击跳转练习。 */
export function RadarChart({
  data,
  series,
  target,
  targetLabel = "目标线",
  onAxisClick,
  maxAxes = 8,
  size = 248,
}: RadarChartProps) {
  // 规整为多系列
  const allSeries: RadarSeries[] =
    series && series.length
      ? series
      : [{ name: "掌握度", color: DEFAULT_COLOR, data: data ?? [] }];

  // 轴 = 第一个系列的标签（假设各系列同序同轴）
  const axes = allSeries[0].data.slice(0, maxAxes);
  const n = axes.length;
  if (n === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 34;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, r: number): [number, number] => {
    const a = angle(i);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const rings = [0.25, 0.5, 0.75, 1];

  const polyOf = (vals: number[]) =>
    vals.map((v, i) => pt(i, R * Math.max(0.05, Math.min(1, v))).join(",")).join(" ");

  const axisVals = (s: RadarSeries) =>
    axes.map((_, i) => {
      const found = s.data[i];
      return found ? found.value : 0;
    });

  return (
    <div>
      <svg viewBox={`0 0 ${size} ${size}`} className="radar" role="img" aria-label="能力图谱雷达">
        {rings.map((rr) => (
          <polygon
            key={rr}
            points={axes.map((_, i) => pt(i, R * rr).join(",")).join(" ")}
            className="radar__ring"
          />
        ))}
        {axes.map((_, i) => {
          const [x, y] = pt(i, R);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="radar__axis" />;
        })}

        {/* 目标线（虚线参考多边形） */}
        {typeof target === "number" && (
          <polygon
            points={polyOf(axes.map(() => target))}
            fill="none"
            stroke={TARGET_COLOR}
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
        )}

        {/* 各系列多边形 */}
        {allSeries.map((s, si) => {
          const vals = axisVals(s);
          const vPts = axes.map((_, i) => pt(i, R * Math.max(0.05, Math.min(1, vals[i]))));
          return (
            <g key={si}>
              <polygon
                points={vPts.map((p) => p.join(",")).join(" ")}
                fill={s.color}
                fillOpacity={0.14}
                stroke={s.color}
                strokeWidth={2}
              />
              {vPts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={s.color}>
                  <title>
                    {axes[i].label}：{Math.round((vals[i] ?? 0) * 100)}%
                    {axes[i].meta ? ` · ${axes[i].meta}` : ""}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}

        {/* 轴标签（可点击跳转） */}
        {axes.map((ax, i) => {
          const [x, y] = pt(i, R + 15);
          const clickable = !!onAxisClick;
          return (
            <text
              key={i}
              x={x}
              y={y}
              className="radar__label"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ cursor: clickable ? "pointer" : "default" }}
              onClick={clickable ? () => onAxisClick?.(ax.label) : undefined}
            >
              {ax.label}
              <title>{ax.label}{ax.meta ? ` · ${ax.meta}` : ""}（点击针对性练习）</title>
            </text>
          );
        })}
      </svg>

      {/* 图例 */}
      <div className="radar__legend">
        {allSeries.map((s, i) => (
          <span key={i} className="radar__legend-item">
            <span className="radar__swatch" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
        {typeof target === "number" && (
          <span className="radar__legend-item">
            <span
              className="radar__swatch"
              style={{ background: "transparent", borderTop: `2px dashed ${TARGET_COLOR}` }}
            />
            {targetLabel}（{Math.round(target * 100)}%）
          </span>
        )}
      </div>
      {onAxisClick && (
        <div className="muted" style={{ fontSize: 11, textAlign: "center", marginTop: 2 }}>
          点击雷达上的知识点可直达针对性练习
        </div>
      )}
    </div>
  );
}
