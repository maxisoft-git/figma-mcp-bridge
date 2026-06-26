import React from "react";
import type { ErrorBoundaryProps, ErrorBoundaryState } from "../types";

/**
 * Error Boundary для обработки ошибок в дереве компонентов.
 *
 * Предотвращает падение всего UI при ошибке в дочернем компоненте.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        const Fallback = this.props.fallback;
        return <Fallback error={this.state.error} retry={this.handleRetry} />;
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary__content">
            <h2 className="error-boundary__title">Что-то пошло не так</h2>
            <p className="error-boundary__message">
              {this.state.error.message}
            </p>
            <button
              className="error-boundary__button"
              onClick={this.handleRetry}
              type="button"
            >
              Попробовать снова
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
