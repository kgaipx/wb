import { useEffect, useState, useCallback } from "react";
import { Routes, Route, NavLink, Link, useLocation, useNavigate, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { setUnauthorizedHandler, api } from "./api/client";
import type { NotificationOut } from "./api/client";
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
import Assessment from "./pages/Assessment";

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

const tabs = [
  { to: "/", label: "首页", end: true, icon: HomeIcon },
  { to: "/learn", label: "学习", icon: BookIcon },
  { to: "/practice", label: "刷题", icon: PenIcon },
  { to: "/exam", label: "模考", icon: ExamIcon },
  { to: "/assessment", label: "测评", icon: AssessIcon },
  { to: "/wrong", label: "错题", icon: WrongIcon },
  { to: "/data", label: "数据", icon: ChartIcon },
  { to: "/profile", label: "我的", icon: UserIcon },
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

function formatNotifTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} 天前`;
  return d.toLocaleDateString("zh-CN");
}

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

  const openNotif = async (n: NotificationOut) => {
    setPanelOpen(false);
    if (!n.is_read) {
      try {
        await api.markNotificationRead(n.id);
        setUnread((u) => Math.max(0, u - 1));
      } catch {
        /* ignore */
      }
    }
    if (n.link) nav(n.link);
  };

  const readAll = async () => {
    try {
      await api.markAllNotificationsRead();
      setUnread(0);
      setNotifs((list) => list.map((x) => ({ ...x, is_read: true })));
    } catch {
      /* ignore */
    }
  };

  // 角色专属入口：审核台(reviewer/admin)、运营后台(admin) 注入底部导航
  const visibleTabs = [...tabs];
  if (user && (user.role === "reviewer" || user.role === "admin")) {
    visibleTabs.push({ to: "/review", label: "审核", icon: ShieldIcon });
  }
  if (user && user.role === "admin") {
    visibleTabs.push({ to: "/admin", label: "运营", icon: GaugeIcon });
  }

  return (
    <div className="app-shell">
      {!isAuth && (
        <header className="app-header">
          <div className="app-header__logo">公</div>
          <div className="app-header__name">AI 公考私教</div>
          <div className="app-header__tag">懂你短板 · 内容可信</div>
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
                  notifs.map((n) => (
                    <button
                      key={n.id}
                      className={"notif-item" + (n.is_read ? "" : " unread")}
                      onClick={() => openNotif(n)}
                    >
                      <div className="notif-item__title">{n.title}</div>
                      <div className="notif-item__body">{n.body}</div>
                      <div className="notif-time">{formatNotifTime(n.created_at)}</div>
                    </button>
                  ))
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

      <main className="app-main" style={isAuth ? { padding: 0, paddingBottom: 0 } : undefined}>
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
          <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
          <Route path="/chat" element={<RequireAuth><Chat /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {!isAuth && <FloatingTutor />}

      {!isAuth && (
        <nav className="nav-bar">
          {visibleTabs.map((t) => {
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
        </nav>
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
