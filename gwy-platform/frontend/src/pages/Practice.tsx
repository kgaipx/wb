import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, Question, Citation, Ability, PracticeResult } from "../api/client";
import Markdown from "../components/Markdown";
import MasteryBadge from "../components/MasteryBadge";
import CiteCards from "../components/CiteCards";
import { RadarChart } from "../components/RadarChart";
import ExplainModal from "../components/ExplainModal";
import EmptyState from "../components/EmptyState";
import Spinner from "../components/Spinner";
import Reveal from "../components/Reveal";
import { TargetIcon, SearchIcon, BrainIcon } from "../icons";

const PAGE = 60;

export default function Practice() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [list, setList] = useState<Question[]>([]);
  const [active, setActive] = useState<Question | null>(null);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<PracticeResult | null>(null);
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
  const [explainId, setExplainId] = useState<number | null>(null); // 题库浏览态「看解析」浮层
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ability, setAbility] = useState<Ability[]>([]); // 练习后最新能力概览（弱项升序最多 8），用于结果页雷达
  const didInit = useRef(false);
  const [mode, setMode] = useState<"practice" | "retry">("practice"); // retry=错题/收藏智能重练
  const [retryCount, setRetryCount] = useState(0);
  const [sessAnswered, setSessAnswered] = useState(0); // 本轮已判分题数（不含跳过）
  const [sessCorrect, setSessCorrect] = useState(0); // 本轮答对题数

  // 初始加载（含 ?q= 直达 / ?kp= 专项练习 / ?ids= 错题本智能重练）
  useEffect(() => {
    setLoading(true);
    setErr("");
    const qid = params.get("q");
    const kp = params.get("kp");
    const idsParam = params.get("ids");
    const ids = idsParam ? idsParam.split(",").map(Number).filter((n) => !Number.isNaN(n)) : [];
    const isRetry = ids.length > 0;
    setMode(isRetry ? "retry" : "practice");
    if (isRetry) setRetryCount(ids.length);
    api
      .bankList({
        limit: isRetry ? 500 : PAGE,
        offset: 0,
        ids: isRetry ? ids : undefined,
        knowledge_point: !isRetry && kp ? kp : undefined,
      })
      .then((qs) => {
        setList(qs);
        setOffset(qs.length);
        setHasMore(!isRetry && qs.length === PAGE);
        if (!isRetry && qid) {
          const target = qs.find((q) => String(q.id) === qid);
          if (target) {
            setActive(target);
          } else {
            // 目标题不在首页（题库共数千题、每页 60）：单独按 id 拉取，确保深链复盘闭环可靠打开
            // 同时并入 list，修复「第 0/N 题」序号错误，并让「下一题」能在本题库续做
            api
              .bankGet(Number(qid))
              .then((q) => {
                setList((prev) => (prev.some((x) => x.id === q.id) ? prev : [...prev, q]));
                setActive(q);
              })
              .catch(() => {});
          }
        }
        if (!isRetry && kp) {
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
    if (mode === "retry") return; // 重练模式不响应科目/弱项筛选，保持题集稳定
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

  // 键盘快捷键：刷题场景高频操作（A/B/C/D 或 1-4 选择，Enter 提交/下一题，Esc 取消选择）
  // 仅在打开单题时生效；文本输入（含文本框）不拦截，避免与输入冲突。
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const tag = (el?.tagName || "").toUpperCase();
      const isText =
        tag === "TEXTAREA" ||
        (tag === "INPUT" && (el as HTMLInputElement).type === "text");
      if (isText) return; // 文本输入中不拦截按键

      const k = e.key.toLowerCase();
      if (!result) {
        // 作答阶段
        const map: Record<string, string> = {
          a: "A", b: "B", c: "C", d: "D", e: "E",
          "1": "A", "2": "B", "3": "C", "4": "D", "5": "E",
        };
        if (map[k]) {
          e.preventDefault();
          setSelected(map[k]);
          return;
        }
        if (k === "enter") {
          if (tag === "BUTTON") return; // 让提交按钮自身的回车（原生点击）生效，避免重复提交
          e.preventDefault();
          if (selected && !busy) submit();
          return;
        }
        if (k === "escape") {
          e.preventDefault();
          setSelected("");
          return;
        }
      } else {
        // 已作答阶段：Enter / 空格 进入下一题
        if (k === "enter" || k === " ") {
          if (tag === "BUTTON") return; // 避免与「下一题」按钮原生回车重复触发
          e.preventDefault();
          if (!busy) nextQuestion();
          return;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, result, selected, busy, submit, nextQuestion]);

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
    setAbility([]);
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

  // 收藏标签快捷切换（易错/重点/已掌握）：确保已收藏后再 PATCH tags，本地即时反映
  async function toggleFavTag(tag: "易错" | "重点" | "已掌握") {
    if (!active) return;
    const needAdd = !faved;
    try {
      if (needAdd) {
        await api.favoriteAdd(active.id);
        setFaved(true);
      }
      const next = favTags.includes(tag)
        ? favTags.filter((t) => t !== tag)
        : [...favTags, tag];
      await api.favoriteUpdate(active.id, { tags: next });
      setFavTags(next);
    } catch (e: any) {
      // 仅在本次调用内新增的收藏若标签更新失败，回滚 faved，避免「已收藏」假阳性
      if (needAdd) setFaved(false);
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
      // 作答后把焦点从（已禁用的）提交按钮移开，确保「Enter 进入下一题」键盘流不被吞掉
      try {
        (document.activeElement as HTMLElement | null)?.blur?.();
      } catch {
        /* ignore */
      }
      // 拉取练习后最新能力概览（弱项升序最多 8），用于结果页雷达；匿名或接口失败静默跳过
      try {
        const s = await api.studentStats();
        setAbility(s.ability || []);
      } catch {
        setAbility([]);
      }
      if (r.skipped) {
        // 暂无标准答案：不计入连续答对，也不打断连对，也不计入本轮统计
      } else {
        setSessAnswered((n) => n + 1);
        if (r.is_correct) setSessCorrect((n) => n + 1);
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
    // 没有更多题：重练模式回到错题本，常规模式回到题库列表
    if (mode === "retry") {
      nav("/wrong");
    } else {
      setActive(null);
    }
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

  const idxInList = active ? list.findIndex((q) => q.id === active.id) : -1;

  return (
    <section>
      <h2 className="page-title">刷题练习</h2>
      {mode === "retry" && (
        <div className="filter-banner">
          <span><TargetIcon /> 智能重练 · 共 <b>{retryCount}</b> 题（来自错题本）</span>
          <button className="link-btn" onClick={() => nav("/wrong")}>← 返回错题本</button>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            按错误优先级出题，练完可在错题本将答对的题标记为「已掌握」移出。
          </div>
        </div>
      )}
      {err && <div className="err-text">{err}</div>}

      {!active && (
        <div>
          {kpFilter && (
            <div className="filter-banner">
              <span>正在专项练习薄弱点：</span>
              <span className="chip-row" style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, verticalAlign: "middle" }}>
                {kpFilter.includes(",")
                  ? kpFilter.split(",").map((k) => (
                      <span key={k} className="chip chip--warn">
                        {k.trim()}
                      </span>
                    ))
                  : <b>{kpFilter}</b>}
              </span>
              <button
                className="link-btn"
                onClick={() => {
                  setKpFilter("");
                  kpAutoOpened.current = false;
                }}
              >
                清除筛选
              </button>
              <div className="muted smart-sort-note" style={{ fontSize: 12, marginTop: 6 }}>
                <BrainIcon /> 间隔重复式智能排序：优先练习「最薄弱 × 久未练 × 易错」的知识点，并把高频错题排在前面复盘。
              </div>
            </div>
          )}
          {mode === "practice" && (
          <div className="chip-row" style={{ marginBottom: 10 }}>
            {subjects.map((s) => (
              <button key={s} className={"chip " + (filter === s ? "chip--on" : "")} onClick={() => setFilter(s)}>
                {s}
              </button>
            ))}
          </div>
          )}
          {list.map((q) => (
            <Reveal key={q.id}>
              <div
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
                <div className="q-item__foot">
                  <button
                    className="link-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExplainId(q.id);
                    }}
                  >
                    看解析 <SearchIcon />
                  </button>
                </div>
              </div>
            </Reveal>
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
            <EmptyState tight icon="book" title="该科目暂无题目" />
          ))}
          {hasMore && (
            <button className={"btn btn--ghost btn--block" + (loadingMore ? " btn--loading" : "")} style={{ marginTop: 14 }} disabled={loadingMore} onClick={loadMore}>
              {loadingMore && <Spinner size={15} />}
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
          <div className="practice-pos">
            <span className="muted" style={{ fontSize: 12 }}>
              {mode === "retry"
                ? <><TargetIcon /> 智能重练 · 第 ${idxInList >= 0 ? idxInList + 1 : "?"} / ${retryCount} 题</>
                : `第 ${idxInList + 1} / ${list.length} 题${hasMore ? "（题库还有更多）" : ""}`}
              {sessAnswered > 0 && (
                <span style={{ marginLeft: 8 }}>
                  · 本轮已答 {sessAnswered} · 正确率 {Math.round((sessCorrect / sessAnswered) * 100)}%
                </span>
              )}
            </span>
          </div>
          {encourage && (
            <div className="streak-toast" onClick={() => setEncourage("")}>{encourage}</div>
          )}
          {streak >= 2 && (
            <div className="streak-badge" key={streak}>
              🔥 连续答对 {streak} 题
            </div>
          )}
          <div className="row row--between" style={{ marginBottom: 6, flexWrap: "wrap" }}>
            <div className="q-item__meta" style={{ minWidth: 0, flex: 1 }}>
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
              {faved && (
                <button
                  className={"chip chip--ok " + (favTags.includes("已掌握") ? "chip--on" : "")}
                  onClick={() => toggleFavTag("已掌握")}
                  title="标记为已掌握"
                >
                  🟢 已掌握
                </button>
              )}
            </div>
          </div>
          <div className="q-stem">{active.stem}</div>

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
                <span className="opt__badge">{o.label}</span>
                <span className="opt__text">{o.content}</span>
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
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              ⌨️ 快捷键：<b>A–D</b> 选择 · <b>Enter</b> 提交 · <b>Esc</b> 取消选择
            </div>
          )}
          {result && (
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              ⌨️ 快捷键：<b>Enter</b> 进入下一题
            </div>
          )}

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
            <div className={"result " + (result.is_correct ? "result--ok" : result.skipped ? "result--skip" : "result--bad")}>
              <div className="result__head">
                <div>
                  {result.skipped ? (
                    <span className="verdict verdict--skip">⚠ 本题暂无标准答案，已跳过</span>
                  ) : result.is_correct ? (
                    <span className="verdict verdict--ok">✔ 答对</span>
                  ) : (
                    <span className="verdict verdict--bad">{`✘ 答错，正确答案：${result.correct_answer ?? ""}`}</span>
                  )}
                  <div className="text-3" style={{ marginTop: 4, fontSize: 12 }}>
                    {result.skipped
                      ? "该题为题库暂缺标准答案，不影响你的正确率统计"
                      : result.is_correct
                      ? "这一知识点又稳了一分"
                      : "别担心，下方可看 AI 讲解复盘"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <MasteryBadge value={result.mastery ?? 0} />
                  {(() => {
                    const before = result.mastery_before ?? 0;
                    const after = result.mastery ?? 0;
                    const delta = Math.round((after - before) * 100);
                    const cls = delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-3";
                    const arrow = delta > 0 ? "▲ +" : delta < 0 ? "▼ " : "— ";
                    return (
                      <div className={cls} style={{ fontSize: 12, marginTop: 2 }}>
                        {Math.round(before * 100)}% → {Math.round(after * 100)}% · {arrow}{Math.abs(delta)}%
                      </div>
                    );
                  })()}
                </div>
              </div>
              {ability.length >= 3 && (
                <div className="card" style={{ marginTop: 12 }}>
                  <div className="row row--between">
                    <strong>练习后能力图谱</strong>
                    <span className="muted" style={{ fontSize: 12 }}>弱项雷达 · 凹陷处优先补</span>
                  </div>
                  <RadarChart
                    series={[
                      {
                        name: "练习后掌握度",
                        color: "var(--brand)",
                        data: [...ability]
                          .sort((a, b) => a.mastery - b.mastery)
                          .slice(0, 8)
                          .map((a) => ({
                            label: a.knowledge_point,
                            value: a.mastery,
                            meta: `${a.attempts} 次作答`,
                          })),
                      },
                    ]}
                    target={0.85}
                    targetLabel="目标 85%"
                    onAxisClick={(kp) => nav(`/practice?kp=${encodeURIComponent(kp)}`)}
                  />
                </div>
              )}
              {result.explanation && (
                <div className="explain-block">
                  <div className="explain-block__label">解析</div>
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

      <ExplainModal
        questionId={explainId}
        onClose={() => setExplainId(null)}
        onFavToggle={(id, willFav) => {
          if (active && id === active.id) setFaved(willFav);
        }}
      />
    </section>
  );
}
