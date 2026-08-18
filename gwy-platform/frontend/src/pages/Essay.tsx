import { useEffect, useRef, useState } from "react";
import { api, EssayPrompt, EssayHistoryItem, EssayModel, EssayCompare } from "../api/client";
import { DimensionBars } from "../components/DimensionBars";
import { LineChart } from "../components/LineChart";
import { EssayCompareCard } from "../components/EssayCompareCard";
import { ReportExport } from "../components/ReportExport";
import Markdown from "../components/Markdown";
import { parseWordTarget, wordStatus, countEssayChars } from "../utils/essayWord";

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
  const [hLoading, setHLoading] = useState(false);
  const [model, setModel] = useState<EssayModel | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const [compare, setCompare] = useState<EssayCompare | null>(null);
  const compareRef = useRef<HTMLDivElement>(null);
  const gradeRef = useRef<HTMLDivElement>(null);
  const [compareBusy, setCompareBusy] = useState(false);

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
    setCompare(null);
    try {
      const r = await api.essayGrade(essay, material, 100, promptId, requirement);
      setGrade(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadCompare() {
    if (!grade) return;
    setCompareBusy(true);
    setErr("");
    try {
      // 复用已生成的范文（避免重复生成）；缺失则现场生成
      let me = model?.model_essay ?? null;
      if (!me) {
        const m = await api.essayModel(material, requirement, promptId);
        setModel(m);
        me = m.model_essay;
      }
      const c = await api.essayCompare(
        essay,
        material,
        requirement,
        promptId,
        me,
        grade.dimensions,
        grade.total,
      );
      setCompare(c);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setCompareBusy(false);
    }
  }

  async function loadHistory() {
    setHLoading(true);
    try {
      setHistory(await api.essayHistory());
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setHLoading(false);
    }
  }

  function resetEssay() {
    setEssay("");
    setGrade(null);
    setCompare(null);
    setErr("");
  }

  async function loadModel() {
    setModelBusy(true);
    setErr("");
    try {
      setModel(await api.essayModel(material, requirement, promptId));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setModelBusy(false);
    }
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
            {(() => {
              const n = countEssayChars(essay);
              const t = parseWordTarget(requirement);
              const st = wordStatus(n, t);
              return (
                <div className="row row--between" style={{ marginTop: 4, fontSize: 12 }}>
                  <span className="muted">
                    已写 <b className={st.cls}>{n}</b> 字{t ? ` · 要求 ${t[0]}–${t[1]} 字` : ""}
                  </span>
                  <span className={st.cls}>{st.text}</span>
                </div>
              );
            })()}
            <button className="btn btn--primary btn--block" style={{ marginTop: 10 }} disabled={busy || !essay.trim()} onClick={doGrade}>
              {busy ? "批改中…" : "AI 批改（满分 100）"}
            </button>
            <button className="btn btn--ghost btn--block" style={{ marginTop: 8 }} disabled={modelBusy} onClick={loadModel}>
              {modelBusy ? "生成范文中…" : "📝 查看范文参考"}
            </button>
            <button className="btn btn--ghost btn--block" style={{ marginTop: 8 }} disabled={!grade || compareBusy} onClick={loadCompare}>
              {compareBusy ? "对比点评中…" : "📊 对比范文点评"}
            </button>
          </div>

          {grade && (
            <>
              <div className="row row--between" style={{ marginBottom: 8 }}>
                <strong>申论批改结果</strong>
                <ReportExport targetRef={gradeRef} fileName={`申论批改结果_${new Date().toISOString().slice(0, 10)}`} />
              </div>
              <div ref={gradeRef} className="card report-hero" style={{ marginTop: 0 }}>
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
                    <div className="tutor-box__body"><Markdown>{grade.rationale}</Markdown></div>
                  </div>
                )}
              </div>
              <div className="row row--between" style={{ marginTop: 10 }}>
                <button className="btn btn--ghost btn--sm" onClick={resetEssay}>✍ 再写一篇</button>
                <span className="muted" style={{ fontSize: 12 }}>双阶段评分（初评 + 一致性校准），异常自动转人工</span>
              </div>
            </>
          )}

          {model && (
            <div className="card report-hero" style={{ marginTop: 12 }}>
              <div className="row row--between">
                <strong>📝 高分范文参考</strong>
                {model.offline && <span className="text-warning" style={{ fontSize: 12 }}>范文生成暂不可用</span>}
              </div>
              {model.outline.length > 0 && (
                <div className="tutor-box" style={{ marginTop: 10 }}>
                  <div className="tutor-box__title">结构提纲</div>
                  <ul className="tutor-box__body" style={{ margin: 0, paddingLeft: 18 }}>
                    {model.outline.map((o, i) => <li key={i}>{o}</li>)}
                  </ul>
                </div>
              )}
              {model.key_points.length > 0 && (
                <div className="tutor-box" style={{ marginTop: 10 }}>
                  <div className="tutor-box__title">高分要点</div>
                  <ul className="tutor-box__body" style={{ margin: 0, paddingLeft: 18 }}>
                    {model.key_points.map((o, i) => <li key={i}>{o}</li>)}
                  </ul>
                </div>
              )}
              <div className="tutor-box" style={{ marginTop: 10 }}>
                <div className="tutor-box__title">范文</div>
                <div className="tutor-box__body"><Markdown>{model.model_essay}</Markdown></div>
              </div>
              <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                AI 生成范文，仅供参考学习，请结合本题材料与自身理解使用。
              </div>
            </div>
          )}

          {compare && (
            <>
              <div className="row row--between" style={{ marginBottom: 8 }}>
                <strong>申论与范文对比点评</strong>
                <ReportExport targetRef={compareRef} fileName={`申论对比点评_${new Date().toISOString().slice(0, 10)}`} />
              </div>
              <div ref={compareRef}>
                <EssayCompareCard data={compare} />
              </div>
            </>
          )}
        </>
      )}

      {tab === "history" && (
        <>
          {hLoading && (
            <div className="sk-stack">
              {[0, 1, 2].map((i) => (
                <div key={i} className="sk-card">
                  <div className="sk-head">
                    <div className="sk sk-circle" style={{ width: 26, height: 26 }} />
                    <div className="sk sk-line" style={{ width: "45%" }} />
                  </div>
                  <div className="sk sk-line" style={{ width: "100%" }} />
                  <div className="sk sk-line" style={{ width: "60%" }} />
                </div>
              ))}
            </div>
          )}
          {!hLoading && history.length === 0 && (
            <div className="empty empty--tight">
              <div className="empty__icon">📝</div>
              <div className="empty__title">暂无批改记录</div>
              <div className="empty__desc">去「写 & 批改」完成首次申论批改吧。</div>
            </div>
          )}
          {!hLoading && history.length > 0 && (() => {
            const sorted = [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            const totals = sorted.map((h) => h.total);
            const first = totals[0];
            const last = totals[totals.length - 1];
            const best = Math.max(...totals);
            const avg = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
            const prev = totals.length > 1 ? totals[totals.length - 2] : null;
            const delta = prev !== null ? last - prev : 0;
            const deltaCls = delta > 0 ? "rate-trend--up" : delta < 0 ? "rate-trend--down" : "rate-trend--flat";
            return (
              <div className="card" style={{ marginTop: 12 }}>
                <div className="row row--between">
                  <strong>申论得分趋势</strong>
                  <span className="tag tag--brand">已批改 {history.length} 篇</span>
                </div>
                {sorted.length > 1 ? (
                  <LineChart
                    points={sorted.map((h) => ({ label: h.created_at.slice(5, 10), value: h.total }))}
                    max={100}
                    min={0}
                    unit="分"
                    color="var(--success)"
                  />
                ) : (
                  <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                    再完成 1 篇批改即可解锁得分趋势曲线。
                  </div>
                )}
                <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
                  <div className="metric">
                    <div className="metric__num" style={{ color: "var(--brand)" }}>{first}</div>
                    <div className="metric__label">首次得分</div>
                  </div>
                  <div className="metric">
                    <div className="metric__num" style={{ color: "var(--success)" }}>{best}</div>
                    <div className="metric__label">最佳得分</div>
                  </div>
                  <div className="metric">
                    <div className="metric__num">{avg}</div>
                    <div className="metric__label">平均得分</div>
                  </div>
                </div>
                {prev !== null && (
                  <div className="row row--between" style={{ marginTop: 8, fontSize: 12 }}>
                    <span className="muted">较上次批改</span>
                    <span className={"rate-trend " + deltaCls}>
                      {delta > 0 ? "▲ +" : delta < 0 ? "▼ " : "— "}
                      {Math.abs(delta)} 分
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
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
              <DimensionBars dims={h.dimensions} />
              {h.rationale && (
                <div className="tutor-box" style={{ marginTop: 8 }}>
                  <div className="tutor-box__body"><Markdown>{h.rationale}</Markdown></div>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
