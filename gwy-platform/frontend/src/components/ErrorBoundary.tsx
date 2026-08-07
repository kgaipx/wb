import React from "react";

interface State {
  hasError: boolean;
}

// 全局错误边界：任何子树渲染异常时降级为可重试页，避免整页白屏。
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // 仅记录，不向用户暴露内部错误
    console.error("[ErrorBoundary] 渲染异常：", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: "center", marginTop: 80 }}>
          <h2 style={{ marginBottom: 8 }}>页面出了点小问题</h2>
          <p style={{ color: "var(--text-2)", marginBottom: 16 }}>
            发生了一点意外，刷新即可恢复。若反复出现，请联系客服。
          </p>
          <button className="btn btn--primary" onClick={this.handleRetry}>
            刷新重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
