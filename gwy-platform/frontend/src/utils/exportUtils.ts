// 数据导出与分享：纯前端、零依赖。
// 支持：Markdown/文本/JSON 文件下载、剪贴板复制、Web Share API 降级复制。

/** 生成当天时间戳文件名片段，如 2026-08-05_2146 */
export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(
    d.getMinutes()
  )}`;
}

/** 触发浏览器下载（Blob 方式，无需服务器） */
export function triggerDownload(filename: string, content: string, mime = "text/markdown;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 延迟释放，确保下载已触发
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** 复制文本到剪贴板，返回是否成功（降级到 execCommand） */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 落到下方降级方案
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export type ShareResult = "shared" | "copied" | "failed";

/**
 * 优先唤起系统分享面板（移动端/支持的桌面浏览器），失败则降级复制文本。
 * 返回结果用于 toast 提示。
 */
export async function shareOrCopy(title: string, text: string): Promise<ShareResult> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      return "shared";
    }
  } catch (e: any) {
    // 用户取消或其他错误，继续降级复制
    if (e && e.name === "AbortError") return "failed";
  }
  const ok = await copyText(text);
  return ok ? "copied" : "failed";
}
