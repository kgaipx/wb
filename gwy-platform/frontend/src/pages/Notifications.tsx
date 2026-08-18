import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { NotificationOut } from "../api/client";
import { notifMeta, formatNotifTime } from "../components/notifMeta";

const PAGE = 20;

/** 通知中心独立页：完整列表 + 分页加载更多 + 单条/全部已读 + 深链跳转。 */
export default function Notifications() {
  const nav = useNavigate();
  const [items, setItems] = useState<NotificationOut[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const load = useCallback(
    async (from: number, append: boolean) => {
      try {
        const data = await api.notifications(PAGE, from);
        setUnread(data.unread_count);
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setHasMore(data.items.length === PAGE);
        if (!append) setOffset(0);
      } catch {
        /* 忽略：网络/鉴权异常不阻塞页面骨架 */
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
      } catch {
        /* ignore */
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
    } catch {
      /* ignore */
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
      ) : items.length === 0 ? (
        <div className="notif-empty notif-empty--page">
          暂无通知，会员开通、测评完成等重要动态会在这里提醒你
        </div>
      ) : view.length === 0 && filter === "unread" ? (
        <div className="notif-empty notif-empty--page">
          🎉 没有未读通知，所有提醒都已查看
        </div>
      ) : (
        <>
          <div className="notif-list">
            {view.map((n) => {
              const m = notifMeta(n.type);
              return (
                <button
                  key={n.id}
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
