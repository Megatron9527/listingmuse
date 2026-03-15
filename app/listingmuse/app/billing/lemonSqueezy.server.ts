import crypto from "node:crypto";

export type LemonSqueezyCheckoutParams = {
  shopDomain: string;
  redirectUrl?: string;
  email?: string;
  name?: string;
};

export type LemonSqueezyWebhookHeaders = {
  signature: string | null;
  eventName: string | null;
};

export type LemonSqueezyWebhookEvent = {
  meta?: {
    event_name?: string;
    custom_data?: Record<string, unknown>;
  };
  data?: {
    type?: string;
    id?: string;
    attributes?: Record<string, unknown>;
  };
};

export const getLemonSqueezyEnv = () => {
  const storeId = process.env.LEMONSQUEEZY_STORE_ID?.trim() || null;
  const apiKey = process.env.LEMONSQUEEZY_API_KEY?.trim() || null;
  const variantId = process.env.LEMONSQUEEZY_VARIANT_ID?.trim() || null;
  const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET?.trim() || null;

  return {
    storeId,
    apiKey,
    variantId,
    webhookSecret,
    configured: Boolean(storeId && apiKey && variantId && webhookSecret),
  };
};

const toUtf8Buffer = (s: string) => Buffer.from(s, "utf8");

export const verifyLemonSqueezyWebhookSignature = (args: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
}) => {
  const { rawBody, signatureHeader, secret } = args;
  if (!signatureHeader) return false;

  const digestHex = crypto
    .createHmac("sha256", secret)
    .update(toUtf8Buffer(rawBody))
    .digest("hex");

  const expected = toUtf8Buffer(digestHex);
  const actual = toUtf8Buffer(signatureHeader);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
};

export const createLemonSqueezyCheckoutUrl = async (
  params: LemonSqueezyCheckoutParams,
) => {
  const env = getLemonSqueezyEnv();
  if (!env.storeId || !env.apiKey || !env.variantId) {
    return {
      ok: false as const,
      error: "LEMONSQUEEZY_NOT_CONFIGURED",
    };
  }

  const body = {
    data: {
      type: "checkouts",
      attributes: {
        product_options: {
          ...(params.redirectUrl ? { redirect_url: params.redirectUrl } : {}),
        },
        checkout_data: {
          ...(params.email ? { email: params.email } : {}),
          ...(params.name ? { name: params.name } : {}),
          custom: {
            shopDomain: params.shopDomain,
          },
        },
      },
      relationships: {
        store: {
          data: { type: "stores", id: env.storeId },
        },
        variant: {
          data: { type: "variants", id: env.variantId },
        },
      },
    },
  };

  const resp = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${env.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      ok: false as const,
      error: "LEMONSQUEEZY_CHECKOUT_CREATE_FAILED",
      status: resp.status,
      details: text,
    };
  }

  const json = (await resp.json()) as {
    data?: { attributes?: { url?: string } };
  };

  const url = json.data?.attributes?.url ?? null;
  if (!url) {
    return {
      ok: false as const,
      error: "LEMONSQUEEZY_CHECKOUT_URL_MISSING",
    };
  }

  return { ok: true as const, url };
};

export const getLemonSqueezyWebhookHeaders = (
  request: Request,
): LemonSqueezyWebhookHeaders => {
  return {
    signature: request.headers.get("X-Signature"),
    eventName: request.headers.get("X-Event-Name"),
  };
};

export const parseLemonSqueezyWebhook = (rawBody: string) => {
  let event: LemonSqueezyWebhookEvent;
  try {
    event = JSON.parse(rawBody) as LemonSqueezyWebhookEvent;
  } catch {
    return { ok: false as const, error: "INVALID_JSON" };
  }
  return { ok: true as const, event };
};
