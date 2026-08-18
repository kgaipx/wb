import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Ability, WrongItem } from "../api/client";

/* ============================================================
 * 智能错题强化包
 * 基于学情薄弱点 / 错题本，拉取同知识点相似题与变式，闭环补漏。
 * 后端：/bank/questions/{qid}/similar + /bank/questions?knowledge_point=
 * ============================================================ */

function masteryColor(m: number): string {
  if (m >= 0.7) return "var(--success)";
  if (m >= 0.4) return "var(--warning)";
  return "var(--danger)";
}

export default function SmartReinforcement() {
  const nav = useNavigate();
  const [stats, setStats] = useState<{ ability: Ability[] } | null>(null);
  const [wrongs, setWrongs] = useState<WrongItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // 正在生成哪个包

  useEffect(() => {
    Promise.all([api.studentStats(), api.wrongList()])
      .then(([s, w]) => {
        setStats({ ability: s.ability });
        setWrongs(w);
      })
      .catch((e) => setErr(e.message || "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const weak = useMemo(() => (stats?.ability || []).filter((a) => a.mastery < 0.85), [stats]);

  async function buildByKp(kp: string): Promise<number[]> {
    const qs = await api.bankList({ knowledge_point: kp, limit: 12 });
    return qs.map((q) => q.id);
  }

  async function goPractice(ids: number[]) {
    const uniq = Array.from(new Set(ids)).filter((x) => x);
    if (!uniq.length) {
      setErr("暂无可练习的题（该知识点下题量不足）");
      return;
    }
    nav(`/practice?ids=${uniq.join(",")}`);
  }

  async function reinforceAll() {
    if (!weak.length) return;
    setBusy("all");
    try {
      const groups = await Promise.all(weak.map((a) => buildByKp(a.knowledge_point)));
      const ids = groups.flat().slice(0, 60);
      await goPractice(ids);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function reinforceKp(kp: string) {
    setBusy(kp);
    try {
      const ids = await buildByKp(kp);
      await goPractice(ids);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function reinforceFromWrong(w: WrongItem) {
    setBusy("w" + w.question.id);
    try {
      const sims = await api.similarQuestions(w.question.id, 12);
      const ids = [w.question.id, ...sims.map((s) => s.id)];
      await goPractice(ids);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <section>
        <div className="hero">
          <div className="hero__title">智能错题强化包</div>
          <div className="hero__sub">正在分析你的薄弱点…</div>
        </div>
        <div className="sk-card">
          <div className="sk sk-line" style={{ width: "40%" }} />
          <div className="sk sk-line" style={{ width: "90%" }} />
          <div className="sk sk-line" style={{ width: "70%" }} />
          <div className="sk sk-line" style={{ width: "80%" }} />
        </div>
      </section>
    );
  }

  return (
    <section>
      {/* Hero */}
      <div className="hero re-hero">
        <div className="hero__title">智能错题强化包</div>
        <div className="hero__sub">按薄弱点精准拉题 · 同考点变式 · 闭环补漏</div>
      </div>

      {err && <div className="err-text">{err}</div>}

      {/* 统计 */}
      <div className="grid-3 mat-stats">
        <div className="metric">
          <div className="metric__num">{weak.length}</div>
          <div className="metric__label">薄弱知识点</div>
        </div>
        <div className="metric">
          <div className="metric__num" style={{ color: "var(--danger)" }}>{wrongs.length}</div>
          <div className="metric__label">错题总数</div>
        </div>
        <div className="metric">
          <div className="metric__num" style={{ color: "var(--brand)" }}>
            {weak.length ? Math.min(60, weak.length * 12) : 0}
          </div>
          <div className="metric__label">可强化题</div>
        </div>
      </div>

      {/* 一键强化 */}
      {weak.length > 0 && (
        <div className="card re-cta">
          <div className="re-cta__txt">
            <div className="re-cta__title">一键强化全部薄弱点</div>
            <div className="re-cta__desc muted">
              聚合 {weak.length} 个薄弱知识点的相似题与变式，生成专属补漏包（最多 60 题）。
            </div>
          </div>
          <button className="btn btn--primary re-cta__btn" disabled={busy !== null} onClick={reinforceAll}>
            {busy === "all" ? "生成中…" : "🎯 开始强化"}
          </button>
        </div>
      )}

      {/* 薄弱点列表 */}
      <div className="section-title" style={{ marginTop: "var(--sp-5)" }}>按薄弱点强化</div>
      {weak.length === 0 ? (
        <div className="card fav-empty">
          <div className="empty empty--tight">
            <div className="empty__icon">✅</div>
            <div className="empty__title">暂无薄弱知识点</div>
            <div className="empty__desc">多做几道题，系统会据此定位你的薄弱环节。</div>
          </div>
        </div>
      ) : (
        <div className="re-kp-list">
          {weak.map((a) => (
            <div key={a.knowledge_point} className="card re-kp">
              <div className="re-kp__head">
                <span className="re-kp__name">{a.knowledge_point}</span>
                <span className="re-kp__pct" style={{ color: masteryColor(a.mastery) }}>
                  {Math.round(a.mastery * 100)}%
                </span>
              </div>
              <div className="progress" style={{ marginTop: 8 }}>
                <div
                  className="progress__bar"
                  style={{ width: `${Math.round(a.mastery * 100)}%`, background: masteryColor(a.mastery) }}
                />
              </div>
              <div className="re-kp__meta muted">
                已练 {a.attempts} 次 · 正确 {a.correct} 次
              </div>
              <button
                className="btn btn--ghost btn--sm re-kp__btn"
                disabled={busy !== null}
                onClick={() => reinforceKp(a.knowledge_point)}
              >
                {busy === a.knowledge_point ? "生成中…" : "🎯 生成强化包"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 从错题本强化 */}
      <div className="section-title" style={{ marginTop: "var(--sp-5)" }}>从错题本强化</div>
      {wrongs.length === 0 ? (
        <div className="card fav-empty">
          <div className="empty empty--tight">
            <div className="empty__icon">🎉</div>
            <div className="empty__title">没有错题</div>
            <div className="empty__desc">保持住，做错的题会自动进入这里。</div>
          </div>
        </div>
      ) : (
        <div className="re-wrong-list">
          {wrongs.slice(0, 30).map((w) => (
            <div key={w.question.id} className="card re-wrong">
              <div className="re-wrong__meta">
                <span className="tag tag--brand">{w.question.knowledge_point}</span>
                {w.recurrence_rate != null && (
                  <span className="tag tag--accent">复错 {Math.round(w.recurrence_rate * 100)}%</span>
                )}
              </div>
              <div className="re-wrong__stem">{w.question.stem}</div>
              <button
                className="btn btn--ghost btn--sm re-kp__btn"
                disabled={busy !== null}
                onClick={() => reinforceFromWrong(w)}
              >
                {busy === "w" + w.question.id ? "生成中…" : "🎯 强化这题"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mat-foot muted">
        强化包基于你的薄弱点与错题，自动拉取同知识点相似题与变式，练完即闭环补漏。
      </div>
    </section>
  );
}
