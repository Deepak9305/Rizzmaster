import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Simple UUID fallback for environments without crypto.randomUUID (e.g. older WebViews)
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto dismiss after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      {/* Toast Container - Safe Area aware
          Updated z-index to 9999 to be above Splash (100) and Modals
          Fixed padding-top to use inline style for safe-area env var or arbitrary tailwind value
      */}
      <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none flex flex-col items-center gap-2 p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              animate-slide-up-fade px-6 py-3 rounded-full backdrop-blur-md shadow-2xl border border-white/10 text-sm font-bold flex items-center gap-3
              ${toast.type === 'success' ? 'bg-green-500/20 text-green-200' : ''}
              ${toast.type === 'error' ? 'bg-red-500/20 text-red-200' : ''}
              ${toast.type === 'info' ? 'bg-zinc-800/80 text-white' : ''}
            `}
          >
            {toast.type === 'success' && <span>✨</span>}
            {toast.type === 'error' && <span>⚠️</span>}
            {toast.type === 'info' && <span>ℹ️</span>}
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};