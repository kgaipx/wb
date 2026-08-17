import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Question, Citation } from "../api/client";
import CiteCards from "./CiteCards";
import Markdown from "./Markdown";

interface ExplainData {
  knowledge_point: string;
  explanation: string;
  citations: Citation[];
  correct_answer: string | null;
  offline?: boolean;
}

/** 题解浮层：从题库任意列表（搜题 / 收藏）点「看解析」打开，展示题干、选项、正确答案与 AI 讲解。
 *  题干与选项走匿名可用的 GET /bank/questions/{id}；AI 讲解走登录/配额受限的 POST /ai/explain，未登录优雅降级提示。 */
export default function ExplainModal({
  questionId,
  onClose,
}: {
  questionId: number | null;
  onClose: () => void;
}) {
  const nav = useNavigate();
  const [q, setQ] = useState<Question | null>(null);
  const [ex, setEx] = useState<ExplainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [qErr, setQErr] = useState("");
  const [exErr, setExErr] = useState("");
  const [favBusy, setFavBusy] = useState(false);

  useEffect(() => {
    if (questionId == null) return;
    let cancelled = false;
    setLoading(true);
    setQErr("");
    setExErr("");
    setQ(null);
    setEx(null);
    const loadQ = api
      .bankGet(questionId)
      .then((qq) => !cancelled && setQ(qq))
      .catch(() => !cancelled && setQErr("题目加载失败"));
    const loadEx = api
      .explain(questionId)
      .then((ee) => !cancelled && setEx(ee))
      .catch((e: any) => {
        if (cancelled) return;
        if (e?.status === 401) setExErr("登录后即可查看 AI 详细讲解");
        else if (e?.status === 402) setExErr(e?.message || "今日 AI 讲解次数已用完");
        else setExErr("AI 讲解暂时不可用");
      });
    Promise.all([loadQ, loadEx]).finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (questionId == null) return null;

  return (
    <div className="explain-mask" onClick={onClose}>
      <div className="explain-modal" onClick={(e) => e.stopPropagation()}>
        <div className="explain-modal__head">
          <div className="q-item__meta">
            {q && (
              <>
                <span className="tag tag--brand">{q.subject}</span>
                {q.category && <span className="tag">{q.category}</span>}
                <span className="text-3">#{q.id}</span>
              </>
            )}
          </div>
          <button className="explain-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="explain-modal__body">
          {loading && <div className="muted">加载中…</div>}
          {qErr && <div className="err-text">{qErr}</div>}

          {!loading && q && (
            <>
              <div className="explain-stem">{q.stem}</div>
              <ul className="explain-opts">
                {q.options.map((o) => (
                  <li className="explain-opt" key={o.label}>
                    <span className="explain-opt__label">{o.label}</span>
                    <span className="explain-opt__content">{o.content}</span>
                  </li>
                ))}
              </ul>
              {ex?.correct_answer && (
                <div className="explain-answer">
                  ✅ 正确答案：<b>{ex.correct_answer}</b>
                </div>
              )}
            </>
          )}

          {!loading && !exErr && ex && (
            <div className="explain-ai">
              <div className="explain-ai__head">
                <span className="explain-ai__badge">🤖 AI 讲解</span>
                {ex.knowledge_point && <span className="explain-ai__kp">{ex.knowledge_point}</span>}
                {ex.offline && <span className="explain-ai__offline">离线降级</span>}
              </div>
              <div className="explain-ai__body">
                <Markdown>{ex.explanation}</Markdown>
              </div>
              {ex.citations.length > 0 && <CiteCards cites={ex.citations} />}
            </div>
          )}

          {!loading && exErr && (
            <div className="card card--hint" style={{ marginTop: 10 }}>
              {exErr}
              {exErr.includes("登录") && (
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn--primary btn--sm" onClick={() => nav("/login")}>
                    去登录
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="explain-modal__foot">
          <button
            className="btn btn--primary btn--sm"
            onClick={() => {
              onClose();
              nav(`/practice?q=${questionId}`);
            }}
          >
            去练习这道题
          </button>
          <button
            className="btn btn--ghost btn--sm"
            disabled={favBusy}
            onClick={async () => {
              setFavBusy(true);
              try {
                await api.favoriteAdd(questionId);
              } catch {
                /* ignore */
              } finally {
                setFavBusy(false);
              }
            }}
          >
            ☆ 收藏
          </button>
        </div>
      </div>
    </div>
  );
}
