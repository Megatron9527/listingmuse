#!/usr/bin/env node
import crypto from "node:crypto";

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
};

const url = getArg("--url", "http://localhost:3000/webhooks/lemonsqueezy");
const shopDomain = getArg("--shop", "example.myshopify.com");
const eventName = getArg("--event", "subscription_created");

const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
if (!secret) {
  console.error("Missing env: LEMONSQUEEZY_WEBHOOK_SECRET");
  process.exit(1);
}

// Minimal fixture payload that matches the app's parser expectations.
const payload = {
  meta: {
    event_name: eventName,
    custom_data: {
      shopDomain,
    },
  },
  data: {
    id: "sub_test_123",
    attributes: {
      status: "active",
      customer_id: "cust_test_123",
      variant_id: "var_test_123",
      renews_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      ends_at: null,
    },
  },
};

const rawBody = JSON.stringify(payload);

// LemonSqueezy uses HMAC SHA256 signatures in a single header.
// The server-side verifier should match this algorithm.
const signature = crypto
  .createHmac("sha256", secret)
  .update(rawBody, "utf8")
  .digest("hex");

const resp = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Signature": signature,
    // Provide the event name if the server reads it from headers.
    "X-Event-Name": eventName,
  },
  body: rawBody,
});

const text = await resp.text();
console.log("Status:", resp.status);
console.log(text);
