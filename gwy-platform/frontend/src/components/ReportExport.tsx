import { useState } from "react";
import type { RefObject } from "react";
import { toPng } from "html-to-image";
import { useToast } from "./ToastProvider";
import Spinner from "./Spinner";

/**
 * 把任意 DOM 节点截成 PNG 直接下载，用于「成果留存 / 分享」。
 * 捕获节点本身不含本按钮（按钮渲染在节点之外），导出图干净无 UI 残留。
 */
export function ReportExport({
  targetRef,
  fileName,
  label = "📸 导出图片",
}: {
  targetRef: RefObject<HTMLElement | null>;
  fileName: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function onExport() {
    const node = targetRef.current;
    if (!node || busy) return;
    setBusy(true);
    try {
      const bg =
        getComputedStyle(document.body).getPropertyValue("--surface")?.trim() ||
        "#ffffff";
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: bg || "#ffffff",
      });
      const a = document.createElement("a");
      a.download = fileName.toLowerCase().endsWith(".png") ? fileName : `${fileName}.png`;
      a.href = dataUrl;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error("导出图片失败", e);
      toast.error("导出失败，请稍后重试，或用系统截图保存。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className={"btn btn--ghost btn--sm" + (busy ? " btn--loading" : "")} disabled={busy} onClick={onExport}>
      {busy && <Spinner size={14} />}
      {busy ? "生成中…" : label}
    </button>
  );
}
