import { useEffect, useState } from "react";
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

export default function BillingPage() {
  const data = useLoaderData<typeof loader>();
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    setCheckoutUrl(null);
    setError(null);
  }, [data.active]);

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
      };

      if (!json.ok) {
        setError(json.error ?? "Failed to create checkout");
        return;
      }

      if (json.checkoutUrl) {
        setCheckoutUrl(json.checkoutUrl);
        window.open(json.checkoutUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Request failed";
      setError(message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 8px" }}>Billing</h1>
      <p style={{ margin: "0 0 16px", opacity: 0.85 }}>
        Subscription status for <code>{data.shopDomain}</code>.
      </p>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <Link to="/app">Back to Generate</Link>
      </div>

      <div
        style={{
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 10,
          padding: 12,
          background: "rgba(0,0,0,0.02)",
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 650, marginBottom: 6 }}>Status</div>
            <div>
              {data.active ? (
                <span style={{ color: "#0a7" }}>Active</span>
              ) : (
                <span style={{ color: "#a00" }}>Inactive</span>
              )}
              <span style={{ opacity: 0.7 }}> · </span>
              <span style={{ opacity: 0.85 }}>
                {data.billing?.status ?? "none"}
              </span>
            </div>
            {data.billing?.currentPeriodEnd && (
              <div style={{ opacity: 0.75, marginTop: 4 }}>
                Current period ends: {data.billing.currentPeriodEnd}
              </div>
            )}
          </div>

          {!data.active && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                onClick={createCheckout}
                disabled={!data.configured || isCreating}
                style={{ padding: "8px 12px" }}
              >
                {isCreating ? "Creating checkout..." : "Start subscription"}
              </button>
              {!data.configured && (
                <span style={{ opacity: 0.75 }}>
                  LemonSqueezy env vars not set.
                </span>
              )}
            </div>
          )}

          {checkoutUrl && (
            <div style={{ fontSize: 13 }}>
              Checkout URL: <a href={checkoutUrl}>{checkoutUrl}</a>
            </div>
          )}
          {error && <div style={{ color: "#a00" }}>{error}</div>}
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
