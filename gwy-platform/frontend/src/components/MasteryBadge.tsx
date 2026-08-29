/** 知识点掌握度/巩固度环形徽章：按档位配色，中心显示百分比 + 档位文字。
 *  value: 0-1（越高越绿=越掌握）；size 控制渲染尺寸（viewBox 固定 72，按比例缩放）。 */
export default function MasteryBadge({ value, size = 72 }: { value: number; size?: number }) {
  const v = Math.max(0, Math.min(1, value || 0));
  const pctv = Math.round(v * 100);
  const tone = v >= 0.7 ? "var(--success)" : v >= 0.4 ? "var(--warning)" : "var(--danger)";
  const label = v >= 0.7 ? "精通" : v >= 0.4 ? "巩固" : "薄弱";
  const R = 26;
  const C = 2 * Math.PI * R;
  const off = C * (1 - v);
  return (
    <div className="mastery-badge" title={`巩固度：${pctv}%（${label}）`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
        <circle
          cx="36"
          cy="36"
          r={R}
          fill="none"
          stroke={tone}
          strokeWidth="8"
          strokeDasharray={C}
          strokeDashoffset={off}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
        />
        <text x="36" y="34" textAnchor="middle" fontSize="16" fontWeight={700} fill={tone}>
          {pctv}%
        </text>
        <text x="36" y="50" textAnchor="middle" fontSize={12} fill="var(--text-3, #9aa0ab)">
          {label}
        </text>
      </svg>
    </div>
  );
}
