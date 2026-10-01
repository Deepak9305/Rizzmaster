import { applyCors } from './_cors.js';
import rewardedAdStatus from './rewarded-ad-status.js';

// Preserve compatibility with existing APKs. A client completion claim is not
// proof of an earned ad; only the signed AdMob SSV handler may grant credits.
export default function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405);
    res.setHeader('Content-Type', 'application/json');
    return res.send(JSON.stringify({ error: 'Method not allowed.' }));
  }
  return rewardedAdStatus({
    method: 'GET',
    headers: req.headers,
    query: { attemptId: req.body?.attemptId },
  }, res);
}
