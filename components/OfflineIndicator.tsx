import React from 'react';

interface OfflineIndicatorProps {
  isOffline: boolean;
}

const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ isOffline }) => {
  if (!isOffline) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center text-center p-8 animate-fade-in">
      <div className="max-w-sm">
        <div className="text-5xl mb-6">🛰️</div>
        <h1 className="text-3xl font-bold text-white mb-2">Connection Lost</h1>
        <p className="text-white/60 leading-relaxed">
          It looks like you're offline. Rizz Master needs an internet connection to work its magic. Please check your connection and try again.
        </p>
      </div>
    </div>
  );
};

export default OfflineIndicator;
