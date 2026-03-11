import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function SettingsPage() {
  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 8px" }}>Settings</h1>
      <p style={{ margin: "0 0 16px", opacity: 0.85 }}>
        Phase-1 placeholder. Later this will store per-shop defaults like tone,
        category templates, and apply behavior.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Default tone</span>
          <select defaultValue="friendly" style={{ padding: 8 }}>
            <option value="friendly">Friendly</option>
            <option value="professional">Professional</option>
            <option value="luxury">Luxury</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Include SEO fields</span>
          <input type="checkbox" defaultChecked />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Notes</span>
          <textarea
            placeholder="Saved later in Subscription/Shop settings"
            rows={4}
            style={{ padding: 8 }}
          />
        </label>
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
