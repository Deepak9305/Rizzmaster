import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { Capacitor } from '@capacitor/core';

const App = lazy(() => import('./App'));
const WebRouter = lazy(() => import('./components/WebRouter'));

const isNativePlatform = Capacitor.isNativePlatform();

// Let CSS select the lightweight compositor path before the first React paint.
// This matters on Android WebViews where blur-heavy layers are expensive.
document.documentElement.classList.toggle('native-app', isNativePlatform);

const shouldRenderWebRouter = typeof window !== 'undefined' && !isNativePlatform;

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
