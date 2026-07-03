import React from 'react';
import type { UpdateGateConfig } from '../services/updateGateService';

interface ForceUpdateGateProps {
  config: UpdateGateConfig;
}

const ForceUpdateGate: React.FC<ForceUpdateGateProps> = ({ config }) => {
  const handleUpdateClick = () => {
    if (!config.updateUrl) {
      return;
    }

    window.location.href = config.updateUrl;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-6 py-10 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[420px] h-[420px] rounded-full bg-rose-600/20 blur-[120px]" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[460px] h-[460px] rounded-full bg-amber-500/15 blur-[140px]" />

      <div className="relative z-10 max-w-md w-full glass p-8 rounded-3xl border border-white/10 shadow-2xl text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl">
          ⬆
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white mb-3">Update Required</h1>
        <p className="text-sm text-white/55 leading-relaxed mb-6">
          {config.updateMessage}
        </p>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-sm text-white/70 mb-6">
          <div>Current version: <span className="text-white font-semibold">{config.currentVersion}</span></div>
          <div>Minimum required: <span className="text-white font-semibold">{config.minSupportedVersion}</span></div>
        </div>

        <button
          type="button"
          onClick={handleUpdateClick}
          disabled={!config.updateUrl}
          className="w-full py-3.5 rounded-2xl font-bold text-black bg-yellow-400 hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Update App
        </button>

        {!config.updateUrl && (
          <p className="text-xs text-white/35 mt-4">
            Update link is not configured yet. Contact support if this screen persists.
          </p>
        )}
      </div>
    </div>
  );
};

export default ForceUpdateGate;
