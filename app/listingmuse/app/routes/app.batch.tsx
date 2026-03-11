import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function BatchPage() {
  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 8px" }}>Batch</h1>
      <p style={{ margin: "0 0 16px", opacity: 0.85 }}>
        Phase-1 placeholder for bulk generation workflows. In later phases this
        page will queue multiple products and track progress.
      </p>

      <div
        style={{
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 8,
          padding: 12,
          background: "rgba(0,0,0,0.03)",
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>
          Planned capabilities
        </h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Upload a CSV of product IDs + optional overrides</li>
          <li>Run generation jobs with per-item status</li>
          <li>Review outputs and apply in bulk with audit trails</li>
        </ul>
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
