import React from "react";

/**
 * 轻量 Markdown 渲染（无三方依赖，防止离线/沙箱无法安装包）。
 * - 先对文本做 HTML 转义，再解析结构，天然防 XSS（不会直出原始标签）。
 * - 支持：标题(#/##/###)、有序/无序列表、引用、加粗、斜体、行内代码、
 *   链接(http/https)、代码块、段落与换行。
 */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const INLINE_RE =
  /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;

function renderInline(raw: string, keyBase: string): React.ReactNode[] {
  const text = esc(raw);
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) nodes.push(<strong key={`${keyBase}-b${k++}`}>{m[2]}</strong>);
    else if (m[4] !== undefined) nodes.push(<em key={`${keyBase}-i${k++}`}>{m[4]}</em>);
    else if (m[6] !== undefined) nodes.push(<code key={`${keyBase}-c${k++}`}>{m[6]}</code>);
    else if (m[8] !== undefined)
      nodes.push(
        <a key={`${keyBase}-a${k++}`} href={m[9]} target="_blank" rel="noreferrer">
          {m[8]}
        </a>
      );
    last = INLINE_RE.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderBlock(raw: string, i: number): React.ReactNode {
  const block = raw.replace(/\s+$/, "");
  if (block.startsWith("```")) {
    let inner = block.slice(3);
    const nl = inner.indexOf("\n");
    const code = (nl >= 0 ? inner.slice(nl + 1) : inner).replace(/```$/, "");
    return (
      <pre key={i}>
        <code>{esc(code)}</code>
      </pre>
    );
  }
  if (/^#{1,3}\s/.test(block)) {
    const lines = block.split("\n");
    const level = lines[0].match(/^#+/)![0].length;
    const headText = lines[0].replace(/^#{1,3}\s/, "");
    const Tag = (`h${Math.min(level, 4)}` as unknown) as keyof JSX.IntrinsicElements;
    const rest = lines.slice(1).join("\n").trim();
    return (
      <React.Fragment key={i}>
        <Tag>{renderInline(headText, `b${i}`)}</Tag>
        {rest && <p>{renderInline(rest, `b${i}-r`)}</p>}
      </React.Fragment>
    );
  }
  if (/^>\s?/.test(block)) {
    const lines = block
      .split("\n")
      .map((l) => l.replace(/^>\s?/, ""))
      .join("\n");
    return (
      <blockquote key={i}>{renderInline(lines, `b${i}`)}</blockquote>
    );
  }
  const lines = block.split("\n");
  if (lines.length > 0 && lines.every((l) => /^\s*[-*]\s+/.test(l))) {
    return (
      <ul key={i}>
        {lines.map((l, j) => (
          <li key={j}>{renderInline(l.replace(/^\s*[-*]\s+/, ""), `b${i}-${j}`)}</li>
        ))}
      </ul>
    );
  }
  if (lines.length > 0 && lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
    return (
      <ol key={i}>
        {lines.map((l, j) => (
          <li key={j}>{renderInline(l.replace(/^\s*\d+\.\s+/, ""), `b${i}-${j}`)}</li>
        ))}
      </ol>
    );
  }
  // 段落：单换行 -> <br/>
  return (
    <p key={i}>
      {lines.map((l, j) => (
        <React.Fragment key={j}>
          {j > 0 && <br />}
          {renderInline(l, `b${i}-${j}`)}
        </React.Fragment>
      ))}
    </p>
  );
}

export default function Markdown({ children }: { children: string }) {
  if (!children) return null;
  const blocks = children.split(/\n{2,}/);
  return <div className="md">{blocks.map((b, i) => renderBlock(b, i))}</div>;
}
