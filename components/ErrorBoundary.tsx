import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    // You can also log the error to an error reporting service here
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-6 text-center">
          <div className="bg-zinc-900 p-8 rounded-2xl border border-white/10 shadow-2xl max-w-md w-full">
            <h2 className="text-2xl font-bold mb-4 text-red-400">Oops! Something went wrong.</h2>
            <p className="text-zinc-400 mb-6">
              The app encountered an unexpected error. Don't worry, your data is safe.
            </p>
            <div className="bg-black/50 p-4 rounded-lg mb-6 text-left overflow-auto max-h-40 border border-white/5">
              <code className="text-xs text-red-300 font-mono">
                {this.state.error?.toString()}
              </code>
            </div>
            <button
              onClick={this.handleReload}
              className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
