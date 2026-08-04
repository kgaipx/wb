import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ChatMessage, ChatReply } from "../api/client";

const SUGGESTIONS = [
  "类比推理总做错，怎么破？",
  "申论大作文开头怎么写更有气势？",
  "资料分析提速有什么套路？",
  "距离考试 30 天，怎么安排复习？",
];

const WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "我是你的 AI 公考私教 🤖 可以问我知识点、解题技巧、申论写法、复习规划。回答会尽量标注资料来源，离线时也能基于本地知识库给你建议。",
};

export default function Chat() {
  const nav = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [lastReply, setLastReply] = useState<ChatReply | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setErr("");
    const next: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const reply = await api.chat(next.slice(1)); // 不含欢迎语
      setLastReply(reply);
      setMessages([...next, { role: "assistant", content: reply.answer }]);
    } catch (e: any) {
      setErr(e.message || "对话失败，请稍后再试");
      setMessages([...next, { role: "assistant", content: "（连接出错，请稍后再试）" }]);
    } finally {
      setBusy(false);
    }
  }

  const citations = lastReply?.citations?.filter(Boolean) ?? [];

  return (
    <section className="chat">
      <div className="chat__head">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="返回">
          ‹
        </button>
        <div>
          <div className="chat__title">AI 公考私教</div>
          <div className="chat__status">{lastReply?.offline ? "离线检索模式" : "RAG 溯源 · 接通大模型"}</div>
        </div>
      </div>

      <div className="chat__msgs">
        {messages.map((m, i) => (
          <div key={i} className={`bubble bubble--${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="bubble bubble--assistant bubble--loading">私教正在思考…</div>}
        {err && <div className="err-text">{err}</div>}
        <div ref={endRef} />
      </div>

      {messages.length <= 1 && (
        <div className="chat__suggest">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}

      {citations.length > 0 && (
        <div className="chat__cite">
          <span className="muted">资料来源</span>
          {citations.map((c, i) => (
            <span key={i} className="tag tag--soft">
              {c}
            </span>
          ))}
        </div>
      )}

      <div className="chat__input">
        <textarea
          className="input"
          rows={1}
          placeholder="问点什么，例如：资料分析怎么提速？"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button className="btn btn--primary chat__send" disabled={busy || !input.trim()} onClick={() => send(input)}>
          发送
        </button>
      </div>
    </section>
  );
}
