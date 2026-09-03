'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught a descendant render error:', error, errorInfo);
    }
  }

  public handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="rounded-2xl border border-red-900/40 bg-red-950/20 p-6 text-center shadow-lg backdrop-blur-sm space-y-4 my-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xl font-bold">
            ⚠
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">
              Something went wrong while rendering this section.
            </h3>
            <p className="text-xs text-red-300/80 max-w-md mx-auto leading-relaxed">
              {this.state.error?.message ||
                'An unexpected rendering error occurred in this workspace view.'}
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-800/60 bg-red-900/40 hover:bg-red-900/60 px-4 py-2 text-xs font-semibold text-red-200 transition-all shadow-sm"
            >
              🔄 Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
