import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

/**
 * Root Error Boundary — catches render errors so the app shows a fallback
 * instead of a blank white screen (especially useful in WebDriver E2E sessions).
 */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Uncaught render error:", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return React.createElement(
        "div",
        { style: { color: "red", padding: "20px" } },
        React.createElement("h1", null, "Application Error"),
        React.createElement("pre", null, String(this.state.error)),
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>,
);
