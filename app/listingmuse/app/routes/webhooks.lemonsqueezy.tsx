import type { ActionFunctionArgs } from "react-router";
import type { Prisma } from "@prisma/client";
import prisma from "../db.server";
import {
  getLemonSqueezyEnv,
  getLemonSqueezyWebhookHeaders,
  parseLemonSqueezyWebhook,
  verifyLemonSqueezyWebhookSignature,
} from "../billing/lemonSqueezy.server";

const jsonResponse = (body: unknown, init?: ResponseInit) => {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
};

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return !!v && typeof v === "object" && !Array.isArray(v);
};

const coerceString = (v: unknown) => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
};

const coerceDate = (v: unknown) => {
  const s = coerceString(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const ensureShop = async (shopDomain: string) => {
  return prisma.shop.upsert({
    where: { shopDomain },
    create: { shopDomain },
    update: {},
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const env = getLemonSqueezyEnv();
  if (!env.webhookSecret) {
    return jsonResponse(
      { ok: false, error: "LEMONSQUEEZY_WEBHOOK_SECRET_MISSING" },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const headers = getLemonSqueezyWebhookHeaders(request);
  const valid = verifyLemonSqueezyWebhookSignature({
    rawBody,
    signatureHeader: headers.signature,
    secret: env.webhookSecret,
  });
  if (!valid) {
    return jsonResponse(
      { ok: false, error: "INVALID_SIGNATURE" },
      { status: 401 },
    );
  }

  const parsed = parseLemonSqueezyWebhook(rawBody);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: parsed.error }, { status: 400 });
  }

  const event = parsed.event;
  const eventName = headers.eventName ?? event.meta?.event_name ?? null;

  const customData = event.meta?.custom_data ?? null;
  const shopDomain = isRecord(customData)
    ? coerceString(customData.shopDomain ?? customData.shop)
    : null;

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      shopId: null,
      topic: `lemonsqueezy:${eventName ?? "unknown"}`,
      payload: event as unknown as Prisma.InputJsonValue,
      status: "RECEIVED",
    },
  });

  if (!shopDomain) {
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: "IGNORED",
        processedAt: new Date(),
        error: "Missing meta.custom_data.shopDomain",
      },
    });
    return jsonResponse({ ok: true, ignored: true });
  }

  const shop = await ensureShop(shopDomain);

  const attributes = isRecord(event.data?.attributes)
    ? event.data?.attributes
    : null;
  const status = attributes
    ? (coerceString(attributes.status) ?? "inactive")
    : "inactive";
  const customerId = attributes ? coerceString(attributes.customer_id) : null;
  const subscriptionId = coerceString(event.data?.id);
  const variantId = attributes ? coerceString(attributes.variant_id) : null;

  const renewsAt = attributes ? coerceDate(attributes.renews_at) : null;
  const endsAt = attributes ? coerceDate(attributes.ends_at) : null;
  const currentPeriodEnd = endsAt ?? renewsAt;
  const cancelAt = endsAt;

  await prisma.billing.upsert({
    where: { shopId: shop.id },
    create: {
      shopId: shop.id,
      provider: "LEMONSQUEEZY",
      status: status.toLowerCase(),
      lemonsqueezyCustomerId: customerId,
      lemonsqueezySubscriptionId: subscriptionId,
      lemonsqueezyVariantId: variantId,
      currentPeriodEnd,
      cancelAt,
    },
    update: {
      provider: "LEMONSQUEEZY",
      status: status.toLowerCase(),
      lemonsqueezyCustomerId: customerId,
      lemonsqueezySubscriptionId: subscriptionId,
      lemonsqueezyVariantId: variantId,
      currentPeriodEnd,
      cancelAt,
    },
  });

  await prisma.webhookEvent.update({
    where: { id: webhookEvent.id },
    data: {
      shopId: shop.id,
      status: "PROCESSED",
      processedAt: new Date(),
    },
  });

  return jsonResponse({ ok: true });
};
