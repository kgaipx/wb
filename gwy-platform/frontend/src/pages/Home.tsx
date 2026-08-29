import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api, PlanOut, PlanTask, StudentStats, WrongItem } from "../api/client";
import { useAuth } from "../auth";
import EmptyState from "../components/EmptyState";
import { TargetIcon, CalendarIcon, SparkleIcon } from "../icons";
import { calcSprint, daysLeftOf } from "../sprint";

const KIND_LABEL: Record<string, string> = {
  practice: "刷题",
  review_wrong: "错题",
  favorite: "收藏",
  explain: "讲解",
  mock: "模考",
  read: "阅读",
};

export default function Home() {
  const nav = useNavigate();
  const { user, loading, logout } = useAuth();
  const [dailyList, setDailyList] = useState<any[]>([]);
  const [dailyIdx, setDailyIdx] = useState(0);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [plan, setPlan] = useState<PlanOut | null>(null);
  const [installed, setInstalled] = useState(false);
  const [examStat, setExamStat] = useState<any[]>([]);
  const [examLoading, setExamLoading] = useState(false);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [wrongs, setWrongs] = useState<WrongItem[]>([]);

  // —— 冲刺横幅：目标日期（localStorage 即时 + /auth/me 跨设备同步，同 Learn）——
  const [examDate, setExamDate] = useState<string>(() => localStorage.getItem("gwy_target_exam_date") || "");
  const [examName, setExamName] = useState<string>(() => localStorage.getItem("gwy_target_exam_name") || "目标考试");
  useEffect(() => {
    if (!user) return;
    api
      .me()
      .then((u) => {
        if (u.target_exam_date) {
          setExamDate(u.target_exam_date);
          setExamName(u.target_exam_name || "目标考试");
        }
      })
      .catch(() => {});
  }, [user]);
  const sprint = useMemo(
    () => calcSprint(daysLeftOf(examDate), stats?.ability || []),
    [examDate, stats]
  );
  const sprintShow = sprint && sprint.daysLeft <= 45 ? sprint : null; // 冲刺期 = 剩余 ≤45 天

  // —— AI 备考晨报：每日首次进入自动生成（前端按北京时间自然日缓存，每日至多一次 LLM 调用）——
  const [morning, setMorning] = useState<any>(null);
  const [morningLoading, setMorningLoading] = useState(false);
  useEffect(() => {
    if (!user) return;
    const todayKey = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const cached = localStorage.getItem("gwy_morning_" + todayKey);
    if (cached) {
      try {
        setMorning(JSON.parse(cached));
        return;
      } catch {
        /* 缓存损坏则重新请求 */
      }
    }
    setMorningLoading(true);
    api
      .morningReport()
      .then((r) => {
        setMorning(r);
        try {
          localStorage.setItem("gwy_morning_" + todayKey, JSON.stringify(r));
        } catch {
          /* 存储满等场景忽略 */
        }
      })
      .catch(() => {})
      .finally(() => setMorningLoading(false));
  }, [user]);

  // PWA 已安装态检测：standalone 显示模式（Android Chrome / 桌面）或 iOS Safari navigator.standalone
  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const update = () =>
      setInstalled(mq.matches || (navigator as any).standalone === true);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // 已登录：拉一批「每日一练」弱项推荐，支持「换一题」循环浏览
  const loadDaily = useCallback(() => {
    setDailyLoading(true);
    api
      .recommend(6)
      .then((r) => {
        setDailyList(r.questions || []);
        setDailyIdx(0);
      })
      .catch(() => setDailyList([]))
      .finally(() => setDailyLoading(false));
  }, []);

  useEffect(() => {
    if (user) loadDaily();
  }, [user, loadDaily]);

  // 已登录：拉取已有学习计划，用于首页「今日计划」概览（不自动生成）
  useEffect(() => {
    if (!user) return;
    api.planGet().then(setPlan).catch(() => setPlan(null));
  }, [user]);

  // 已登录：拉最近 5 次模考，用于首页「模考进步」第一屏提分信号
  useEffect(() => {
    if (!user) return;
    setExamLoading(true);
    api
      .examHistory(5, 0)
      .then(setExamStat)
      .catch(() => setExamStat([]))
      .finally(() => setExamLoading(false));
  }, [user]);

  // 已登录：拉学情概览，用于首页「学习概览」三宫格（复用 studentStats）
  useEffect(() => {
    if (!user) return;
    api.studentStats().then(setStats).catch(() => setStats(null));
  }, [user]);

  // 已登录：拉待复盘错题，用于首页「智能日报」的间隔到期 / 新错题统计
  useEffect(() => {
    if (!user) return;
    api.wrongList().then(setWrongs).catch(() => setWrongs([]));
  }, [user]);

  const daily = dailyList[dailyIdx] || null;

  // —— 智能日报：间隔到期复习 + 新错题提醒 + 最弱一键练 ——
  // 待复盘错题（wrongList 默认即未复盘）按「最后作答时间」切本地日：
  // 今天内的 = 新错题（待首次复习）；更早的 = 间隔到期、今天该复盘。
  const now0 = new Date();
  const todayStart = new Date(now0.getFullYear(), now0.getMonth(), now0.getDate());
  let dueCount = 0;
  let newToday = 0;
  for (const w of wrongs) {
    if (!w.last_attempted_at) {
      dueCount += 1;
      continue;
    }
    const last = new Date(w.last_attempted_at);
    if (last >= todayStart) newToday += 1;
    else dueCount += 1;
  }
  const weak3 = stats
    ? [...stats.ability].sort((a, b) => a.mastery - b.mastery).slice(0, 3)
    : [];

  // 冷启动引导：零作答的纯新手用户，首登即给「三步开启」引导；做第一题后自动消失
  const isNew = stats ? stats.total_answers === 0 : false;

  const onPlanTask = (t: PlanTask) => {
    if (t.kind === "mock") {
      nav("/exam");
      return;
    }
    if (t.ref_id) nav(`/practice?q=${t.ref_id}`);
  };

  const shuffleDaily = () => {
    if (dailyList.length === 0) return;
    if (dailyIdx < dailyList.length - 1) setDailyIdx(dailyIdx + 1);
    else loadDaily(); // 当前批次看完，重新拉一批
  };

  if (loading) return (
    <section>
      <div className="sk-stack">
        <div className="sk-card">
          <div className="sk-head">
            <div className="sk sk-circle" style={{ width: 44, height: 44 }} />
            <div style={{ flex: 1 }}>
              <div className="sk sk-line" style={{ width: "55%" }} />
              <div className="sk sk-line" style={{ width: "35%", height: 10 }} />
            </div>
          </div>
          <div className="sk sk-line" style={{ width: "100%" }} />
          <div className="sk sk-line" style={{ width: "88%" }} />
        </div>
        <div className="sk-card">
          <div className="sk sk-line" style={{ width: "42%" }} />
          <div className="sk sk-line" style={{ width: "100%" }} />
          <div className="sk sk-line" style={{ width: "76%" }} />
        </div>
        <div className="sk-card">
          <div className="sk sk-line" style={{ width: "50%" }} />
          <div className="sk sk-line" style={{ width: "100%" }} />
        </div>
      </div>
    </section>
  );

  // 未登录：引导注册 / 登录
  if (!user) {
    return (
      <section className="fx-stagger">
        <div className="hero">
          <div className="hero__badge"><SparkleIcon /> AI 私教 · 内容可溯源 · 随时问</div>
          <div className="hero__title">AI 公考私教</div>
          <div className="hero__sub">更懂你短板 · 内容可信 · 花钱无忧 · 陪你上岸</div>
          <div className="hero__actions">
            <button
              className="btn btn--inverse"
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
    <section className="fx-stagger">
      <div className="hero">
        <div className="hero__badge"><span className="dot" />私教在线 · 随时为你答疑</div>
        <div className="hero__title">你好，{user.nickname || user.email}</div>
        <div className="hero__sub">
          {user.target_exam} · 会员：<b>{user.plan === "free" ? "免费版" : user.plan}</b>
        </div>
        <div className="hero__actions">
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn--inverse" style={{ flex: 1 }} onClick={() => nav("/practice")}>
              开始刷题
            </button>
            <button
              className="btn btn--ghost-on"
              style={{ flex: 1 }}
              onClick={() => nav("/learn")}
            >
              学习中心
            </button>
          </div>
        </div>
      </div>

      {/* 冲刺横幅：倒计时 ≤45 天的每日冲刺提醒（数据与 Learn 冲刺面板同源） */}
      {sprintShow && (
        <div
          className="card"
          style={{
            marginTop: 14,
            border: "1px solid rgba(var(--brand-rgb), 0.35)",
            background:
              "linear-gradient(135deg, rgba(var(--brand-rgb), 0.12), rgba(var(--accent-rgb), 0.10))",
          }}
        >
          <div className="row row--between" style={{ alignItems: "center" }}>
            <strong>
              🚀 冲刺期 · 距{examName}还有 {sprintShow.daysLeft} 天
            </strong>
            <span className="chip chip--warn">{sprintShow.phase.name}</span>
          </div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
            {sprintShow.phase.target} · {sprintShow.phase.daily}
          </div>
          {sprintShow.weak.length > 0 && (
            <>
              <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                🎯 今日冲刺（薄弱点优先）：
              </div>
              <div className="chip-row" style={{ marginTop: 4 }}>
                {sprintShow.weak.map((w) => (
                  <button
                    key={w.knowledge_point}
                    className="chip chip--on"
                    onClick={() => nav(`/practice?kp=${encodeURIComponent(w.knowledge_point)}`)}
                  >
                    {w.knowledge_point}（{Math.round(w.mastery * 100)}%）
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn btn--primary btn--sm" onClick={() => nav("/exam")}>
              📝 今日模考
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => nav("/wrong")}>
              📕 错题复盘
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => nav("/learn")}>
              查看冲刺计划
            </button>
          </div>
        </div>
      )}

      {/* AI 备考晨报：昨日表现 + 薄弱点 + 今日计划 + 倒计时（LLM 播报，模板兜底；按日缓存） */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="row row--between" style={{ alignItems: "center" }}>
          <strong>🌅 AI 备考晨报</strong>
          {morning && <span className="muted" style={{ fontSize: 12 }}>{morning.date}</span>}
        </div>
        {morningLoading && !morning ? (
          <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            <span className="sk sk-line" style={{ width: "88%", display: "inline-block", height: 12 }} />
            <span className="muted" style={{ marginLeft: 8 }}>晨报生成中…</span>
          </div>
        ) : morning ? (
          <>
            <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.7 }}>{morning.report}</div>
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              昨日 {morning.yesterday_answers} 题 · 正确率 {morning.yesterday_rate}% · 本周 {morning.week_answers} 题
              {morning.plan_today > 0 && ` · 今日计划 ${morning.plan_done}/${morning.plan_today}`}
              {morning.countdown_days != null && ` · 距考试 ${morning.countdown_days} 天`}
            </div>
            {morning.weak.length > 0 && (
              <div className="chip-row" style={{ marginTop: 6 }}>
                {morning.weak.map((w: string) => (
                  <button
                    key={w}
                    className="chip chip--on"
                    onClick={() => nav(`/practice?kp=${encodeURIComponent(w)}`)}
                  >
                    {w}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* 冷启动新手引导：零作答用户首登破冰，做第一题后自动消失 */}
      {isNew && (
        <div className="card onboard" style={{ marginTop: 14 }}>
          <strong>👋 欢迎！三步开启你的 AI 私教</strong>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            先测评定位短板，再每日一练破冰，随时问 AI 私教。
          </div>
          <div className="onboard__steps" style={{ marginTop: 10 }}>
            <button className="onboard__step" onClick={() => nav("/assessment")}>
              <span className="onboard__no">1</span>
              <span className="onboard__txt">
                <b>做一次能力测评</b>
                <span className="muted">定位你的真实薄弱点</span>
              </span>
              <span className="onboard__go">→</span>
            </button>
            <button className="onboard__step" onClick={() => nav("/practice")}>
              <span className="onboard__no">2</span>
              <span className="onboard__txt">
                <b>刷一组每日一练</b>
                <span className="muted">从薄弱点开始破冰</span>
              </span>
              <span className="onboard__go">→</span>
            </button>
            <button className="onboard__step" onClick={() => nav("/chat")}>
              <span className="onboard__no">3</span>
              <span className="onboard__txt">
                <b>体验 AI 私教</b>
                <span className="muted">随时问解题技巧与规划</span>
              </span>
              <span className="onboard__go">→</span>
            </button>
          </div>
        </div>
      )}

      {/* PWA 引导徽章：强化「离线轻量」卖点，已安装用户给正向反馈 */}
      <div className="home-pwa">
        <span className="home-pwa__badge home-pwa__badge--info">
          <span className="dot" />可离线刷题
        </span>
        {installed && (
          <span className="home-pwa__badge">
            <span className="dot" />已安装到设备
          </span>
        )}
      </div>

      {/* 搜题入口：直达全局题库检索 */}
      <button
        className="card home-search"
        style={{ marginTop: 14, width: "100%", textAlign: "left", cursor: "pointer" }}
        onClick={() => nav("/search")}
      >
        <span className="home-search__ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </span>
        <span className="home-search__txt">
          <b>搜题</b>
          <span className="muted">按关键词 / 科目 / 知识点检索题库，直达练习与收藏</span>
        </span>
        <span className="home-search__go">→</span>
      </button>

      {/* 今日学习计划概览 */}
      {plan ? (
        <div className="card home-plan" style={{ marginTop: 14 }}>
          <div className="row row--between">
            <strong>今日学习计划</strong>
            <button className="link-btn" onClick={() => nav("/plan")}>完整计划 →</button>
          </div>
          <div className="home-plan__top">
            <span className="home-plan__streak">🔥 连续打卡 {plan.progress.streak_days} 天</span>
            <span className="home-plan__today">
              今日 {plan.progress.today_done}/{plan.progress.today_total}
            </span>
          </div>
          {(() => {
            const today = plan.items.find((d) => d.day === plan.today_index);
            if (!today) {
              return (
                <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                  今日计划已结束或尚未开始，去计划页查看全部安排。
                </div>
              );
            }
            return (
              <>
                <div className="home-plan__focus muted">{today.focus}</div>
                <div className="home-plan__tasks">
                  {today.tasks.slice(0, 4).map((t) => {
                    const clickable = t.kind === "mock" || !!t.ref_id;
                    return (
                      <div
                        key={t.id}
                        className={
                          "home-plan__task" +
                          (t.done ? " is-done" : "") +
                          (clickable ? " is-link" : "")
                        }
                        onClick={clickable ? () => onPlanTask(t) : undefined}
                      >
                        <span className={"home-plan__check" + (t.done ? " on" : "")}>
                          {t.done ? "✓" : ""}
                        </span>
                        <span className="home-plan__kind">{KIND_LABEL[t.kind] || t.kind}</span>
                        <span className="home-plan__title">{t.title}</span>
                        {t.done && <span className="home-plan__badge">已完成</span>}
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      ) : (
        <div className="card card--soft" style={{ marginTop: 14 }}>
          <div className="row row--between">
            <strong>今日学习计划</strong>
          </div>
          <EmptyState tight icon="calendar" title="还没有学习计划" desc="生成一份为你定制的 AI 学习计划，这里会出现今日待办。" />
            <button className="btn btn--primary empty__action" onClick={() => nav("/plan")}>
              制定我的计划
            </button>
        </div>
      )}

      {/* 每日一练 */}
      <div className="card card--tutor" style={{ marginTop: 14 }}>
        <div className="card--tutor__txt">
          <div className="row row--between">
            <div className="muted" style={{ fontSize: 12 }}>每日一练 · 为你推荐</div>
            <button
              className="link-btn"
              style={{ fontSize: 12 }}
              onClick={shuffleDaily}
              disabled={dailyLoading}
            >
              {dailyLoading ? "加载中…" : "换一题"}
            </button>
          </div>
          {dailyLoading ? (
            <div className="sk-stack" style={{ marginTop: 6 }}>
              <div className="sk sk-line" style={{ width: "30%" }} />
              <div className="sk sk-line" style={{ width: "92%" }} />
              <div className="sk sk-line" style={{ width: "80%", height: 28 }} />
              <div className="sk sk-line" style={{ width: "96%" }} />
            </div>
          ) : daily ? (
            <>
              <div className="daily-tags">
                {daily.subject && <span className="tag tag--brand">{daily.subject}</span>}
                {daily.category && <span className="tag">{daily.category}</span>}
                {daily.difficulty != null && (
                  <span className="tag tag--warning">难度 {daily.difficulty}</span>
                )}
              </div>
              <div style={{ fontWeight: 700, marginTop: 6 }}>{daily.knowledge_point}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {daily.stem}
              </div>
            </>
          ) : (
            <EmptyState tight icon="bulb" title="暂无推荐题" desc="去题库练练手，AI 会按你的薄弱点推荐题目。" style={{ marginTop: 6 }} />
          )}
        </div>
        {daily && (
          <button className="btn btn--primary btn--sm" onClick={() => nav(`/practice?q=${daily.id}`)}>
            练习
          </button>
        )}
      </div>

      {/* 模考进步：把"提分信号"前置到首页第一屏 */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="row row--between">
          <strong>模考进步</strong>
          <button className="link-btn" onClick={() => nav("/exam")}>完整复盘 →</button>
        </div>
        {examLoading ? (
          <div className="sk-stack" style={{ marginTop: 8 }}>
            <div className="sk sk-line" style={{ width: "48%" }} />
            <div className="sk sk-line" style={{ width: "88%" }} />
            <div className="sk sk-line" style={{ width: "64%" }} />
          </div>
        ) : examStat.length === 0 ? (
          <>
            <EmptyState tight icon="exam" title="还没有模考记录" desc="去「在线模考」测一次真实水平，这里会显示你的提分曲线。" />
              <button className="btn btn--primary btn--sm empty__action" onClick={() => nav("/exam")}>
                去模考
              </button>
          </>
        ) : (
          (() => {
            const last = examStat[0];
            const rate = Math.round((last.correct_rate || 0) * 100);
            const tone = rate >= 70 ? "rate--good" : rate >= 50 ? "rate--mid" : "rate--bad";
            const prevRate = examStat[1] ? Math.round((examStat[1].correct_rate || 0) * 100) : null;
            const delta = prevRate !== null ? rate - prevRate : 0;
            const deltaCls =
              delta > 0 ? "rate-trend--up" : delta < 0 ? "rate-trend--down" : "rate-trend--flat";
            return (
              <div style={{ marginTop: 6 }}>
                <div className="row row--between">
                  <span className="muted" style={{ fontSize: 13 }}>
                    最近一次 · {last.created_at.slice(5, 10) + " " + last.created_at.slice(11, 16)}
                  </span>
                  <span className={"big-rate " + tone} style={{ fontSize: 22 }}>{rate}<span>%</span></span>
                </div>
                {prevRate !== null && (
                  <div className="row row--between" style={{ marginTop: 4, fontSize: 12 }}>
                    <span className="muted">较上次模考</span>
                    <span className={"rate-trend " + deltaCls}>
                      {delta > 0 ? "▲ +" : delta < 0 ? "▼ " : "— "}
                      {Math.abs(delta)}%
                    </span>
                  </div>
                )}
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  已记录近 {examStat.length} 次模考，去「在线模考·历史」看完整进步曲线。
                </div>
              </div>
            );
          })()
        )}
      </div>

      {/* 学习概览：首页首屏即展示核心状态，给出下一步方向感 */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="row row--between">
          <strong>学习概览</strong>
          <button className="link-btn" onClick={() => nav("/data")}>数据中心 →</button>
        </div>
        <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
          <div className="metric">
            <div className="metric__num" style={{ color: "var(--accent)" }}>{stats ? stats.streak_days : "—"}</div>
            <div className="metric__label">🔥连续打卡</div>
          </div>
          <div className="metric">
            <div className="metric__num" style={{ color: "var(--brand)" }}>{stats ? Math.round(stats.correct_rate * 100) + "%" : "—"}</div>
            <div className="metric__label">客观正确率</div>
          </div>
          <div className="metric">
            <div className="metric__num" style={{ color: "var(--danger)" }}>{stats ? Math.max(0, stats.wrong_distinct - stats.reviewed_distinct) : "—"}</div>
            <div className="metric__label">待攻克错题</div>
          </div>
        </div>
        {stats && stats.wrong_distinct - stats.reviewed_distinct > 0 && (
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn btn--primary btn--sm" style={{ flex: 1 }} onClick={() => nav("/wrong")}>
              攻克错题本
            </button>
            <button className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={() => nav("/data")}>
              看完整趋势
            </button>
          </div>
        )}
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          复错率、弱项知识点与近 7 日趋势，去数据中心看完整进步曲线。
        </div>
      </div>

      {/* 智能日报：间隔到期复习 + 新错题提醒 + 最弱一键练 */}
      <div className="card home-daily" style={{ marginTop: 14 }}>
        <div className="row row--between">
          <strong><CalendarIcon /> 智能日报</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            {now0.getMonth() + 1} 月 {now0.getDate()} 日
          </span>
        </div>
        <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
          <div className="metric">
            <div className="metric__num" style={{ color: "var(--warning)" }}>{dueCount}</div>
            <div className="metric__label">间隔到期待复习</div>
          </div>
          <div className="metric">
            <div className="metric__num" style={{ color: "var(--accent)" }}>{newToday}</div>
            <div className="metric__label">今日新错题</div>
          </div>
          <div className="metric">
            <div className="metric__num" style={{ color: "var(--brand)" }}>{stats ? stats.streak_days : "—"}</div>
            <div className="metric__label">🔥连续打卡</div>
          </div>
        </div>
        {(dueCount + newToday) > 0 && (
          <button
            className="btn btn--primary btn--sm"
            style={{ marginTop: 10, width: "100%" }}
            onClick={() => nav("/wrong")}
          >
            去复习错题（{dueCount + newToday}）
          </button>
        )}

        {weak3.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="muted" style={{ fontSize: 12 }}>最弱知识点 · 一键练</div>
            <div className="chip-row" style={{ marginTop: 4 }}>
              {weak3.map((a) => (
                <button
                  key={a.knowledge_point}
                  className="chip chip--on"
                  onClick={() => nav(`/practice?kp=${encodeURIComponent(a.knowledge_point)}`)}
                >
                  {a.knowledge_point} {Math.round(a.mastery * 100)}%
                </button>
              ))}
            </div>
            <button
              className="btn btn--ghost btn--sm"
              style={{ marginTop: 8, width: "100%" }}
              onClick={() => nav("/practice?kp=" + weak3.map((a) => a.knowledge_point).join(","))}
            >
              <><TargetIcon /> 一键混合薄弱点练习（{weak3.length}）</>
            </button>
          </div>
        )}
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

      <div className={"card" + (user.plan === "free" ? " home-membership--free" : "")} style={{ marginTop: 14 }}>
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
