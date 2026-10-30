// Global frontend error reporting -> Django activity logging API.
// No auth required. Never throws.

import { API_BASE_URL } from "@/lib/api/client";

const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};

/** Set VITE_REPORT_ERRORS=true to enable reporting in development. */
export const ERROR_REPORTING_ENABLED =
  env.VITE_REPORT_ERRORS === "true" || String(env.PROD) === "true" || env.MODE === "production";

export const ERROR_ENDPOINT = `${API_BASE_URL.replace(/\/$/, "")}/activity/logs/frontend-error/`;

export interface ReportExtra {
  stack?: string;
  componentStack?: string;
  path?: string;
  metadata?: Record<string, unknown>;
}

function toMessage(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message || String(error), stack: error.stack };
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

export function reportError(error: unknown, extra: ReportExtra = {}): void {
  try {
    if (!ERROR_REPORTING_ENABLED) {
      console.debug("[reportError skipped in dev]", error, extra);
      return;
    }
    const { message, stack } = toMessage(error);
    const payload = {
      message: message.slice(0, 2000),
      stack: (extra.stack ?? stack)?.slice(0, 8000),
      path: extra.path ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
      componentStack: extra.componentStack?.slice(0, 8000),
      metadata: {
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        ...(extra.metadata ?? {}),
      },
    };
    const body = JSON.stringify(payload);

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(ERROR_ENDPOINT, blob)) return;
    }

    void fetch(ERROR_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      cache: "no-store",
    }).catch(() => {
      /* swallow */
    });
  } catch {
    /* never throw from the reporter */
  }
}

let installed = false;

export function setupGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event: ErrorEvent) => {
    reportError(event.error ?? event.message, {
      metadata: {
        source: "window.error",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    reportError(event.reason ?? "Unhandled promise rejection", {
      metadata: { source: "unhandledrejection" },
    });
  });
}
