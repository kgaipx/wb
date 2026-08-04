import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Question } from "../api/client";

export default function Favorites() {
  const nav = useNavigate();
  const [list, setList] = useState<Question[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function refresh() {
    api.favoriteList().then(setList).catch((e) => setErr(e.message));
  }
  useEffect(() => {
    refresh();
  }, []);

  async function remove(qid: number) {
    setBusy(true);
    try {
      await api.favoriteRemove(qid);
      setList((prev) => prev.filter((q) => q.id !== qid));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="page-title">我的收藏</h2>
      <div className="card card--hint">
        把重点、易错、值得反复揣摩的题加入收藏，沉淀为你的个人备考清单。
      </div>
      {err && <div className="err-text">{err}</div>}

      {list.length === 0 && (
        <div className="muted" style={{ marginTop: 16 }}>
          还没有收藏。在「刷题」「模考」或「错题本」中可把题目加入收藏。
        </div>
      )}

      {list.map((q) => (
        <div key={q.id} className="card" style={{ marginTop: 12 }}>
          <div className="q-item__meta">
            <span className="tag tag--brand">{q.subject}</span>
            <span>{q.knowledge_point}</span>
            {q.is_verified && <span className="tag tag--verified">✓ 已审核</span>}
          </div>
          <div className="q-item__stem" style={{ marginTop: 6 }}>{q.stem}</div>
          <div className="row" style={{ marginTop: 8, gap: 8 }}>
            <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => nav(`/practice?q=${q.id}`)}>
              去练习
            </button>
            <button className="btn btn--ghost" style={{ flex: 1 }} disabled={busy} onClick={() => remove(q.id)}>
              取消收藏
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
