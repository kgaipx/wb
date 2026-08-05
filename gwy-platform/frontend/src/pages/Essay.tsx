import { useEffect, useState } from "react";
import { api, EssayPrompt, EssayHistoryItem } from "../api/client";

const DIM_ORDER = ["立意", "结构", "论证", "语言", "素材"];

export default function Essay() {
  const [tab, setTab] = useState<"write" | "history">("write");
  const [prompts, setPrompts] = useState<EssayPrompt[]>([]);
  const [promptId, setPromptId] = useState<number | null>(null);
  const [material, setMaterial] = useState("");
  const [requirement, setRequirement] = useState("请围绕给定主题写一篇短文");
  const [essay, setEssay] = useState("");
  const [grade, setGrade] = useState<any>(null);
  const [history, setHistory] = useState<EssayHistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.essayPrompts().then(setPrompts).catch((e) => setErr(e.message));
  }, []);

  function pickPrompt(p: EssayPrompt | null) {
    setPromptId(p ? p.id : null);
    setMaterial(p ? p.material : "");
    setRequirement(p ? p.requirement : "请围绕给定主题写一篇短文");
  }

  async function doGrade() {
    if (!essay.trim()) return;
    setBusy(true);
    setErr("");
    setGrade(null);
    try {
      const r = await api.essayGrade(essay, material, 100, promptId, requirement);
      setGrade(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory() {
    try {
      setHistory(await api.essayHistory());
    } catch (e: any) {
      setErr(e.message);
    }
  }

  function DimensionBars({ dims }: { dims: Record<string, number> }) {
    return (
      <div style={{ marginTop: 8 }}>
        {DIM_ORDER.map((d) => {
          const v = dims[d] ?? 0;
          const pct = Math.min(100, Math.round((v / 20) * 100));
          return (
            <div key={d} style={{ marginTop: 6 }}>
              <div className="row row--between" style={{ fontSize: 13 }}>
                <span>{d}</span>
                <span className="text-3">{v} / 20</span>
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

  return (
    <section>
      <div className="row row--between" style={{ marginBottom: 8 }}>
        <h2 className="page-title" style={{ margin: 0 }}>申论 AI 批改</h2>
        <div className="chip-row">
          <button className={"chip " + (tab === "write" ? "chip--on" : "")} onClick={() => setTab("write")}>写 & 批改</button>
          <button
            className={"chip " + (tab === "history" ? "chip--on" : "")}
            onClick={() => { setTab("history"); loadHistory(); }}
          >历史</button>
        </div>
      </div>

      {err && <div className="err-text">{err}</div>}

      {tab === "write" && (
        <>
          <div className="card">
            <div className="field-label">选择模拟题（或自行粘贴材料）</div>
            <div className="chip-row" style={{ marginTop: 6 }}>
              <button className={"chip " + (promptId === null ? "chip--on" : "")} onClick={() => pickPrompt(null)}>自由练习</button>
              {prompts.map((p) => (
                <button key={p.id} className={"chip " + (promptId === p.id ? "chip--on" : "")} onClick={() => pickPrompt(p)}>
                  {p.title.replace(/^模拟题[一二三四五六七八]：/, "")}
                </button>
              ))}
            </div>

            <div className="field-label" style={{ marginTop: 12 }}>给定材料</div>
            <textarea className="textarea" style={{ marginTop: 6 }} value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="粘贴申论材料…" />

            <div className="field-label" style={{ marginTop: 10 }}>作答要求</div>
            <textarea className="textarea" style={{ marginTop: 6 }} value={requirement} onChange={(e) => setRequirement(e.target.value)} placeholder="作答要求…" />

            <div className="field-label" style={{ marginTop: 10 }}>你的作答</div>
            <textarea
              className="textarea"
              style={{ marginTop: 6, minHeight: 160 }}
              value={essay}
              onChange={(e) => setEssay(e.target.value)}
              placeholder="在此粘贴或输入你的申论作答…"
            />
            <button className="btn btn--primary btn--block" style={{ marginTop: 10 }} disabled={busy || !essay.trim()} onClick={doGrade}>
              {busy ? "批改中…" : "AI 批改（满分 100）"}
            </button>
          </div>

          {grade && (
            <div className="card report-hero" style={{ marginTop: 12 }}>
              <div className="row row--between">
                <div className={"big-rate " + (grade.total >= 70 ? "rate--good" : grade.total >= 50 ? "rate--mid" : "rate--bad")}>
                  {grade.total}<span>分</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="muted">总分（满分 100）</div>
                  {grade.needs_human_review && <div className="text-warning" style={{ marginTop: 4 }}>⚠ 已转人工复核</div>}
                </div>
              </div>
              <DimensionBars dims={grade.dimensions} />
              {grade.rationale && (
                <div className="tutor-box" style={{ marginTop: 12 }}>
                  <div className="tutor-box__title">总评</div>
                  <div className="tutor-box__body">{grade.rationale}</div>
                </div>
              )}
              <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                双阶段评分（初评 + 一致性校准），异常自动转人工，保障人 AI 评分一致性门槛。
              </div>
            </div>
          )}
        </>
      )}

      {tab === "history" && (
        <>
          {history.length === 0 && <div className="muted" style={{ marginTop: 16 }}>暂无批改记录，去「写 & 批改」完成首次申论批改吧。</div>}
          {history.map((h) => (
            <div key={h.id} className="card" style={{ marginTop: 12 }}>
              <div className="row row--between">
                <strong>{h.prompt_title || "自由练习"}</strong>
                <span className={h.total >= 70 ? "text-success" : "text-danger"}>{h.total} 分</span>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {new Date(h.created_at).toLocaleString("zh-CN")}
                {h.needs_human_review && " · 已转人工"}
              </div>
              <div style={{ marginTop: 6 }}>
                {DIM_ORDER.map((d) => (
                  <span key={d} className="tag" style={{ marginRight: 6, fontSize: 12 }}>
                    {d} {h.dimensions[d] ?? 0}
                  </span>
                ))}
              </div>
              {h.rationale && <div className="text-3" style={{ fontSize: 13, marginTop: 6 }}>{h.rationale}</div>}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
