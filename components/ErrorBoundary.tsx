"use client";

import { Component, type ReactNode } from "react";

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-8 text-center">
          <p className="text-lg font-medium text-[var(--color-text)]">Something went wrong</p>
          <p className="max-w-sm text-sm text-[var(--color-muted)]">{this.state.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, message: "" })}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-black"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
