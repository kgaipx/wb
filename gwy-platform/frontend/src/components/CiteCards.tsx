import { useEffect, useState } from "react";
import { api, Citation, KnowledgeChunkOut } from "../api/client";
import Markdown from "./Markdown";

/**
 * 知识引用卡片：展示 AI 私教讲解/对话召回的资料片段。
 * 含知识点(kp)标签 + 片段标题 + 来源 + 相关度条，直观呈现向量检索质量。
 * 卡片可点击：点击后反查知识原文并以弹窗展示详情（兼容旧版仅含来源字符串的历史引用）。
 */
export default function CiteCards({ cites }: { cites: Citation[] }) {
  const [active, setActive] = useState<Citation | null>(null);
  const [chunks, setChunks] = useState<KnowledgeChunkOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // 反查词：富引用优先用知识点，旧引用回退到来源/标题
  const term = active ? active.kp || active.source || active.title || "" : "";

  useEffect(() => {
    if (!active) return;
    let alive = true;
    if (!term) {
      setChunks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr("");
    api
      .knowledgeLookup(term, 6)
      .then((rows) => {
        if (alive) setChunks(rows);
      })
      .catch(() => {
        if (alive) setErr("加载知识原文失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [active, term]);

  // Esc 关闭弹窗
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  if (!cites || cites.length === 0) return null;
  return (
    <>
      <div className="cite-cards">
        <span className="cite-cards__label muted">知识引用</span>
        {cites.map((c, i) => {
          // score<=1.2 视为 0~1 混合分（向量/混合路径），否则按原始分值（纯词项路径）归一
          const pct =
            c.score == null
              ? null
              : Math.max(0, Math.min(100, Math.round(c.score <= 1.2 ? c.score * 100 : c.score)));
          return (
            <button
              type="button"
              className="cite-card cite-card--btn"
              key={i}
              onClick={() => setActive(c)}
              aria-label={`查看引用详情：${c.title || c.source || "知识片段"}`}
            >
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
              <span className="cite-card__more">点击查看知识原文 ›</span>
            </button>
          );
        })}
      </div>

      {active && (
        <div
          className="cite-modal"
          role="dialog"
          aria-modal="true"
          aria-label="知识引用详情"
          onClick={() => setActive(null)}
        >
          <div className="cite-modal__panel" onClick={(e) => e.stopPropagation()}>
            <div className="cite-modal__head">
              <div className="cite-modal__headtext">
                {active.kp && <span className="cite-card__kp">{active.kp}</span>}
                <strong className="cite-modal__title">{active.title || active.source || "知识片段"}</strong>
                {active.score != null && (
                  <span className="cite-modal__score">相关度 {Math.round(active.score <= 1.2 ? active.score * 100 : active.score)}%</span>
                )}
              </div>
              <button className="cite-modal__close" onClick={() => setActive(null)} aria-label="关闭">
                ×
              </button>
            </div>
            {active.source && (
              <div className="cite-modal__src muted">来源：{active.source}</div>
            )}

            <div className="cite-modal__body">
              {!term ? (
                <div className="muted cite-modal__empty">该引用缺少可追溯的知识点或来源，无法反查原文。</div>
              ) : loading ? (
                <div className="muted cite-modal__empty">正在加载知识原文…</div>
              ) : err ? (
                <div className="err-text">{err}</div>
              ) : chunks.length === 0 ? (
                <div className="muted cite-modal__empty">未找到与「{term}」对应的知识原文片段。</div>
              ) : (
                <>
                  <div className="cite-modal__count muted">
                    匹配到 {chunks.length} 条知识片段（按相关度排序）
                  </div>
                  {chunks.map((ck) => (
                    <div className="cite-modal__chunk" key={ck.id}>
                      <div className="cite-modal__chunkhead">
                        <span className="cite-card__kp">{ck.kp}</span>
                        <span className="cite-modal__chunktitle">{ck.title}</span>
                        {ck.is_verified && <span className="cite-modal__badge" title="双签校验通过">✓ 已校验</span>}
                      </div>
                      <div className="cite-modal__chunksrc muted">{ck.source}</div>
                      <div className="md cite-modal__content">
                        <Markdown>{ck.content}</Markdown>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
