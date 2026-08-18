import { useEffect, useState, useCallback } from "react";
import { Routes, Route, NavLink, Link, useLocation, useNavigate, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { setUnauthorizedHandler, api } from "./api/client";
import type { NotificationOut } from "./api/client";
import ErrorBoundary from "./components/ErrorBoundary";
import { notifMeta, formatNotifTime } from "./components/notifMeta";
import Home from "./pages/Home";
import Learn from "./pages/Learn";
import Practice from "./pages/Practice";
import Profile from "./pages/Profile";
import Exam from "./pages/Exam";
import Wrong from "./pages/Wrong";
import Favorites from "./pages/Favorites";
import Chat from "./pages/Chat";
import Plan from "./pages/Plan";
import Review from "./pages/Review";
import Membership from "./pages/Membership";
import Essay from "./pages/Essay";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Notifications from "./pages/Notifications";
import Assessment from "./pages/Assessment";
import Search from "./pages/Search";
import MaterialLibrary from "./pages/MaterialLibrary";
import SmartReinforcement from "./pages/SmartReinforcement";
import ExamPrediction from "./pages/ExamPrediction";
import Flashcards from "./pages/Flashcards";

type Icon = () => JSX.Element;

const HomeIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </svg>
);
const BookIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5.5A2 2 0 0 1 5 4h5v15H5a2 2 0 0 0-2 1.5z" />
    <path d="M21 5.5A2 2 0 0 0 19 4h-5v15h5a2 2 0 0 1 2 1.5z" />
  </svg>
);
const PenIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
const UserIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);
const ExamIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3h6a1 1 0 0 1 1 1v1h1a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1V4a1 1 0 0 1 1-1z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
const AssessIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    <path d="M12 12 18.5 7" />
  </svg>
);
const WrongIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v4h4" />
    <path d="M12 8v4l3 2" />
  </svg>
);
const ChartIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19V5" />
    <path d="M4 19h16" />
    <rect x="7" y="11" width="3" height="5" rx="1" />
    <rect x="12" y="7" width="3" height="9" rx="1" />
    <rect x="17" y="13" width="3" height="3" rx="1" />
  </svg>
);

const ShieldIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
const GaugeIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 18a8 8 0 1 1 16 0" />
    <path d="M12 14l4-3" />
    <circle cx="12" cy="14" r="1.2" fill="currentColor" />
  </svg>
);
const TargetIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
  </svg>
);
const PaperIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h9l3 3v15a0 0 0 0 1 0 0H6a0 0 0 0 1 0 0V4a1 1 0 0 1 1-1z" />
    <path d="M14 3v4h4" />
    <path d="M8.5 13h7M8.5 16.5h5" />
  </svg>
);
const StarIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
  </svg>
);
const PlanIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    <path d="M8 13.5l2 2 4-4" />
  </svg>
);
const CrownIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8l3.5 3L12 5l4.5 6L20 8l-1 10H5z" />
  </svg>
);
const EssayIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M13 3v5h5" />
    <path d="M8.5 12.5h7M8.5 16h5" />
  </svg>
);
const SearchIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4-4" />
  </svg>
);

const CardsIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="7" width="13" height="11" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
  </svg>
);
const MoreIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.9" />
    <circle cx="12" cy="12" r="1.9" />
    <circle cx="19" cy="12" r="1.9" />
  </svg>
);
const BellIcon: Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

/** 主栏固定 5 个核心入口（首页 + 练习闭环 + 我的），保证小屏不拥挤。 */
const PRIMARY = [
  { to: "/", label: "首页", end: true, icon: HomeIcon },
  { to: "/practice", label: "刷题", icon: PenIcon },
  { to: "/assessment", label: "测评", icon: AssessIcon },
  { to: "/wrong", label: "错题", icon: WrongIcon },
  { to: "/profile", label: "我的", icon: UserIcon },
];

/** 次要入口收进「更多」抽屉；role 限定角色可见项（审核=reviewer/admin，运营=admin）。 */
type MoreEntry = { to: string; label: string; icon: Icon; end?: boolean; role?: "reviewer" | "admin" };
const MORE: MoreEntry[] = [
  { to: "/learn", label: "学习", icon: BookIcon },
  { to: "/search", label: "搜题", icon: SearchIcon },
  { to: "/exam", label: "模考", icon: ExamIcon },
  { to: "/predict", label: "真题", icon: PaperIcon },
  { to: "/data", label: "数据", icon: ChartIcon },
  { to: "/favorites", label: "收藏", icon: StarIcon },
  { to: "/plan", label: "计划", icon: PlanIcon },
  { to: "/membership", label: "会员", icon: CrownIcon },
  { to: "/notifications", label: "通知", icon: BellIcon },
  { to: "/essay", label: "申论", icon: EssayIcon },
  { to: "/material", label: "素材", icon: BookIcon },
  { to: "/reinforce", label: "强化包", icon: TargetIcon },
  { to: "/flashcards", label: "速记卡", icon: CardsIcon },
  { to: "/review", label: "审核", icon: ShieldIcon, role: "reviewer" },
  { to: "/admin", label: "运营", icon: GaugeIcon, role: "admin" },
];

function FloatingTutor() {
  const loc = useLocation();
  if (loc.pathname === "/chat" || loc.pathname === "/login") return null;
  return (
    <Link to="/chat" className="fab" aria-label="AI 私教">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
        <path d="M8.5 9.5h7M8.5 13h4" />
      </svg>
      <span className="fab__label">私教</span>
    </Link>
  );
}

/** 受保护路由：未登录跳转 /login 并记录来源页。 */
function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="splash">加载中…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

/** 注册 401 回调：清除登录态并跳转登录页。 */
function AuthGate() {
  const { logout } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      nav("/login");
    });
    return () => setUnauthorizedHandler(null);
  }, [logout, nav]);
  return null;
}

// 时间格式化已迁移至 components/notifMeta，避免与通知中心页重复实现。

function AppShell() {
  const loc = useLocation();
  const isAuth = loc.pathname === "/login";
  const { user } = useAuth();
  const nav = useNavigate();
  const [notifs, setNotifs] = useState<NotificationOut[]>([]);
  const [unread, setUnread] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  // —— PWA 安装引导 ——
  useEffect(() => {
    const onPrompt = (e: any) => {
      // 捕获浏览器原生「安装到主屏幕」提示，改为自有 UI 触发
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    };
    const onInstalled = () => {
      setShowInstall(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // —— 离线状态指示（强化「离线轻量」差异化卖点）——
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // iOS / 移动端键盘遮挡修复：输入框获得焦点时，待键盘弹出后将其滚动到可视区中部。
  // 这是跨平台通用的缓解方案（无法在沙箱内真机验证，需在 iOS Safari 实机确认效果）。
  useEffect(() => {
    const onFocusIn = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        // 延迟到键盘弹出动画之后，避免被固定底部导航遮挡
        window.setTimeout(() => {
          try {
            t.scrollIntoView({ block: "center", behavior: "smooth" });
          } catch {
            /* 老浏览器兼容 */
          }
        }, 300);
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  const installApp = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === "accepted") {
        /* 用户接受安装，浏览器会自动添加到主屏幕 */
      }
    } catch {
      /* 忽略：部分浏览器不支持主动 prompt */
    } finally {
      setDeferredPrompt(null);
      setShowInstall(false);
    }
  };

  const dismissInstall = () => {
    setShowInstall(false);
    setDeferredPrompt(null);
  };

  const loadNotifs = useCallback(async () => {
    try {
      const data = await api.notifications();
      setNotifs(data.items);
      setUnread(data.unread_count);
    } catch {
      /* 忽略：未登录或网络错误不阻塞主流程 */
    }
  }, []);

  useEffect(() => {
    if (user && !isAuth) loadNotifs();
    else {
      setNotifs([]);
      setUnread(0);
    }
  }, [user, isAuth, loadNotifs, loc.pathname]);

  // 通知中心页内标记已读后回写顶部铃铛角标（跨组件共享刷新）
  useEffect(() => {
    const onChanged = () => loadNotifs();
    window.addEventListener("notif-changed", onChanged);
    return () => window.removeEventListener("notif-changed", onChanged);
  }, [loadNotifs]);

  const openNotif = async (n: NotificationOut) => {
    setPanelOpen(false);
    if (!n.is_read) {
      try {
        await api.markNotificationRead(n.id);
        await loadNotifs();
      } catch {
        /* ignore */
      }
    }
    if (n.link) nav(n.link);
  };

  const readAll = async () => {
    try {
      await api.markAllNotificationsRead();
      await loadNotifs();
    } catch {
      /* ignore */
    }
  };

  // —— 底部导航：主栏固定 5 个核心入口，其余收进「更多」抽屉（响应式防拥挤）——
  const [moreOpen, setMoreOpen] = useState(false);
  const role = user?.role;
  const visibleMore = MORE.filter(
    (m) => !m.role || m.role === role || (m.role === "reviewer" && role === "admin")
  );
  const inMore = visibleMore.some((m) => m.to === loc.pathname);

  return (
    <div className="app-shell">
      {!isAuth && (
        <header className="app-header">
          <div className="app-header__logo">公</div>
          <div className="app-header__brand">
            <div className="app-header__name">AI 公考私教</div>
            <div className="app-header__tag">懂你短板 · 内容可信</div>
          </div>
          <button
            className="bell-btn"
            aria-label="通知"
            onClick={() => setPanelOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
            {unread > 0 && (
              <span className="unread-dot">{unread > 99 ? "99+" : unread}</span>
            )}
          </button>

          {panelOpen && (
            <div className="notif-panel">
              <div className="notif-panel__head">
                <span>通知</span>
                {unread > 0 && (
                  <button className="notif-readall" onClick={readAll}>
                    全部已读
                  </button>
                )}
              </div>
              <div className="notif-panel__body">
                {notifs.length === 0 ? (
                  <div className="notif-empty">暂无通知</div>
                ) : (
                  <>
                    {notifs.map((n) => {
                      const m = notifMeta(n.type);
                      return (
                        <button
                          key={n.id}
                          className={"notif-item" + (n.is_read ? "" : " unread")}
                          style={{ borderLeft: `3px solid ${m.color}` }}
                          onClick={() => openNotif(n)}
                        >
                          <div className="notif-item__row">
                            <span className="notif-item__ico" style={{ color: m.color }}>
                              {m.icon}
                            </span>
                            <span className="notif-item__txt">
                              <span className="notif-item__title">{n.title}</span>
                              <span className="notif-item__body">{n.body}</span>
                              <span className="notif-time">{formatNotifTime(n.created_at)}</span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                    <button
                      className="notif-viewall"
                      onClick={() => {
                        setPanelOpen(false);
                        nav("/notifications");
                      }}
                    >
                      查看全部通知 →
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </header>
      )}

      {!isAuth && panelOpen && (
        <div className="notif-backdrop" onClick={() => setPanelOpen(false)} />
      )}

      {!isAuth && showInstall && (
        <div className="install-banner">
          <div className="install-banner__txt">
            <b>安装到主屏幕</b>
            <span>获得类原生 App 体验，离线也能刷题</span>
          </div>
          <button className="install-banner__btn" onClick={installApp}>
            安装
          </button>
          <button
            className="install-banner__close"
            aria-label="关闭"
            onClick={dismissInstall}
          >
            ×
          </button>
        </div>
      )}

      {!online && (
        <div className="offline-banner" role="status">
          <span className="offline-banner__dot" />
          <span>当前离线 · 已缓存内容可继续刷题，恢复网络后自动同步进度</span>
        </div>
      )}

      <main className="app-main" style={isAuth ? { padding: 0, paddingBottom: 0 } : undefined}>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/learn" element={<RequireAuth><Learn /></RequireAuth>} />
            <Route path="/practice" element={<RequireAuth><Practice /></RequireAuth>} />
            <Route path="/exam" element={<RequireAuth><Exam /></RequireAuth>} />
            <Route path="/assessment" element={<RequireAuth><Assessment /></RequireAuth>} />
            <Route path="/wrong" element={<RequireAuth><Wrong /></RequireAuth>} />
            <Route path="/favorites" element={<RequireAuth><Favorites /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
            <Route path="/plan" element={<RequireAuth><Plan /></RequireAuth>} />
            <Route path="/review" element={<RequireAuth><Review /></RequireAuth>} />
            <Route path="/membership" element={<RequireAuth><Membership /></RequireAuth>} />
            <Route path="/essay" element={<RequireAuth><Essay /></RequireAuth>} />
            <Route path="/data" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/search" element={<RequireAuth><Search /></RequireAuth>} />
            <Route path="/material" element={<RequireAuth><MaterialLibrary /></RequireAuth>} />
            <Route path="/reinforce" element={<RequireAuth><SmartReinforcement /></RequireAuth>} />
            <Route path="/predict" element={<RequireAuth><ExamPrediction /></RequireAuth>} />
            <Route path="/flashcards" element={<RequireAuth><Flashcards /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
            <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
            <Route path="/chat" element={<RequireAuth><Chat /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>

      {!isAuth && <FloatingTutor />}

      {!isAuth && (
        <nav className="nav-bar">
          {PRIMARY.map((t) => {
            const Icon = t.icon;
            return (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
              >
                <span className="nav-link__ico">
                  <Icon />
                </span>
                {t.label}
              </NavLink>
            );
          })}
          <button
            type="button"
            className={"nav-link" + (inMore ? " active" : "")}
            onClick={() => setMoreOpen(true)}
            aria-label="更多功能"
          >
            <span className="nav-link__ico">
              <MoreIcon />
            </span>
            更多
          </button>
        </nav>
      )}

      {!isAuth && moreOpen && (
        <>
          <div className="more-backdrop" onClick={() => setMoreOpen(false)} />
          <div className="more-sheet" role="dialog" aria-label="全部功能">
            <div className="more-sheet__head">
              <span>全部功能</span>
              <button
                className="more-sheet__close"
                onClick={() => setMoreOpen(false)}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <div className="more-sheet__grid">
              {visibleMore.map((t) => {
                const Icon = t.icon;
                return (
                  <NavLink
                    key={t.to}
                    to={t.to}
                    end={t.end}
                    className={({ isActive }) => "more-item" + (isActive ? " active" : "")}
                    onClick={() => setMoreOpen(false)}
                  >
                    <span className="more-item__ico">
                      <Icon />
                    </span>
                    <span className="more-item__label">{t.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
      <AppShell />
    </AuthProvider>
  );
}
