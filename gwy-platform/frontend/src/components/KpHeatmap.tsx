import type { KpHeatSubject } from "../api/client";

/** 掌握度 → 色相（0=红弱，130=绿强），连续渐变更易读。 */
function heatColor(m: number): string {
  const hue = Math.max(0, Math.min(1, m)) * 130; // 0红 → 130绿
  return `hsl(${hue.toFixed(0)}, 62%, 45%)`;
}

function pct(m: number) {
  return Math.round(m * 100);
}

export default function KpHeatmap({
  subjects,
  onSelect,
  compact = false,
}: {
  subjects: KpHeatSubject[];
  onSelect?: (kp: string) => void;
  compact?: boolean;
}) {
  if (!subjects || subjects.length === 0) {
    return (
      <div className="empty empty--tight">
        <div className="empty__icon">🧩</div>
        <div className="empty__title">暂无知识点掌握度</div>
        <div className="empty__desc">去「刷题」或「模考」积累数据后，这里会生成你的分科热力图。</div>
      </div>
    );
  }

  return (
    <div className="kpheat">
      {!compact && (
        <div className="kpheat__legend">
          <span className="muted" style={{ fontSize: 12 }}>弱</span>
          <span className="kpheat__legend-bar" />
          <span className="muted" style={{ fontSize: 12 }}>强</span>
        </div>
      )}
      {subjects.map((s) => {
        const weakCount = s.kps.filter((k) => k.mastery < 0.5).length;
        return (
          <div className="kpheat__subj" key={s.subject}>
            <div className="kpheat__subj-head">
              <span className="kpheat__subj-name">{s.subject}</span>
              <span className="kpheat__subj-avg">均 {pct(s.avg_mastery)}%</span>
              {!compact && weakCount > 0 && (
                <span className="kpheat__subj-weak">薄弱 {weakCount}</span>
              )}
            </div>
            <div className="kpheat__grid">
              {s.kps.map((k) => (
                <button
                  key={k.knowledge_point}
                  className="kpheat__cell"
                  style={{ background: heatColor(k.mastery) }}
                  onClick={onSelect ? () => onSelect(k.knowledge_point) : undefined}
                  title={`${k.knowledge_point} · 掌握度 ${pct(k.mastery)}% · ${k.attempts} 次作答`}
                >
                  <span className="kpheat__cell-name">{k.knowledge_point}</span>
                  <span className="kpheat__cell-val">{pct(k.mastery)}%</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
