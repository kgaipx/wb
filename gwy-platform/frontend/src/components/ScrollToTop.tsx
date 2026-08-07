import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// 路由切换时滚动到顶部，避免停留在上一页的滚动位置（体验一致性）。
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}
