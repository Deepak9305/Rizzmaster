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

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Use a ref to keep track of timeouts so we can clear them if needed (optional)

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto dismiss after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      {/* Toast Container - Safe Area aware */}
      <div className="fixed top-0 left-0 right-0 z-[100] pointer-events-none flex flex-col items-center gap-2 p-4 pt-safe-top">
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