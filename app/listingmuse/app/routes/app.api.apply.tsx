import { randomUUID } from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

type ApplyRequest = {
  productId?: unknown;
  generated?: unknown;
};

const jsonResponse = (body: unknown, init?: ResponseInit) => {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
};

const coerceString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return jsonResponse(
    { ok: false, error: "Method not allowed" },
    { status: 405 },
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      { ok: false, error: "Expected application/json" },
      { status: 415 },
    );
  }

  let payload: ApplyRequest;
  try {
    payload = (await request.json()) as ApplyRequest;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const productId = coerceString(payload.productId);
  if (!productId) {
    return jsonResponse(
      { ok: false, error: "Missing productId" },
      { status: 400 },
    );
  }

  const auditLogId = `audit_${randomUUID()}`;
  return jsonResponse({
    ok: true,
    appliedToProductId: productId,
    auditLogId,
    audit: {
      id: auditLogId,
      action: "APPLY_GENERATED_LISTING",
      entityType: "Product",
      entityId: productId,
      createdAt: new Date().toISOString(),
      details: payload.generated ?? null,
    },
  });
};
