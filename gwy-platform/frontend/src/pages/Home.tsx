// 首页：定位 + 学习入口（占位，WBS 1.1 设计系统落地后细化）
export default function Home() {
  return (
    <section>
      <h1 style={{ fontSize: 22 }}>AI 公考私教</h1>
      <p style={{ color: "#555" }}>更懂你短板 · 内容可信 · 花钱无忧 · 陪你上岸</p>
      <div style={{ marginTop: 16, padding: 16, background: "#f5f8ff", borderRadius: 12 }}>
        <strong>今日推荐</strong>
        <p style={{ color: "#666", fontSize: 14 }}>（接入 WBS 3.2 自适应引擎后展示个性化弱项练习）</p>
      </div>
    </section>
  );
}
