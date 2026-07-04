const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/localhost(?::\d+)?$/,
  /^http:\/\/localhost(?::\d+)?$/,
  /^capacitor:\/\/localhost$/,
  /^ionic:\/\/localhost$/,
  /^https:\/\/rizzmaster\.online$/,
  /^https:\/\/www\.rizzmaster\.online$/,
  /^https:\/\/rizzmaster\.vercel\.app$/,
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
  /^https:\/\/[a-z0-9-]+-uc\.a\.run\.app$/,
  /^https:\/\/[a-z0-9-]+\.run\.app$/,
];

export const applyCors = (req, res) => {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  if (origin && ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }

  return false;
};
