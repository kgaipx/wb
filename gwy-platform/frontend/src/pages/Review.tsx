import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ReviewOut, ReviewStats } from "../api/client";

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

// 双签需两名不同审核员；预置两个身份便于单人演示
const REVIEWERS = ["审核员·甲", "审核员·乙"];

const SAMPLE_BODY = `【AI 生成解析】类比推理：题干“钢笔∶墨水”，二者为配套使用关系（钢笔需要墨水才能书写）。
类比选项“毛笔∶墨汁”同样为配套使用，逻辑一致，故选 B。
（本解析由 AI 生成，须经双签复核后方可对外发布，确保内容可信。）`;

export default function Review() {
  const nav = useNavigate();
  const [reviewer, setReviewer] = useState(REVIEWERS[0]);
  const [pending, setPending] = useState<ReviewOut[]>([]);
  const [done, setDone] = useState<ReviewOut[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: number; mode: "reject" | "correct"; body: string; note: string } | null>(null);

  function loadAll() {
    return Promise.all([api.reviewPending(), api.reviewSpotCheck()])
      .then(([p, s]) => {
        setPending(p);
        setStats(s);
      })
      .catch((e: any) => setErr(e.message));
  }
  useEffect(() => {
    loadAll();
  }, []);

  async function sign(r: ReviewOut) {
    setBusy(true);
    setErr("");
    try {
      const updated = await api.reviewApprove(r.id, reviewer);
      // 双签完成 -> 移入「已处理」
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
      const updated = await api.reviewReject(editing.id, reviewer, editing.note || "内容存疑，退回修改");
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
      const updated = await api.reviewCorrect(editing.id, reviewer, editing.body);
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

  async function submitSample() {
    setBusy(true);
    setErr("");
    try {
      await api.reviewSubmit({
        item_type: "question",
        item_id: "q-" + Math.floor(Math.random() * 9000 + 1000),
        body: SAMPLE_BODY,
      });
      await loadAll();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const passPct = stats ? Math.round(stats.pass_rate * 100) : 0;

  return (
    <section>
      <div className="review-head">
        <h2 className="page-title" style={{ marginBottom: 2 }}>内容双签审核台</h2>
        <div className="muted" style={{ fontSize: 13 }}>信任保障 · AI 生成内容须经两名审核员复核方可发布</div>
      </div>

      {/* 信任徽章 / 抽检 */}
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

      {/* 审核员身份 */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row row--between">
          <strong>当前审核员</strong>
          <span className="muted" style={{ fontSize: 12 }}>双签需两名不同审核员</span>
        </div>
        <div className="chip-row" style={{ marginTop: 8 }}>
          {REVIEWERS.map((rv) => (
            <button
              key={rv}
              className={"chip" + (reviewer === rv ? " chip--on" : "")}
              onClick={() => setReviewer(rv)}
            >
              {rv}
            </button>
          ))}
        </div>
        {err && <div className="err-text" style={{ marginTop: 8 }}>{err}</div>}
      </div>

      <h3 className="section-title" style={{ marginTop: 16 }}>待复核队列（{pending.length}）</h3>
      {pending.length === 0 && (
        <div className="card review-empty">
          <div className="muted">待复核队列为空。</div>
          <button className="btn btn--primary btn--sm" style={{ marginTop: 10 }} disabled={busy} onClick={submitSample}>
            提交一条 AI 生成内容送审（演示）
          </button>
        </div>
      )}

      {pending.map((r) => {
        const signed1 = !!r.reviewer_1;
        const signed2 = !!r.reviewer_2;
        const isEditing = editing?.id === r.id;
        return (
          <div className="card review-card" key={r.id} style={{ marginTop: 12 }}>
            <div className="row row--between">
              <div className="q-item__meta">
                <span className="tag tag--brand">{TYPE_LABEL[r.item_type] || r.item_type}</span>
                <span className="text-3">{r.item_id}</span>
                <span className="text-3">v{r.version}</span>
              </div>
              <span className={"status-pill status--" + r.status}>{STATUS_LABEL[r.status] || r.status}</span>
            </div>

            <div className="review-body">{r.body}</div>

            {/* 签名进度 */}
            <div className="sign-row">
              <span className={"sign-chip" + (signed1 ? " sign-chip--on" : "")}>
                {signed1 ? "✔ " : "○ "}审核员·甲
              </span>
              <span className={"sign-chip" + (signed2 ? " sign-chip--on" : "")}>
                {signed2 ? "✔ " : "○ "}审核员·乙
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
        );
      })}

      {done.length > 0 && (
        <>
          <h3 className="section-title" style={{ marginTop: 18 }}>已处理（{done.length}）</h3>
          {done.map((r) => (
            <div className="card review-card review-card--done" key={r.id} style={{ marginTop: 12 }}>
              <div className="row row--between">
                <div className="q-item__meta">
                  <span className="tag tag--brand">{TYPE_LABEL[r.item_type] || r.item_type}</span>
                  <span className="text-3">{r.item_id}</span>
                  <span className="text-3">v{r.version}</span>
                </div>
                <span className={"status-pill status--" + r.status}>{STATUS_LABEL[r.status] || r.status}</span>
              </div>
              {r.reviewer_note && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>驳回意见：{r.reviewer_note}</div>}
            </div>
          ))}
        </>
      )}

      <button className="btn btn--ghost btn--block" style={{ marginTop: 16 }} onClick={() => nav("/profile")}>
        返回我的
      </button>
    </section>
  );
}
