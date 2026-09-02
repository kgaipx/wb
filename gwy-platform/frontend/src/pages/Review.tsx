import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  QuestionReviewOut,
  QuestionReviewStats,
  ReviewOut,
  ReviewStats,
} from "../api/client";
import { useAuth } from "../auth";
import EmptyState from "../components/EmptyState";
import Reveal from "../components/Reveal";

const TYPE_LABEL: Record<string, string> = {
  question: "题目解析",
  knowledge: "知识点",
  essay_policy: "申论规范",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待复核",
  approved: "已通过",
  rejected: "已驳回",
  corrected: "已更正",
};

const SAMPLE_BODY = `【AI 生成解析】类比推理：题干“钢笔∶墨水”，二者为配套使用关系（钢笔需要墨水才能书写）。
类比选项“毛笔∶墨汁”同样为配套使用，逻辑一致，故选 B。
（本解析由 AI 生成，须经双签复核后方可对外发布，确保内容可信。）`;

export default function Review() {
  const nav = useNavigate();
  const { user } = useAuth();
  const reviewerName = user?.nickname || user?.email || "当前审核员";
  const [tab, setTab] = useState<"content" | "questions">("content");

  // —— 内容审核（原有） ——
  const [pending, setPending] = useState<ReviewOut[]>([]);
  const [done, setDone] = useState<ReviewOut[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loadingC, setLoadingC] = useState(true);
  const [err, setErr] = useState("");
  const [noPerm, setNoPerm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: number; mode: "reject" | "correct"; body: string; note: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [subType, setSubType] = useState("question");
  const [subBody, setSubBody] = useState("");
  const [subOk, setSubOk] = useState("");

  // —— 题库审核（新增：接入待核实题） ——
  const [qPending, setQPending] = useState<QuestionReviewOut[]>([]);
  const [qStats, setQStats] = useState<QuestionReviewStats | null>(null);
  const [qErr, setQErr] = useState("");
  const [qBusy, setQBusy] = useState(false);
  const [qOffset, setQOffset] = useState(0);
  const [qHasMore, setQHasMore] = useState(false);
  const [qSigned, setQSigned] = useState<QuestionReviewOut[]>([]); // 本会话已处理（反馈）
  const [qBulkBusy, setQBulkBusy] = useState(false); // 本页批量签
  // —— 程序自动识别审核（规则初筛：定位可疑题，优先人工复核） ——
  const [scan, setScan] = useState<any>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanErr, setScanErr] = useState("");
  const [scanOpen, setScanOpen] = useState(false); // 可疑题列表展开
  const [scanGroup, setScanGroup] = useState<string>(""); // 分组筛选（""=全部 / 科目名）
  const [scanBusyIds, setScanBusyIds] = useState<number[]>([]); // 处置中的题目
  const [fixAns, setFixAns] = useState<Record<number, string>>({}); // 修正答案输入
  const [fixNote, setFixNote] = useState<string>(""); // 处置备注（批量）
  const [hist, setHist] = useState<any[]>([]); // 最近处置留痕
  const [histErr, setHistErr] = useState("");
  // —— v2 批量处置 ——
  const [selIds, setSelIds] = useState<number[]>([]); // 勾选待批量处置
  const [reasonFilter, setReasonFilter] = useState<string>(""); // 原因类型筛选
  const [scanLimit, setScanLimit] = useState<number>(300); // 已加载条数
  const [bulkFixAns, setBulkFixAns] = useState<string>(""); // 批量修正答案

  // —— AI 批量补解析（P2 内容质量） ——
  const [aiFill, setAiFill] = useState<any>(null); // 最近一批结果
  const [aiFillBusy, setAiFillBusy] = useState(false);
  const [aiFillErr, setAiFillErr] = useState("");
  const [aiBatch, setAiBatch] = useState(10); // 单批题数
  // 一键循环补完：前端驱动循环（服务端双 worker，进程内 job 状态不可共享）
  const loopStopRef = useRef(false);
  const [loopRun, setLoopRun] = useState(false);
  const [loopStat, setLoopStat] = useState<{ done: number; failed: number; remaining: number; startedAt: number } | null>(null);

  async function runAiFill() {
    setAiFillBusy(true); setAiFillErr("");
    try {
      const r = await api.aiFillExplanations(aiBatch);
      setAiFill(r);
      await loadHist();
    } catch (e: any) {
      setAiFillErr(e.message || "补解析失败");
    } finally {
      setAiFillBusy(false);
    }
  }

  async function runAiFillLoop() {
    setLoopRun(true); loopStopRef.current = false; setAiFillErr("");
    setLoopStat({ done: 0, failed: 0, remaining: aiFill?.remaining ?? 0, startedAt: Date.now() });
    let guard = 0; // 硬上限防失控（100 批 × 100 = 10000 > 全库）
    try {
      while (!loopStopRef.current && guard < 100) {
        guard++;
        const r = await api.aiFillExplanations(100);
        setAiFill(r);
        setLoopStat(s => s ? { ...s, done: s.done + r.filled, failed: s.failed + r.failed, remaining: r.remaining } : s);
        if (r.remaining === 0) break;
        if (r.filled === 0) { setAiFillErr("连续一批无成功题，已停止（查看失败原因）"); break; }
        await loadHist();
      }
    } catch (e: any) {
      setAiFillErr(e.message || "循环补解析中断");
    } finally {
      setLoopRun(false);
      loopStopRef.current = false;
    }
  }

  // —— 可疑题处置（工作台）：fixed / voided / ignored，全部留痕 ——
  async function loadHist() {
    try {
      setHist(await api.auditActions(30));
      setHistErr("");
    } catch (e: any) {
      setHistErr(e.message || "留痕加载失败");
    }
  }
  async function doAction(ids: number[], action: "fixed" | "voided" | "ignored", answer?: string) {
    setScanBusyIds(prev => [...prev, ...ids]);
    setScanErr("");
    try {
      await api.autoAction({ question_ids: ids, action, note: fixNote || undefined, answer });
      const idSet = new Set(ids);
      setScan((prev: any) => prev ? {
        ...prev,
        suspects: (prev.suspects || []).filter((s: any) => !idSet.has(s.id)),
        suspect_count: Math.max(0, prev.suspect_count - ids.length),
      } : prev);
      setFixNote("");
      await loadHist();
    } catch (e: any) {
      setScanErr(e.message || "处置失败");
    } finally {
      setScanBusyIds(prev => prev.filter(id => !ids.includes(id)));
    }
  }

  // ===== 内容审核 =====
  function loadAll() {
    setLoadingC(true);
    return Promise.all([api.reviewPending(), api.reviewSpotCheck()])
      .then(([p, s]) => {
        setPending(p);
        setStats(s);
        setNoPerm(false);
      })
      .catch((e: any) => {
        if (e?.status === 403) {
          setNoPerm(true);
        } else {
          setErr(e.message);
        }
      })
      .finally(() => setLoadingC(false));
  }
  useEffect(() => {
    if (tab === "content") loadAll();
    else loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function doSubmit() {
    if (!subBody.trim()) {
      setErr("请填写送审内容正文");
      return;
    }
    setBusy(true);
    setErr("");
    setSubOk("");
    try {
      await api.reviewSubmit({ item_type: subType, body: subBody.trim() });
      setSubBody("");
      setShowForm(false);
      setSubOk("已报送，进入待复核队列 ✔");
      await loadAll();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function sign(r: ReviewOut) {
    setBusy(true);
    setErr("");
    try {
      const updated = await api.reviewApprove(r.id);
      setPending((list) => list.filter((x) => x.id !== r.id));
      setDone((list) => [updated, ...list]);
      const s = await api.reviewSpotCheck().catch(() => null);
      if (s) setStats(s);
    } catch (e: any) {
      setErr(e.message);
      loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function doReject() {
    if (!editing) return;
    setBusy(true);
    setErr("");
    try {
      const updated = await api.reviewReject(editing.id, editing.note || "内容存疑，退回修改");
      setPending((list) => list.filter((x) => x.id !== editing.id));
      setDone((list) => [updated, ...list]);
      setEditing(null);
      const s = await api.reviewSpotCheck().catch(() => null);
      if (s) setStats(s);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doCorrect() {
    if (!editing) return;
    setBusy(true);
    setErr("");
    try {
      const updated = await api.reviewCorrect(editing.id, editing.body);
      setPending((list) => list.filter((x) => x.id !== editing.id));
      setDone((list) => [updated, ...list]);
      setEditing(null);
      const s = await api.reviewSpotCheck().catch(() => null);
      if (s) setStats(s);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  // ===== 题库审核 =====
  function loadQuestions() {
    setQBusy(true);
    return Promise.all([api.reviewQuestionsStats(), api.reviewQuestionsPending(50, 0)])
      .then(([s, p]) => {
        setQStats(s);
        setQPending(p);
        setQOffset(p.length);
        setQHasMore(p.length === 50);
        setQErr("");
        setNoPerm(false);
      })
      .catch((e: any) => {
        if (e?.status === 403) {
          setNoPerm(true);
        } else {
          setQErr(e.message);
        }
      })
      .finally(() => setQBusy(false));
  }

  async function loadMoreQ() {
    setQBusy(true);
    try {
      const p = await api.reviewQuestionsPending(50, qOffset);
      setQPending((list) => [...list, ...p]);
      setQOffset((o) => o + p.length);
      setQHasMore(p.length === 50);
    } catch (e: any) {
      setQErr(e.message);
    } finally {
      setQBusy(false);
    }
  }

  async function signQ(q: QuestionReviewOut) {
    setQBusy(true);
    setQErr("");
    try {
      const updated = await api.reviewQuestionSign(q.question_id);
      // 双签完成 -> is_verified 已翻转，题目离开待审队列；重新拉取
      setQPending((list) => list.filter((x) => x.question_id !== q.question_id));
      setQSigned((list) => [updated, ...list]);
      const s = await api.reviewQuestionsStats().catch(() => null);
      if (s) setQStats(s);
    } catch (e: any) {
      setQErr(e.message);
      loadQuestions();
    } finally {
      setQBusy(false);
    }
  }

  async function rejectQ(q: QuestionReviewOut, note?: string) {
    setQBusy(true);
    setQErr("");
    try {
      const updated = await api.reviewQuestionReject(q.question_id, note || "题目存疑，退回修正");
      setQPending((list) => list.filter((x) => x.question_id !== q.question_id));
      setQSigned((list) => [updated, ...list]);
      const s = await api.reviewQuestionsStats().catch(() => null);
      if (s) setQStats(s);
    } catch (e: any) {
      setQErr(e.message);
    } finally {
      setQBusy(false);
    }
  }

  // 本页全部签名：审完一页后一键签整页（双签须两名不同审核员各执行一次）
  async function bulkSignQ() {
    if (qPending.length === 0) return;
    const ok = window.confirm(
      `确认对本页 ${qPending.length} 道待核实题执行「${reviewerName}」签名？\n` +
      `请确保已逐题核对题干、选项与答案。两位审核员各执行一次本操作即完成双签转正。`
    );
    if (!ok) return;
    setQBulkBusy(true);
    setQErr("");
    let okCnt = 0;
    let skipCnt = 0;
    let errCnt = 0;
    for (const q of qPending) {
      // 跳过自己已签的题（防重复签 / 400）
      if (q.reviewer_1 === user?.email || q.reviewer_2 === user?.email) {
        skipCnt++;
        continue;
      }
      try {
        await api.reviewQuestionSign(q.question_id);
        okCnt++;
      } catch (e: any) {
        if ((e as any)?.status === 400) skipCnt++;
        else errCnt++;
      }
    }
    try {
      await loadQuestions();
    } catch {
      /* ignore */
    }
    setQBulkBusy(false);
    setQErr(
      `本页签名完成 ✔ 成功 ${okCnt} · 跳过(已签) ${skipCnt}` +
      (errCnt ? ` · 失败 ${errCnt}` : "")
    );
  }

  const passPct = stats ? Math.round(stats.pass_rate * 100) : 0;

  return (
    <section>
      <div className="review-head">
        <h2 className="page-title" style={{ marginBottom: 2 }}>内容双签审核台</h2>
        <div className="muted" style={{ fontSize: 13 }}>信任保障 · 内容须经两名审核员复核方可发布</div>
      </div>

      {noPerm && (
        <Reveal delay={0}>
        <div className="card" style={{ marginTop: 12, borderColor: "var(--danger, #d92b1c)" }}>
          <div className="muted">
            当前账号无审核权限。审核台仅对 <b>reviewer / admin</b> 角色开放；请用审核员账号登录，或联系管理员在后台分配角色。
          </div>
          <button className="btn btn--ghost btn--sm" style={{ marginTop: 10 }} onClick={() => nav("/profile")}>
            返回我的
          </button>
        </div>
        </Reveal>
      )}

      {/* Tab 切换 */}
      <div className="seg" style={{ marginTop: 12 }}>
        <button className={"seg__btn" + (tab === "content" ? " seg__btn--on" : "")} onClick={() => setTab("content")}>
          内容审核
        </button>
        <button className={"seg__btn" + (tab === "questions" ? " seg__btn--on" : "")} onClick={() => setTab("questions")}>
          题库审核
          {qStats && qStats.pending > 0 && <span className="seg__badge">{qStats.pending}</span>}
        </button>
      </div>

      {/* ===================== 内容审核 ===================== */}
      {tab === "content" && !noPerm && (
        <>
          {/* 信任徽章 / 抽检 */}
          <Reveal delay={60}>
          <div className="card review-trust">
            <div className="review-trust__main">
              <div className={"big-rate " + (passPct >= 99 ? "rate--good" : passPct >= 80 ? "rate--mid" : "rate--bad")}>
                {passPct}<span>%</span>
              </div>
              <div className="muted" style={{ fontSize: 13 }}>内容抽检合格率（承诺 ≥99%）</div>
            </div>
            <div className="review-trust__stat">
              <span><b>{stats?.total ?? 0}</b> 累计送审</span>
              <span><b>{stats?.approved ?? 0}</b> 已双签通过</span>
              <span><b>{stats?.sample_target ?? 0}</b> 抽检目标</span>
            </div>
          </div>
          </Reveal>

          {/* 抽样复检队列：每次 spot-check 返回的随机样本，支撑「真抽」而非「只报数」的可操作闭环 */}
          {stats?.samples && stats.samples.length > 0 && (
            <Reveal delay={80}>
            <div className="card" style={{ marginTop: 12 }}>
              <div className="row row--between">
                <strong style={{ fontSize: 14 }}>本次抽样复检（{stats.sample_size ?? stats.samples.length} 条）</strong>
                <span className="muted" style={{ fontSize: 12 }}>随机抽取已通过项做二次核验</span>
              </div>
              <div style={{ marginTop: 8 }}>
                {stats.samples.map((s) => (
                  <div key={s.review_id} className="q-item" style={{ marginTop: 6 }}>
                    <div className="q-item__meta">
                      <span className="tag tag--brand">#{s.review_id}</span>
                      <span className="text-3">{s.item_type}</span>
                      <span className="text-3">{s.item_id}</span>
                    </div>
                    <div className="row" style={{ gap: 12, fontSize: 12, marginTop: 4, color: "var(--text-3)" }}>
                      <span>甲签：{s.reviewer_1 || "—"} {s.reviewer_1_at ? `· ${new Date(s.reviewer_1_at).toLocaleString("zh-CN", { hour12: false })}` : ""}</span>
                      <span>乙签：{s.reviewer_2 || "—"} {s.reviewer_2_at ? `· ${new Date(s.reviewer_2_at).toLocaleString("zh-CN", { hour12: false })}` : ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </Reveal>
          )}

          {/* 审核员身份 */}
          <Reveal delay={120}>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="row row--between">
              <strong>当前审核员</strong>
              <span className="muted" style={{ fontSize: 12 }}>双签须两名不同审核员</span>
            </div>
            <div className="chip-row" style={{ marginTop: 8 }}>
              <span className="chip chip--on">{reviewerName}</span>
            </div>
            {err && <div className="err-text" style={{ marginTop: 8 }}>{err}</div>}
          </div>
          </Reveal>

          <h3 className="section-title" style={{ marginTop: 16 }}>待复核队列（{pending.length}）</h3>
          {subOk && <div className="ok-text" style={{ marginBottom: 8 }}>{subOk}</div>}
          {loadingC && pending.length === 0 && (
            <>
              {[0, 1].map((i) => (
                <div className="card review-card" key={i} style={{ marginTop: 12 }}>
                  <div className="skeleton-line" style={{ width: "35%" }} />
                  <div className="skeleton-line" style={{ width: "95%", marginTop: 10 }} />
                  <div className="skeleton-line" style={{ width: "70%", marginTop: 8 }} />
                </div>
              ))}
            </>
          )}
          {pending.length === 0 && !loadingC && (
            <div className="card review-empty">
              <div className="muted">待复核队列为空。</div>
              <button className="btn btn--primary btn--sm" style={{ marginTop: 10 }} disabled={busy} onClick={() => setShowForm(true)}>
                报送新内容进入复核
              </button>
            </div>
          )}

          {showForm && (
            <Reveal delay={180}>
            <div className="card review-submit" style={{ marginTop: 12 }}>
              <div className="row row--between">
                <strong>报送新内容（AI 生成 / 入库前须复核）</strong>
                <button className="back-link" onClick={() => setShowForm(false)}>收起</button>
              </div>
              <div className="field-label" style={{ marginTop: 8 }}>内容类型</div>
              <div className="chip-row">
                {(["question", "knowledge", "essay_policy"] as const).map((t) => (
                  <button key={t} className={"chip" + (subType === t ? " chip--on" : "")} onClick={() => setSubType(t)}>
                    {TYPE_LABEL[t] || t}
                  </button>
                ))}
              </div>
              <div className="field-label" style={{ marginTop: 8 }}>内容正文</div>
              <textarea
                className="textarea"
                style={{ minHeight: 110 }}
                placeholder="粘贴 AI 生成的题目解析 / 知识点 / 申论范文正文，提交后由两名审核员双签复核…"
                value={subBody}
                onChange={(e) => setSubBody(e.target.value)}
              />
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn btn--primary btn--sm" disabled={busy} onClick={doSubmit}>提交送审</button>
                <button className="btn btn--ghost btn--sm" onClick={() => { setSubBody(SAMPLE_BODY); setSubType("question"); }}>载入示例</button>
              </div>
            </div>
            </Reveal>
          )}

          {pending.map((r, idx) => {
            const signed1 = !!r.reviewer_1;
            const signed2 = !!r.reviewer_2;
            const isEditing = editing?.id === r.id;
            return (
              <Reveal key={r.id} delay={Math.min(idx, 8) * 40}>
              <div className="card review-card" style={{ marginTop: 12 }}>
                <div className="row row--between">
                  <div className="q-item__meta">
                    <span className="tag tag--brand">{TYPE_LABEL[r.item_type] || r.item_type}</span>
                    <span className="text-3">{r.item_id}</span>
                    <span className="text-3">v{r.version}</span>
                  </div>
                  <span className={"status-pill status--" + r.status}>{STATUS_LABEL[r.status] || r.status}</span>
                </div>

                <div className="review-body">{r.body}</div>

                <div className="sign-row">
                  <span className={"sign-chip" + (signed1 ? " sign-chip--on" : "")}>
                    {signed1 ? "✔ " : "○ "}
                    {r.reviewer_1 || "第一签审核员"}
                    {r.reviewer_1_at && <span className="text-3" style={{ fontSize: 11, marginLeft: 4 }}>· {new Date(r.reviewer_1_at).toLocaleString("zh-CN", { hour12: false })}</span>}
                  </span>
                  <span className={"sign-chip" + (signed2 ? " sign-chip--on" : "")}>
                    {signed2 ? "✔ " : "○ "}
                    {r.reviewer_2 || "第二签审核员"}
                    {r.reviewer_2_at && <span className="text-3" style={{ fontSize: 11, marginLeft: 4 }}>· {new Date(r.reviewer_2_at).toLocaleString("zh-CN", { hour12: false })}</span>}
                  </span>
                  {signed1 && !signed2 && <span className="muted" style={{ fontSize: 12 }}>尚缺一签</span>}
                </div>

                {isEditing && editing!.mode === "reject" && (
                  <div className="review-edit">
                    <div className="field-label">驳回意见</div>
                    <textarea
                      className="textarea"
                      value={editing!.note}
                      onChange={(e) => setEditing({ ...editing!, note: e.target.value })}
                      placeholder="说明驳回原因…"
                    />
                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      <button className="btn btn--danger btn--sm" disabled={busy} onClick={doReject}>确认驳回</button>
                      <button className="btn btn--ghost btn--sm" onClick={() => setEditing(null)}>取消</button>
                    </div>
                  </div>
                )}

                {isEditing && editing!.mode === "correct" && (
                  <div className="review-edit">
                    <div className="field-label">更正内容（版本留痕，将通知受影响学员）</div>
                    <textarea
                      className="textarea"
                      value={editing!.body}
                      onChange={(e) => setEditing({ ...editing!, body: e.target.value })}
                      style={{ minHeight: 96 }}
                    />
                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      <button className="btn btn--primary btn--sm" disabled={busy} onClick={doCorrect}>提交更正</button>
                      <button className="btn btn--ghost btn--sm" onClick={() => setEditing(null)}>取消</button>
                    </div>
                  </div>
                )}

                {!isEditing && (
                  <div className="row review-actions">
                    <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => sign(r)}>
                      {signed1 && !signed2 ? "补第二签" : "签名通过"}
                    </button>
                    <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setEditing({ id: r.id, mode: "reject", body: r.body, note: "" })}>
                      驳回
                    </button>
                  <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setEditing({ id: r.id, mode: "correct", body: r.body, note: "" })}>
                    更正
                  </button>
                </div>
                )}
              </div>
              </Reveal>
            );
          })}

          {done.length > 0 && (
            <>
              <h3 className="section-title" style={{ marginTop: 18 }}>已处理（{done.length}）</h3>
              {done.map((r, idx) => (
                <Reveal key={r.id} delay={Math.min(idx, 8) * 40}>
                <div className="card review-card review-card--done" key={r.id} style={{ marginTop: 12 }}>
                  <div className="row row--between">
                    <div className="q-item__meta">
                      <span className="tag tag--brand">{TYPE_LABEL[r.item_type] || r.item_type}</span>
                      <span className="text-3">{r.item_id}</span>
                      <span className="text-3">v{r.version}</span>
                    </div>
                    <span className={"status-pill status--" + r.status}>{STATUS_LABEL[r.status] || r.status}</span>
                  </div>
                  {r.body && <div className="review-body review-body--mini">{r.body}</div>}
                  {r.reviewer_note && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>驳回意见：{r.reviewer_note}</div>}
                </div>
                </Reveal>
              ))}
            </>
          )}
        </>
      )}

      {/* ===================== 题库审核 ===================== */}
      {tab === "questions" && !noPerm && (
        <>
          {/* 题库核实概览 */}
          <Reveal delay={240}>
          <div className="card review-trust">
            <div className="review-trust__stat" style={{ width: "100%", justifyContent: "space-between" }}>
              <span><b>{qStats?.total ?? 0}</b> 题库总量</span>
              <span><b style={{ color: "var(--ok, #1a7f37)" }}>{qStats?.verified ?? 0}</b> 已双签</span>
              <span><b style={{ color: "var(--danger, #d92b1c)" }}>{qStats?.pending ?? 0}</b> 待核实</span>
              <span><b>{qStats?.awaiting_second ?? 0}</b> 待二审</span>
            </div>
          </div>
          </Reveal>

          {/* 程序自动识别：规则初筛 → 处置工作台（fixed/voided/ignored，全部留痕） */}
          <Reveal delay={270}>
          <div className="card card--soft" style={{ marginTop: 12 }}>
            <div className="row row--between">
              <strong style={{ fontSize: 14 }}>🤖 程序自动识别 · 处置工作台</strong>
              <span className="muted" style={{ fontSize: 12 }}>规则初筛 → 人工处置，全程留痕</span>
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
              对题库执行 9 类规则识别（答案合法性 / 选项矛盾 / 重复 / 乱码 / 题干重复等），
              可疑题在此直接处置：<b>忽略</b>（误报）/ <b>作废</b>（内容损坏，移出练习池）/
              <b>修正答案</b>（改答案字段）。每条处置记录操作人与时间，已处置题不再重复识别。
            </div>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button className="btn btn--primary btn--sm" disabled={scanBusy} onClick={async () => {
                setScanBusy(true); setScanErr(""); setScan(null); setSelIds([]);
                try {
                  const r = await api.autoScan({ limit: scanLimit });
                  setScan(r); loadHist();
                } catch (e: any) {
                  setScanErr(e.message || "识别失败");
                } finally {
                  setScanBusy(false);
                }
              }}>
                {scanBusy ? "识别中…" : "运行全库识别"}
              </button>
              {scan && (
                <button className="btn btn--ghost btn--sm" disabled={scanBusy} onClick={async () => {
                  setScanBusy(true); setScanErr("");
                  try {
                    const r = await api.autoScan({ limit: scanLimit, subject: "行测" });
                    setScan(r);
                  } catch (e: any) { setScanErr(e.message || "识别失败"); }
                  finally { setScanBusy(false); }
                }}>仅行测</button>
              )}
            </div>
            {scanErr && <div className="err-text" style={{ marginTop: 8 }}>{scanErr}</div>}

            {/* AI 批量补解析：对缺解析题调 LLM 生成（逐题留痕，单题失败不阻断） */}
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "var(--bg-soft, #f6f7fb)" }}>
              <div className="row row--between">
                <strong style={{ fontSize: 13 }}>✨ AI 批量补解析</strong>
                {aiFill && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    剩余缺解析（未作废）：<b>{aiFill.remaining}</b>
                  </span>
                )}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>
                对缺解析的题由 LLM 生成解析并写库（含 ai_filled 留痕）。LLM 并发生成、每批约
                30~60 秒；连续点击或「一键补完」即可完成全量补齐。
              </div>
              <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "center" }}>
                <select className="input" style={{ width: 110, fontSize: 12, padding: "5px 8px" }}
                  value={aiBatch} onChange={e => setAiBatch(Number(e.target.value))} disabled={aiFillBusy || loopRun}>
                  <option value={10}>每批 10 题</option>
                  <option value={20}>每批 20 题</option>
                  <option value={30}>每批 30 题</option>
                  <option value={50}>每批 50 题</option>
                  <option value={100}>每批 100 题</option>
                </select>
                <button className="btn btn--primary btn--sm" disabled={aiFillBusy || loopRun} onClick={runAiFill}>
                  {aiFillBusy ? "生成中…（请勿关闭）" : aiFill ? `继续补 ${aiBatch} 题` : `开始补解析（${aiBatch} 题）`}
                </button>
                {!loopRun ? (
                  <button className="btn btn--ghost btn--sm" disabled={aiFillBusy} onClick={runAiFillLoop}
                    title="自动以每批 100 题循环执行直到全部补完，可随时停止">
                    ▶▶ 一键补完（循环执行）
                  </button>
                ) : (
                  <button className="btn btn--danger btn--sm" onClick={() => { loopStopRef.current = true; }}>
                    ■ 停止
                  </button>
                )}
              </div>
              {loopRun && loopStat && (
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  <span style={{ color: "var(--ok, #1a7f37)" }}>循环中：已补 <b>{loopStat.done}</b></span>
                  {loopStat.failed > 0 && <span style={{ color: "var(--danger, #d92b1c)", marginLeft: 10 }}>失败 <b>{loopStat.failed}</b></span>}
                  <span className="muted" style={{ marginLeft: 10 }}>剩余 <b>{loopStat.remaining}</b></span>
                  <span className="muted" style={{ marginLeft: 10 }}>已用 {Math.max(1, Math.round((Date.now() - loopStat.startedAt) / 60000))} 分钟</span>
                </div>
              )}
              {aiFillErr && <div className="err-text" style={{ fontSize: 12, marginTop: 6 }}>{aiFillErr}</div>}
              {aiFill && (
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  <span style={{ color: "var(--ok, #1a7f37)" }}>本批成功 <b>{aiFill.filled}</b></span>
                  {aiFill.failed > 0 && <span style={{ color: "var(--danger, #d92b1c)", marginLeft: 10 }}>失败 <b>{aiFill.failed}</b></span>}
                  {aiFill.model && <span className="muted" style={{ marginLeft: 10 }}>模型：{aiFill.model}</span>}
                  {(aiFill.items || []).filter((i: any) => !i.ok).slice(0, 3).map((i: any) => (
                    <div key={i.id} className="err-text" style={{ fontSize: 12, marginTop: 4 }}>#{i.id}：{i.error}</div>
                  ))}
                  {(aiFill.items || []).filter((i: any) => i.ok).slice(0, 2).map((i: any) => (
                    <div key={i.id} className="muted" style={{ fontSize: 12, marginTop: 4 }}>#{i.id}：{i.explanation}</div>
                  ))}
                </div>
              )}
            </div>

            {scan && (
              <div style={{ marginTop: 10 }}>
                <div className="row" style={{ gap: 16, fontSize: 13 }}>
                  <span>扫描 <b>{scan.scanned}</b> 题</span>
                  <span style={{ color: "var(--ok, #1a7f37)" }}>正常 <b>{scan.ok_count}</b>（{Math.round(scan.ok_rate * 100)}%）</span>
                  <span style={{ color: "var(--warning, #b7791f)" }}>提示 <b>{scan.notice_count ?? 0}</b></span>
                  <span style={{ color: "var(--danger, #d92b1c)" }}>待处置 <b>{scan.suspect_count}</b></span>
                </div>
                {/* 按原因类型筛选（点击切换，与 by_type 计数联动） */}
                {Object.keys(scan.by_type || {}).length > 0 && (
                  <div className="chip-row" style={{ marginTop: 8, flexWrap: "wrap" }}>
                    <span className="chip" style={{ cursor: "pointer", ...(reasonFilter === "" ? { outline: "2px solid var(--brand, #4f46e5)" } : {}) }} onClick={() => setReasonFilter("")}>全部原因</span>
                    {Object.entries(scan.by_type).map(([code, n]) => (
                      <span key={code} className="chip chip--warn" style={{ cursor: "pointer", ...(reasonFilter === code ? { outline: "2px solid var(--brand, #4f46e5)" } : {}) }} title={code} onClick={() => setReasonFilter(code)}>{code} ×{String(n)}</span>
                    ))}
                  </div>
                )}
                {/* 按科目分组筛选 */}
                {Object.keys(scan.grouped || {}).length > 0 && (
                  <div className="chip-row" style={{ marginTop: 8, flexWrap: "wrap" }}>
                    <span className="chip" style={{ cursor: "pointer", ...(scanGroup === "" ? { outline: "2px solid var(--brand, #4f46e5)" } : {}) }} onClick={() => setScanGroup("")}>全部</span>
                    {Object.entries(scan.grouped).map(([sub, n]) => (
                      <span key={sub} className="chip" style={{ cursor: "pointer", ...(scanGroup === sub ? { outline: "2px solid var(--brand, #4f46e5)" } : {}) }} onClick={() => setScanGroup(sub)}>{sub} ×{String(n)}</span>
                    ))}
                  </div>
                )}
                {/* 处置备注（批量） */}
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <input className="input" style={{ flex: 1, fontSize: 12, padding: "5px 10px" }} placeholder="处置备注（选填，留痕展示）" value={fixNote} onChange={e => setFixNote(e.target.value)} />
                </div>
                {/* 可疑题清单（多选 + 批量处置） */}
                {(() => {
                  const list = (scan.suspects || []).filter(
                    (s: any) =>
                      (!scanGroup || s.subject === scanGroup) &&
                      (!reasonFilter || (s.reasons || []).includes(reasonFilter))
                  );
                  const allSel = list.length > 0 && list.every((s: any) => selIds.includes(s.id));
                  const canBulkFix = list.some(
                    (s: any) => (s.reasons || []).includes("bad_answer") || (s.reasons || []).includes("answer_conflict")
                  );
                  return list.length > 0 && (
                    <>
                      <div className="row row--between" style={{ marginTop: 8 }}>
                        <button className="link-btn" style={{ fontSize: 13 }} onClick={() => setScanOpen(o => !o)}>
                          {scanOpen ? "收起可疑题清单" : `展开待处置题（${list.length}）`}
                        </button>
                        {scan.suspect_count > (scan.suspects?.length || 0) && (
                          <button className="link-btn" style={{ fontSize: 12 }} disabled={scanBusy} onClick={async () => {
                            setScanBusy(true);
                            try {
                              const more = Math.min(scan.suspect_count, scanLimit + 700);
                              const r = await api.autoScan({ limit: more });
                              setScan(r); setScanLimit(more);
                            } catch (e: any) { setScanErr(e.message || "加载失败"); }
                            finally { setScanBusy(false); }
                          }}>
                            {scanBusy ? "加载中…" : `加载更多（当前 ${scan.suspects?.length ?? 0}/${scan.suspect_count}）`}
                          </button>
                        )}
                      </div>
                      {scanOpen && (
                        <>
                          {/* 批量工具栏 */}
                          <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <label className="text-3" style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                              <input type="checkbox" checked={allSel} onChange={e => setSelIds(e.target.checked ? list.map((s: any) => s.id) : [])} />
                              全选当前 {list.length} 题
                            </label>
                            <span className="text-3" style={{ color: "var(--brand, #4f46e5)" }}>已选 {selIds.length}</span>
                            {canBulkFix && (
                              <input className="input" style={{ width: 120, fontSize: 12, padding: "4px 8px" }} placeholder="批量修正答案，如 A" value={bulkFixAns} onChange={e => setBulkFixAns(e.target.value)} />
                            )}
                            <button className="btn btn--ghost btn--sm" disabled={selIds.length === 0 || scanBusyIds.length > 0} onClick={() => { doAction(selIds, "ignored"); setSelIds([]); }}>批量忽略</button>
                            <button className="btn btn--danger btn--sm" disabled={selIds.length === 0 || scanBusyIds.length > 0} onClick={() => { doAction(selIds, "voided"); setSelIds([]); }}>批量作废</button>
                            <button className="btn btn--primary btn--sm" disabled={selIds.length === 0 || scanBusyIds.length > 0 || !canBulkFix} onClick={() => { doAction(selIds, "fixed", (bulkFixAns || "").trim().toUpperCase() || undefined); setSelIds([]); setBulkFixAns(""); }}>批量修正</button>
                          </div>
                          <div style={{ marginTop: 8, maxHeight: 420, overflow: "auto" }}>
                            {list.map((s: any) => {
                              const busy = scanBusyIds.includes(s.id);
                              const checked = selIds.includes(s.id);
                              return (
                                <div key={s.id} className="q-item" style={{ marginTop: 6 }}>
                                  <div className="q-item__meta">
                                    <label style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                                      <input type="checkbox" checked={checked} onChange={e => setSelIds(prev => e.target.checked ? [...prev, s.id] : prev.filter(x => x !== s.id))} />
                                    </label>
                                    <span className="tag tag--brand">#{s.id}</span>
                                    <span className="text-3">{s.subject} · {s.category}</span>
                                    {s.source && <span className="text-3">{s.source}</span>}
                                    <span className="text-3" style={{ color: "var(--danger, #d92b1c)" }}>答案：{s.answer || "(空)"}</span>
                                  </div>
                                  <div style={{ fontSize: 13, marginTop: 4 }}>{s.stem}</div>
                                  <div className="chip-row" style={{ marginTop: 6, flexWrap: "wrap" }}>
                                    {(s.reason_labels || []).map((l: string) => (
                                      <span key={l} className="chip chip--warn" style={{ fontSize: 12 }}>{l}</span>
                                    ))}
                                  </div>
                                  {/* 修正答案输入（仅对可修正类显示） */}
                                  {(s.reasons || []).includes("bad_answer") || (s.reasons || []).includes("answer_conflict") ? (
                                    <div className="row" style={{ gap: 6, marginTop: 6 }}>
                                      <input className="input" style={{ width: 130, fontSize: 12, padding: "5px 10px" }} placeholder="修正答案，如 A" value={fixAns[s.id] ?? ""} onChange={e => setFixAns(prev => ({ ...prev, [s.id]: e.target.value }))} />
                                      <button className="btn btn--sm" disabled={busy} onClick={() => doAction([s.id], "fixed", (fixAns[s.id] || "").trim().toUpperCase() || undefined)}>
                                        {busy ? "…" : "修正并固定"}
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="row" style={{ gap: 6, marginTop: 6 }}>
                                      <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => doAction([s.id], "ignored")}>{busy ? "…" : "忽略（误报）"}</button>
                                      <button className="btn btn--danger btn--sm" disabled={busy} onClick={() => doAction([s.id], "voided")}>{busy ? "…" : "作废"}</button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}
                {/* 最近处置留痕 */}
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  <div className="muted" style={{ marginBottom: 4 }}>最近处置留痕（{hist.length}）：</div>
                  {histErr && <div className="err-text">{histErr}</div>}
                  {hist.length === 0 && !histErr && <div className="muted">暂无处置记录</div>}
                  {hist.slice(0, 8).map((h: any) => (
                    <div key={h.id} className="text-3" style={{ marginTop: 2 }}>
                      <span className="chip chip--on" style={{ fontSize: 11 }}>{h.action === "fixed" ? "已修正" : h.action === "voided" ? "已作废" : "已忽略"}</span>
                      #{h.question_id} · {h.actor} · {new Date(h.created_at).toLocaleString("zh-CN")}
                      {h.note ? ` · ${h.note}` : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          </Reveal>

          <Reveal delay={300}>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="row row--between">
              <strong>当前审核员</strong>
              <span className="muted" style={{ fontSize: 12 }}>双签须两名不同审核员；通过即题目转正</span>
            </div>
            <div className="chip-row" style={{ marginTop: 8 }}>
              <span className="chip chip--on">{reviewerName}</span>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button className="btn btn--primary btn--sm" disabled={qBulkBusy || qPending.length === 0} onClick={bulkSignQ}>
                {qBulkBusy ? "签名中…" : `本页全部签名（${qPending.length}）`}
              </button>
              <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
                两位审核员各点一次即整页双签转正
              </span>
            </div>
            {qErr && <div className="err-text" style={{ marginTop: 8 }}>{qErr}</div>}
          </div>
          </Reveal>

          <h3 className="section-title" style={{ marginTop: 16 }}>待核实题库（{qPending.length}）</h3>
          {qBusy && qPending.length === 0 && (
            <>
              {[0, 1].map((i) => (
                <div className="card qrev-card" key={i} style={{ marginTop: 12 }}>
                  <div className="skeleton-line" style={{ width: "40%" }} />
                  <div className="skeleton-line" style={{ width: "95%", marginTop: 10 }} />
                  <div className="skeleton-line" style={{ width: "80%", marginTop: 8 }} />
                </div>
              ))}
            </>
          )}
          {qPending.length === 0 && !qBusy && (
            <div className="card review-empty">
              <EmptyState tight icon="check" title="暂无待核实题目" desc="全部已双签通过 🎉" />
            </div>
          )}

          {qPending.map((q, idx) => {
            const signed1 = !!q.reviewer_1;
            const signed2 = !!q.reviewer_2;
            return (
              <Reveal key={q.question_id} delay={Math.min(idx, 8) * 40}>
              <div className="card qrev-card" key={q.question_id} style={{ marginTop: 12 }}>
                <div className="row row--between">
                  <div className="q-item__meta">
                    <span className="tag tag--brand">{q.subject}</span>
                    <span className="tag">{q.category}</span>
                    <span className="text-3">#{q.question_id}</span>
                  </div>
                  <span className={"status-pill status--" + (q.review_status === "approved" ? "approved" : "pending")}>
                    {STATUS_LABEL[q.review_status] || q.review_status}
                  </span>
                </div>

                <div className="qrev-stem">{(q.stem || "").slice(0, 200)}</div>

                <ul className="qrev-opts">
                  {q.options.map((o) => (
                    <li key={o.label} className={"qrev-opt" + (o.is_correct ? " qrev-opt--correct" : "")}>
                      <span className="qrev-opt__label">{o.label}</span>
                      <span className="qrev-opt__content">{(o.content || "").slice(0, 80)}</span>
                      {o.is_correct && <span className="qrev-opt__mark">正确答案</span>}
                    </li>
                  ))}
                </ul>

                <div className="qrev-meta">
                  <span>标准答案：<b>{q.answer || "—"}</b></span>
                  <span>来源：{q.source || "—"}</span>
                  <span>版权：{q.copyright_owner || "—"}</span>
                </div>

                {/* 双签进度 */}
                <div className="sign-row">
                  <span className={"sign-chip" + (signed1 ? " sign-chip--on" : "")}>
                    {signed1 ? "✔ " : "○ "}
                    {q.reviewer_1 || "第一签审核员"}
                  </span>
                  <span className={"sign-chip" + (signed2 ? " sign-chip--on" : "")}>
                    {signed2 ? "✔ " : "○ "}
                    {q.reviewer_2 || "第二签审核员"}
                  </span>
                  {signed1 && !signed2 && <span className="muted" style={{ fontSize: 12 }}>尚缺一签</span>}
                </div>

                <div className="row review-actions">
                  <button className="btn btn--primary btn--sm" disabled={qBusy} onClick={() => signQ(q)}>
                    {signed1 && !signed2 ? "补第二签 · 转正" : "签名通过"}
                  </button>
                  <button className="btn btn--ghost btn--sm" disabled={qBusy} onClick={() => rejectQ(q)}>
                    驳回
                  </button>
                </div>
              </div>
              </Reveal>
            );
          })}

          {qSigned.length > 0 && (
            <>
              <h3 className="section-title" style={{ marginTop: 18 }}>本会话已处理（{qSigned.length}）</h3>
              {qSigned.map((q, idx) => (
                <Reveal key={q.question_id} delay={Math.min(idx, 8) * 40}>
                <div className="card qrev-card qrev-card--done" key={q.question_id} style={{ marginTop: 12 }}>
                  <div className="row row--between">
                    <div className="q-item__meta">
                      <span className="tag tag--brand">{q.subject}</span>
                      <span className="tag">{q.category}</span>
                      <span className="text-3">#{q.question_id}</span>
                    </div>
                    <span className={"status-pill status--" + (q.is_verified ? "approved" : "pending")}>
                      {q.is_verified ? "已转正" : STATUS_LABEL[q.review_status] || q.review_status}
                    </span>
                  </div>
                  {(q.reviewer_1 || q.reviewer_2) && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      双签：{q.reviewer_1 || "—"} · {q.reviewer_2 || "—"}
                    </div>
                  )}
                </div>
                </Reveal>
              ))}
            </>
          )}

          {qHasMore && (
            <button className="btn btn--ghost btn--block" style={{ marginTop: 12 }} disabled={qBusy} onClick={loadMoreQ}>
              {qBusy ? "加载中…" : `加载更多待核实题（还剩约 ${Math.max(0, (qStats?.pending ?? 0) - qOffset)} 道）`}
            </button>
          )}
        </>
      )}

      <button className="btn btn--ghost btn--block" style={{ marginTop: 16 }} onClick={() => nav("/profile")}>
        返回我的
      </button>
    </section>
  );
}
