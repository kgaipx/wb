import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { RadarChart } from "../components/RadarChart";

interface PaperQ {
  id: number;
  subject: string;
  category: string;
  qtype: string;
  stem: string;
  difficulty: number;
  knowledge_point: string;
  options: { id: number; label: string; content: string }[];
}
type Phase = "setup" | "doing" | "report" | "history" | "historyDetail";

// 模考为限时客观题组卷（自动评分）；申论属主观题需 AI 批改，不纳入自动模考，请到「申论批改」专项训练
const SUBJECTS = [
  { v: "", label: "全部科目" },
  { v: "行测", label: "行测" },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 模考正确率趋势折线（零依赖 SVG，复用运营后台视觉）。单点居中显示。 */
function ExamTrendChart({ rows }: { rows: { label: string; value: number }[] }) {
  const W = 320;
  const H = 96;
  const pad = 10;
  const bottom = 0;
  const top = 100;
  const n = rows.length;
  const step = n > 1 ? (W - pad * 2) / (n - 1) : 0;
  const pts = rows.map((r, i) => {
    const x = n > 1 ? pad + i * step : W / 2;
    const y = H - pad - ((r.value - bottom) / (top - bottom)) * (H - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map((p) => p.join(",")).join(" ");
  const area = `${pad},${H - pad} ${line} ${W - pad},${H - pad}`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="正确率趋势">
        <polygon points={area} fill="var(--brand)" opacity={0.1} />
        <polyline
          points={line}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={2.8} fill="var(--brand)" />
        ))}
      </svg>
      <div className="row row--between" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
        <span>{rows[0]?.label}</span>
        {n > 1 && <span>{rows[n - 1]?.label}</span>}
      </div>
    </div>
  );
}

export default function Exam() {
  const [tab, setTab] = useState<"exam" | "history">("exam");
  const [phase, setPhase] = useState<Phase>("setup");
  const [subject, setSubject] = useState("");
  const [count, setCount] = useState(20);
  const [paper, setPaper] = useState<PaperQ[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [report, setReport] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  // 限时倒计时状态
  const [deadline, setDeadline] = useState(0); // 截止时间戳(ms)
  const [remaining, setRemaining] = useState(0); // 剩余秒数
  // 用 ref 让计时器回调始终读到最新试卷与作答，避免闭包过期
  const paperRef = useRef<PaperQ[]>([]);
  const answersRef = useRef<Record<number, string>>({});
  const submittingRef = useRef(false);
  paperRef.current = paper;
  answersRef.current = answers;

  const HIS_PAGE = 20;
  const [history, setHistory] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [hisOffset, setHisOffset] = useState(0);
  const [hisLoadingMore, setHisLoadingMore] = useState(false);
  const [hisHasMore, setHisHasMore] = useState(false);

  const nav = useNavigate();

  async function loadHistory(reset = true) {
    const off = reset ? 0 : hisOffset;
    try {
      const data = await api.examHistory(HIS_PAGE, off);
      if (reset) {
        setHistory(data);
        setHisOffset(HIS_PAGE);
      } else {
        setHistory((prev) => [...prev, ...data]);
        setHisOffset(off + HIS_PAGE);
      }
      setHisHasMore(data.length === HIS_PAGE);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function loadMoreHistory() {
    if (hisLoadingMore || !hisHasMore) return;
    setHisLoadingMore(true);
    try {
      await loadHistory(false);
    } finally {
      setHisLoadingMore(false);
    }
  }

  useEffect(() => {
    if (tab === "history") loadHistory();
  }, [tab]);

  // 限时倒计时：进入 doing 且已设截止时间后开始计时，归零自动交卷
  useEffect(() => {
    if (phase !== "doing" || !deadline) return;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(rem);
      if (rem <= 0) {
        const ans = paperRef.current.map((q) => ({
          question_id: q.id,
          selected: answersRef.current[q.id] || "",
        }));
        doSubmit(ans);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, deadline]);

  // 考试中关闭/刷新页面时给予浏览器原生确认，防止误丢进度
  useEffect(() => {
    if (phase !== "doing") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  async function start() {
    setBusy(true);
    setErr("");
    setInfo("");
    try {
      const r = await api.examStart(subject || undefined, count);
      if (r.count < r.requested) {
        setInfo(`「${r.subject}」题库当前共 ${r.count} 题，已按实际题量组卷（你选择的 ${r.requested} 题超出可用题量）。`);
      }
      setPaper(r.paper);
      setAnswers({});
      setDeadline(Date.now() + r.duration_seconds * 1000);
      setRemaining(r.duration_seconds);
      setPhase("doing");
    } catch (e: any) {
      if (e.status === 404) {
        setErr("该科目暂无可组卷题目，请尝试「全部科目」或选择其他科目。");
      } else {
        setErr(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  /** 真正交卷逻辑（手动/自动共用）。用 ref 防重复提交。 */
  async function doSubmit(ans: { question_id: number; selected: string }[]) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    setErr("");
    try {
      const r = await api.examSubmit(ans);
      setReport(r);
      setPhase("report");
      setDeadline(0);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
      submittingRef.current = false;
    }
  }

  function submit() {
    const ans = paper.map((q) => ({ question_id: q.id, selected: answers[q.id] || "" }));
    doSubmit(ans);
  }

  async function openDetail(id: number) {
    setBusy(true);
    setErr("");
    try {
      setDetail(await api.examHistoryDetail(id));
      setPhase("historyDetail");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const answered = paper.filter((q) => answers[q.id]).length;
  const byId = new Map(paper.map((q) => [q.id, q]));

  function renderReport(rep: any, getStem: (d: any) => string | undefined) {
    const rate = Math.round((rep.correct_rate || 0) * 100);
    const tone = rate >= 70 ? "rate--good" : rate >= 50 ? "rate--mid" : "rate--bad";
    // 按知识点聚合正确率（弱→强排序），让考生看清究竟哪个模块拖后腿
    const kpStats = (() => {
      const m = new Map<string, { c: number; t: number }>();
      (rep.details || []).forEach((d: any) => {
        const k = d.knowledge_point || "未分类";
        const e = m.get(k) || { c: 0, t: 0 };
        e.t += 1;
        if (d.is_correct) e.c += 1;
        m.set(k, e);
      });
      return Array.from(m.entries())
        .map(([kp, v]) => ({ kp, rate: v.t ? v.c / v.t : 0, c: v.c, t: v.t }))
        .sort((a, b) => a.rate - b.rate);
    })();
    return (
      <>
        <div className="card report-hero">
          <div className={"big-rate " + tone}>{rate}<span>%</span></div>
          <div className="muted">正确率 · 答对 {rep.correct}/{rep.total} 题</div>
        </div>
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row row--between">
            <strong>各知识点正确率</strong>
            <span className="muted" style={{ fontSize: 12 }}>弱 → 强</span>
          </div>
          {kpStats.length >= 3 && (
            <div style={{ marginTop: 8 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>本次模考能力雷达（轴越瘪越该补）</div>
              <RadarChart data={kpStats.slice(0, 8).map((s) => ({ label: s.kp, value: s.rate }))} />
            </div>
          )}
          {kpStats.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>暂无维度数据</div>
          ) : (
            <div style={{ marginTop: 8 }}>
              {kpStats.map((s) => {
                const p = Math.round(s.rate * 100);
                const tone2 = p >= 70 ? "progress--success" : p >= 50 ? "" : "progress--warn";
                return (
                  <div key={s.kp} style={{ marginTop: 8 }}>
                    <div className="row row--between" style={{ fontSize: 13 }}>
                      <span>
                        {s.kp} <span className="text-3">（{s.c}/{s.t}）</span>
                      </span>
                      <span className={p >= 70 ? "text-success" : p >= 50 ? "text-brand" : "text-danger"}>{p}%</span>
                    </div>
                    <div className={"progress " + tone2}>
                      <div className="progress__bar" style={{ width: p + "%" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="card card--warning" style={{ marginTop: 12 }}>
          <strong>薄弱知识点（AI 诊断）</strong>
          <div className="chip-row" style={{ marginTop: 8 }}>
            {rep.weak_points.length ? (
              rep.weak_points.map((w: string) => (
                <button key={w} className="chip chip--warn chip--btn" onClick={() => nav("/learn")}>
                  {w}
                </button>
              ))
            ) : (
              <span className="muted">无明显薄弱点，保持节奏 👍</span>
            )}
          </div>
          <button className="btn btn--ghost btn--sm" style={{ marginTop: 8 }} onClick={() => nav("/learn")}>
            去学习中心针对性重练 →
          </button>
        </div>
        <h3 className="section-title" style={{ marginTop: 16 }}>逐题回顾</h3>
        {rep.details.map((d: any, i: number) => (
          <div className="card" key={d.question_id} style={{ marginTop: 12 }}>
            <div className="row row--between">
              <span className="text-3">第 {i + 1} 题{d.knowledge_point ? ` · ${d.knowledge_point}` : ""}</span>
              <span className={d.is_correct ? "text-success" : "text-danger"}>
                {d.is_correct ? "✔ 答对" : "✘ 答错"}
              </span>
            </div>
            {getStem(d) && <div className="q-item__stem" style={{ marginTop: 4 }}>{getStem(d)}</div>}
            {!d.is_correct && (
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                正确答案：<b className="text-brand">{d.correct_answer}</b>
                {d.selected ? `（你的作答：${d.selected}）` : ""}
                <div style={{ marginTop: 6 }}>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => nav(`/practice?q=${d.question_id}`)}
                  >
                    🔁 重练这道题
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </>
    );
  }

  return (
    <section>
      <h2 className="page-title">在线模考</h2>
      <div className="chip-row" style={{ marginBottom: 12 }}>
        <button className={"chip" + (tab === "exam" ? " chip--on" : "")} onClick={() => setTab("exam")}>模考</button>
        <button className={"chip" + (tab === "history" ? " chip--on" : "")} onClick={() => setTab("history")}>历史</button>
      </div>
      {err && <div className="err-text">{err}</div>}
      {info && <div className="info-text">{info}</div>}

      {tab === "exam" && phase === "setup" && (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            还原真实考场节奏：限时组卷、隐藏答案，交卷后生成「提分报告」（正确率 + 薄弱知识点），并自动存入历史可随时复盘。
          </p>
          <div className="field-label">选择科目</div>
          <div className="chip-row">
            {SUBJECTS.map((s) => (
              <button key={s.v} className={"chip" + (subject === s.v ? " chip--on" : "")} onClick={() => setSubject(s.v)}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="field-label" style={{ marginTop: 12 }}>题量</div>
          <div className="chip-row">
            {[10, 20, 30].map((n) => (
              <button key={n} className={"chip" + (count === n ? " chip--on" : "")} onClick={() => setCount(n)}>
                {n} 题
              </button>
            ))}
          </div>
          <button className="btn btn--primary btn--block" style={{ marginTop: 16 }} disabled={busy} onClick={start}>
            {busy ? "组卷中…" : "开始模考"}
          </button>
        </div>
      )}

      {tab === "exam" && phase === "doing" && (
        <>
          {info && <div className="info-text" style={{ marginBottom: 10 }}>{info}</div>}
          <div className="exam-bar">
            <span className="tag tag--brand">{subject || "全部"}</span>
            <span className="text-3">已答 {answered}/{paper.length}</span>
            {remaining > 0 && (
              <span className={"exam-clock" + (remaining <= 60 ? " exam-clock--warn" : "")}>
                ⏱ {fmtClock(remaining)}
              </span>
            )}
            <button className="btn btn--primary btn--sm" disabled={busy} onClick={submit}>
              {busy ? "阅卷中…" : "交卷"}
            </button>
          </div>
          {paper.map((q, i) => (
            <div className="card" key={q.id} style={{ marginTop: 12 }}>
              <div className="q-item__meta" style={{ marginBottom: 4 }}>
                <span className="text-3">第 {i + 1} 题</span>
                <span className="tag tag--brand">{q.knowledge_point}</span>
                <span>· 难度 {q.difficulty}</span>
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.5 }}>{q.stem}</div>
              {q.options.map((o) => (
                <label key={o.id} className={"opt" + (answers[q.id] === o.label ? " opt--selected" : "")}>
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={answers[q.id] === o.label}
                    onChange={() => setAnswers((s) => ({ ...s, [q.id]: o.label }))}
                  />
                  <b>{o.label}.</b> <span>{o.content}</span>
                </label>
              ))}
            </div>
          ))}
          <button className="btn btn--primary btn--block" style={{ marginTop: 14 }} disabled={busy} onClick={submit}>
            {busy ? "阅卷中…" : `交卷（已答 ${answered}/${paper.length}）`}
          </button>
        </>
      )}

      {tab === "exam" && phase === "report" && (
        <>
          {renderReport(report, (d) => byId.get(d.question_id)?.stem)}
          <button className="btn btn--ghost btn--block" style={{ marginTop: 16 }} onClick={() => { setPhase("setup"); setTab("history"); }}>
            查看模考历史 →
          </button>
        </>
      )}

      {tab === "history" && phase !== "historyDetail" && (
        <div>
          {history.length > 0 &&
            (() => {
              const sorted = [...history].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
              const trendRows = sorted.map((h, i) => ({
                label: `第${i + 1}次`,
                value: Math.round((h.correct_rate || 0) * 100),
              }));
              const avg = Math.round(
                (sorted.reduce((s, h) => s + (h.correct_rate || 0), 0) / sorted.length) * 100
              );
              const best = Math.round(Math.max(...sorted.map((h) => h.correct_rate || 0)) * 100);
              const first = Math.round((sorted[0].correct_rate || 0) * 100);
              const last = Math.round((sorted[sorted.length - 1].correct_rate || 0) * 100);
              const delta = last - first;
              const deltaCls =
                delta > 0 ? "rate-trend--up" : delta < 0 ? "rate-trend--down" : "rate-trend--flat";
              return (
                <div className="card">
                  <div className="row row--between">
                    <strong>成绩进步趋势</strong>
                    <span className="muted" style={{ fontSize: 12 }}>正确率 %</span>
                  </div>
                  <ExamTrendChart rows={trendRows} />
                  <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
                    <div className="metric">
                      <div className="metric__num" style={{ fontSize: 20 }}>{sorted.length}</div>
                      <div className="metric__label">模考次数</div>
                    </div>
                    <div className="metric">
                      <div className="metric__num" style={{ fontSize: 20, color: "var(--brand)" }}>{avg}%</div>
                      <div className="metric__label">平均正确率</div>
                    </div>
                    <div className="metric">
                      <div className="metric__num" style={{ fontSize: 20, color: "var(--success)" }}>{best}%</div>
                      <div className="metric__label">最佳成绩</div>
                    </div>
                  </div>
                  {sorted.length >= 2 && (
                    <div className="row row--between" style={{ marginTop: 10, fontSize: 13 }}>
                      <span className="muted">较首次模考</span>
                      <span className={"rate-trend " + deltaCls}>
                        {delta > 0 ? "▲ +" : delta < 0 ? "▼ " : "— "}
                        {Math.abs(delta)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
          <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>已加载 {history.length} 次模考记录</div>
          {history.length === 0 && (
            <div className="card">
              <div className="empty empty--tight">
                <div className="empty__icon">🏛️</div>
                <div className="empty__title">还没有模考记录</div>
                <div className="empty__desc">去「模考」完成一次，检验真实水平。</div>
                <div className="empty__action">
                  <button className="btn btn--primary btn--sm" onClick={() => setTab("exam")}>去模考 →</button>
                </div>
              </div>
            </div>
          )}
          {history.map((h) => {
            const rate = Math.round((h.correct_rate || 0) * 100);
            const tone = rate >= 70 ? "rate--good" : rate >= 50 ? "rate--mid" : "rate--bad";
            return (
              <div
                key={h.id}
                className="q-item"
                role="button"
                tabIndex={0}
                onClick={() => openDetail(h.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openDetail(h.id);
                  }
                }}
              >
                <div className="q-item__meta">
                  <span className="tag tag--brand">{h.subject}</span>
                  <span className="text-3">{fmtDate(h.created_at)}</span>
                </div>
                <div className="row row--between" style={{ marginTop: 4 }}>
                  <span>答对 {h.correct}/{h.total}</span>
                  <span className={"big-rate " + tone} style={{ fontSize: 22 }}>{rate}<span>%</span></span>
                </div>
                {h.weak_points.length > 0 && (
                  <div className="text-3" style={{ fontSize: 12, marginTop: 4 }}>薄弱：{h.weak_points.slice(0, 3).join("、")}</div>
                )}
              </div>
            );
          })}
          {hisHasMore && (
            <button className="btn btn--ghost btn--block" style={{ marginTop: 14 }} disabled={hisLoadingMore} onClick={loadMoreHistory}>
              {hisLoadingMore ? "加载中…" : "加载更多模考记录"}
            </button>
          )}
        </div>
      )}

      {tab === "history" && phase === "historyDetail" && detail && (
        <>
          <button className="back-link" onClick={() => setPhase("history")}>← 返回历史列表</button>
          {renderReport(detail, (d) => d.stem)}
          <button className="btn btn--ghost btn--block" style={{ marginTop: 16 }} onClick={() => setPhase("history")}>
            返回历史列表
          </button>
        </>
      )}
    </section>
  );
}
