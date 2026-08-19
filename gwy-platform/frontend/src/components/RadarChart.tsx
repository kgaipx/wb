interface RadarDatum {
  label: string;
  value: number; // 0~1 掌握度
}

/** 能力图谱雷达：把知识点掌握度（0~1）可视化为自适应诊断。最多 8 个轴，超出截断。 */
export function RadarChart({ data }: { data: RadarDatum[] }) {
  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 34;
  const n = data.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, r: number): [number, number] => {
    const a = angle(i);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const rings = [0.25, 0.5, 0.75, 1];
  const vPts = data.map((d, i) => pt(i, R * Math.max(0.05, Math.min(1, d.value))));
  const vPoly = vPts.map((p) => p.join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="radar" role="img" aria-label="能力图谱雷达">
      {rings.map((rr) => (
        <polygon
          key={rr}
          points={data.map((_, i) => pt(i, R * rr).join(",")).join(" ")}
          className="radar__ring"
        />
      ))}
      {data.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="radar__axis" />;
      })}
      <polygon points={vPoly} className="radar__area" />
      {vPts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={3} className="radar__dot" />
      ))}
      {data.map((d, i) => {
        const [x, y] = pt(i, R + 15);
        return (
          <text key={i} x={x} y={y} className="radar__label" textAnchor="middle" dominantBaseline="middle">
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}
