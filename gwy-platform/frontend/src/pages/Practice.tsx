import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, Question } from "../api/client";

export default function Practice() {
  const [params] = useSearchParams();
  const [list, setList] = useState<Question[]>([]);
  const [active, setActive] = useState<Question | null>(null);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<any>(null);
  const [explain, setExplain] = useState<string>("");
  const [cites, setCites] = useState<string[]>([]);
  const [faved, setFaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.bankList({ limit: 50 })
      .then((qs) => {
        setList(qs);
        const qid = params.get("q");
        if (qid) {
          const target = qs.find((q) => String(q.id) === qid);
          if (target) {
            setActive(target);
            return;
          }
        }
      })
      .catch((e) => setErr(e.message));
  }, [params]);

  useEffect(() => {
    if (!active) return;
    api
      .favoriteList()
      .then((favs) => setFaved(favs.some((f) => f.id === active.id)))
      .catch(() => setFaved(false));
  }, [active]);

  async function toggleFav() {
    if (!active) return;
    try {
      if (faved) await api.favoriteRemove(active.id);
      else await api.favoriteAdd(active.id);
      setFaved((v) => !v);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function submit() {
    if (!active || !selected) return;
    setBusy(true);
    setErr("");
    try {
      const r = await api.practice(active.id, selected);
      setResult(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function askTutor() {
    if (!active) return;
    setBusy(true);
    try {
      const r = await api.explain(active.id, selected || undefined);
      setExplain(r.explanation);
      setCites(r.citations);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="page-title">刷题练习</h2>
      {err && <div className="err-text">{err}</div>}

      {!active && (
        <div>
          {list.map((q) => (
            <button
              key={q.id}
              className="q-item"
              onClick={() => {
                setActive(q);
                setSelected("");
                setResult(null);
                setExplain("");
              }}
            >
              <div className="q-item__meta">
                <span className="tag tag--brand">{q.subject}</span>
                <span>{q.knowledge_point}</span>
                <span>· 难度 {q.difficulty}</span>
                {q.is_verified && <span className="tag tag--verified">✓ 已审核</span>}
              </div>
              <div className="q-item__stem">{q.stem}</div>
            </button>
          ))}
          {list.length === 0 && <div className="muted">题库加载中…</div>}
        </div>
      )}

      {active && (
        <div className="card">
          <button className="back-link" onClick={() => setActive(null)}>
            ← 返回题库
          </button>
          <div className="row row--between" style={{ marginBottom: 6 }}>
            <div className="q-item__meta">
              <span className="tag tag--brand">{active.subject}</span>
              <span>{active.knowledge_point}</span>
            </div>
            <button className={"chip " + (faved ? "chip--on" : "")} onClick={toggleFav}>
              {faved ? "★ 已收藏" : "☆ 收藏"}
            </button>
          </div>
          <div style={{ fontSize: 16, margin: "6px 0 12px" }}>{active.stem}</div>

          {active.options.map((o) => (
            <label key={o.id} className={"opt" + (selected === o.label ? " opt--selected" : "")}>
              <input type="radio" name="opt" checked={selected === o.label} onChange={() => setSelected(o.label)} />
              <b>{o.label}.</b> <span>{o.content}</span>
            </label>
          ))}

          <div className="row" style={{ marginTop: 8, gap: 8 }}>
            <button className="btn btn--primary" style={{ flex: 1 }} disabled={busy || !selected} onClick={submit}>
              提交
            </button>
            <button className="btn btn--ghost" style={{ flex: 1 }} disabled={busy} onClick={askTutor}>
              AI 私教讲解
            </button>
          </div>

          {result && (
            <div className={"result " + (result.is_correct ? "result--ok" : "result--bad")}>
              <b>{result.is_correct ? "✔ 答对" : `✘ 答错，正确答案：${result.correct_answer}`}</b>
              {result.explanation && <div style={{ marginTop: 6 }}>{result.explanation}</div>}
              <div className="text-3" style={{ marginTop: 6, fontSize: 12 }}>
                当前掌握度：{result.mastery}
              </div>
            </div>
          )}

          {explain && (
            <div className="tutor-box">
              <div className="tutor-box__title">AI 私教讲解</div>
              <div className="tutor-box__body">{explain}</div>
              {cites.length > 0 && <div className="tutor-box__cite">来源：{cites.join("；")}</div>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
