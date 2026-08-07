// 申论五维评分条（立意/结构/论证/语言/素材），满分默认 20/维，总分 100。
// 同时供「申论批改」页与「我的」页内嵌批改复用。

export const ESSAY_DIMENSIONS = ["立意", "结构", "论证", "语言", "素材"];

export function DimensionBars({ dims, max = 20 }: { dims: Record<string, number>; max?: number }) {
  return (
    <div style={{ marginTop: 8 }}>
      {ESSAY_DIMENSIONS.map((d) => {
        const v = dims[d] ?? 0;
        const pct = Math.min(100, Math.round((v / max) * 100));
        return (
          <div key={d} style={{ marginTop: 6 }}>
            <div className="row row--between" style={{ fontSize: 13 }}>
              <span>{d}</span>
              <span className="text-3">
                {v} / {max}
              </span>
            </div>
            <div className="progress">
              <div className="progress__bar" style={{ width: pct + "%" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
