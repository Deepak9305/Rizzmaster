export const MARKETING_HOME_PATH = '/landing';

export const normalizeMarketingPath = (pathname: string) => {
  const path = pathname.replace(/\/+$/, '');
  return path || '/';
};

export const isMarketingPath = (pathname: string) => {
  const path = normalizeMarketingPath(pathname).toLowerCase();
  return path === MARKETING_HOME_PATH || path === '/blog' || path.startsWith('/blog/') || path === '/privacy' || path === '/terms' || path === '/support';
};
