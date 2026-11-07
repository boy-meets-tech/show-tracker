import { SeverityNumber } from "@opentelemetry/api-logs";
import { loggerProvider } from "../../instrumentation";
import type { NotificationKind, PushResult } from "./push";

// This logger is deliberately separate from the application's console logging.
// Only calls added by this integration are exported to PostHog.
const posthogLogger = loggerProvider?.getLogger("show-tracker-posthog");

export function logPushDelivery(
  kind: NotificationKind | null,
  recipientCount: number,
  result: PushResult
) {
  const outcome = result.failed > 0 ? "partial_failure" : result.problem ? "skipped" : "delivered";

  posthogLogger?.emit({
    body: "push_delivery_completed",
    severityNumber: result.failed > 0 ? SeverityNumber.ERROR : SeverityNumber.INFO,
    attributes: {
      notification_kind: kind ?? "test",
      recipient_count: recipientCount,
      sent_count: result.sent,
      failed_count: result.failed,
      outcome,
    },
  });

  return loggerProvider?.forceFlush().catch(() => {});
}
