import { Routes, Route, NavLink } from "react-router-dom";
import Home from "./pages/Home";
import Learn from "./pages/Learn";
import Practice from "./pages/Practice";
import Profile from "./pages/Profile";

const tabs = [
  { to: "/", label: "首页", end: true },
  { to: "/learn", label: "学习" },
  { to: "/practice", label: "刷题" },
  { to: "/profile", label: "我的" },
];

export default function App() {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <main style={{ flex: 1, padding: 16 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </main>
      <nav style={{ display: "flex", borderTop: "1px solid #eee", position: "sticky", bottom: 0, background: "#fff" }}>
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            style={({ isActive }) => ({
              flex: 1,
              textAlign: "center",
              padding: "10px 0",
              textDecoration: "none",
              color: isActive ? "#2563eb" : "#666",
            })}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
