import { Routes, Route, NavLink } from "react-router-dom";
import Home from "./pages/Home";
import Learn from "./pages/Learn";
import Practice from "./pages/Practice";
import Profile from "./pages/Profile";
import Exam from "./pages/Exam";

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

const tabs = [
  { to: "/", label: "首页", end: true, icon: HomeIcon },
  { to: "/learn", label: "学习", icon: BookIcon },
  { to: "/practice", label: "刷题", icon: PenIcon },
  { to: "/exam", label: "模考", icon: ExamIcon },
  { to: "/profile", label: "我的", icon: UserIcon },
];

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__logo">公</div>
        <div className="app-header__name">AI 公考私教</div>
        <div className="app-header__tag">懂你短板 · 内容可信</div>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/exam" element={<Exam />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </main>

      <nav className="nav-bar">
        {tabs.map((t) => {
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
    </div>
  );
}
