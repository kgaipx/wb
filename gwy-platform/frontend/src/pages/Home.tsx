import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth";

export default function Home() {
  const nav = useNavigate();
  const { user, loading, logout } = useAuth();
  const [daily, setDaily] = useState<any>(null);

  // 已登录用户拉一条「每日一练」推荐
  useEffect(() => {
    if (user) {
      api
        .recommend(1)
        .then((r) => setDaily(r.questions[0] || null))
        .catch(() => setDaily(null));
    }
  }, [user]);

  if (loading) return <section><div className="splash">加载中…</div></section>;

  // 未登录：引导注册 / 登录
  if (!user) {
    return (
      <section>
        <div className="hero">
          <div className="hero__title">AI 公考私教</div>
          <div className="hero__sub">更懂你短板 · 内容可信 · 花钱无忧 · 陪你上岸</div>
          <div className="hero__actions">
            <button
              className="btn"
              style={{ background: "#fff", color: "var(--brand)" }}
              onClick={() => nav("/login", { state: { from: "/" } })}
            >
              登录 / 注册，开启 AI 私教
            </button>
          </div>
        </div>

        <div className="card card--soft">
          <strong>平台能力</strong>
          <ul className="cap-list">
            <li>AI 私教逐题讲解（接通 DeepSeek，RAG 溯源）</li>
            <li>自适应弱项推送 + 能力图谱</li>
            <li>申论 AI 批改（双阶段 + 一致性门禁）</li>
            <li>在线模考 + 提分报告</li>
            <li>会员透明定价 + 无忧退费</li>
          </ul>
          <button className="btn btn--ghost btn--sm btn--block" style={{ marginTop: 10 }} onClick={() => nav("/essay")}>
            去申论批改 →
          </button>
        </div>
      </section>
    );
  }

  // 已登录
  return (
    <section>
      <div className="hero">
        <div className="hero__title">你好，{user.nickname || user.email}</div>
        <div className="hero__sub">
          {user.target_exam} · 会员：<b>{user.plan === "free" ? "免费版" : user.plan}</b>
        </div>
        <div className="hero__actions">
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" style={{ flex: 1, background: "#fff", color: "var(--brand)" }} onClick={() => nav("/practice")}>
              开始刷题
            </button>
            <button
              className="btn"
              style={{ flex: 1, background: "rgba(255,255,255,.16)", color: "#fff", border: "1px solid rgba(255,255,255,.5)" }}
              onClick={() => nav("/learn")}
            >
              学习中心
            </button>
          </div>
        </div>
      </div>

      {/* 每日一练 */}
      {daily && (
        <div className="card card--tutor" style={{ marginTop: 14 }}>
          <div className="card--tutor__txt">
            <div className="muted" style={{ fontSize: 12 }}>每日一练 · 推荐</div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>{daily.knowledge_point}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {daily.stem}
            </div>
          </div>
          <button className="btn btn--primary btn--sm" onClick={() => nav(`/practice?q=${daily.id}`)}>
            练习
          </button>
        </div>
      )}

      <div className="card card--soft" style={{ marginTop: 14 }}>
        <div className="row row--between">
          <strong>学习数据中心</strong>
          <button className="link-btn" onClick={() => nav("/data")}>查看 →</button>
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          复错率、正确率、弱项知识点与近 7 日趋势，一眼看清提分进度。
        </div>
      </div>

      <div className="card card--soft" style={{ marginTop: 14 }}>
        <strong>卡住了？问问 AI 私教</strong>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          知识点、解题技巧、申论写法、复习规划，随时问。
        </div>
        <button className="btn btn--primary" style={{ marginTop: 10 }} onClick={() => nav("/chat")}>
          去问问
        </button>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="row row--between">
          <strong>会员中心</strong>
          {user.plan === "free" && (
            <button className="link-btn" onClick={() => nav("/membership")}>升级 →</button>
          )}
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          {user.plan === "free"
            ? "升级解锁无限次 AI 私教讲解与申论批改"
            : "已解锁全部会员权益，暖心陪跑到上岸"}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <button className="btn btn--ghost btn--block" onClick={logout}>
          退出登录
        </button>
      </div>
    </section>
  );
}
