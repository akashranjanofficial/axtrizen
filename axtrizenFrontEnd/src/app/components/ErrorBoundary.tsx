import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  viewName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — catches render errors per-view so one crash
 * doesn't kill the entire app. Wrap each lazy-loaded view with this.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.viewName ?? "View"} crashed:`, error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "60vh",
            gap: "16px",
            padding: "40px",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "rgba(239, 68, 68, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
            }}
          >
            ⚠️
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--foreground)" }}>
            Something went wrong
          </h2>
          <p
            style={{
              fontSize: "14px",
              color: "var(--muted-foreground)",
              textAlign: "center",
              maxWidth: "400px",
              lineHeight: 1.5,
            }}
          >
            {this.props.viewName ?? "This view"} encountered an error.
            {this.state.error && (
              <span
                style={{
                  display: "block",
                  marginTop: "8px",
                  fontFamily: "monospace",
                  fontSize: "12px",
                }}
              >
                {this.state.error.message}
              </span>
            )}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: "10px 24px",
              borderRadius: "12px",
              background: "var(--primary)",
              color: "var(--primary-foreground)",
              border: "none",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
