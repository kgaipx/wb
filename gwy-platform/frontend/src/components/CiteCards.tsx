import { Citation } from "../api/client";

/**
 * 知识引用卡片：展示 AI 私教讲解/对话召回的资料片段。
 * 含知识点(kp)标签 + 片段标题 + 来源 + 相关度条，直观呈现向量检索质量。
 */
export default function CiteCards({ cites }: { cites: Citation[] }) {
  if (!cites || cites.length === 0) return null;
  return (
    <div className="cite-cards">
      <span className="cite-cards__label muted">知识引用</span>
      {cites.map((c, i) => {
        // score<=1.2 视为 0~1 混合分（向量/混合路径），否则按原始分值（纯词项路径）归一
        const pct =
          c.score == null
            ? null
            : Math.max(0, Math.min(100, Math.round(c.score <= 1.2 ? c.score * 100 : c.score)));
        return (
          <div className="cite-card" key={i}>
            {c.kp && <span className="cite-card__kp">{c.kp}</span>}
            <div className="cite-card__title">{c.title || c.source || "知识片段"}</div>
            <div className="cite-card__meta">
              <span className="cite-card__src">{c.source}</span>
              {pct != null && (
                <span className="cite-card__rel" title={`相关度 ${pct}%`}>
                  <span className="cite-card__bar">
                    <i style={{ width: `${pct}%` }} />
                  </span>
                  <span className="cite-card__pct">{pct}%</span>
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
