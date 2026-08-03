import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { Capacitor } from '@capacitor/core';

const App = lazy(() => import('./App'));
const WebRouter = lazy(() => import('./components/WebRouter'));

const shouldRenderWebRouter = typeof window !== 'undefined' && !Capacitor.isNativePlatform();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Suspense fallback={<div className="min-h-screen bg-[#050407]" />}>
      {shouldRenderWebRouter ? <WebRouter /> : <App />}
    </Suspense>
  </React.StrictMode>
);
