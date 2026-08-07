import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, Question } from "../api/client";

const PAGE = 60;

export default function Practice() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [list, setList] = useState<Question[]>([]);
  const [active, setActive] = useState<Question | null>(null);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<any>(null);
  const [explain, setExplain] = useState<string>("");
  const [cites, setCites] = useState<string[]>([]);
  const [explainOffline, setExplainOffline] = useState<boolean>(false);
  const [faved, setFaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<string>("全部");
  const [kpFilter, setKpFilter] = useState<string>(""); // 测评弱项专项练习（按 knowledge_point）
  const kpAutoOpened = useRef(false);
  const [upgrade, setUpgrade] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const didInit = useRef(false);

  // 初始加载（含 ?q= 直达 / ?kp= 专项练习）
  useEffect(() => {
    setLoading(true);
    setErr("");
    const qid = params.get("q");
    const kp = params.get("kp");
    api
      .bankList({ limit: PAGE, offset: 0, knowledge_point: kp || undefined })
      .then((qs) => {
        setList(qs);
        setOffset(qs.length);
        setHasMore(qs.length === PAGE);
        if (qid) {
          const target = qs.find((q) => String(q.id) === qid);
          if (target) setActive(target);
        }
        if (kp) {
          setKpFilter(kp);
          kpAutoOpened.current = false;
        }
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [params]);

  // 科目 / 弱项筛选变化 → 重新拉第一页（跳过挂载初值）
  useEffect(() => {
    if (!didInit.current) {
      didInit.current = true;
      return;
    }
    if (active) return; // 做题中不重拉
    setLoading(true);
    setErr("");
    api
      .bankList({
        limit: PAGE,
        offset: 0,
        subject: filter !== "全部" ? filter : undefined,
        knowledge_point: kpFilter || undefined,
      })
      .then((qs) => {
        setList(qs);
        setOffset(qs.length);
        setHasMore(qs.length === PAGE);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [filter, kpFilter]);

  useEffect(() => {
    if (!active) return;
    api
      .favoriteList()
      .then((favs) => setFaved(favs.some((f) => f.id === active.id)))
      .catch(() => setFaved(false));
  }, [active]);

  // 从测评弱项进入：自动打开第一道专项题（每轮 kp 仅触发一次）
  useEffect(() => {
    if (kpFilter && !kpAutoOpened.current && !active && list.length) {
      kpAutoOpened.current = true;
      setActive(list[0]);
    }
  }, [kpFilter, list, active]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setErr("");
    try {
      const qs = await api.bankList({
        limit: PAGE,
        offset,
        subject: filter !== "全部" ? filter : undefined,
        knowledge_point: kpFilter || undefined,
      });
      setList((prev) => [...prev, ...qs]);
      setOffset((o) => o + qs.length);
      setHasMore(qs.length === PAGE);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoadingMore(false);
    }
  }

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
      setExplainOffline(!!r.offline);
    } catch (e: any) {
      if (e.status === 402) setUpgrade(true);
      else setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  // 下一题：在当前（已筛选）列表内顺序推进；到末尾且还有更多则先翻页再继续
  async function nextQuestion() {
    if (!active) return;
    const idx = list.findIndex((q) => q.id === active.id);
    if (idx >= 0 && idx + 1 < list.length) {
      openQuestion(list[idx + 1]);
      return;
    }
    if (hasMore && !loadingMore) {
      const qs = await api
        .bankList({
          limit: PAGE,
          offset,
          subject: filter !== "全部" ? filter : undefined,
          knowledge_point: kpFilter || undefined,
        })
        .catch(() => []);
      if (qs.length) {
        setList((prev) => [...prev, ...qs]);
        setOffset((o) => o + qs.length);
        setHasMore(qs.length === PAGE);
        openQuestion(qs[0]);
        return;
      }
    }
    // 没有更多题：回到题库列表
    setActive(null);
  }

  const subjects = useMemo(() => {
    const set = new Set(list.map((q) => q.subject));
    return ["全部", ...Array.from(set)];
  }, [list]);

  const nextLabel = (() => {
    if (!active) return "下一题 →";
    const idx = list.findIndex((q) => q.id === active.id);
    if (idx >= 0 && idx + 1 < list.length) return "下一题 →";
    if (hasMore) return "加载更多并继续 →";
    return "已到末尾 · 返回题库";
  })();

  return (
    <section>
      <h2 className="page-title">刷题练习</h2>
      {err && <div className="err-text">{err}</div>}

      {!active && (
        <div>
          {kpFilter && (
            <div className="filter-banner">
              正在专项练习薄弱点：<b>{kpFilter}</b>
              <button
                className="link-btn"
                onClick={() => {
                  setKpFilter("");
                  kpAutoOpened.current = false;
                }}
              >
                清除筛选
              </button>
            </div>
          )}
          <div className="chip-row" style={{ marginBottom: 10 }}>
            {subjects.map((s) => (
              <button key={s} className={"chip " + (filter === s ? "chip--on" : "")} onClick={() => setFilter(s)}>
                {s}
              </button>
            ))}
          </div>
          {list.map((q) => (
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
          {list.length === 0 && (loading ? <div className="muted">加载中…</div> : <div className="muted">该科目暂无题目</div>)}
          {hasMore && (
            <button className="btn btn--ghost btn--block" style={{ marginTop: 14 }} disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? "加载中…" : "加载更多"}
            </button>
          )}
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
                当前掌握度：{Math.round((result.mastery ?? 0) * 100)}%
              </div>
              <button className="btn btn--primary btn--block" style={{ marginTop: 10 }} disabled={busy} onClick={nextQuestion}>
                {nextLabel}
              </button>
            </div>
          )}

          {explain && (
            <div className="tutor-box">
              <div className="tutor-box__title">
                AI 私教讲解
                {explainOffline && <span className="badge badge--warn">离线模式</span>}
              </div>
              <div className="tutor-box__body">{explain}</div>
              {cites.length > 0 && <div className="tutor-box__cite">来源：{cites.join("；")}</div>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
