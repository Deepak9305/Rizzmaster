
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    private handleReset = () => {
        // Reload the entire page to ensure a clean state
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center safe-top safe-bottom">
                    <div className="absolute inset-0 bg-rose-900/5 blur-[100px] pointer-events-none" />

                    <div className="relative z-10 max-w-sm w-full glass p-8 rounded-3xl border border-white/10 shadow-2xl">
                        <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center text-3xl mb-6 mx-auto border border-rose-500/20">
                            ⚡
                        </div>

                        <h2 className="text-xl font-bold text-white mb-3">Something tripped up...</h2>
                        <p className="text-sm text-white/50 mb-8 leading-relaxed">
                            The Rizz God hit a snag. This usually happens due to a tiny network glitch.
                        </p>

                        <button
                            onClick={this.handleReset}
                            className="w-full py-3.5 rizz-gradient rounded-xl font-bold text-white shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
                        >
                            Try Again
                        </button>

                        <p className="mt-4 text-[10px] text-white/20 uppercase tracking-widest font-medium">
                            Error code: {this.state.error?.name || 'GENERIC_CRASH'}
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
