/**
 * Local dev server. Mounts the same route handlers Lambda uses, via Express.
 */
import express from 'express';
import cors from 'cors';
import { routes } from './handlers/api.js';
import { isDemoMode } from './services/db.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

for (const [key, fn] of Object.entries(routes)) {
  const [method, path] = key.split(' ');
  app[method.toLowerCase()](path, async (req, res) => {
    const userId = req.header('x-user-id') || 'demo';
    try {
      const out = await fn({ userId, params: req.params, query: req.query, body: req.body });
      res.status(out.status).json(out.body);
    } catch (err) {
      console.error(err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`EchoGuard API listening on http://localhost:${PORT} ${isDemoMode() ? '(demo mode: in-memory data, rule-based AI)' : '(DynamoDB + Bedrock)'}`);
});
