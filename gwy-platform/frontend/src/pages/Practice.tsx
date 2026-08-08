import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, Question, Citation } from "../api/client";
import Markdown from "../components/Markdown";
import MasteryBadge from "../components/MasteryBadge";
import CiteCards from "../components/CiteCards";

const PAGE = 60;

export default function Practice() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [list, setList] = useState<Question[]>([]);
  const [active, setActive] = useState<Question | null>(null);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<any>(null);
  const [explain, setExplain] = useState<string>("");
  const [cites, setCites] = useState<Citation[]>([]);
  const [explainOffline, setExplainOffline] = useState<boolean>(false);
  const [faved, setFaved] = useState(false);
  const [favTags, setFavTags] = useState<string[]>([]); // 当前题的收藏标签（易错/重点）
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<string>("全部");
  const [kpFilter, setKpFilter] = useState<string>(""); // 测评弱项专项练习（按 knowledge_point）
  const kpAutoOpened = useRef(false);
  const [upgrade, setUpgrade] = useState(false);
  const [streak, setStreak] = useState(0); // 连续答对计数（激励）
  const [encourage, setEncourage] = useState(""); // 答对/中断浮动鼓励文案
  const encourageTimer = useRef<number | null>(null);
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
          if (target) {
            setActive(target);
          } else {
            // 目标题不在首页（题库共数千题、每页 60）：单独按 id 拉取，确保深链复盘闭环可靠打开
            api
              .bankGet(Number(qid))
              .then((q) => setActive(q))
              .catch(() => {});
          }
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
      .then((favs) => {
        const cur = favs.find((f) => f.question.id === active.id);
        setFaved(!!cur);
        setFavTags(cur ? cur.tags : []);
      })
      .catch(() => {
        setFaved(false);
        setFavTags([]);
      });
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

  async function favAndSkip() {
    if (!active) return;
    if (!faved) {
      try {
        await api.favoriteAdd(active.id);
        setFaved(true);
      } catch (e: any) {
        setErr(e.message);
      }
    }
    await nextQuestion();
  }

  // 收藏标签快捷切换（易错/重点）：确保已收藏后再 PATCH tags，本地即时反映
  async function toggleFavTag(tag: "易错" | "重点") {
    if (!active) return;
    try {
      if (!faved) {
        await api.favoriteAdd(active.id);
        setFaved(true);
      }
      const next = favTags.includes(tag)
        ? favTags.filter((t) => t !== tag)
        : [...favTags, tag];
      await api.favoriteUpdate(active.id, { tags: next });
      setFavTags(next);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  function flashEncourage(msg: string) {
    setEncourage(msg);
    if (encourageTimer.current) window.clearTimeout(encourageTimer.current);
    encourageTimer.current = window.setTimeout(() => setEncourage(""), 2200);
  }

  async function submit() {
    if (!active || !selected) return;
    setBusy(true);
    setErr("");
    try {
      const r = await api.practice(active.id, selected);
      setResult(r);
      if (r.is_correct) {
        const ns = streak + 1;
        setStreak(ns);
        if (ns >= 3) {
          flashEncourage(ns % 10 === 0 ? `🔥 连续答对 ${ns} 题，手感火热，继续！` : `连续答对 ${ns} 题，保持节奏`);
        }
      } else {
        if (streak >= 3) flashEncourage("连续答对中断，别急，复盘后再战！");
        setStreak(0);
      }
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
            <div
              key={q.id}
              className="q-item"
              role="button"
              tabIndex={0}
              onClick={() => openQuestion(q)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openQuestion(q);
                }
              }}
            >
              <div className="q-item__meta">
                <span className="tag tag--brand">{q.subject}</span>
                <span>{q.knowledge_point}</span>
                <span>· 难度 {q.difficulty}</span>
                {q.is_verified && <span className="tag tag--verified">✓ 已审核</span>}
              </div>
              <div className="q-item__stem">{q.stem}</div>
            </div>
          ))}
          {list.length === 0 && (loading ? (
            <div className="sk-card" style={{ marginTop: 8 }}>
              <div className="sk-head">
                <div className="sk sk-circle" style={{ width: 30, height: 30 }} />
                <div className="sk sk-line" style={{ width: "40%" }} />
              </div>
              <div className="sk sk-line" style={{ width: "100%" }} />
              <div className="sk sk-line" style={{ width: "88%" }} />
              <div className="sk sk-line" style={{ width: "70%" }} />
            </div>
          ) : (
            <div className="empty empty--tight">
              <div className="empty__icon">📚</div>
              <div className="empty__title">该科目暂无题目</div>
            </div>
          ))}
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
          {encourage && (
            <div className="streak-toast" onClick={() => setEncourage("")}>{encourage}</div>
          )}
          {streak >= 2 && (
            <div className="streak-badge" key={streak}>
              🔥 连续答对 {streak} 题
            </div>
          )}
          <div className="row row--between" style={{ marginBottom: 6 }}>
            <div className="q-item__meta">
              <span className="tag tag--brand">{active.subject}</span>
              <span>{active.knowledge_point}</span>
            </div>
            <div className="fav-quicktags">
              <button className={"chip " + (faved ? "chip--on" : "")} onClick={toggleFav}>
                {faved ? "★ 已收藏" : "☆ 收藏"}
              </button>
              {faved && (
                <button
                  className={"chip chip--danger " + (favTags.includes("易错") ? "chip--on" : "")}
                  onClick={() => toggleFavTag("易错")}
                  title="标记为易错题"
                >
                  🔴 易错
                </button>
              )}
              {faved && (
                <button
                  className={"chip chip--warn " + (favTags.includes("重点") ? "chip--on" : "")}
                  onClick={() => toggleFavTag("重点")}
                  title="标记为重点题"
                >
                  🟡 重点
                </button>
              )}
            </div>
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

          {!result && (
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button className="btn btn--ghost" disabled={busy} onClick={nextQuestion}>
                跳过本题 →
              </button>
              <button className="btn btn--ghost" disabled={busy} onClick={favAndSkip}>
                收藏并跳过 →
              </button>
            </div>
          )}

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
              <div className="result__head">
                <div>
                  <b>{result.is_correct ? "✔ 答对" : `✘ 答错，正确答案：${result.correct_answer}`}</b>
                  <div className="text-3" style={{ marginTop: 4, fontSize: 12 }}>
                    {result.is_correct ? "这一知识点又稳了一分" : "别担心，下方可看 AI 讲解复盘"}
                  </div>
                </div>
                <MasteryBadge value={result.mastery ?? 0} />
              </div>
              {result.explanation && (
                <div style={{ marginTop: 8 }}>
                  <Markdown>{result.explanation}</Markdown>
                </div>
              )}
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
              <div className="tutor-box__body"><Markdown>{explain}</Markdown></div>
              {cites.length > 0 && <CiteCards cites={cites} />}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
