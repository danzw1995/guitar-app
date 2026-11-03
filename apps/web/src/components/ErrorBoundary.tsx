import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 顶层错误边界：任何一个页面渲染抛错，都不该让整块白屏。
 * 进度存在 localStorage，跟渲染无关，所以这里可以放心承诺"数据没丢"。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[guitar-lab] 渲染出错", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash" role="alert">
        <h1>这一页出问题了</h1>
        <p>
          渲染时抛了一个错误。你的进度和记录都存在本机，没有丢——可以先重试，不行再重新加载。
        </p>
        <pre className="crash-detail">{error.message}</pre>
        <div className="crash-actions">
          <button className="btn primary" onClick={() => this.setState({ error: null })}>
            再试一次
          </button>
          <button className="btn ghost" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </div>
      </div>
    );
  }
}
