import prisma from "../db.server";

export type BillingPaywallInfo = {
  billingUrl: string;
  checkoutPath: string;
  statusPath: string;
};

export const getBillingForShopId = async (shopId: string) => {
  return prisma.billing.findUnique({ where: { shopId } });
};

export const isBillingCurrentlyActive = (
  billing: {
    status: string;
    currentPeriodEnd: Date | null;
  } | null,
) => {
  if (!billing) return false;

  const status = (billing.status || "").toLowerCase();
  if (status === "active") return true;

  if (status === "cancelled") {
    if (!billing.currentPeriodEnd) return false;
    return billing.currentPeriodEnd.getTime() > Date.now();
  }

  return false;
};

export const getPaywallInfo = (): BillingPaywallInfo => {
  return {
    billingUrl: "/app/billing",
    checkoutPath: "/app/api/billing/checkout",
    statusPath: "/app/api/billing/status",
  };
};

export const jsonResponse = (body: unknown, init?: ResponseInit) => {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
};

export const paymentRequiredResponse = (args?: {
  reason?: string;
  status?: string | null;
  currentPeriodEnd?: Date | null;
}) => {
  const paywall = getPaywallInfo();
  return jsonResponse(
    {
      ok: false,
      error: "payment_required",
      paywall: {
        reason: args?.reason ?? "subscription_inactive",
        billingUrl: paywall.billingUrl,
        checkoutPath: paywall.checkoutPath,
        status: args?.status ?? null,
        currentPeriodEnd: args?.currentPeriodEnd
          ? args.currentPeriodEnd.toISOString()
          : null,
      },
    },
    { status: 402 },
  );
};
