import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, Ability, ChatMessage, ChatSession } from "../api/client";
import Markdown from "../components/Markdown";
import CiteCards from "../components/CiteCards";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { ChartIcon, TargetIcon, CompassIcon } from "../icons";

const SUGGESTIONS = [
  "类比推理总做错，怎么破？",
  "申论大作文开头怎么写更有气势？",
  "资料分析提速有什么套路？",
  "距离考试 30 天，怎么安排复习？",
];

const WELCOME =
  "我是你的 AI 公考私教，可以问我知识点、解题技巧、申论写法、复习规划。回答会尽量标注资料来源，离线时也能基于本地知识库给你建议。";

const LS_KEY = "activeChatSession";

export default function Chat() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const didAutoSend = useRef(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const [weak, setWeak] = useState<Ability[]>([]);
  const [profileReady, setProfileReady] = useState(false);

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
        // 测评/其他页跳转过来的预填问题：自动开新会话并发问（如 /chat?q=帮我讲讲数量关系怎么提分）
        const q = params.get("q");
        if (q && !didAutoSend.current) {
          didAutoSend.current = true;
          setActiveId(null);
          localStorage.removeItem(LS_KEY);
          void send(q);
        }
      })
      .catch(() => setErr("加载会话失败"))
      .finally(() => setLoading(false));

  // 拉取学员能力画像（最弱知识点），让私教对话首屏即可针对性引导
  api
    .studentStats()
    .then((st) => {
      if (st?.ability?.length) setWeak(st.ability.slice(0, 5));
      setProfileReady(true);
    })
    .catch(() => {
      setProfileReady(true);
      /* 画像缺失不影响对话主流程 */
    });
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

  async function doSend(sid: number, q: string, kpHint?: string) {
    const uid = -Date.now();
    setMessages((prev) => [...prev, { id: uid, role: "user", content: q }]);
    setInput("");
    setBusy(true);
    try {
      const r = await api.chatSend(sid, q, kpHint);
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

  async function send(text: string, kpHint?: string) {
    const q = text.trim();
    if (!q || busy) return;
    setErr("");
    if (activeId == null) {
      try {
        const s = await api.chatCreate();
        setSessions((prev) => [s, ...prev]);
        setActiveId(s.id);
        localStorage.setItem(LS_KEY, String(s.id));
        await doSend(s.id, q, kpHint);
      } catch (e: any) {
        setErr(e.message || "创建会话失败");
      }
    } else {
      await doSend(activeId, q, kpHint);
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

  function startRename(s: ChatSession) {
    setConfirmId(null);
    setEditId(s.id);
    setEditText(s.title);
  }
  function cancelRename() {
    setEditId(null);
    setEditText("");
  }
  async function saveRename(s: ChatSession) {
    const t = editText.trim();
    if (!t || t === s.title) {
      cancelRename();
      return;
    }
    try {
      const updated = await api.chatRename(s.id, t);
      setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, title: updated.title } : x)));
      setEditId(null);
      setEditText("");
    } catch (e: any) {
      setErr(e.message || "重命名失败");
      cancelRename();
    }
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const offline = lastAssistant?.offline ?? false;
  // 最弱知识点：用于首条建议聚焦 + 头部个性化提示
  const TOP_WEAK = weak[0] ?? null;
  const statusText = offline
    ? "离线检索模式"
    : weak.length
    ? `个性化私教 · 已结合 ${weak.length} 个薄弱点`
    : "RAG 溯源 · 接通大模型";

  return (
    <section className="chat">
      <div className="chat__head">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="返回">
          ‹
        </button>
        <div className="chat__headinfo">
          <div className="chat__title">AI 公考私教</div>
          <div
            className="chat__status"
            title={weak.length ? "私教已读取你的能力画像，会优先针对最薄弱知识点给建议" : undefined}
          >
            {weak.length > 0 && <TargetIcon />}
            {statusText}
          </div>
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
                <div className="sk-stack" style={{ padding: 12, gap: 10 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <div className="sk-row" key={i}>
                      <div className="sk sk-circle" style={{ width: 36, height: 36 }} />
                      <div style={{ flex: 1 }}>
                        <div className="sk sk-line" style={{ width: "70%" }} />
                        <div className="sk sk-line" style={{ width: "45%", height: 10 }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!loading && sessions.length === 0 && (
                <EmptyState tight icon="chat" title="还没有历史对话" desc="开启一段新对话，AI 私教会记住你的薄弱点。" style={{ paddingTop: 28, paddingBottom: 28 }} />
              )}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={"session-item" + (s.id === activeId ? " session-item--on" : "")}
                  onClick={() => selectSession(s.id)}
                >
                  <div className="session-item__main">
                    {editId === s.id ? (
                      <input
                        className="session-item__edit"
                        value={editText}
                        autoFocus
                        onChange={(e) => setEditText(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename(s);
                          if (e.key === "Escape") cancelRename();
                        }}
                        onBlur={() => saveRename(s)}
                      />
                    ) : (
                      <div className="session-item__title">{s.title}</div>
                    )}
                    {s.last_message && editId !== s.id && (
                      <div className="session-item__preview">{s.last_message}</div>
                    )}
                    <div className="session-item__meta">
                      {new Date(s.updated_at).toLocaleString("zh-CN", { hour12: false })} · {s.message_count} 条
                    </div>
                  </div>
                  {editId === s.id ? (
                    <>
                      <button
                        className="session-item__confirm"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          saveRename(s);
                        }}
                      >
                        保存
                      </button>
                      <button
                        className="session-item__cancel"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelRename();
                        }}
                      >
                        取消
                      </button>
                    </>
                  ) : confirmId === s.id ? (
                    <>
                      <button
                        className="session-item__confirm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmId(null);
                          removeSession(s.id);
                        }}
                      >
                        确认
                      </button>
                      <button
                        className="session-item__cancel"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmId(null);
                        }}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="session-item__rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(s);
                        }}
                        aria-label="重命名会话"
                        title="重命名会话"
                      >
                        ✏️
                      </button>
                      <button
                        className="session-item__del"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmId(s.id);
                        }}
                        aria-label="删除会话"
                        title="删除会话"
                      >
                        🗑
                      </button>
                    </>
                  )}
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

        {!loading && messages.length === 0 && activeId == null && weak.length > 0 && (
          <div className="bubble bubble--assistant profile-card">
            <div className="profile-card__title"><ChartIcon /> 私教已了解你的薄弱点</div>
            <div className="profile-card__desc">
              依据你的练习数据，以下知识点掌握度偏低。点选其一，私教会给出针对性突破建议：
            </div>
            <div className="chip-row">
              {weak.map((w) => (
                <button
                  key={w.knowledge_point}
                  className="chip chip--click chip--btn"
                  onClick={() => send(`帮我重点突破「${w.knowledge_point}」这个知识点`, w.knowledge_point)}
                  disabled={busy}
                >
                  {w.knowledge_point}
                  <span className="profile-card__pct">{Math.round(w.mastery * 100)}%</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && messages.length === 0 && activeId == null && profileReady && weak.length === 0 && (
          <div className="bubble bubble--assistant profile-card">
            <div className="profile-card__title"><CompassIcon /> 让私教更懂你</div>
            <div className="profile-card__desc">
              完成几道题或一次能力测评后，私教会结合你的薄弱点给出针对性突破建议。
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={m.id ?? i} className={`bubble bubble--${m.role}`}>
            {m.role === "assistant" ? <Markdown>{m.content}</Markdown> : m.content}
            {m.role === "assistant" && m.citations && m.citations.length > 0 && (
              <CiteCards cites={m.citations} />
            )}
          </div>
        ))}
        {busy && <div className="bubble bubble--assistant bubble--loading">私教正在思考…</div>}
        {err && <div className="err-text">{err}</div>}
        <div ref={endRef} />
      </div>

      {!loading && messages.length === 0 && activeId == null && (
        <div className="chat__suggest">
          {(TOP_WEAK
            ? [`帮我重点突破「${TOP_WEAK.knowledge_point}」这个知识点`, ...SUGGESTIONS.slice(1, 4)]
            : SUGGESTIONS
          ).map((s, i) => (
            <button
              key={s}
              className="chip"
              onClick={() => {
                const isFocus = TOP_WEAK != null && i === 0;
                send(s, isFocus ? TOP_WEAK!.knowledge_point : undefined);
              }}
              disabled={busy}
            >
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
          onFocus={(e) => {
            const el = e.currentTarget;
            // iOS 键盘弹起后把输入框滚到可视区，避免被键盘遮挡（真机时序微调仍待真机验证）
            setTimeout(() => el.scrollIntoView({ block: "center" }), 300);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button className={"btn btn--primary chat__send" + (busy ? " btn--loading" : "")} disabled={busy || !input.trim()} onClick={() => send(input)}>
          {busy && <Spinner size={15} />}
          发送
        </button>
      </div>
    </section>
  );
}
