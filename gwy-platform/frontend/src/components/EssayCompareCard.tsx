import { EssayCompare } from "../api/client";
import { ChartIcon } from "../icons";

const ESSAY_DIMENSIONS = ["立意", "结构", "论证", "语言", "素材"];

/** 申论对比点评卡片：考生作答 vs 高分范文 的维度级差距分析与改进建议。 */
export function EssayCompareCard({ data }: { data: EssayCompare }) {
  const per = 20; // 五维各满分 20
  const dims = ESSAY_DIMENSIONS.filter((d) => d in data.student_dimensions || d in data.model_dimensions);
  const gapSum =
    Math.round(
      ESSAY_DIMENSIONS.reduce(
        (s, d) => s + ((data.model_dimensions[d] ?? 0) - (data.student_dimensions[d] ?? 0)),
        0,
      ) * 10,
    ) / 10;

  return (
    <div className="card report-hero" style={{ marginTop: 12 }}>
      <div className="row row--between">
        <strong><ChartIcon /> 对比范文点评</strong>
        {data.offline && <span className="text-warning" style={{ fontSize: 12 }}>点评已降级（题型对照）</span>}
      </div>

      {/* 总分对照 */}
      <div className="row row--between" style={{ marginTop: 8 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          你的总分 <b className="text-brand">{data.student_total}</b> · 范文参考 <b>{data.model_total}</b>
          <span className="text-3">（满分 100）</span>
        </div>
        <span
          className={
            "tag " + (gapSum <= 0 ? "tag--soft" : "tag--brand")
          }
          title="范文总分减你总分"
        >
          分差 {gapSum > 0 ? "+" : ""}{gapSum}
        </span>
      </div>

      {/* 你 vs 范文 维度对比 */}
      <div style={{ marginTop: 10 }}>
        {dims.map((d) => {
          const sv = data.student_dimensions[d] ?? 0;
          const mv = data.model_dimensions[d] ?? 0;
          const sp = Math.min(100, Math.round((sv / per) * 100));
          const mp = Math.min(100, Math.round((mv / per) * 100));
          const diff = Math.round((mv - sv) * 10) / 10;
          return (
            <div key={d} style={{ marginTop: 8 }}>
              <div className="row row--between" style={{ fontSize: 13 }}>
                <span>{d}</span>
                <span className="text-3">
                  你 {sv} · 范文 {mv}
                  {diff > 0.5 && <span className="text-danger"> （差 {diff}）</span>}
                </span>
              </div>
              {/* 范文条（浅） */}
              <div className="progress" style={{ height: 6, marginTop: 3, background: "var(--track-2, #eef1f6)" }}>
                <div className="progress__bar" style={{ width: mp + "%", background: "var(--text-3, #98a2b3)" }} />
              </div>
              {/* 你条（主色） */}
              <div className="progress" style={{ height: 8, marginTop: 3 }}>
                <div className="progress__bar" style={{ width: sp + "%" }} />
              </div>
            </div>
          );
        })}
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          浅灰为范文水平，主色为你当前水平，越接近说明该维度越到位。
        </div>
      </div>

      {/* 总体点评 */}
      {data.narrative && (
        <div className="tutor-box" style={{ marginTop: 12 }}>
          <div className="tutor-box__title">总体对比</div>
          <div className="tutor-box__body">{data.narrative}</div>
        </div>
      )}

      {/* 维度差距清单 */}
      {data.gaps.some((g) => g.comment.trim()) && (
        <div className="tutor-box" style={{ marginTop: 10 }}>
          <div className="tutor-box__title">分维度差距</div>
          <ul className="tutor-box__body" style={{ margin: "4px 0 0 18px" }}>
            {data.gaps
              .filter((g) => g.comment.trim())
              .map((g, i) => (
                <li key={i}>
                  <b>{g.dimension}</b>：{g.comment}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* 改进建议 */}
      {data.suggestions.length > 0 && (
        <div className="tutor-box" style={{ marginTop: 10 }}>
          <div className="tutor-box__title">改进建议</div>
          <ul className="tutor-box__body" style={{ margin: "4px 0 0 18px" }}>
            {data.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
