import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import {
  jsonResponse,
  getBillingForShopId,
  isBillingCurrentlyActive,
} from "../billing/billing.server";
import {
  createLemonSqueezyCheckoutUrl,
  getLemonSqueezyEnv,
} from "../billing/lemonSqueezy.server";
import { authenticate } from "../shopify.server";

const ensureShop = async (shopDomain: string) => {
  return prisma.shop.upsert({
    where: { shopDomain },
    create: { shopDomain },
    update: {},
  });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return jsonResponse(
    { ok: false, error: "Method not allowed" },
    { status: 405 },
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = await ensureShop(session.shop);

    const billing = await getBillingForShopId(shop.id);
    if (
      isBillingCurrentlyActive(
        billing
          ? {
              status: billing.status,
              currentPeriodEnd: billing.currentPeriodEnd ?? null,
            }
          : null,
      )
    ) {
      return jsonResponse({
        ok: true,
        alreadyActive: true,
        billingUrl: "/app/billing",
      });
    }

    const env = getLemonSqueezyEnv();
    if (!env.storeId || !env.apiKey || !env.variantId) {
      return jsonResponse(
        { ok: false, error: "LEMONSQUEEZY_NOT_CONFIGURED" },
        { status: 500 },
      );
    }

    const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
    const redirectUrl = appUrl ? `${appUrl}/app/billing` : undefined;

    const created = await createLemonSqueezyCheckoutUrl({
      shopDomain: session.shop,
      redirectUrl,
    });

    if (!created.ok) {
      return jsonResponse(
        {
          ok: false,
          error: created.error,
          status: created.status ?? null,
          details: "details" in created ? created.details ?? null : null,
        },
        { status: 502 },
      );
    }

    await prisma.billing.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        provider: "LEMONSQUEEZY",
        status: "inactive",
        lemonsqueezyVariantId: env.variantId,
      },
      update: {
        provider: "LEMONSQUEEZY",
        lemonsqueezyVariantId: env.variantId,
      },
    });

    return jsonResponse({ ok: true, checkoutUrl: created.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(
      {
        ok: false,
        error: "BILLING_CHECKOUT_UNEXPECTED_ERROR",
        details: message,
      },
      { status: 500 },
    );
  }
};
