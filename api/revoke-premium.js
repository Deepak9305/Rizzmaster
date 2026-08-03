import { applyCors } from "./_cors.js";

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(payload));
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  return json(res, 410, {
    error: "Premium revocation is only performed by verified store and administrative workflows.",
    code: "PREMIUM_REVOKE_DISABLED",
  });
}
