import React from 'react';

interface ErrorBoundaryProps {
  /** Name of the area shown in the fallback, e.g. the panel title. */
  label?: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Contains a render crash to the panel that caused it, so the sidebar and
 * device controls stay usable.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ''}]`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-surface border border-border-muted rounded-xl p-5">
          <p className="text-sm font-medium text-text-primary">
            {this.props.label ? `${this.props.label} stopped working` : 'This view stopped working'}
          </p>
          <p className="text-sm text-text-secondary mt-1">
            The rest of the app is fine. Try again, or switch to another tool.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto text-xs text-red-300/90 bg-background rounded-md p-3 font-mono whitespace-pre-wrap break-words">
            {error.message || String(error)}
          </pre>
          <button
            onClick={this.reset}
            className="mt-4 px-3 h-8 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
