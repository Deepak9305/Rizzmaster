import React, { startTransition, useEffect, useState } from 'react';
import App from '../App';
import { isMarketingPath, normalizeMarketingPath } from '../services/marketingRoutes';
import MarketingSite from './MarketingSite';
import BillingReturnPage from './BillingReturnPage';

const getPathname = () => normalizeMarketingPath(window.location.pathname);
const isBillingReturnPath = (pathname: string) => pathname.toLowerCase() === '/billing/return';

const WebRouter: React.FC = () => {
  const [pathname, setPathname] = useState(getPathname);
  const [hasVisitedApp, setHasVisitedApp] = useState(() => {
    const initialPath = getPathname();
    return !isMarketingPath(initialPath) && !isBillingReturnPath(initialPath);
  });
  const isMarketingPage = isMarketingPath(pathname);
  const isBillingReturnPage = isBillingReturnPath(pathname);

  useEffect(() => {
    const handlePopState = () => {
      const nextPathname = getPathname();
      startTransition(() => setPathname(nextPathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!isMarketingPage && !isBillingReturnPage) {
      setHasVisitedApp(true);
    }
  }, [isBillingReturnPage, isMarketingPage]);

  const navigate = (path: string) => {
    const nextPathname = normalizeMarketingPath(path);
    if (nextPathname === pathname) return;

    window.history.pushState({}, '', nextPathname);
    startTransition(() => setPathname(nextPathname));
  };

  return (
    <>
      {hasVisitedApp && (
        <div hidden={isMarketingPage || isBillingReturnPage}>
          <App onNavigateToPath={navigate} />
        </div>
      )}
      {isMarketingPage && <MarketingSite />}
      {isBillingReturnPage && <BillingReturnPage onContinue={() => navigate('/')} />}
    </>
  );
};

export default WebRouter;
