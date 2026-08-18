import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Question } from "../api/client";

/* ============================================================
 * 历年真题套卷模考 + 分数预测
 * 按国考/省考真题题型配比，从真实题库中合成「真题套卷」；
 * 限时模考后结合目标进面线估算行测分、总分与上岸概率。
 * （真实历年卷数据缺失，套卷为按配比从题库智能组卷的等价替代。）
 * ============================================================ */

interface Module {
  cat: string;
  label: string;
  n: number;
}
interface Blueprint {
  key: string;
  name: string;
  minutes: number;
  line: number; // 默认进面线（总分）
  modules: Module[];
}

const CAT_LABEL: Record<string, string> = {
  言语理解与表达: "言语",
  数量关系: "数量",
  判断推理: "判断",
  资料分析: "资料",
  常识判断: "常识",
};

const BLUEPRINTS: Blueprint[] = [
  {
    key: "gwy_pro",
    name: "国考·副省级",
    minutes: 120,
    line: 120,
    modules: [
      { cat: "言语理解与表达", label: "言语", n: 40 },
      { cat: "数量关系", label: "数量", n: 15 },
      { cat: "判断推理", label: "判断", n: 40 },
      { cat: "资料分析", label: "资料", n: 20 },
      { cat: "常识判断", label: "常识", n: 20 },
    ],
  },
  {
    key: "gwy_city",
    name: "国考·地市级/行政执法",
    minutes: 120,
    line: 110,
    modules: [
      { cat: "言语理解与表达", label: "言语", n: 40 },
      { cat: "数量关系", label: "数量", n: 10 },
      { cat: "判断推理", label: "判断", n: 40 },
      { cat: "资料分析", label: "资料", n: 20 },
      { cat: "常识判断", label: "常识", n: 20 },
    ],
  },
  {
    key: "prov",
    name: "省考·联考",
    minutes: 120,
    line: 115,
    modules: [
      { cat: "言语理解与表达", label: "言语", n: 35 },
      { cat: "数量关系", label: "数量", n: 15 },
      { cat: "判断推理", label: "判断", n: 40 },
      { cat: "资料分析", label: "资料", n: 15 },
      { cat: "常识判断", label: "常识", n: 15 },
    ],
  },
];

function isMulti(q: Question): boolean {
  return !!q.qtype && (q.qtype.includes("多") || q.qtype.toLowerCase().includes("multi"));
}

interface ReviewItem {
  qid: number;
  stem: string;
  cat: string;
  kp: string;
  multi: boolean;
  options: { label: string; content: string }[];
  userAnswer: string; // 用户所选标签拼接（""=未作答）
  correctAnswer: string; // 正确标签拼接（""=无标准答案）
  isCorrect: boolean;
  skipped: boolean; // 无标准答案，已跳过
  explanation: string;
}

interface ResultData {
  total: number;
  correct: number;
  xingce: number; // 行测估分
  essay: number;
  totalScore: number;
  line: number;
  gap: number;
  prob: number; // 上岸概率 0-100
  perModule: { label: string; cat: string; total: number; correct: number }[];
  weakest: string | null;
  reviews: ReviewItem[];
}

export default function ExamPrediction() {
  const nav = useNavigate();
  const [phase, setPhase] = useState<"setup" | "exam" | "result">("setup");
  const [bpKey, setBpKey] = useState(BLUEPRINTS[0].key);
  const [line, setLine] = useState(BLUEPRINTS[0].line);
  const [essay, setEssay] = useState(65);

  const [paper, setPaper] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [idx, setIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [building, setBuilding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<ResultData | null>(null);
  const [revFilter, setRevFilter] = useState<"all" | "wrong" | "unans">("all");
  const timerRef = useRef<number | null>(null);
  const submitRef = useRef(submit);
  submitRef.current = submit;

  const bp = BLUEPRINTS.find((b) => b.key === bpKey)!;
  const totalQ = useMemo(() => bp.modules.reduce((s, m) => s + m.n, 0), [bp]);

  // 调整蓝图时同步默认进面线
  function chooseBp(k: string) {
    setBpKey(k);
    const b = BLUEPRINTS.find((x) => x.key === k)!;
    setLine(b.line);
  }

  async function startExam() {
    setBuilding(true);
    setErr("");
    try {
      const groups = await Promise.all(
        bp.modules.map((m) => api.bankList({ category: m.cat, limit: m.n }))
      );
      const qs: Question[] = [];
      bp.modules.forEach((m, i) => {
        groups[i].slice(0, m.n).forEach((q) => qs.push(q));
      });
      if (qs.length < totalQ * 0.6) {
        setErr(`题库中该模块题量不足（实得 ${qs.length}/${totalQ} 题），暂无法组卷，可换一套或稍后补充题库。`);
        setBuilding(false);
        return;
      }
      setPaper(qs);
      setAnswers({});
      setIdx(0);
      setTimeLeft(bp.minutes * 60);
      setPhase("exam");
    } catch (e: any) {
      setErr(e.message || "组卷失败");
    } finally {
      setBuilding(false);
    }
  }

  // 倒计时
  useEffect(() => {
    if (phase !== "exam") return;
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          submitRef.current();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function setAnswer(qid: number, sel: string) {
    setAnswers((a) => ({ ...a, [qid]: sel }));
  }

  const cur = paper[idx];

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const results = await Promise.all(
        paper.map((q) => {
          const sel = answers[q.id] || "";
          // 始终调用 practice：已作答则判分；未作答（sel=""）走后端「仅揭示答案」分支，
          // 不写入作答记录、不更新能力图谱，避免把「没做」污染成「做错」。
          return api
            .practice(q.id, sel)
            .then((r) => ({
              cat: q.category,
              correct: !!r.is_correct,
              selected: sel,
              correctAnswer: r.correct_answer ?? "",
              explanation: r.explanation ?? "",
              skipped: !!r.skipped,
            }))
            .catch(() => ({
              cat: q.category,
              correct: false,
              selected: sel,
              correctAnswer: "",
              explanation: "",
              skipped: false,
            }));
        })
      );
      const total = results.length;
      const correct = results.filter((r) => r.correct).length;
      const perModuleMap = new Map<string, { total: number; correct: number }>();
      bp.modules.forEach((m) => perModuleMap.set(m.cat, { total: 0, correct: 0 }));
      results.forEach((r) => {
        const slot = perModuleMap.get(r.cat);
        if (slot) {
          slot.total += 1;
          if (r.correct) slot.correct += 1;
        }
      });
      const perModule = bp.modules.map((m) => {
        const s = perModuleMap.get(m.cat)!;
        return { label: m.label, cat: m.cat, total: s.total, correct: s.correct };
      });
      const xingce = total ? Math.round((correct / total) * 1000) / 10 : 0;
      const totalScore = Math.round((xingce + essay) * 10) / 10;
      const gap = Math.round((totalScore - line) * 10) / 10;
      const prob = Math.max(1, Math.min(99, Math.round(100 / (1 + Math.exp(-gap / 7)))));
      let weakest: string | null = null;
      let worstRate = 1;
      perModule.forEach((m) => {
        if (m.total > 0) {
          const rate = m.correct / m.total;
          if (rate < worstRate) {
            worstRate = rate;
            weakest = m.label;
          }
        }
      });
      const reviews: ReviewItem[] = paper.map((q, i) => {
        const r = results[i];
        return {
          qid: q.id,
          stem: q.stem,
          cat: q.category,
          kp: q.knowledge_point,
          multi: isMulti(q),
          options: q.options.map((o) => ({ label: o.label, content: o.content })),
          userAnswer: r.selected,
          correctAnswer: r.correctAnswer,
          isCorrect: r.correct,
          skipped: r.skipped,
          explanation: r.explanation,
        };
      });
      setResult({ total, correct, xingce, essay, totalScore, line, gap, prob, perModule, weakest, reviews });
      setPhase("result");
    } catch (e: any) {
      setErr(e.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  const answeredCount = Object.keys(answers).filter((k) => answers[+k]).length;
  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  /* ============ 组卷阶段 ============ */
  if (phase === "setup") {
    return (
      <section>
        <div className="hero pred-hero">
          <div className="hero__title">真题套卷 · 分数预测</div>
          <div className="hero__sub">按国考/省考真题配比智能组卷 · 限时模考 · 上岸概率估算</div>
        </div>

        {err && <div className="err-text">{err}</div>}

        <div className="section-title">选择考试类型</div>
        <div className="chip-row mat-cats">
          {BLUEPRINTS.map((b) => (
            <button key={b.key} className={"chip" + (b.key === bpKey ? " chip--on" : "")} onClick={() => chooseBp(b.key)}>
              {b.name}
            </button>
          ))}
        </div>

        {/* 套卷结构 */}
        <div className="card pred-blueprint">
          <div className="pred-blueprint__head">
            <span className="pred-blueprint__name">{bp.name}</span>
            <span className="tag tag--brand">{totalQ} 题 · {bp.minutes} 分钟</span>
          </div>
          <div className="pred-mods">
            {bp.modules.map((m) => (
              <div key={m.cat} className="pred-mod">
                <span className="pred-mod__label">{m.label}</span>
                <span className="pred-mod__n">{m.n} 题</span>
              </div>
            ))}
          </div>
          <div className="pred-blueprint__note muted">
            分值按等权估算（行测满分 100）。真实历年卷暂未授权入库，本套卷依据真题题型配比，从已入库真题库中智能抽题合成，贴近实战。
          </div>
        </div>

        {/* 预测参数 */}
        <div className="card pred-params">
          <div className="pred-param">
            <label>目标进面线（总分）</label>
            <input type="number" value={line} min={0} max={200} onChange={(e) => setLine(Number(e.target.value) || 0)} />
          </div>
          <div className="pred-param">
            <label>申论基准分：<b>{essay}</b></label>
            <input type="range" min={40} max={85} value={essay} onChange={(e) => setEssay(Number(e.target.value))} />
          </div>
        </div>

        <button className="btn btn--primary btn--block pred-start" disabled={building} onClick={startExam}>
          {building ? "正在智能组卷…" : "📝 生成套卷并开始模考"}
        </button>
        <div className="mat-foot muted">
          模考结束后，系统据你的正确率估算行测分，并结合申论基准与目标进面线，给出总分与上岸概率参考。
        </div>
      </section>
    );
  }

  /* ============ 模考阶段 ============ */
  if (phase === "exam" && cur) {
    const multi = isMulti(cur);
    const sel = answers[cur.id] || "";
    const selArr = multi ? sel.split("").filter(Boolean) : [];
    const timeWarn = timeLeft <= 60;

    function pick(label: string) {
      if (multi) {
        const next = selArr.includes(label)
          ? selArr.filter((x) => x !== label)
          : [...selArr, label].sort();
        setAnswer(cur.id, next.join(""));
      } else {
        setAnswer(cur.id, label);
      }
    }

    return (
      <section className="pred-exam">
        {/* 顶部进度 + 计时 */}
        <div className={"pred-top" + (timeWarn ? " pred-top--warn" : "")}>
          <div className="pred-top__row">
            <span className="pred-top__idx">第 {idx + 1} / {paper.length} 题</span>
            <span className="pred-top__time">⏱ {fmtTime(timeLeft)}</span>
          </div>
          <div className="progress">
            <div className="progress__bar" style={{ width: `${((idx + 1) / paper.length) * 100}%` }} />
          </div>
          <div className="pred-top__answered muted">已答 {answeredCount}/{paper.length}</div>
        </div>

        {/* 题干 */}
        <div className="card pred-q">
          <div className="pred-q__meta">
            <span className="tag tag--brand">{CAT_LABEL[cur.category] || cur.category}</span>
            <span className="tag">{cur.knowledge_point}</span>
            {multi && <span className="tag tag--warning">多选</span>}
          </div>
          <div className="pred-q__stem">{cur.stem}</div>
          <div className="pred-q__opts">
            {cur.options.map((o) => {
              const on = multi ? selArr.includes(o.label) : sel === o.label;
              return (
                <button
                  key={o.id}
                  className={"pred-opt" + (on ? " pred-opt--on" : "")}
                  onClick={() => pick(o.label)}
                >
                  <span className="pred-opt__label">{o.label}</span>
                  <span className="pred-opt__content">{o.content}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 导航 */}
        <div className="pred-nav">
          <button className="btn btn--ghost" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>
            上一题
          </button>
          {idx < paper.length - 1 ? (
            <button className="btn btn--primary" onClick={() => setIdx((i) => i + 1)}>
              下一题
            </button>
          ) : (
            <button className="btn btn--primary" disabled={submitting} onClick={submit}>
              {submitting ? "交卷中…" : "🏁 交卷"}
            </button>
          )}
        </div>
        {idx === paper.length - 1 && (
          <button className="btn btn--ghost btn--block pred-submit-all" disabled={submitting} onClick={submit}>
            直接交卷（未答计错）
          </button>
        )}
      </section>
    );
  }

  /* ============ 结果 + 分数预测 ============ */
  if (phase === "result" && result) {
    const probColor = result.prob >= 70 ? "var(--success)" : result.prob >= 45 ? "var(--warning)" : "var(--danger)";
    const advice =
      result.gap >= 12
        ? "稳了！保持节奏，可冲刺更高层级岗位。"
        : result.gap >= 3
        ? "有望进面，重点补强最弱模块、拉大分差。"
        : result.gap > -3
        ? "处于进面边缘，单模块提升 5 分即可翻盘。"
        : "差距偏大，建议优先攻克正确率最低模块并延长备考周期。";

    return (
      <section>
        <div className="hero pred-hero">
          <div className="hero__title">模考成绩 · 分数预测</div>
          <div className="hero__sub">{bp.name} · 共 {result.total} 题，答对 {result.correct} 题</div>
        </div>

        {/* 核心预测卡 */}
        <div className="card pred-result">
          <div className="pred-result__score">
            <div className="pred-result__total">{result.totalScore}</div>
            <div className="pred-result__totallabel">估测总分</div>
          </div>
          <div className="pred-result__gauge">
            <Gauge pct={result.prob} color={probColor} />
          </div>
        </div>

        {/* 分项 */}
        <div className="grid-2 pred-scores">
          <div className="metric">
            <div className="metric__num">{result.xingce}</div>
            <div className="metric__label">行测估分</div>
          </div>
          <div className="metric">
            <div className="metric__num">{result.essay}</div>
            <div className="metric__label">申论基准</div>
          </div>
          <div className="metric">
            <div className="metric__num" style={{ color: result.gap >= 0 ? "var(--success)" : "var(--danger)" }}>
              {result.gap >= 0 ? "+" : ""}{result.gap}
            </div>
            <div className="metric__label">与进面线差</div>
          </div>
          <div className="metric">
            <div className="metric__num" style={{ color: probColor }}>{result.prob}%</div>
            <div className="metric__label">上岸概率</div>
          </div>
        </div>

        {/* 模块拆解 */}
        <div className="section-title" style={{ marginTop: "var(--sp-5)" }}>各模块正确率</div>
        <div className="card pred-mods-result">
          {result.perModule.map((m) => {
            const rate = m.total ? Math.round((m.correct / m.total) * 100) : 0;
            const color = rate >= 70 ? "var(--success)" : rate >= 40 ? "var(--warning)" : "var(--danger)";
            return (
              <div key={m.cat} className="pred-modbar">
                <div className="pred-modbar__head">
                  <span>{m.label}</span>
                  <span className="muted">{m.correct}/{m.total}</span>
                </div>
                <div className="progress">
                  <div className="progress__bar" style={{ width: `${rate}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* 建议 */}
        <div className="card card--accent pred-advice">
          <div className="pred-advice__title">📌 备考建议</div>
          <div className="pred-advice__body">{advice}</div>
          {result.weakest && (
            <div className="pred-advice__weak">
              最弱模块：<b>{result.weakest}</b>，建议优先用「智能强化包」专项突破。
            </div>
          )}
        </div>

        {/* 逐题复盘 */}
        {(() => {
          const wrongCount = result.reviews.filter((r) => r.userAnswer && !r.isCorrect && !r.skipped).length;
          const unansCount = result.reviews.filter((r) => !r.userAnswer && !r.skipped).length;
          const shown = result.reviews.filter((r) => {
            if (revFilter === "wrong") return r.userAnswer && !r.isCorrect && !r.skipped;
            if (revFilter === "unans") return !r.userAnswer && !r.skipped;
            return true;
          });
          return (
            <>
              <div className="section-title" style={{ marginTop: "var(--sp-5)" }}>逐题复盘</div>
              <div className="chip-row pred-rev-filters">
                <button className={"chip" + (revFilter === "all" ? " chip--on" : "")} onClick={() => setRevFilter("all")}>全部 {result.reviews.length}</button>
                <button className={"chip" + (revFilter === "wrong" ? " chip--on" : "")} onClick={() => setRevFilter("wrong")}>答错 {wrongCount}</button>
                <button className={"chip" + (revFilter === "unans" ? " chip--on" : "")} onClick={() => setRevFilter("unans")}>未答 {unansCount}</button>
              </div>
              <div className="pred-reviews">
                {shown.map((rv, i) => {
                  const corrSet = new Set(rv.correctAnswer.split(""));
                  const userSet = new Set(rv.userAnswer.split(""));
                  const badge = rv.skipped ? "无答案" : rv.isCorrect ? "答对" : rv.userAnswer ? "答错" : "未答";
                  const badgeCls = rv.skipped ? " is-skip" : rv.isCorrect ? " is-ok" : " is-bad";
                  return (
                    <div key={rv.qid} className={"pred-review" + (rv.isCorrect ? " pred-review--ok" : rv.skipped ? "" : " pred-review--bad")}>
                      <div className="pred-review__head">
                        <span className="pred-review__idx">{i + 1}</span>
                        <span className={"pred-review__badge" + badgeCls}>{badge}</span>
                        <span className="tag tag--brand">{CAT_LABEL[rv.cat] || rv.cat}</span>
                        {rv.multi && <span className="tag tag--warning">多选</span>}
                      </div>
                      <div className="pred-review__stem">{rv.stem}</div>
                      <div className="pred-review__opts">
                        {rv.options.map((o) => {
                          const isCorr = corrSet.has(o.label);
                          const isUser = userSet.has(o.label);
                          let cls = "pred-review__opt";
                          if (isCorr) cls += " is-correct";
                          else if (isUser) cls += " is-wrong";
                          const mark = isCorr ? "✓" : isUser ? "✗" : "";
                          return (
                            <div key={o.label} className={cls}>
                              <span className="pred-review__opt-label">{o.label}</span>
                              <span className="pred-review__opt-content">{o.content}</span>
                              {mark && <span className="pred-review__opt-mark">{mark}</span>}
                            </div>
                          );
                        })}
                      </div>
                      <div className="pred-review__ans">
                        <span>你的答案：<b className={rv.isCorrect ? "is-ok" : rv.skipped ? "" : "is-bad"}>{rv.userAnswer || "（未作答）"}</b></span>
                        <span>正确答案：<b className="is-ok">{rv.skipped ? "—" : rv.correctAnswer}</b></span>
                      </div>
                      {rv.explanation && !rv.skipped && <div className="pred-review__exp">💡 {rv.explanation}</div>}
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        <div className="pred-result-actions">
          <button className="btn btn--primary btn--block" onClick={() => { setPhase("setup"); setResult(null); }}>
            再考一套
          </button>
          {result.weakest && (
            <button className="btn btn--ghost btn--block" onClick={() => nav("/reinforce")}>
              🎯 去强化最弱模块
            </button>
          )}
        </div>
        <div className="mat-foot muted">
          预测为基于当前正确率与历史进面线的概率参考，实际录取受岗位竞争比、面试表现等多因素影响。
        </div>
      </section>
    );
  }

  return null;
}

function Gauge({ pct, color }: { pct: number; color: string }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const off = C * (1 - pct / 100);
  return (
    <div className="pred-gauge">
      <svg viewBox="0 0 80 80" width="96" height="96">
        <circle cx="40" cy="40" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
        <circle
          cx="40" cy="40" r={R} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 40 40)"
          style={{ transition: "stroke-dashoffset .6s var(--ease-out)" }}
        />
        <text x="40" y="37" textAnchor="middle" fontSize="17" fontWeight="800" fill={color}>{pct}%</text>
        <text x="40" y="53" textAnchor="middle" fontSize="9" fill="var(--text-3)">上岸概率</text>
      </svg>
    </div>
  );
}
