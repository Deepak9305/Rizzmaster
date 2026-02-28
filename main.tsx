import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
// @ts-ignore - Virtual module
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for PWA / Offline Support
if ('serviceWorker' in navigator) {
  registerSW({
    onNeedRefresh() {
      // Optional: Prompt user to refresh. For now, we just log.
      console.log('New content available, ready to reload.');
    },
    onOfflineReady() {
      console.log('App is ready to work offline.');
    },
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Global Error Handlers for Uncaught Promises
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection:', event.reason);
  // Prevent default browser error overlay if possible, or just log
  // event.preventDefault(); 
});

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
