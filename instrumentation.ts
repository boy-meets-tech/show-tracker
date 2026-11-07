import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";

function createLoggerProvider() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!key || !host) {
    if (process.env.NODE_ENV !== "production") {
      if (!key) {
        console.warn(
          "NEXT_PUBLIC_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_KEY is configured"
        );
      }
      if (!host) {
        console.warn(
          "NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured"
        );
      }
    }
    return null;
  }

  return new LoggerProvider({
    resource: resourceFromAttributes({ "service.name": "show-tracker" }),
    processors: [
      new BatchLogRecordProcessor({
        exportTimeoutMillis: 2000,
        exporter: new OTLPLogExporter({
          url: new URL("/i/v1/logs", host).toString(),
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          timeoutMillis: 2000,
        }),
      }),
    ],
  });
}

// This provider is intentionally isolated from the global OTel logger so only
// logs purpose-written for PostHog in this integration are exported.
export const loggerProvider = createLoggerProvider();

export function register() {
  // The provider initializes at module load so server modules can import it.
}
