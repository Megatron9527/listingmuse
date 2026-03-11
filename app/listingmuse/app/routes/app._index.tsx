import { useMemo, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

type GenerateResponse = {
  ok: boolean;
  generationId?: string;
  listing?: Record<string, unknown>;
  error?: string;
};

type ApplyResponse = {
  ok: boolean;
  auditLogId?: string;
  appliedToProductId?: string;
  error?: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function GeneratePage() {
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [productId, setProductId] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [generateResult, setGenerateResult] = useState<GenerateResponse | null>(
    null,
  );
  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);

  const canApply = useMemo(() => {
    return Boolean(productId.trim()) && Boolean(generateResult?.listing);
  }, [generateResult?.listing, productId]);

  const generate = async () => {
    setIsGenerating(true);
    setApplyResult(null);
    try {
      const response = await fetch("/app/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ title, imageUrl }),
      });
      const data = (await response.json()) as GenerateResponse;
      setGenerateResult(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      setGenerateResult({ ok: false, error: message });
    } finally {
      setIsGenerating(false);
    }
  };

  const apply = async () => {
    if (!generateResult?.listing) return;
    setIsApplying(true);
    try {
      const response = await fetch("/app/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ productId, generated: generateResult.listing }),
      });
      const data = (await response.json()) as ApplyResponse;
      setApplyResult(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      setApplyResult({ ok: false, error: message });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 8px" }}>Generate</h1>
      <p style={{ margin: "0 0 16px", opacity: 0.85 }}>
        Phase-1 scaffolding: mock listing generation and apply. Try Batch or
        Settings from the app nav.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            placeholder="e.g. Vintage denim jacket"
            style={{ padding: 8 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Image URL</span>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.currentTarget.value)}
            placeholder="https://..."
            style={{ padding: 8 }}
          />
        </label>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={generate}
            disabled={isGenerating}
            style={{ padding: "8px 12px" }}
          >
            {isGenerating ? "Generating..." : "Generate listing"}
          </button>
          <Link to="/app/batch">Go to Batch</Link>
          <Link to="/app/settings">Go to Settings</Link>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Apply to product ID (optional)</span>
          <input
            value={productId}
            onChange={(e) => setProductId(e.currentTarget.value)}
            placeholder="gid://shopify/Product/1234567890"
            style={{ padding: 8 }}
          />
        </label>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={apply}
            disabled={!canApply || isApplying}
            style={{ padding: "8px 12px" }}
          >
            {isApplying ? "Applying..." : "Apply generated payload"}
          </button>
          {!canApply && (
            <span style={{ opacity: 0.7 }}>
              Generate first, then enter a product ID.
            </span>
          )}
        </div>

        <div
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 8,
            padding: 12,
            background: "rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Generate result
              </div>
              <pre style={{ margin: 0, overflow: "auto" }}>
                <code>{JSON.stringify(generateResult, null, 2)}</code>
              </pre>
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Apply result
              </div>
              <pre style={{ margin: 0, overflow: "auto" }}>
                <code>{JSON.stringify(applyResult, null, 2)}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
