import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, Question } from "../api/client";

export default function Practice() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [list, setList] = useState<Question[]>([]);
  const [active, setActive] = useState<Question | null>(null);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<any>(null);
  const [explain, setExplain] = useState<string>("");
  const [cites, setCites] = useState<string[]>([]);
  const [faved, setFaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<string>("全部");
  const [upgrade, setUpgrade] = useState(false);

  useEffect(() => {
    api.bankList({ limit: 200 })
      .then((qs) => {
        setList(qs);
        const qid = params.get("q");
        if (qid) {
          const target = qs.find((q) => String(q.id) === qid);
          if (target) setActive(target);
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

  // 科目筛选
  const subjects = useMemo(() => {
    const set = new Set(list.map((q) => q.subject));
    return ["全部", ...Array.from(set)];
  }, [list]);
  const filtered = useMemo(
    () => (filter === "全部" ? list : list.filter((q) => q.subject === filter)),
    [list, filter]
  );

  function openQuestion(q: Question) {
    setActive(q);
    setSelected("");
    setResult(null);
    setExplain("");
    setUpgrade(false);
  }

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
    setErr("");
    setUpgrade(false);
    try {
      const r = await api.explain(active.id, selected || undefined);
      setExplain(r.explanation);
      setCites(r.citations);
    } catch (e: any) {
      if (e.status === 402) setUpgrade(true);
      else setErr(e.message);
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
          <div className="chip-row" style={{ marginBottom: 10 }}>
            {subjects.map((s) => (
              <button key={s} className={"chip " + (filter === s ? "chip--on" : "")} onClick={() => setFilter(s)}>
                {s}
              </button>
            ))}
          </div>
          {filtered.map((q) => (
            <button key={q.id} className="q-item" onClick={() => openQuestion(q)}>
              <div className="q-item__meta">
                <span className="tag tag--brand">{q.subject}</span>
                <span>{q.knowledge_point}</span>
                <span>· 难度 {q.difficulty}</span>
                {q.is_verified && <span className="tag tag--verified">✓ 已审核</span>}
              </div>
              <div className="q-item__stem">{q.stem}</div>
            </button>
          ))}
          {filtered.length === 0 && <div className="muted">该科目暂无题目</div>}
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

          {active.options.map((o) => {
            let cls = "opt";
            if (result) {
              if (o.label === result.correct_answer) cls += " opt--correct";
              else if (o.label === selected && !result.is_correct) cls += " opt--wrong";
              else if (selected === o.label) cls += " opt--selected";
            } else if (selected === o.label) {
              cls += " opt--selected";
            }
            return (
              <label key={o.id} className={cls}>
                <input
                  type="radio"
                  name="opt"
                  disabled={!!result}
                  checked={selected === o.label}
                  onChange={() => setSelected(o.label)}
                />
                <b>{o.label}.</b> <span>{o.content}</span>
              </label>
            );
          })}

          <div className="row" style={{ marginTop: 8, gap: 8 }}>
            <button className="btn btn--primary" style={{ flex: 1 }} disabled={busy || !selected || !!result} onClick={submit}>
              提交
            </button>
            <button className="btn btn--ghost" style={{ flex: 1 }} disabled={busy} onClick={askTutor}>
              AI 私教讲解
            </button>
          </div>

          {upgrade && (
            <div className="card card--warning" style={{ marginTop: 12 }}>
              <div className="muted" style={{ fontSize: 13 }}>
                免费版今日 AI 讲解额度已用完。升级会员解锁无限次 AI 私教讲解。
              </div>
              <button className="btn btn--primary btn--sm" style={{ marginTop: 8 }} onClick={() => nav("/membership")}>
                去升级 →
              </button>
            </div>
          )}

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
