import { env } from "../../config/env";
import type { AlertEvent } from "../types";
import { alertStore } from "../store";

export function deliverInApp(alert: AlertEvent): void {
  if (!env.ALERT_IN_APP_ENABLED) return;
  alertStore.addNotification(alert);
}
