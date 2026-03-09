
import React from 'react';

interface NoInternetOverlayProps {
    isVisible: boolean;
    onRetry: () => void;
}

const NoInternetOverlay: React.FC<NoInternetOverlayProps> = ({ isVisible, onRetry }) => {
    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-[10000] bg-black flex flex-col items-center justify-center p-6 text-center animate-fade-in">
            {/* Decorative Blur */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-rose-500/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="relative z-10 max-w-sm w-full glass p-8 rounded-3xl border border-white/10 shadow-2xl">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-3xl mb-6 mx-auto border border-white/10">
                    📡
                </div>

                <h2 className="text-xl font-bold text-white mb-3">No Connection</h2>
                <p className="text-sm text-white/50 mb-8 leading-relaxed">
                    The Rizz Master needs the cloud to cook. Check your internet and try again.
                </p>

                <button
                    onClick={onRetry}
                    className="w-full py-3.5 rizz-gradient rounded-xl font-bold text-white shadow-lg shadow-rose-500/20 active:scale-95 transition-all text-sm uppercase tracking-widest"
                >
                    Check Connectivity
                </button>

                <p className="mt-6 text-[10px] text-white/20 uppercase tracking-[0.2em]">
                    Waiting for signal...
                </p>
            </div>
        </div>
    );
};

export default NoInternetOverlay;
