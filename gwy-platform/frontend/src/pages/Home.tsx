import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, UserOut } from "../api/client";

export default function Home() {
  const nav = useNavigate();
  const [user, setUser] = useState<UserOut | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("access_token")) {
      api.me().then(setUser).catch(() => localStorage.removeItem("access_token"));
    }
  }, []);

  async function doLogin() {
    setBusy(true);
    setErr("");
    try {
      const r = await api.login({ email, password });
      localStorage.setItem("access_token", r.access_token);
      setUser(await api.me());
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function doRegister() {
    setBusy(true);
    setErr("");
    try {
      const r = await api.register({ email, password, nickname });
      localStorage.setItem("access_token", r.access_token);
      setUser(await api.me());
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  function logout() {
    localStorage.removeItem("access_token");
    setUser(null);
  }

  return (
    <section>
      <div className="hero">
        <div className="hero__title">AI 公考私教</div>
        <div className="hero__sub">更懂你短板 · 内容可信 · 花钱无忧 · 陪你上岸</div>
        {user && (
          <div className="hero__actions">
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn"
                style={{ flex: 1, background: "#fff", color: "var(--brand)" }}
                onClick={() => nav("/practice")}
              >
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
        )}
      </div>

      {user ? (
        <div className="card">
          <strong>你好，{user.nickname || user.email}</strong>
          <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
            目标考试：{user.target_exam} · 会员：<b className="text-brand">{user.plan}</b>
          </div>
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn btn--ghost" style={{ flex: 1 }} onClick={logout}>
              退出登录
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <input className="input" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            className="input"
            type="password"
            placeholder="密码（≥6 位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input className="input" placeholder="昵称（可选）" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          {err && <div className="err-text">{err}</div>}
          <div className="row" style={{ marginTop: 6, gap: 8 }}>
            <button className="btn btn--primary" style={{ flex: 1 }} disabled={busy} onClick={doLogin}>
              登录
            </button>
            <button className="btn btn--ghost" style={{ flex: 1 }} disabled={busy} onClick={doRegister}>
              注册
            </button>
          </div>
        </div>
      )}

      {user && (
        <div className="card card--tutor" style={{ marginTop: 14 }}>
          <div className="card--tutor__txt">
            <strong>卡住了？问问 AI 私教</strong>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              知识点、解题技巧、申论写法、复习规划，随时问。
            </div>
          </div>
          <button className="btn btn--primary" onClick={() => nav("/chat")}>
            去问问
          </button>
        </div>
      )}

      <div className="card card--soft" style={{ marginTop: 14 }}>
        <strong>平台能力</strong>
        <ul className="cap-list">
          <li>AI 私教逐题讲解（接通 DeepSeek，RAG 溯源）</li>
          <li>自适应弱项推送 + 能力图谱</li>
          <li>申论 AI 批改（双阶段 + 一致性门禁）</li>
          <li>在线模考 + 提分报告</li>
          <li>会员透明定价 + 无忧退费</li>
        </ul>
      </div>
    </section>
  );
}
