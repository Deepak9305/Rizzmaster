import { createApiServer } from './server/api/_http-server.js';

const port = Number(process.env.PORT || 8080);
createApiServer().listen(port, () => {
  console.log(`[cloud-run] API listening on 0.0.0.0:${port}`);
});
