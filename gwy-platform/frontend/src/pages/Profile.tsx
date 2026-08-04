import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Dashboard } from "../api/client";

export default function Profile() {
  const nav = useNavigate();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [plan, setPlan] = useState("free");
  const [wrongCount, setWrongCount] = useState(0);
  const [favCount, setFavCount] = useState(0);
  const [err, setErr] = useState("");
  const [essay, setEssay] = useState("");
  const [grade, setGrade] = useState<any>(null);

  useEffect(() => {
    api.dashboard().then((d) => {
      setDash(d);
      setPlan(d.user.plan);
    }).catch((e) => setErr(e.message));
    api.wrongList().then((w) => setWrongCount(w.length)).catch(() => {});
    api.favoriteList().then((f) => setFavCount(f.length)).catch(() => {});
  }, []);

  async function gradeEssay() {
    setGrade(null);
    try {
      setGrade(await api.essayGrade(essay, "请围绕给定主题写一篇短文", 100));
    } catch (e: any) {
      setErr(e.message);
    }
  }

  if (err) return <section><h2 className="page-title">我的</h2><div className="err-text">{err}</div></section>;
  if (!dash) return <section><h2 className="page-title">我的</h2><div className="muted">加载中…（需先登录）</div></section>;

  return (
    <section>
      <h2 className="page-title">我的</h2>
      <div className="card">
        <strong>{dash.user.nickname || dash.user.email}</strong>
        <div className="muted" style={{ marginTop: 4 }}>
          {dash.user.target_exam} · 会员：<b className="text-brand">{plan}</b>
        </div>
        <div className="text-3" style={{ marginTop: 2, fontSize: 13 }}>
          累计答题 {dash.total_answers} · 正确率 {Math.round(dash.correct_rate * 100)}%
        </div>
      </div>

      {/* 学习管理 */}
      <div className="card" style={{ marginTop: 12 }}>
        <strong>学习管理</strong>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="manage-card" onClick={() => nav("/wrong")}>
            <span className="manage-card__num">{wrongCount}</span>
            <span className="manage-card__label">待复盘错题</span>
          </button>
          <button className="manage-card" onClick={() => nav("/favorites")}>
            <span className="manage-card__num">{favCount}</span>
            <span className="manage-card__label">我的收藏</span>
          </button>
        </div>
      </div>

      {/* 会员中心入口（WBS 7.1） */}
      <div className="card card--tutor" style={{ marginTop: 12 }}>
        <div className="card--tutor__txt">
          <strong>会员中心</strong>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            透明定价 · 无忧退费 · AI 私教全流程权益
          </div>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={() => nav("/membership")}>
          进入 →
        </button>
      </div>

      {/* 内容可信 / 双签审核台（WBS 5.2 信任保障） */}
      <div className="card card--soft" style={{ marginTop: 12 }}>
        <div className="row row--between">
          <strong>内容可信 · 双签审核台</strong>
          <span className="badge badge--soft">运营后台</span>
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          AI 生成内容须经两名审核员复核通过方可发布，版本留痕、可溯可纠。
        </div>
        <button className="btn btn--ghost btn--sm" style={{ marginTop: 10 }} onClick={() => nav("/review")}>
          进入审核台 →
        </button>
      </div>

      {/* 申论批改（WBS 4.1） */}
      <div className="card" style={{ marginTop: 12 }}>
        <strong>申论 AI 批改</strong>
        <textarea
          className="textarea"
          style={{ marginTop: 6 }}
          placeholder="粘贴你的申论作答…"
          value={essay}
          onChange={(e) => setEssay(e.target.value)}
        />
        <button className="btn btn--primary btn--block" style={{ marginTop: 8 }} disabled={!essay} onClick={gradeEssay}>
          批改（满分 100）
        </button>
        {grade && (
          <div className="tutor-box" style={{ marginTop: 8 }}>
            <div>
              <b>总分：{grade.total}</b>{" "}
              {grade.needs_human_review && <span className="text-warning">（已转人工复核）</span>}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {Object.entries(grade.dimensions).map(([k, v]) => `${k} ${v}`).join(" · ")}
            </div>
            {grade.rationale && <div style={{ fontSize: 13, marginTop: 4 }}>{grade.rationale}</div>}
          </div>
        )}
      </div>
    </section>
  );
}
