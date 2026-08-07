import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ChatMessage, ChatSession } from "../api/client";
import Markdown from "../components/Markdown";

const SUGGESTIONS = [
  "类比推理总做错，怎么破？",
  "申论大作文开头怎么写更有气势？",
  "资料分析提速有什么套路？",
  "距离考试 30 天，怎么安排复习？",
];

const WELCOME =
  "我是你的 AI 公考私教 🤖 可以问我知识点、解题技巧、申论写法、复习规划。回答会尽量标注资料来源，离线时也能基于本地知识库给你建议。";

const LS_KEY = "activeChatSession";

export default function Chat() {
  const nav = useNavigate();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  // 挂载即恢复会话列表与上次会话（DB 为真相源，刷新不丢）
  useEffect(() => {
    api
      .chatSessions()
      .then((ss) => {
        setSessions(ss);
        const saved = Number(localStorage.getItem(LS_KEY));
        const target = ss.find((s) => s.id === saved) || ss[0];
        if (target) {
          setActiveId(target.id);
          loadMessages(target.id);
        }
      })
      .catch(() => setErr("加载会话失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, drawer]);

  function loadMessages(id: number) {
    api.chatMessages(id).then((msgs) => setMessages(msgs)).catch(() => setErr("加载消息失败"));
  }

  function selectSession(id: number) {
    if (id === activeId) {
      setDrawer(false);
      return;
    }
    setActiveId(id);
    localStorage.setItem(LS_KEY, String(id));
    setMessages([]);
    setDrawer(false);
    loadMessages(id);
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setErr("");
    setDrawer(false);
    localStorage.removeItem(LS_KEY);
  }

  async function doSend(sid: number, q: string) {
    const uid = -Date.now();
    setMessages((prev) => [...prev, { id: uid, role: "user", content: q }]);
    setInput("");
    setBusy(true);
    try {
      const r = await api.chatSend(sid, q);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== uid),
        { id: uid, role: "user", content: q },
        {
          id: r.message.id,
          role: "assistant",
          content: r.message.content || "",
          citations: r.message.citations,
          offline: r.message.offline,
          model: r.message.model,
          created_at: r.message.created_at,
        },
      ]);
      setSessions((prev) => {
        const next = prev.map((s) =>
          s.id === sid
            ? {
                ...s,
                title: r.title || s.title,
                updated_at: r.message.created_at || s.updated_at,
                message_count: (s.message_count || 0) + 2,
              }
            : s
        );
        return next.sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      });
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== uid));
      setErr(e.message || "对话失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setErr("");
    if (activeId == null) {
      try {
        const s = await api.chatCreate();
        setSessions((prev) => [s, ...prev]);
        setActiveId(s.id);
        localStorage.setItem(LS_KEY, String(s.id));
        await doSend(s.id, q);
      } catch (e: any) {
        setErr(e.message || "创建会话失败");
      }
    } else {
      await doSend(activeId, q);
    }
  }

  async function removeSession(id: number) {
    try {
      await api.chatDelete(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeId === id) newChat();
    } catch (e: any) {
      setErr(e.message || "删除失败");
    }
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const offline = lastAssistant?.offline ?? false;

  return (
    <section className="chat">
      <div className="chat__head">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="返回">
          ‹
        </button>
        <div className="chat__headinfo">
          <div className="chat__title">AI 公考私教</div>
          <div className="chat__status">{offline ? "离线检索模式" : "RAG 溯源 · 接通大模型"}</div>
        </div>
        <button
          className="iconbtn"
          onClick={() => setDrawer(true)}
          aria-label="历史对话"
          title="历史对话"
        >
          ☰
        </button>
        <button className="btn btn--ghost btn--sm" onClick={newChat}>
          新对话
        </button>
      </div>

      {/* 会话抽屉：历史切换 / 删除 */}
      {drawer && (
        <div className="chat-drawer" onClick={() => setDrawer(false)}>
          <div className="chat-drawer__panel" onClick={(e) => e.stopPropagation()}>
            <div className="chat-drawer__head">
              <strong>历史对话</strong>
              <button className="iconbtn" onClick={() => setDrawer(false)} aria-label="关闭">
                ×
              </button>
            </div>
            <div className="chat-drawer__list">
              {loading && sessions.length === 0 && (
                <div className="muted" style={{ padding: 12 }}>
                  加载中…
                </div>
              )}
              {!loading && sessions.length === 0 && (
                <div className="muted" style={{ padding: 12 }}>
                  还没有历史对话
                </div>
              )}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={"session-item" + (s.id === activeId ? " session-item--on" : "")}
                  onClick={() => selectSession(s.id)}
                >
                  <div className="session-item__main">
                    <div className="session-item__title">{s.title}</div>
                    <div className="session-item__meta">
                      {new Date(s.updated_at).toLocaleString("zh-CN", { hour12: false })} · {s.message_count} 条
                    </div>
                  </div>
                  <button
                    className="session-item__del"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSession(s.id);
                    }}
                    aria-label="删除会话"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
            <button
              className="btn btn--primary btn--block"
              style={{ marginTop: 10 }}
              onClick={() => {
                newChat();
              }}
            >
              ＋ 新建对话
            </button>
          </div>
        </div>
      )}

      <div className="chat__msgs">
        {loading && messages.length === 0 && (
          <div className="bubble bubble--assistant bubble--loading">加载对话…</div>
        )}

        {!loading && messages.length === 0 && activeId == null && (
          <div className="bubble bubble--assistant">{WELCOME}</div>
        )}

        {messages.map((m, i) => (
          <div key={m.id ?? i} className={`bubble bubble--${m.role}`}>
            {m.role === "assistant" ? <Markdown>{m.content}</Markdown> : m.content}
            {m.role === "assistant" && m.citations && m.citations.length > 0 && (
              <div className="chat__cite">
                <span className="muted">资料来源</span>
                {m.citations.map((c, ci) => (
                  <span key={ci} className="tag tag--soft">
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="bubble bubble--assistant bubble--loading">私教正在思考…</div>}
        {err && <div className="err-text">{err}</div>}
        <div ref={endRef} />
      </div>

      {!loading && messages.length === 0 && activeId == null && (
        <div className="chat__suggest">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>
              {s}
            </button>
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
