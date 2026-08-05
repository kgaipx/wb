import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { UserIcon } from "../icons";
import { api } from "../api/client";

type Mode = "login" | "register" | "forgot";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  // 找回密码流程状态
  const [resetToken, setResetToken] = useState("");
  const [newPwd, setNewPwd] = useState("");

  // 登录来源页（被路由守卫拦截后跳转回来）
  const from = (loc.state as any)?.from || "/";

  function validate(): string | null {
    if (!EMAIL_RE.test(email)) return "请输入有效的邮箱地址";
    if (password.length < 6) return "密码至少 6 位";
    if (mode === "register" && nickname.trim().length > 20) return "昵称过长（≤20 字）";
    return null;
  }

  async function submit() {
    setErr("");
    setInfo("");
    const ve = validate();
    if (ve) {
      setErr(ve);
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, nickname.trim() || undefined);
      }
      nav(from, { replace: true });
    } catch (e: any) {
      setErr(e.message || "操作失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  async function requestReset() {
    setErr("");
    setInfo("");
    if (!EMAIL_RE.test(email)) {
      setErr("请输入有效的邮箱地址");
      return;
    }
    setBusy(true);
    try {
      const r = await api.forgotPassword(email.trim());
      setInfo(r.message);
      if (r.dev_token) setResetToken(r.dev_token); // 开发模式：直接填入令牌
    } catch (e: any) {
      setErr(e.message || "申请失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    setErr("");
    setInfo("");
    if (resetToken.trim().length < 8) {
      setErr("请输入重置令牌");
      return;
    }
    if (newPwd.length < 6) {
      setErr("新密码至少 6 位");
      return;
    }
    setBusy(true);
    try {
      const r = await api.resetPassword(resetToken.trim(), newPwd);
      setInfo(r.message);
      setMode("login");
      setPassword("");
      setResetToken("");
      setNewPwd("");
    } catch (e: any) {
      setErr(e.message || "重置失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setErr("");
    setInfo("");
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-head">
          <div className="auth-logo">
            <UserIcon />
          </div>
          <div className="auth-title">AI 公考私教</div>
          <div className="auth-sub">
            {mode === "login" ? "登录后开启你的私教陪跑"
              : mode === "register" ? "注册即送 AI 私教体验"
              : "找回密码 · 重置登录密码"}
          </div>
        </div>

        <div className="seg">
          <button className={"seg__btn" + (mode === "login" ? " seg__btn--on" : "")} onClick={() => switchMode("login")}>
            登录
          </button>
          <button className={"seg__btn" + (mode === "register" ? " seg__btn--on" : "")} onClick={() => switchMode("register")}>
            注册
          </button>
        </div>

        {mode !== "forgot" && (
          <>
            <div className="field-label" style={{ marginTop: 14 }}>邮箱</div>
            <input
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {mode === "register" && (
              <>
                <div className="field-label" style={{ marginTop: 10 }}>昵称（可选）</div>
                <input
                  className="input"
                  placeholder="如何称呼你"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </>
            )}

            <div className="field-label" style={{ marginTop: 10 }}>密码</div>
            <div className="pwd-wrap">
              <input
                className="input"
                type={showPwd ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="至少 6 位"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <button type="button" className="pwd-eye" onClick={() => setShowPwd((v) => !v)} aria-label="切换密码可见">
                {showPwd ? "隐藏" : "显示"}
              </button>
            </div>

            {mode === "login" && (
              <label className="check-row" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>记住我（保持登录）</span>
              </label>
            )}

            {err && <div className="err-text" style={{ marginTop: 8 }}>{err}</div>}
            {info && <div className="ok-text" style={{ marginTop: 8 }}>{info}</div>}

            <button className="btn btn--primary btn--block" style={{ marginTop: 14 }} disabled={busy} onClick={submit}>
              {busy ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}
            </button>

            {mode === "login" && (
              <div style={{ marginTop: 10, textAlign: "right" }}>
                <button className="link-btn" onClick={() => switchMode("forgot")}>忘记密码？</button>
              </div>
            )}

            <div className="auth-foot">
              {mode === "login" ? (
                <span>还没有账号？<button className="link-btn" onClick={() => switchMode("register")}>立即注册</button></span>
              ) : (
                <span>已有账号？<button className="link-btn" onClick={() => switchMode("login")}>去登录</button></span>
              )}
            </div>
          </>
        )}

        {mode === "forgot" && (
          <>
            <div className="field-label" style={{ marginTop: 14 }}>注册邮箱</div>
            <input
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn btn--ghost btn--block" style={{ marginTop: 12 }} disabled={busy} onClick={requestReset}>
              获取重置令牌
            </button>

            <div className="field-label" style={{ marginTop: 14 }}>重置令牌</div>
            <input
              className="input"
              placeholder="邮箱收到的令牌（开发模式自动填入）"
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
            />

            <div className="field-label" style={{ marginTop: 10 }}>新密码</div>
            <div className="pwd-wrap">
              <input
                className="input"
                type={showPwd ? "text" : "password"}
                autoComplete="new-password"
                placeholder="至少 6 位"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doReset()}
              />
              <button type="button" className="pwd-eye" onClick={() => setShowPwd((v) => !v)} aria-label="切换密码可见">
                {showPwd ? "隐藏" : "显示"}
              </button>
            </div>

            {err && <div className="err-text" style={{ marginTop: 8 }}>{err}</div>}
            {info && <div className="ok-text" style={{ marginTop: 8 }}>{info}</div>}

            <button className="btn btn--primary btn--block" style={{ marginTop: 14 }} disabled={busy} onClick={doReset}>
              {busy ? "处理中…" : "重置密码"}
            </button>

            <div className="auth-foot">
              <span><button className="link-btn" onClick={() => switchMode("login")}>返回登录</button></span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
