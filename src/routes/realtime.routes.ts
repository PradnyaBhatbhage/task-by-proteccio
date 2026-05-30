import { Router } from "express";
import { env } from "../config/env";
import { getDashboardAnalytics } from "../services/dashboard-analytics-cache";

const router = Router();

router.get("/realtime/dashboard", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = () => {
    const payload = getDashboardAnalytics();
    res.write(`event: dashboard\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send();
  const timer = setInterval(send, env.DASHBOARD_REALTIME_POLL_MS);
  req.on("close", () => {
    clearInterval(timer);
    res.end();
  });
});

export default router;
