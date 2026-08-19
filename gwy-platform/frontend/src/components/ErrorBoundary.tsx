import { Component, ErrorInfo, ReactNode } from "react";
import { WarningIcon } from "../icons";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
}

/**
 * 全局错误边界：捕获任何页面渲染期异常，避免整站白屏。
 * 提供「重试」与「返回首页」两个出口；错误信息仅用于本地展示与调试。
 */
class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || "未知错误" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 仅本地打印，便于排查；不向外部服务上报
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-screen">
          <div className="error-screen__card">
            <div className="error-screen__icon"><WarningIcon /></div>
            <h2>页面出错了</h2>
            <p className="muted">
              程序遇到了一个意外错误，已为你保留当前位置。可重试恢复，或返回首页。
            </p>
            {this.state.message && (
              <pre className="error-screen__detail">{this.state.message}</pre>
            )}
            <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 14 }}>
              <button className="btn btn--primary btn--sm" onClick={this.handleRetry}>
                重试
              </button>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => (window.location.href = "/")}
              >
                返回首页
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ErrorBoundary({ children }: Props) {
  return <ErrorBoundaryInner>{children}</ErrorBoundaryInner>;
}
