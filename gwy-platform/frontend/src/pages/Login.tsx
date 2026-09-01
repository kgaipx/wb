import { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth";
import { UserIcon, RobotIcon, PenIcon, ChartIcon, RepeatIcon } from "../icons";
import { api } from "../api/client";
import Spinner from "../components/Spinner";
import { useField } from "../hooks/useField";

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
  // 表单级「已提交」信号：首次提交后置 true，此后字段错误立即显示并随输入实时更新
  const [mainSubmitted, setMainSubmitted] = useState(false);
  const [resetSubmitted, setResetSubmitted] = useState(false);
  const [doResetSubmitted, setDoResetSubmitted] = useState(false);

  // 找回密码流程状态
  const [resetToken, setResetToken] = useState("");
  const [newPwd, setNewPwd] = useState("");

  // 受控字段校验控制器：失焦 / 提交后即时标红 + 内联错误，错误随输入实时变化
  const emailErr = useField({ value: email, validate: (v) => (!EMAIL_RE.test(v.trim()) ? "请输入有效的邮箱地址" : null), submitted: mainSubmitted });
  const pwdErr = useField({ value: password, validate: (v) => (v.length < 6 ? "密码至少 6 位" : null), submitted: mainSubmitted });
  const nickErr = useField({ value: nickname, validate: (v) => (v.trim().length > 20 ? "昵称过长（≤20 字）" : null), submitted: mainSubmitted });
  const frEmailErr = useField({ value: email, validate: (v) => (!EMAIL_RE.test(v.trim()) ? "请输入有效的邮箱地址" : null), submitted: resetSubmitted });
  const tokenErr = useField({ value: resetToken, validate: (v) => (v.trim().length < 8 ? "请输入重置令牌" : null), submitted: doResetSubmitted });
  const frPwdErr = useField({ value: newPwd, validate: (v) => (v.length < 6 ? "新密码至少 6 位" : null), submitted: doResetSubmitted });

  // 登录来源页（被路由守卫拦截后跳转回来）
  const from = (loc.state as any)?.from || "/";

  function validate(): string | null {
    if (!EMAIL_RE.test(email)) return "请输入有效的邮箱地址";
    if (password.length < 6) return "密码至少 6 位";
    if (mode === "register" && nickname.trim().length > 20) return "昵称过长（≤20 字）";
    return null;
  }

  async function submit() {
    setMainSubmitted(true);
    setErr("");
    setInfo("");
    const ve = validate();
    if (ve) {
      // 客户端错误已通过字段内联 .field-error 展示，这里仅做提交拦截
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
    setResetSubmitted(true);
    setErr("");
    setInfo("");
    if (!EMAIL_RE.test(email.trim())) {
      // 邮箱错误已由 frEmailErr 内联展示，这里仅拦截提交
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
    setDoResetSubmitted(true);
    setErr("");
    setInfo("");
    if (resetToken.trim().length < 8) {
      // 令牌错误已由 tokenErr 内联展示，仅拦截提交
      return;
    }
    if (newPwd.length < 6) {
      // 新密码错误已由 frPwdErr 内联展示，仅拦截提交
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
    // 切换模式时重置各表单的「已提交」信号，避免上一模式残留的标红带到新模式
    setMainSubmitted(false);
    setResetSubmitted(false);
    setDoResetSubmitted(false);
  }

  return (
    <div className="auth-screen">
      <div className="auth-wrap">
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
            {/* 表单化：密码框包进 <form>，消除 Chrome「Password field is not contained in a
                form」告警（密码管理器/自动填充依赖此结构），回车提交改走原生 onSubmit。 */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="field-label" style={{ marginTop: 14 }}>邮箱</div>
              <input
                className={"input" + (emailErr.invalid ? " is-invalid" : "")}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={emailErr.onBlur}
                aria-invalid={emailErr.invalid || undefined}
                aria-describedby={emailErr.describedBy}
              />
              {emailErr.invalid && (
                <div id={emailErr.describedBy} className="field-error" role="alert">
                  <span className="field-error__ico" aria-hidden="true">!</span>
                  <span>{emailErr.error}</span>
                </div>
              )}

              {mode === "register" && (
                <>
                  <div className="field-label" style={{ marginTop: 10 }}>昵称（可选）</div>
                  <input
                    className={"input" + (nickErr.invalid ? " is-invalid" : "")}
                    placeholder="如何称呼你"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    onBlur={nickErr.onBlur}
                    aria-invalid={nickErr.invalid || undefined}
                    aria-describedby={nickErr.describedBy}
                  />
                  {nickErr.invalid && (
                    <div id={nickErr.describedBy} className="field-error" role="alert">
                      <span className="field-error__ico" aria-hidden="true">!</span>
                      <span>{nickErr.error}</span>
                    </div>
                  )}
                </>
              )}

              <div className="field-label" style={{ marginTop: 10 }}>密码</div>
              <div className="pwd-wrap">
                <input
                  className={"input" + (pwdErr.invalid ? " is-invalid" : "")}
                  type={showPwd ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder="至少 6 位"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={pwdErr.onBlur}
                  aria-invalid={pwdErr.invalid || undefined}
                  aria-describedby={pwdErr.describedBy}
                />
                <button type="button" className="pwd-eye" onClick={() => setShowPwd((v) => !v)} aria-label="切换密码可见">
                  {showPwd ? "隐藏" : "显示"}
                </button>
              </div>
              {pwdErr.invalid && (
                <div id={pwdErr.describedBy} className="field-error" role="alert">
                  <span className="field-error__ico" aria-hidden="true">!</span>
                  <span>{pwdErr.error}</span>
                </div>
              )}

              {mode === "login" && (
                <label className="check-row" style={{ marginTop: 10 }}>
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  <span>记住我（保持登录）</span>
                </label>
              )}

              {err && <div className="err-text" style={{ marginTop: 8 }}>{err}</div>}
              {info && <div className="ok-text" style={{ marginTop: 8 }}>{info}</div>}

              <button className={"btn btn--primary btn--block" + (busy ? " btn--loading" : "")} style={{ marginTop: 14 }} disabled={busy}>
                {busy && <Spinner size={15} />}
                {busy ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}
              </button>
            </form>

            {mode === "register" && (
              <div className="muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.7 }}>
                注册即代表您已阅读并同意
                <Link to="/terms" style={{ margin: "0 3px" }}>《用户服务协议》</Link>和
                <Link to="/privacy" style={{ margin: "0 3px" }}>《隐私政策》</Link>。
                平台仅收集备考必需信息，支持随时导出或注销删除（见「我的 → 账号与数据」）。
              </div>
            )}

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
            {/* 找回密码拆成两个 form：邮箱段提交=获取令牌，令牌+新密码段提交=重置密码，
                回车在各自段内触发对应动作，互不串扰。 */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                requestReset();
              }}
            >
              <div className="field-label" style={{ marginTop: 14 }}>注册邮箱</div>
              <input
                className={"input" + (frEmailErr.invalid ? " is-invalid" : "")}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={frEmailErr.onBlur}
                aria-invalid={frEmailErr.invalid || undefined}
                aria-describedby={frEmailErr.describedBy}
              />
              {frEmailErr.invalid && (
                <div id={frEmailErr.describedBy} className="field-error" role="alert">
                  <span className="field-error__ico" aria-hidden="true">!</span>
                  <span>{frEmailErr.error}</span>
                </div>
              )}
              <button className={"btn btn--ghost btn--block" + (busy ? " btn--loading" : "")} style={{ marginTop: 12 }} disabled={busy}>
                {busy && <Spinner size={15} />}
                获取重置令牌
              </button>
            </form>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                doReset();
              }}
            >
              <div className="field-label" style={{ marginTop: 14 }}>重置令牌</div>
              <input
                className={"input" + (tokenErr.invalid ? " is-invalid" : "")}
                placeholder="邮箱收到的令牌（开发模式自动填入）"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                onBlur={tokenErr.onBlur}
                aria-invalid={tokenErr.invalid || undefined}
                aria-describedby={tokenErr.describedBy}
              />
              {tokenErr.invalid && (
                <div id={tokenErr.describedBy} className="field-error" role="alert">
                  <span className="field-error__ico" aria-hidden="true">!</span>
                  <span>{tokenErr.error}</span>
                </div>
              )}

              <div className="field-label" style={{ marginTop: 10 }}>新密码</div>
              <div className="pwd-wrap">
                <input
                  className={"input" + (frPwdErr.invalid ? " is-invalid" : "")}
                  type={showPwd ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="至少 6 位"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  onBlur={frPwdErr.onBlur}
                  aria-invalid={frPwdErr.invalid || undefined}
                  aria-describedby={frPwdErr.describedBy}
                />
                <button type="button" className="pwd-eye" onClick={() => setShowPwd((v) => !v)} aria-label="切换密码可见">
                  {showPwd ? "隐藏" : "显示"}
                </button>
              </div>

              {err && <div className="err-text" style={{ marginTop: 8 }}>{err}</div>}
              {info && <div className="ok-text" style={{ marginTop: 8 }}>{info}</div>}

              <button className={"btn btn--primary btn--block" + (busy ? " btn--loading" : "")} style={{ marginTop: 14 }} disabled={busy}>
                {busy && <Spinner size={15} />}
                {busy ? "处理中…" : "重置密码"}
              </button>
            </form>

            <div className="auth-foot">
              <span><button className="link-btn" onClick={() => switchMode("login")}>返回登录</button></span>
            </div>
          </>
        )}
      </div>

      <div className="auth-values">
        <div className="auth-value"><span className="auth-value__ico"><RobotIcon /></span><span>AI 私教陪跑</span></div>
        <div className="auth-value"><span className="auth-value__ico"><PenIcon /></span><span>申论 AI 批改</span></div>
        <div className="auth-value"><span className="auth-value__ico"><ChartIcon /></span><span>能力雷达诊断</span></div>
        <div className="auth-value"><span className="auth-value__ico"><RepeatIcon /></span><span>错题复错闭环</span></div>
      </div>
      </div>
    </div>
  );
}
