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
      const u = await api.me();
      setUser(u);
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
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>AI 公考私教</h1>
      <p style={{ color: "#555", marginTop: 0 }}>更懂你短板 · 内容可信 · 花钱无忧 · 陪你上岸</p>

      {user ? (
        <>
          <div style={card}>
            <strong>你好，{user.nickname || user.email}</strong>
            <div style={{ color: "#666", fontSize: 14, marginTop: 4 }}>
              目标考试：{user.target_exam} · 会员：{user.plan}
            </div>
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            <button style={btn} onClick={() => nav("/practice")}>开始刷题</button>
            <button style={btn} onClick={() => nav("/learn")}>学习中心（AI 私教）</button>
            <button style={btnGhost} onClick={logout}>退出登录</button>
          </div>
        </>
      ) : (
        <div style={card}>
          <input style={input} placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input style={input} type="password" placeholder="密码（≥6 位）" value={password} onChange={(e) => setPassword(e.target.value)} />
          <input style={input} placeholder="昵称（可选）" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          {err && <div style={{ color: "#dc2626", fontSize: 13 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button style={btn} disabled={busy} onClick={doLogin}>登录</button>
            <button style={btnGhost} disabled={busy} onClick={doRegister}>注册</button>
          </div>
        </div>
      )}

      <div style={{ ...card, marginTop: 14, background: "#f5f8ff" }}>
        <strong>平台能力</strong>
        <ul style={{ color: "#555", fontSize: 14, margin: "6px 0 0", paddingLeft: 18 }}>
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

const card: React.CSSProperties = { padding: 16, background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", marginBottom: 8, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" };
const btn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 15 };
const btnGhost: React.CSSProperties = { flex: 1, padding: "10px 0", background: "#fff", color: "#2563eb", border: "1px solid #2563eb", borderRadius: 8, fontSize: 15 };
