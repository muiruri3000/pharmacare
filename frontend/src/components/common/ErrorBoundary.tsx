import * as React from "react";

import { reportError } from "@/lib/errors/reportError";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    reportError(error, { componentStack: errorInfo.componentStack ?? undefined });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <div className="max-w-md text-center">
              <h1 className="text-xl font-semibold">Something went wrong</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {this.state.error?.message ?? "An unexpected error occurred."}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Reload page
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
