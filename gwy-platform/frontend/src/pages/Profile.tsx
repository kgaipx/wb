import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Dashboard, StudentStats, EssayPrompt, EssayModel, EssayCompare } from "../api/client";
import { useAuth } from "../auth";
import { LineChart } from "../components/LineChart";
import { DimensionBars } from "../components/DimensionBars";
import { EssayCompareCard } from "../components/EssayCompareCard";
import Markdown from "../components/Markdown";
import Reveal from "../components/Reveal";
import CountUp from "../components/CountUp";
import { useField } from "../hooks/useField";
import { parseWordTarget, wordStatus, countEssayChars } from "../utils/essayWord";
import { PenIcon, ChartIcon } from "../icons";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Profile() {
  const nav = useNavigate();
  const { logout, user } = useAuth();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [plan, setPlan] = useState("free");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [wrongCount, setWrongCount] = useState(0);
  const [favCount, setFavCount] = useState(0);
  const [err, setErr] = useState("");
  const [essay, setEssay] = useState("");
  const [grade, setGrade] = useState<any>(null);
  const [essayPrompt, setEssayPrompt] = useState<EssayPrompt | null>(null);
  const [essayModel, setEssayModel] = useState<EssayModel | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const [compare, setCompare] = useState<EssayCompare | null>(null);
  const [compareBusy, setCompareBusy] = useState(false);

  const [nickname, setNickname] = useState("");
  const [province, setProvince] = useState("");
  const [targetExam, setTargetExam] = useState("国考");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileOk, setProfileOk] = useState("");

  const [pwdOld, setPwdOld] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdOk, setPwdOk] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  // 表单级「已提交」信号：首次提交后置 true，字段错误立即显示并随输入实时更新
  const [pwdSubmitted, setPwdSubmitted] = useState(false);
  const [profileSubmitted, setProfileSubmitted] = useState(false);

  // —— 合规（PIPL 45/47）：数据导出 + 账号注销 ——
  const [expBusy, setExpBusy] = useState(false);
  const [expErr, setExpErr] = useState("");
  const [delOpen, setDelOpen] = useState(false); // 注销确认展开
  const [delPwd, setDelPwd] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");

  // 受控字段校验控制器：失焦 / 提交后即时标红 + 内联错误，错误随输入实时变化
  const pwdOldErr = useField({ value: pwdOld, validate: (v) => (v.length === 0 ? "请输入原密码" : null), submitted: pwdSubmitted });
  const pwdNewErr = useField({ value: pwdNew, validate: (v) => (v.length < 6 ? "新密码至少 6 位" : null), submitted: pwdSubmitted });
  const pwdConfirmErr = useField({
    value: pwdConfirm,
    validate: (v) => {
      if (v.length < 6) return "新密码至少 6 位";
      if (v !== pwdNew) return "两次输入的新密码不一致";
      return null;
    },
    submitted: pwdSubmitted,
  });
  const nickErr = useField({ value: nickname, validate: (v) => (v.trim().length > 20 ? "昵称过长（≤20 字）" : null), submitted: profileSubmitted });

  useEffect(() => {
    api.dashboard().then((d) => {
      setDash(d);
      setPlan(d.user.plan);
      setExpiresAt(d.user.plan_expires_at || null);
      setNickname(d.user.nickname || "");
      setProvince(d.user.province || "");
      setTargetExam(d.user.target_exam || "国考");
    }).catch((e) => setErr(e.message));
    api.wrongList().then((w) => setWrongCount(w.length)).catch(() => {});
    api.favoriteList().then((f) => setFavCount(f.length)).catch(() => {});
    // 成长总览：连续打卡 / 7日趋势 / 弱项（与 Dashboard 同源，但本页只做概览，详情跳 Dashboard）
    api.studentStats().then(setStats).catch(() => {});
    // 取首个申论题作为快速批改的真实材料/要求（避免占位文本误导评分）
    api.essayPrompts().then((ps) => setEssayPrompt(ps[0] || null)).catch(() => {});
  }, []);

  async function saveProfile() {
    setProfileSubmitted(true);
    setSavingProfile(true);
    setProfileOk("");
    setErr("");
    if (nickname.trim().length > 20) {
      // 昵称错误已由 nickErr 内联展示，仅拦截提交
      setSavingProfile(false);
      return;
    }
    try {
      await api.updateMe({ nickname, province, target_exam: targetExam });
      setProfileOk("已保存");
      setTimeout(() => setProfileOk(""), 2000);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function gradeEssay() {
    setGrade(null);
    try {
      const material = essayPrompt?.material ?? "";
      const requirement = essayPrompt?.requirement ?? "";
      setGrade(await api.essayGrade(essay, material, 100, essayPrompt?.id ?? null, requirement));
    } catch (e: any) {
      setErr(e.message);
    }
  }

  function resetProfileEssay() {
    setEssay("");
    setGrade(null);
    setCompare(null);
  }

  async function loadProfileModel() {
    setModelBusy(true);
    try {
      setEssayModel(await api.essayModel(essayPrompt?.material ?? "", essayPrompt?.requirement ?? "", essayPrompt?.id ?? null));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setModelBusy(false);
    }
  }

  async function loadProfileCompare() {
    if (!grade) return;
    setCompareBusy(true);
    setErr("");
    try {
      const mat = essayPrompt?.material ?? "";
      const req = essayPrompt?.requirement ?? "";
      let me = essayModel?.model_essay ?? null;
      if (!me) {
        const m = await api.essayModel(mat, req, essayPrompt?.id ?? null);
        setEssayModel(m);
        me = m.model_essay;
      }
      setCompare(
        await api.essayCompare(essay, mat, req, essayPrompt?.id ?? null, me, grade.dimensions, grade.total),
      );
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setCompareBusy(false);
    }
  }

  async function changePwd() {
    setPwdSubmitted(true);
    setPwdOk("");
    setPwdErr("");
    if (pwdOld.length === 0 || pwdNew.length < 6 || pwdNew !== pwdConfirm) {
      // 客户端错误已通过字段内联 .field-error 展示，这里仅拦截提交
      return;
    }
    setPwdBusy(true);
    try {
      await api.changePassword(pwdOld, pwdNew);
      setPwdOk("密码已修改，下次登录请使用新密码");
      setPwdOld("");
      setPwdNew("");
      setPwdConfirm("");
      setTimeout(() => setPwdOk(""), 2500);
    } catch (e: any) {
      setPwdErr(e.message);
    } finally {
      setPwdBusy(false);
    }
  }

  if (err) return <section><h2 className="page-title">我的</h2><div className="err-text">{err}</div></section>;
  if (!dash) return <section><h2 className="page-title">我的</h2><div className="muted">加载中…（需先登录）</div></section>;

  return (
    <section>
      <h2 className="page-title">我的</h2>
      <Reveal delay={0}>
      <div className="card">
        <strong>{dash.user.nickname || dash.user.email}</strong>
        <div className="muted" style={{ marginTop: 4 }}>
          {dash.user.target_exam} · 会员：<b className="text-brand">{plan === "free" ? "免费版" : plan}</b>
          {plan !== "free" && (
            <span className="text-3"> · 有效期至 {fmtDate(expiresAt)}</span>
          )}
        </div>
        <div className="text-3" style={{ marginTop: 2, fontSize: 13 }}>
          累计答题 {dash.total_answers} · 正确率 {Math.round(dash.correct_rate * 100)}%
        </div>
        {plan === "free" && (
          <button className="btn btn--primary btn--block btn--sm" style={{ marginTop: 10 }} onClick={() => nav("/membership")}>
            升级会员，解锁无限 AI 私教
          </button>
        )}
      </div>
      </Reveal>

      {/* 学员画像（可编辑，驱动学习计划与目标个性化） */}
      <Reveal delay={60}>
      <div className="card" style={{ marginTop: 12 }}>
        <strong>学员画像</strong>
        <div className="field-label" style={{ marginTop: 8 }}>昵称</div>
        <input
          className={"input" + (nickErr.invalid ? " is-invalid" : "")}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onBlur={nickErr.onBlur}
          aria-invalid={nickErr.invalid || undefined}
          aria-describedby={nickErr.describedBy}
          placeholder="昵称"
        />
        {nickErr.invalid && (
          <div id={nickErr.describedBy} className="field-error" role="alert">
            <span className="field-error__ico" aria-hidden="true">!</span>
            <span>{nickErr.error}</span>
          </div>
        )}
        <div className="field-label" style={{ marginTop: 8 }}>报考省份</div>
        <input className="input" value={province} onChange={(e) => setProvince(e.target.value)} placeholder="如：广东 / 北京" />
        <div className="field-label" style={{ marginTop: 8 }}>目标考试</div>
        <div className="chip-row">
          {["国考", "省考", "事业单位"].map((t) => (
            <button key={t} className={"chip " + (targetExam === t ? "chip--on" : "")} onClick={() => setTargetExam(t)}>
              {t}
            </button>
          ))}
        </div>
        <button className="btn btn--primary btn--block" style={{ marginTop: 10 }} disabled={savingProfile} onClick={saveProfile}>
          {savingProfile ? "保存中…" : "保存画像"}
        </button>
        {profileOk && <div className="ok-text" style={{ marginTop: 6 }}>{profileOk}</div>}
      </div>
      </Reveal>

      {/* 成长总览（个人中心的成长档案收口，详情见 Dashboard） */}
      {stats && (
        <Reveal delay={120}>
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row row--between">
            <strong>成长总览</strong>
            <span className="muted" style={{ fontSize: 12 }}>近 7 日</span>
          </div>
          <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <div className="metric">
              <div className="metric__num" style={{ color: "var(--brand)" }}>🔥 <CountUp value={stats.streak_days} /></div>
              <div className="metric__label">连续打卡 (天)</div>
            </div>
            <div className="metric">
              <div className="metric__num"><CountUp value={stats.last_7_days.reduce((s, d) => s + d.answers, 0)} /></div>
              <div className="metric__label">本周练习 (题)</div>
            </div>
          </div>
          {stats.last_7_days.length >= 2 && (
            <div style={{ marginTop: 10 }}>
              <LineChart
                points={stats.last_7_days.map((d) => ({
                  label: d.date.slice(5),
                  value: d.answers ? Math.round((d.correct / d.answers) * 100) : 0,
                }))}
                max={100}
                min={0}
                unit="%"
                color="var(--brand)"
              />
            </div>
          )}
          {stats.ability.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>最弱知识点（点击去专项练习）</div>
              <div className="chip-row">
                {stats.ability.slice(0, 3).map((a) => (
                  <button
                    key={a.knowledge_point}
                    className="chip chip--warn"
                    onClick={() => nav(`/practice?kp=${encodeURIComponent(a.knowledge_point)}`)}
                  >
                    {a.knowledge_point}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button className="btn btn--ghost btn--block btn--sm" style={{ marginTop: 10 }} onClick={() => nav("/data")}>
            查看完整学习分析 →
          </button>
        </div>
        </Reveal>
      )}

      {/* 学习管理 */}
      <Reveal delay={180}>
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
      </Reveal>

      {/* 会员中心入口（WBS 7.1） */}
      <Reveal delay={240}>
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
      </Reveal>

      {/* 内容可信 / 双签审核台（WBS 5.2 信任保障，仅审核员/管理员可见） */}
      {user && (user.role === "reviewer" || user.role === "admin") && (
        <Reveal delay={300}>
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
        </Reveal>
      )}

      {/* 运营后台总览（仅管理员可见） */}
      {user && user.role === "admin" && (
        <Reveal delay={360}>
        <div className="card card--tutor" style={{ marginTop: 12 }}>
          <div className="card--tutor__txt">
            <strong>运营后台</strong>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              用户增长 · 营收 · 题库核实 · 学习活跃，一眼掌握平台健康度。
            </div>
          </div>
        <button className="btn btn--ghost btn--sm" onClick={() => nav("/admin")}>
          进入 →
        </button>
      </div>
      </Reveal>
      )}

      {/* 申论批改（WBS 4.1） */}
      <Reveal delay={420}>
      <div className="card" style={{ marginTop: 12 }}>
        <strong>申论 AI 批改</strong>
        <textarea
          className="textarea"
          style={{ marginTop: 6 }}
          placeholder="粘贴你的申论作答…"
          value={essay}
          onChange={(e) => setEssay(e.target.value)}
        />
        {(() => {
          const n = countEssayChars(essay);
          const t = parseWordTarget(essayPrompt?.requirement ?? "");
          const st = wordStatus(n, t);
          return (
            <div className="row row--between" style={{ marginTop: 4, fontSize: 12 }}>
              <span className="muted">
                已写 <b className={st.cls}>{n}</b> 字{t ? ` · 要求 ${t[0]}–${t[1]} 字` : ""}
              </span>
              <span className={st.cls}>{st.text}</span>
            </div>
          );
        })()}
        <button className="btn btn--primary btn--block" style={{ marginTop: 8 }} disabled={!essay} onClick={gradeEssay}>
          批改（满分 100）
        </button>
        <button className="btn btn--ghost btn--block" style={{ marginTop: 8 }} disabled={modelBusy} onClick={loadProfileModel}>
          {modelBusy ? "生成范文中…" : <><PenIcon /> 查看范文参考</>}
        </button>
        <button className="btn btn--ghost btn--block" style={{ marginTop: 8 }} disabled={!grade || compareBusy} onClick={loadProfileCompare}>
          {compareBusy ? "对比点评中…" : <><ChartIcon /> 对比范文点评</>}
        </button>
        {grade && (
          <div className="tutor-box" style={{ marginTop: 8 }}>
            <div className="row row--between">
              <div>
                <b>总分：{grade.total}</b>{" "}
                {grade.needs_human_review && <span className="text-warning">（已转人工复核）</span>}
              </div>
              <button className="btn btn--ghost btn--sm" onClick={resetProfileEssay}><><PenIcon /> 再写一篇</></button>
            </div>
            <DimensionBars dims={grade.dimensions} />
            {grade.rationale && (
              <div className="tutor-box" style={{ marginTop: 8 }}>
                <div className="tutor-box__body"><Markdown>{grade.rationale}</Markdown></div>
              </div>
            )}
          </div>
        )}
        {essayModel && (
          <div className="tutor-box" style={{ marginTop: 10 }}>
            <div className="row row--between">
              <div className="tutor-box__title"><PenIcon /> 高分范文参考</div>
              {essayModel.offline && <span className="text-warning" style={{ fontSize: 12 }}>范文生成暂不可用</span>}
            </div>
            {essayModel.outline.length > 0 && (
              <>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>结构提纲</div>
                <ul className="tutor-box__body" style={{ margin: "4px 0 0 18px" }}>
                  {essayModel.outline.map((o, i) => <li key={i}>{o}</li>)}
                </ul>
              </>
            )}
            {essayModel.key_points.length > 0 && (
              <>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>高分要点</div>
                <ul className="tutor-box__body" style={{ margin: "4px 0 0 18px" }}>
                  {essayModel.key_points.map((o, i) => <li key={i}>{o}</li>)}
                </ul>
              </>
            )}
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>范文</div>
            <div className="tutor-box__body"><Markdown>{essayModel.model_essay}</Markdown></div>
          </div>
        )}
        {compare && <EssayCompareCard data={compare} />}
      </div>
      </Reveal>

      {/* 账号安全（WBS 2.1） */}
      <Reveal delay={480}>
      <div className="card" style={{ marginTop: 12 }}>
        <strong>账号安全</strong>
        {/* 表单化：密码框包进 <form>，消除 Chrome「Password field is not contained in a
            form」告警（密码管理器/自动填充依赖此结构），回车提交改走原生 onSubmit。 */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            changePwd();
          }}
        >
          {/* 隐藏用户名框：满足 Chrome「密码表单应包含用户名字段」无障碍启发式，消除审计告警 */}
          <input type="text" autoComplete="username" value={user?.email || ""} hidden readOnly />
          <div className="field-label" style={{ marginTop: 8 }}>原密码</div>
          <input
            className={"input" + (pwdOldErr.invalid ? " is-invalid" : "")}
            type="password"
            autoComplete="current-password"
            value={pwdOld}
            onChange={(e) => setPwdOld(e.target.value)}
            onBlur={pwdOldErr.onBlur}
            aria-invalid={pwdOldErr.invalid || undefined}
            aria-describedby={pwdOldErr.describedBy}
            placeholder="请输入原密码"
          />
          {pwdOldErr.invalid && (
            <div id={pwdOldErr.describedBy} className="field-error" role="alert">
              <span className="field-error__ico" aria-hidden="true">!</span>
              <span>{pwdOldErr.error}</span>
            </div>
          )}
          <div className="field-label" style={{ marginTop: 8 }}>新密码</div>
          <input
            className={"input" + (pwdNewErr.invalid ? " is-invalid" : "")}
            type="password"
            autoComplete="new-password"
            value={pwdNew}
            onChange={(e) => setPwdNew(e.target.value)}
            onBlur={pwdNewErr.onBlur}
            aria-invalid={pwdNewErr.invalid || undefined}
            aria-describedby={pwdNewErr.describedBy}
            placeholder="至少 6 位"
          />
          {pwdNewErr.invalid && (
            <div id={pwdNewErr.describedBy} className="field-error" role="alert">
              <span className="field-error__ico" aria-hidden="true">!</span>
              <span>{pwdNewErr.error}</span>
            </div>
          )}
          <div className="field-label" style={{ marginTop: 8 }}>确认新密码</div>
          <input
            className={"input" + (pwdConfirmErr.invalid ? " is-invalid" : "")}
            type="password"
            autoComplete="new-password"
            value={pwdConfirm}
            onChange={(e) => setPwdConfirm(e.target.value)}
            onBlur={pwdConfirmErr.onBlur}
            aria-invalid={pwdConfirmErr.invalid || undefined}
            aria-describedby={pwdConfirmErr.describedBy}
            placeholder="再次输入新密码"
          />
          {pwdConfirmErr.invalid && (
            <div id={pwdConfirmErr.describedBy} className="field-error" role="alert">
              <span className="field-error__ico" aria-hidden="true">!</span>
              <span>{pwdConfirmErr.error}</span>
            </div>
          )}
          {pwdErr && <div className="err-text" style={{ marginTop: 6 }}>{pwdErr}</div>}
          {pwdOk && <div className="ok-text" style={{ marginTop: 6 }}>{pwdOk}</div>}
          <button className="btn btn--primary btn--block" style={{ marginTop: 10 }} disabled={pwdBusy}>
            {pwdBusy ? "修改中…" : "修改密码"}
          </button>
        </form>
      </div>
      </Reveal>

      {/* 账号与数据（PIPL 45/47：查阅复制 + 删除注销） */}
      <Reveal delay={500}>
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>账号与数据</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.7 }}>
          依据《个人信息保护法》，您可随时导出本平台存储的全部个人信息，或注销账号并删除学习数据。
        </div>
        <button className="btn btn--ghost btn--block" style={{ marginTop: 10 }} disabled={expBusy}
          onClick={async () => {
            setExpBusy(true); setExpErr("");
            try { await api.exportMyData(); } catch (e: any) { setExpErr(e.message || "导出失败"); }
            finally { setExpBusy(false); }
          }}>
          {expBusy ? "导出中…" : "导出我的数据（JSON）"}
        </button>
        {expErr && <div className="err-text" style={{ fontSize: 12, marginTop: 6 }}>{expErr}</div>}

        {!delOpen ? (
          <button className="btn btn--ghost btn--block" style={{ marginTop: 8, color: "var(--danger, #d92b1c)" }}
            onClick={() => { setDelOpen(true); setDelErr(""); setDelPwd(""); }}>
            注销账号
          </button>
        ) : (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 10, border: "1px solid var(--danger, #d92b1c)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--danger, #d92b1c)" }}>
              ⚠️ 注销不可恢复
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.7 }}>
              将立即删除您的答题、聊天、收藏、测评、模考等全部学习数据并匿名化账号；
              订单财务记录依法规留存（已与身份信息脱钩）。请输入登录密码确认。
            </div>
            <input className="input" type="password" style={{ marginTop: 8 }} placeholder="登录密码"
              value={delPwd} onChange={e => { setDelPwd(e.target.value); setDelErr(""); }} />
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn btn--danger btn--sm" disabled={delBusy || !delPwd}
                onClick={async () => {
                  setDelBusy(true); setDelErr("");
                  try {
                    await api.deactivateAccount(delPwd);
                    logout();
                    nav("/login");
                  } catch (e: any) {
                    setDelErr(e.message || "注销失败");
                  } finally { setDelBusy(false); }
                }}>
                {delBusy ? "注销中…" : "确认注销"}
              </button>
              <button className="btn btn--ghost btn--sm" disabled={delBusy} onClick={() => setDelOpen(false)}>
                取消
              </button>
            </div>
            {delErr && <div className="err-text" style={{ fontSize: 12, marginTop: 6 }}>{delErr}</div>}
          </div>
        )}
      </div>
      </Reveal>

      {/* 退出登录 */}
      <Reveal delay={540}>
      <div className="card" style={{ marginTop: 12 }}>
        <button className="btn btn--ghost btn--block" onClick={() => { logout(); nav("/login"); }}>
          退出登录
        </button>
      </div>
      </Reveal>
    </section>
  );
}
