import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { Capacitor } from '@capacitor/core';
import { isMarketingPath } from './services/marketingRoutes';

const App = lazy(() => import('./App'));
const MarketingSite = lazy(() => import('./components/MarketingSite'));

const shouldRenderMarketing = typeof window !== 'undefined'
  && !Capacitor.isNativePlatform()
  && isMarketingPath(window.location.pathname);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Suspense fallback={<div className="min-h-screen bg-[#050407]" />}>
      {shouldRenderMarketing ? <MarketingSite /> : <App />}
    </Suspense>
  </React.StrictMode>
);
