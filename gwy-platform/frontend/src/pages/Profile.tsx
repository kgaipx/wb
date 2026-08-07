import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Dashboard, EssayPrompt } from "../api/client";
import { useAuth } from "../auth";
import { DimensionBars } from "../components/DimensionBars";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Profile() {
  const nav = useNavigate();
  const { logout, user } = useAuth();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [plan, setPlan] = useState("free");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [wrongCount, setWrongCount] = useState(0);
  const [favCount, setFavCount] = useState(0);
  const [err, setErr] = useState("");
  const [essay, setEssay] = useState("");
  const [grade, setGrade] = useState<any>(null);
  const [essayPrompt, setEssayPrompt] = useState<EssayPrompt | null>(null);

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
    // 取首个申论题作为快速批改的真实材料/要求（避免占位文本误导评分）
    api.essayPrompts().then((ps) => setEssayPrompt(ps[0] || null)).catch(() => {});
  }, []);

  async function saveProfile() {
    setSavingProfile(true);
    setProfileOk("");
    setErr("");
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

  async function changePwd() {
    setPwdOk("");
    setPwdErr("");
    if (pwdNew.length < 6) {
      setPwdErr("新密码至少 6 位");
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdErr("两次输入的新密码不一致");
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

      {/* 学员画像（可编辑，驱动学习计划与目标个性化） */}
      <div className="card" style={{ marginTop: 12 }}>
        <strong>学员画像</strong>
        <div className="field-label" style={{ marginTop: 8 }}>昵称</div>
        <input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="昵称" />
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

      {/* 内容可信 / 双签审核台（WBS 5.2 信任保障，仅审核员/管理员可见） */}
      {user && (user.role === "reviewer" || user.role === "admin") && (
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
      )}

      {/* 运营后台总览（仅管理员可见） */}
      {user && user.role === "admin" && (
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
      )}

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
            <DimensionBars dims={grade.dimensions} />
            {grade.rationale && <div style={{ fontSize: 13, marginTop: 8 }}>{grade.rationale}</div>}
          </div>
        )}
      </div>

      {/* 账号安全（WBS 2.1） */}
      <div className="card" style={{ marginTop: 12 }}>
        <strong>账号安全</strong>
        <div className="field-label" style={{ marginTop: 8 }}>原密码</div>
        <input className="input" type="password" value={pwdOld} onChange={(e) => setPwdOld(e.target.value)} placeholder="请输入原密码" />
        <div className="field-label" style={{ marginTop: 8 }}>新密码</div>
        <input className="input" type="password" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} placeholder="至少 6 位" />
        <div className="field-label" style={{ marginTop: 8 }}>确认新密码</div>
        <input className="input" type="password" value={pwdConfirm} onChange={(e) => setPwdConfirm(e.target.value)} placeholder="再次输入新密码" />
        {pwdErr && <div className="err-text" style={{ marginTop: 6 }}>{pwdErr}</div>}
        {pwdOk && <div className="ok-text" style={{ marginTop: 6 }}>{pwdOk}</div>}
        <button className="btn btn--primary btn--block" style={{ marginTop: 10 }} disabled={pwdBusy} onClick={changePwd}>
          {pwdBusy ? "修改中…" : "修改密码"}
        </button>
      </div>

      {/* 退出登录 */}
      <div className="card" style={{ marginTop: 12 }}>
        <button className="btn btn--ghost btn--block" onClick={() => { logout(); nav("/login"); }}>
          退出登录
        </button>
      </div>
    </section>
  );
}
