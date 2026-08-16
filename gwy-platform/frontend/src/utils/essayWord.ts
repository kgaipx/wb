/** 从作答要求中解析字数区间，如「1000-1200字」「800~1000 字」「1200到1500字」。 */
export function parseWordTarget(req: string): [number, number] | null {
  const m = req.match(/(\d{3,4})\s*[-~到至]\s*(\d{3,4})\s*字/);
  if (m) {
    const lo = parseInt(m[1], 10);
    const hi = parseInt(m[2], 10);
    if (hi > lo) return [lo, hi];
  }
  return null;
}

/** 字数状态：返回提示文案与配色类（复用全局 text-success / text-warning / text-danger）。 */
export function wordStatus(n: number, t: [number, number] | null): { cls: string; text: string } {
  if (!t) return { cls: "muted", text: "申论大作文一般建议 1000–1200 字" };
  const [lo, hi] = t;
  if (n >= lo && n <= hi) return { cls: "text-success", text: "✓ 字数达标" };
  if (n < lo) return n < lo * 0.85 ? { cls: "text-danger", text: "字数偏少，建议充实" } : { cls: "text-warning", text: "接近下限，还差一点" };
  if (n > hi * 1.15) return { cls: "text-warning", text: "已超出建议上限" };
  return { cls: "text-warning", text: "略超上限，可精简" };
}

/** 去空白后的实际字数（申论计数口径：汉字 + 标点，不计空格/换行）。 */
export function countEssayChars(text: string): number {
  return text.replace(/\s/g, "").length;
}
