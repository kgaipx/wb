import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/**
 * 模态 / 抽屉焦点陷阱（Apple 级无障碍标配）。
 *
 * - active=true 时：记录打开前的焦点元素，把焦点移入容器（优先首个可聚焦元素，
 *   无则可聚焦容器自身）；拦截 Tab / Shift+Tab 在容器内循环；拦截 Esc 调用 onClose。
 * - active=false（关闭 / 卸载）时：把焦点归还给打开前的元素，避免键盘焦点丢失到 body。
 *
 * 用法：把返回的 ref 挂到浮层「容器」上，并给容器加 tabIndex={-1} 以便无焦点元素时可聚焦。
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  onClose?: () => void
) {
  const containerRef = useRef<T | null>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // 记录打开前的焦点，关闭时归还
    prevFocus.current = document.activeElement as HTMLElement | null;

    const getFocusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    // 初始焦点：首个可聚焦元素，否则容器自身
    const first = getFocusables()[0];
    (first || container).focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const f = getFocusables();
      if (f.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = f[0];
      const lastEl = f[f.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (activeEl === firstEl || !container.contains(activeEl)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (activeEl === lastEl || !container.contains(activeEl)) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      prevFocus.current?.focus?.({ preventScroll: true });
    };
  }, [active]);

  return containerRef;
}
