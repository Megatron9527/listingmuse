import { useEffect, useMemo, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { getLemonSqueezyEnv } from "../billing/lemonSqueezy.server";
import {
  getPaywallInfo,
  isBillingCurrentlyActive,
} from "../billing/billing.server";

const ensureShop = async (shopDomain: string) => {
  return prisma.shop.upsert({
    where: { shopDomain },
    create: { shopDomain },
    update: {},
  });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const billing = await prisma.billing.findUnique({
    where: { shopId: shop.id },
  });
  const env = getLemonSqueezyEnv();
  const paywall = getPaywallInfo();

  const active = isBillingCurrentlyActive(
    billing
      ? {
          status: billing.status,
          currentPeriodEnd: billing.currentPeriodEnd ?? null,
        }
      : null,
  );

  return {
    shopDomain: session.shop,
    configured: Boolean(
      env.storeId && env.apiKey && env.variantId && env.webhookSecret,
    ),
    paywall,
    active,
    billing: billing
      ? {
          status: billing.status,
          currentPeriodEnd: billing.currentPeriodEnd
            ? billing.currentPeriodEnd.toISOString()
            : null,
          cancelAt: billing.cancelAt ? billing.cancelAt.toISOString() : null,
          provider: billing.provider,
          lemonsqueezySubscriptionId: billing.lemonsqueezySubscriptionId,
        }
      : null,
  };
};

type StatusResponse = {
  ok: boolean;
  active: boolean;
  billing?: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAt: string | null;
  } | null;
  error?: string;
};

const mapCheckoutError = (err: string) => {
  const e = (err || "").toLowerCase();
  if (e.includes("not configured") || e.includes("env") || e.includes("variant")) {
    return {
      title: "Billing isn’t configured yet",
      body: "Set LemonSqueezy env vars (store/api key/variant/webhook secret), then try again.",
    };
  }
  if (e.includes("payment_required")) {
    return {
      title: "Subscription required",
      body: "Please complete checkout. If you already paid, wait a moment and click “I’ve paid — refresh access”.",
    };
  }
  if (e.includes("network") || e.includes("fetch")) {
    return {
      title: "Network error",
      body: "Checkout creation failed due to a network issue. Please retry.",
    };
  }
  return {
    title: "Couldn’t start checkout",
    body: err || "Please retry. If it keeps failing, verify LemonSqueezy configuration and webhook delivery.",
  };
};

export default function BillingPage() {
  const data = useLoaderData<typeof loader>();

  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollMessage, setPollMessage] = useState<string | null>(null);

  const errorCopy = useMemo(() => {
    if (!error) return null;
    return mapCheckoutError(error);
  }, [error]);

  useEffect(() => {
    setCheckoutUrl(null);
    setError(null);
    setIsPolling(false);
    setPollMessage(null);
  }, [data.active]);

  const fetchStatus = async () => {
    const resp = await fetch("/app/api/billing/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({}),
    });
    const json = (await resp.json()) as StatusResponse;
    if (!json.ok) throw new Error(json.error ?? "Status check failed");
    return json;
  };

  const pollForUnlock = async (timeoutMs = 60_000) => {
    setIsPolling(true);
    setPollMessage("Waiting for webhook to confirm your subscription…");

    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        const status = await fetchStatus();
        if (status.active) {
          setPollMessage("Subscription active — unlocking…");
          // Reload to refresh loader data and unlock gated endpoints.
          window.location.reload();
          return;
        }
      } catch {
        // Ignore transient polling failures.
      }

      await new Promise((r) => setTimeout(r, 2500));
    }

    setPollMessage(
      "Still not active. If you completed checkout, verify LemonSqueezy webhook delivery and click refresh.",
    );
    setIsPolling(false);
  };

  const createCheckout = async () => {
    setIsCreating(true);
    setError(null);
    setCheckoutUrl(null);

    try {
      const resp = await fetch(data.paywall.checkoutPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({}),
      });
      const json = (await resp.json()) as {
        ok: boolean;
        checkoutUrl?: string;
        error?: string;
        details?: string | null;
      };

      if (!json.ok) {
        setError([json.error ?? "Failed to create checkout", json.details].filter(Boolean).join(": "));
        return;
      }

      if (json.checkoutUrl) {
        setCheckoutUrl(json.checkoutUrl);
        // Open checkout in a new tab; keep this page for status polling.
        window.open(json.checkoutUrl, "_blank", "noopener,noreferrer");
        // Start polling right away; user may complete checkout quickly.
        void pollForUnlock();
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Request failed";
      setError(message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 980 }}>
      <h1 style={{ margin: "0 0 8px" }}>Upgrade to unlock ListingMuse</h1>
      <p style={{ margin: "0 0 18px", opacity: 0.85 }}>
        Shop: <code>{data.shopDomain}</code>
      </p>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <Link to="/app">Back to Generate</Link>
        <span style={{ opacity: 0.5 }}>|</span>
        <Link to="/app/batch">Batch</Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 14,
            padding: 16,
            background: "rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 750, fontSize: 16 }}>Pro</div>
              <div style={{ opacity: 0.75, marginTop: 4 }}>
                Faster listings, better conversion, less busywork.
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>$ — / mo</div>
              <div style={{ opacity: 0.7, fontSize: 12, marginTop: 2 }}>
                (set price in LemonSqueezy)
              </div>
            </div>
          </div>

          <ul style={{ margin: "14px 0 0", lineHeight: 1.6 }}>
            <li>Generate SEO-friendly titles + descriptions + bullets in seconds</li>
            <li>Apply changes back to Shopify with one click</li>
            <li>Batch workflow for catalog cleanups</li>
            <li>Works on your existing products — no migration</li>
          </ul>

          <div style={{ marginTop: 14, opacity: 0.8, fontSize: 13 }}>
            <strong>Low risk:</strong> If checkout succeeds but access doesn’t
            unlock immediately, it’s usually just webhook delay. This page will
            auto-refresh once the webhook is received.
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            {!data.active ? (
              <button
                type="button"
                onClick={createCheckout}
                disabled={!data.configured || isCreating || isPolling}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: data.configured ? "#111" : "#999",
                  color: "#fff",
                  cursor: data.configured ? "pointer" : "not-allowed",
                  fontWeight: 700,
                }}
              >
                {isCreating
                  ? "Starting checkout…"
                  : isPolling
                    ? "Waiting for confirmation…"
                    : "Start checkout"}
              </button>
            ) : (
              <div style={{ fontWeight: 700, color: "#0a7" }}>Active ✅</div>
            )}

            <button
              type="button"
              onClick={() => void pollForUnlock(15_000)}
              disabled={data.active || isPolling}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.2)",
                background: "#fff",
                cursor: data.active ? "not-allowed" : "pointer",
              }}
            >
              I’ve paid — refresh access
            </button>
          </div>

          {pollMessage && (
            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
              {pollMessage}
            </div>
          )}

          {checkoutUrl && (
            <div style={{ marginTop: 10, fontSize: 13 }}>
              Checkout URL: <a href={checkoutUrl}>{checkoutUrl}</a>
            </div>
          )}

          {errorCopy && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(180,0,0,0.25)",
                background: "rgba(180,0,0,0.06)",
              }}
            >
              <div style={{ fontWeight: 750, color: "#a00" }}>
                {errorCopy.title}
              </div>
              <div style={{ marginTop: 6, color: "#700", fontSize: 13 }}>
                {errorCopy.body}
              </div>
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={createCheckout}
                  disabled={isCreating || !data.configured}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.2)",
                    background: "#fff",
                    cursor: data.configured ? "pointer" : "not-allowed",
                  }}
                >
                  Retry checkout
                </button>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 14,
            padding: 16,
            background: "rgba(0,0,0,0.01)",
          }}
        >
          <div style={{ fontWeight: 750, marginBottom: 10 }}>
            Current access
          </div>
          <div style={{ lineHeight: 1.6, fontSize: 13 }}>
            <div>
              <strong>Status:</strong> {data.active ? "Active" : "Inactive"} ·{" "}
              <span style={{ opacity: 0.85 }}>{data.billing?.status ?? "none"}</span>
            </div>
            {data.billing?.currentPeriodEnd && (
              <div style={{ opacity: 0.8 }}>
                Period ends: {data.billing.currentPeriodEnd}
              </div>
            )}
            {!data.configured && (
              <div style={{ marginTop: 10, color: "#a00" }}>
                LemonSqueezy env vars not set. Checkout can’t start.
              </div>
            )}
          </div>

          <div style={{ marginTop: 14, fontSize: 13, opacity: 0.8 }}>
            <div style={{ fontWeight: 650, marginBottom: 6 }}>
              After checkout
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
              <li>Complete payment in the new tab</li>
              <li>Come back here (this page polls automatically)</li>
              <li>Once Active, go back to Generate and continue</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
