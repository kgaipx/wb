import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircleIcon, WarningIcon, SparkleIcon } from "../icons";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  msg: string;
  leaving: boolean;
}

export interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
  show: (type: ToastType, msg: string, duration?: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = {
  success: CheckCircleIcon,
  error: WarningIcon,
  info: SparkleIcon,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Record<number, number[]>>({});

  const drop = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    const arr = timers.current[id];
    if (arr) {
      arr.forEach(clearTimeout);
      delete timers.current[id];
    }
  }, []);

  const show = useCallback(
    (type: ToastType, msg: string, duration?: number) => {
      const id = ++idRef.current;
      // 错误提示停留更久，确保用户看清；成功/信息默认 2.2s
      const d = duration ?? (type === "error" ? 3200 : 2200);
      setToasts((ts) => [...ts, { id, type, msg, leaving: false }]);
      const t1 = window.setTimeout(() => {
        setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      }, d);
      const t2 = window.setTimeout(() => drop(id), d + 360);
      timers.current[id] = [t1, t2];
    },
    [drop]
  );

  const dismiss = useCallback(
    (id: number) => {
      setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      const t2 = window.setTimeout(() => drop(id), 340);
      timers.current[id] = [...(timers.current[id] ?? []), t2];
    },
    [drop]
  );

  useEffect(
    () => () => {
      Object.values(timers.current).forEach((arr) => arr.forEach(clearTimeout));
    },
    []
  );

  const api: ToastApi = {
    success: (m) => show("success", m),
    error: (m) => show("error", m),
    info: (m) => show("info", m),
    show,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.type];
          return (
            <div
              key={t.id}
              className={`toast-item toast-item--${t.type}${t.leaving ? " toast-item--leaving" : ""}`}
              onClick={() => dismiss(t.id)}
            >
              <Icon />
              <span>{t.msg}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
