import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { NotificationOut } from "../api/client";
import { notifMeta, formatNotifTime } from "../components/notifMeta";
import Reveal from "../components/Reveal";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import { useToast } from "../components/ToastProvider";

const PAGE = 20;

/** 通知中心独立页：完整列表 + 分页加载更多 + 单条/全部已读 + 深链跳转。 */
export default function Notifications() {
  const nav = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState<NotificationOut[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [err, setErr] = useState("");

  const load = useCallback(
    async (from: number, append: boolean) => {
      if (!append) {
        setErr("");
        setLoading(true);
      }
      try {
        const data = await api.notifications(PAGE, from);
        setUnread(data.unread_count);
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setHasMore(data.items.length === PAGE);
        if (!append) setOffset(0);
        setErr("");
      } catch (e: any) {
        // 仅首屏加载失败才提示错误态；分页追加失败保持已有列表，用户可点「加载更多」重试
        if (!append) setErr(e?.message || "通知加载失败，请稍后重试");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    load(0, false);
  }, [load]);

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const next = offset + PAGE;
    setOffset(next);
    load(next, true);
  };

  const open = async (n: NotificationOut) => {
    if (!n.is_read) {
      try {
        await api.markNotificationRead(n.id);
        setUnread((u) => Math.max(0, u - 1));
        setItems((list) =>
          list.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
        );
        // 回写顶部铃铛角标（App 监听此事件重新拉取未读真值）
        window.dispatchEvent(new Event("notif-changed"));
      } catch (e: any) {
        toast.error(e?.message || "标记已读失败，请稍后重试");
      }
    }
    if (n.link) nav(n.link);
  };

  const readAll = async () => {
    try {
      await api.markAllNotificationsRead();
      setUnread(0);
      setItems((list) => list.map((x) => ({ ...x, is_read: true })));
      // 回写顶部铃铛角标（App 监听此事件重新拉取未读真值）
      window.dispatchEvent(new Event("notif-changed"));
    } catch (e: any) {
      toast.error(e?.message || "全部标为已读失败，请稍后重试");
    }
  };

  const view = filter === "unread" ? items.filter((x) => !x.is_read) : items;

  return (
    <section>
      <div className="page-head">
        <h2>通知中心</h2>
        <div className="notif-head__right">
          <div className="notif-filter">
            <button
              className={"notif-filter__btn" + (filter === "all" ? " on" : "")}
              onClick={() => setFilter("all")}
            >
              全部
            </button>
            <button
              className={"notif-filter__btn" + (filter === "unread" ? " on" : "")}
              onClick={() => setFilter("unread")}
            >
              未读{unread > 0 ? ` ${unread}` : ""}
            </button>
          </div>
          {unread > 0 && (
            <button className="notif-readall" onClick={readAll}>
              全部已读
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="notif-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="notif-page__sk" />
          ))}
        </div>
      ) : err && items.length === 0 ? (
        <ErrorState
          title="通知加载失败"
          desc={err || "网络开小差了，请点击重试。"}
          onRetry={() => load(0, false)}
          retryBusy={loading}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="暂无通知"
          desc="会员开通、测评完成等重要动态会在这里提醒你。"
        />
      ) : view.length === 0 && filter === "unread" ? (
        <EmptyState
          icon="check"
          title="没有未读通知"
          desc="所有提醒都已查看，你可以继续专注备考。"
        />
      ) : (
        <>
          <div className="notif-list">
            {view.map((n, idx) => {
              const m = notifMeta(n.type);
              return (
                <Reveal key={n.id} delay={Math.min(idx, 8) * 40}>
                <button
                  className={"notif-page__item" + (n.is_read ? "" : " unread")}
                  style={{ borderLeftColor: m.color }}
                  onClick={() => open(n)}
                >
                  <span className="notif-page__ico" style={{ color: m.color }}>
                    {m.icon}
                  </span>
                  <span className="notif-page__main">
                    <span className="notif-page__title">{n.title}</span>
                    <span className="notif-page__body">{n.body}</span>
                    <span className="notif-time">{formatNotifTime(n.created_at)}</span>
                  </span>
                  {!n.is_read && <span className="notif-page__dot" />}
                </button>
                </Reveal>
              );
            })}
          </div>
          {hasMore && (
            <button
              className="btn btn--ghost btn--block"
              style={{ marginTop: 12 }}
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "加载中…" : "加载更多"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
