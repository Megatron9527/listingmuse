import { useMemo, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

type ProductSummary = {
  id: string;
  title: string;
  descriptionHtml?: string | null;
  tags?: string[];
  seo?: { title?: string | null; description?: string | null } | null;
  imageUrl?: string | null;
};

type ListingDraft = {
  title: string;
  descriptionHtml: string;
  bulletPoints?: string[];
  tags?: string[];
  seo?: { title?: string; description?: string };
  images?: string[];
};

type GenerateResponse = {
  ok: boolean;
  generationId?: string;
  product?: ProductSummary | null;
  listing?: ListingDraft;
  error?: string;
};

type ApplyResponse = {
  ok: boolean;
  auditLogId?: string;
  appliedToProductId?: string;
  error?: string;
  userErrors?: Array<{ field?: string[]; message: string }>;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 10,
        padding: 12,
        background: "rgba(0,0,0,0.02)",
      }}
    >
      <div style={{ fontWeight: 650, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

export default function GeneratePage() {
  // Primary flow: paste a Shopify product GID (or numeric id), generate a draft,
  // review before/after, then apply by generationId.
  const [productId, setProductId] = useState("");
  const [titleOverride, setTitleOverride] = useState("");
  const [imageUrlOverride, setImageUrlOverride] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const [generateResult, setGenerateResult] = useState<GenerateResponse | null>(
    null,
  );
  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);

  const canGenerate = useMemo(() => {
    return Boolean(productId.trim() || titleOverride.trim() || imageUrlOverride.trim());
  }, [imageUrlOverride, productId, titleOverride]);

  const canApply = useMemo(() => {
    return Boolean(productId.trim()) && Boolean(generateResult?.generationId);
  }, [generateResult?.generationId, productId]);

  const generate = async () => {
    setIsGenerating(true);
    setApplyResult(null);
    setGenerateResult(null);

    try {
      const response = await fetch("/app/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          productId: productId.trim() || undefined,
          title: titleOverride.trim() || undefined,
          imageUrl: imageUrlOverride.trim() || undefined,
        }),
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
    if (!generateResult?.generationId) return;

    setIsApplying(true);
    setApplyResult(null);

    try {
      const response = await fetch("/app/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          productId: productId.trim(),
          generationId: generateResult.generationId,
        }),
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

  const current = generateResult?.product ?? null;
  const draft = generateResult?.listing ?? null;

  return (
    <div style={{ padding: 16, maxWidth: 1100 }}>
      <h1 style={{ margin: "0 0 6px" }}>ListingMuse</h1>
      <p style={{ margin: "0 0 16px", opacity: 0.8 }}>
        Generate → review → apply. Phase-2 flow uses DB persistence (generationId)
        and Shopify productUpdate.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <Link to="/app/batch">Batch</Link>
        <span style={{ opacity: 0.35 }}>|</span>
        <Link to="/app/settings">Settings</Link>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <Panel title="1) Choose product">
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Product ID (recommended)</span>
              <input
                value={productId}
                onChange={(e) => setProductId(e.currentTarget.value)}
                placeholder="gid://shopify/Product/1234567890 (or just 1234567890)"
                style={{ padding: 8 }}
              />
            </label>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Title override (optional)</span>
                <input
                  value={titleOverride}
                  onChange={(e) => setTitleOverride(e.currentTarget.value)}
                  placeholder="If empty, we use Shopify product title"
                  style={{ padding: 8 }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Image URL override (optional)</span>
                <input
                  value={imageUrlOverride}
                  onChange={(e) => setImageUrlOverride(e.currentTarget.value)}
                  placeholder="If empty, we use Shopify featured image"
                  style={{ padding: 8 }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                onClick={generate}
                disabled={!canGenerate || isGenerating}
                style={{ padding: "8px 12px" }}
              >
                {isGenerating ? "Generating..." : "Generate draft"}
              </button>
              {!canGenerate && (
                <span style={{ opacity: 0.7 }}>
                  Provide a product ID or at least title/image.
                </span>
              )}
            </div>

            {generateResult?.ok === false && (
              <div style={{ color: "#a00" }}>{generateResult.error ?? "Failed"}</div>
            )}
          </div>
        </Panel>

        <Panel title="2) Review (before → after)">
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8, opacity: 0.85 }}>
                Current product
              </div>
              {!current ? (
                <div style={{ opacity: 0.7 }}>
                  Generate using a product ID to load current product data.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Title</div>
                    <div>{current.title}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Tags</div>
                    <div style={{ opacity: 0.9 }}>
                      {(current.tags ?? []).join(", ") || "(none)"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Description</div>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                      <code>{current.descriptionHtml ?? "(empty)"}</code>
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 8, opacity: 0.85 }}>
                Generated draft
              </div>
              {!draft ? (
                <div style={{ opacity: 0.7 }}>No draft yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Title</div>
                    <div>{draft.title}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Tags</div>
                    <div style={{ opacity: 0.9 }}>
                      {(draft.tags ?? []).join(", ") || "(none)"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Description</div>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                      <code>{draft.descriptionHtml}</code>
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="3) Apply to Shopify">
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                onClick={apply}
                disabled={!canApply || isApplying}
                style={{ padding: "8px 12px" }}
              >
                {isApplying ? "Applying..." : "Apply draft"}
              </button>
              {!canApply && (
                <span style={{ opacity: 0.7 }}>
                  Need product ID + generationId (generate first).
                </span>
              )}
            </div>

            <pre style={{ margin: 0, overflow: "auto" }}>
              <code>
                {JSON.stringify(
                  {
                    generationId: generateResult?.generationId,
                    applyResult,
                  },
                  null,
                  2,
                )}
              </code>
            </pre>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
