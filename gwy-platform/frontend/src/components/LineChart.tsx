export interface LinePoint {
  label: string;
  value: number;
}

/**
 * 零依赖 SVG 折线图（移动端友好）。单点时自动居中。
 * 与运营后台 / 模考历史视觉一致，供多处复用（无需第三方图表库）。
 */
export function LineChart({
  points,
  height = 160,
  color = "var(--brand)",
  formatValue = (v: number) => String(Math.round(v)),
  unit = "",
  emptyText = "暂无数据",
  max,
  min,
}: {
  points: LinePoint[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
  unit?: string;
  emptyText?: string;
  max?: number;
  min?: number;
}) {
  const W = 320;
  const H = height;
  const padL = 10;
  const padR = 10;
  const padT = 16;
  const padB = 22;
  if (points.length === 0) {
    return (
      <div className="muted" style={{ textAlign: "center", padding: 18 }}>
        {emptyText}
      </div>
    );
  }
  const vals = points.map((p) => p.value);
  const maxV = max ?? Math.max(...vals, 1);
  const minV = min ?? Math.min(...vals, 0);
  const span = maxV - minV || 1;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) =>
    points.length === 1 ? W / 2 : padL + (innerW * i) / (points.length - 1);
  const y = (v: number) => padT + innerH * (1 - (v - minV) / span);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
  const area = `${path} L ${x(points.length - 1).toFixed(1)} ${padT + innerH} L ${x(0).toFixed(1)} ${padT + innerH} Z`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: "block" }}
      preserveAspectRatio="xMidYMid meet"
    >
      <path d={area} fill={color} opacity={0.1} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r={3.5} fill={color} />
          <text x={x(i)} y={y(p.value) - 9} fontSize={12} textAnchor="middle" fill="var(--text-3, #4a5160)">
            {formatValue(p.value)}
            {unit}
          </text>
          <text x={x(i)} y={H - 6} fontSize={12} textAnchor="middle" fill="var(--text-3, #9aa0ab)">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
