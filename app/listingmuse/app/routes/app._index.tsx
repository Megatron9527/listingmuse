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
  bulletPoints: string[];
  tags: string[];
  seo: { title: string; description: string };
  images: string[];
  meta?: {
    providerId?: string;
    settings?: { language?: string; market?: string; tone?: string };
    version?: number;
  };
};

type ListingGenerationSettings = {
  language: "en";
  market: "cross-border";
  tone: "conversion" | "neutral";
};

type GenerateResponse = {
  ok: boolean;
  generationId?: string;
  product?: ProductSummary | null;
  listing?: ListingDraft;
  error?: string;
  paywall?: {
    billingUrl?: string;
    checkoutPath?: string;
    reason?: string;
  };
};

type ApplyResponse = {
  ok: boolean;
  auditLogId?: string;
  appliedToProductId?: string;
  error?: string;
  userErrors?: Array<{ field?: string[]; message: string }>;
  paywall?: {
    billingUrl?: string;
    checkoutPath?: string;
    reason?: string;
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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

  const [settings, setSettings] = useState<ListingGenerationSettings>({
    language: "en",
    market: "cross-border",
    tone: "conversion",
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const [generateResult, setGenerateResult] = useState<GenerateResponse | null>(
    null,
  );
  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);

  const canGenerate = useMemo(() => {
    return Boolean(
      productId.trim() || titleOverride.trim() || imageUrlOverride.trim(),
    );
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
          settings,
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

  const ui = {
    page: {
      padding: 18,
      maxWidth: 1160,
      margin: "0 auto",
    },
    heroTitle: {
      margin: "0 0 6px",
      fontSize: 22,
      letterSpacing: "-0.01em",
    },
    heroSub: {
      margin: "0 0 16px",
      opacity: 0.8,
      maxWidth: 820,
      lineHeight: 1.35,
    },
    navRow: {
      display: "flex",
      gap: 10,
      alignItems: "center",
      marginBottom: 14,
      flexWrap: "wrap" as const,
    },
    navPill: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.10)",
      background: "rgba(0,0,0,0.02)",
      textDecoration: "none",
      color: "inherit",
      fontSize: 13,
    },
    layout: {
      display: "grid",
      gridTemplateColumns: "minmax(300px, 360px) minmax(0, 1fr)",
      gap: 14,
    },
    card: {
      border: "1px solid rgba(0,0,0,0.12)",
      borderRadius: 12,
      padding: 12,
      background: "rgba(0,0,0,0.02)",
    },
    sectionTitle: {
      fontWeight: 680,
      marginBottom: 10,
    },
    label: {
      display: "grid",
      gap: 6,
      fontSize: 13,
    },
    input: {
      padding: 9,
      borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.18)",
      background: "white",
    },
    select: {
      padding: 9,
      borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.18)",
      background: "white",
    },
    buttonPrimary: {
      padding: "9px 12px",
      borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.18)",
      background: "#111",
      color: "white",
      cursor: "pointer",
      fontWeight: 650,
    },
    buttonDisabled: {
      opacity: 0.55,
      cursor: "not-allowed",
    },
    badge: {
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 8px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.12)",
      background: "rgba(0,0,0,0.03)",
      fontSize: 12,
    },
    chip: {
      display: "inline-flex",
      alignItems: "center",
      padding: "4px 10px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.10)",
      background: "rgba(255,255,255,0.8)",
      fontSize: 12,
    },
    grid2: {
      display: "grid",
      gap: 12,
      gridTemplateColumns: "1fr 1fr",
    },
    muted: { opacity: 0.75 },
    codeBlock: {
      margin: 0,
      overflow: "auto",
      padding: 10,
      borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.10)",
      background: "rgba(0,0,0,0.02)",
    },
  };

  const stripHtmlToText = (html: string) => {
    return html
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/p\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  };

  const excerpt = (html: string | null | undefined, max: number) => {
    if (!html) return "";
    const txt = stripHtmlToText(html);
    if (txt.length <= max) return txt;
    const slice = txt.slice(0, max + 1);
    const lastSpace = slice.lastIndexOf(" ");
    const cut = lastSpace > 40 ? slice.slice(0, lastSpace) : txt.slice(0, max);
    return `${cut.trim()}...`;
  };

  const diffLabel = (
    before: string | null | undefined,
    after: string | null | undefined,
  ) => {
    const b = (before ?? "").trim();
    const a = (after ?? "").trim();
    if (!b && !a) return "Missing";
    if (b === a) return "Unchanged";
    if (!b && a) return "Added";
    if (b && !a) return "Removed";
    return "Updated";
  };

  const Badge = ({ children }: { children: string }) => {
    return <span style={ui.badge}>{children}</span>;
  };

  const Chip = ({ children }: { children: string }) => {
    return <span style={ui.chip}>{children}</span>;
  };

  const CompareRow = ({
    label,
    before,
    after,
  }: {
    label: string;
    before: string;
    after: string;
  }) => {
    const status = diffLabel(before, after);
    return (
      <div style={{ display: "grid", gap: 6 }}>
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 10 }}
        >
          <div style={{ fontSize: 12, opacity: 0.75 }}>{label}</div>
          <span style={{ ...ui.badge, opacity: 0.9 }}>{status}</span>
        </div>
        <div style={ui.grid2}>
          <div style={{ ...ui.codeBlock, padding: 10 }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>
              Before
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{before || "(empty)"}</div>
          </div>
          <div style={{ ...ui.codeBlock, padding: 10 }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>
              After
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{after || "(empty)"}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={ui.page}>
      <h1 style={ui.heroTitle}>ListingMuse Merchandising Studio</h1>
      <p style={ui.heroSub}>
        Generate market-ready product copy for cross-border independent Shopify
        stores. Compare changes side-by-side, then apply updates to your product
        in Shopify.
      </p>

      <div style={ui.navRow}>
        <Link to="/app/batch" style={ui.navPill}>
          Batch
        </Link>
        <Link to="/app/settings" style={ui.navPill}>
          Settings
        </Link>
        {generateResult?.generationId && (
          <span style={{ ...ui.badge, opacity: 0.9 }}>
            Draft ID: {generateResult.generationId}
          </span>
        )}
      </div>

      <div style={ui.layout}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={ui.card}>
            <div style={ui.sectionTitle}>Product</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={ui.label}>
                <span>Product ID (recommended)</span>
                <input
                  value={productId}
                  onChange={(e) => setProductId(e.currentTarget.value)}
                  placeholder="gid://shopify/Product/1234567890 (or just 1234567890)"
                  style={ui.input}
                />
              </label>

              <div style={{ display: "grid", gap: 10 }}>
                <label style={ui.label}>
                  <span>Title override (optional)</span>
                  <input
                    value={titleOverride}
                    onChange={(e) => setTitleOverride(e.currentTarget.value)}
                    placeholder="Leave empty to use Shopify title"
                    style={ui.input}
                  />
                </label>

                <label style={ui.label}>
                  <span>Image URL override (optional)</span>
                  <input
                    value={imageUrlOverride}
                    onChange={(e) => setImageUrlOverride(e.currentTarget.value)}
                    placeholder="Leave empty to use Shopify image"
                    style={ui.input}
                  />
                </label>
              </div>
            </div>
          </div>

          <div style={ui.card}>
            <div style={ui.sectionTitle}>Generation settings</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={ui.label}>
                <span>Language</span>
                <select
                  value={settings.language}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      language: e.currentTarget.value === "en" ? "en" : "en",
                    }))
                  }
                  style={ui.select}
                >
                  <option value="en">English</option>
                </select>
              </label>

              <label style={ui.label}>
                <span>Market</span>
                <select
                  value={settings.market}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      market:
                        e.currentTarget.value === "cross-border"
                          ? "cross-border"
                          : "cross-border",
                    }))
                  }
                  style={ui.select}
                >
                  <option value="cross-border">
                    Cross-border (independent stores)
                  </option>
                </select>
              </label>

              <label style={ui.label}>
                <span>Tone</span>
                <select
                  value={settings.tone}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      tone:
                        e.currentTarget.value === "neutral"
                          ? "neutral"
                          : "conversion",
                    }))
                  }
                  style={ui.select}
                >
                  <option value="conversion">Conversion-focused</option>
                  <option value="neutral">Neutral</option>
                </select>
              </label>
            </div>
          </div>

          <div style={ui.card}>
            <div style={ui.sectionTitle}>Generate</div>
            <div style={{ display: "grid", gap: 10 }}>
              <button
                type="button"
                onClick={generate}
                disabled={!canGenerate || isGenerating}
                style={{
                  ...ui.buttonPrimary,
                  ...(!canGenerate || isGenerating ? ui.buttonDisabled : {}),
                }}
              >
                {isGenerating ? "Generating..." : "Generate draft"}
              </button>

              {!canGenerate && (
                <div style={ui.muted}>
                  Provide a product ID or at least a title/image.
                </div>
              )}

              {generateResult?.ok === false && (
                <div style={{ color: "#a00" }}>
                  {generateResult.error ?? "Failed"}
                  {generateResult.paywall?.billingUrl && (
                    <span style={{ marginLeft: 10 }}>
                      <Link to={generateResult.paywall.billingUrl}>
                        Go to billing
                      </Link>
                    </span>
                  )}
                </div>
              )}

              <div
                style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}
              >
                <Badge>English</Badge>
                <Badge>Cross-border</Badge>
                <Badge>
                  {settings.tone === "conversion" ? "Conversion" : "Neutral"}
                </Badge>
                {draft?.meta?.providerId && (
                  <Badge>{draft.meta.providerId}</Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <Panel title="Before → After">
            <div style={{ display: "grid", gap: 12 }}>
              <CompareRow
                label="Title"
                before={current?.title ?? ""}
                after={draft?.title ?? ""}
              />
              <CompareRow
                label="Tags"
                before={(current?.tags ?? []).join(", ")}
                after={(draft?.tags ?? []).join(", ")}
              />
              <CompareRow
                label="SEO title"
                before={current?.seo?.title ?? ""}
                after={draft?.seo?.title ?? ""}
              />
              <CompareRow
                label="SEO description"
                before={current?.seo?.description ?? ""}
                after={draft?.seo?.description ?? ""}
              />

              <CompareRow
                label="Description excerpt"
                before={excerpt(current?.descriptionHtml ?? null, 180)}
                after={excerpt(draft?.descriptionHtml ?? null, 180)}
              />
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <details>
                <summary style={{ cursor: "pointer", opacity: 0.85 }}>
                  Raw HTML (current)
                </summary>
                <pre style={ui.codeBlock}>
                  <code>{current?.descriptionHtml ?? "(empty)"}</code>
                </pre>
              </details>
              <details>
                <summary style={{ cursor: "pointer", opacity: 0.85 }}>
                  Raw HTML (draft)
                </summary>
                <pre style={ui.codeBlock}>
                  <code>{draft?.descriptionHtml ?? "(empty)"}</code>
                </pre>
              </details>
            </div>
          </Panel>

          <Panel title="Draft output">
            {!draft ? (
              <div style={ui.muted}>No draft yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Title</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {draft.title}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Bullet points
                  </div>
                  {draft.bulletPoints.length === 0 ? (
                    <div style={ui.muted}>(none)</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {draft.bulletPoints.map((b) => (
                        <li key={b} style={{ margin: "6px 0" }}>
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Tags</div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap" as const,
                    }}
                  >
                    {draft.tags.length ? (
                      draft.tags.map((t) => <Chip key={t}>{t}</Chip>)
                    ) : (
                      <span style={ui.muted}>(none)</span>
                    )}
                  </div>
                </div>

                <div style={ui.grid2}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>SEO title</div>
                    <div style={{ ...ui.codeBlock, padding: 10 }}>
                      {draft.seo.title}
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      SEO description
                    </div>
                    <div style={{ ...ui.codeBlock, padding: 10 }}>
                      {draft.seo.description}
                    </div>
                  </div>
                </div>

                <details>
                  <summary style={{ cursor: "pointer", opacity: 0.85 }}>
                    Debug payload
                  </summary>
                  <pre style={ui.codeBlock}>
                    <code>{JSON.stringify(generateResult, null, 2)}</code>
                  </pre>
                </details>
              </div>
            )}
          </Panel>

          <Panel title="Apply to Shopify">
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Ready checklist
                </div>
                <div
                  style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}
                >
                  <Badge>
                    {productId.trim() ? "Product ID set" : "Product ID missing"}
                  </Badge>
                  <Badge>
                    {generateResult?.generationId
                      ? "Draft generated"
                      : "Draft not generated"}
                  </Badge>
                </div>
              </div>

              <button
                type="button"
                onClick={apply}
                disabled={!canApply || isApplying}
                style={{
                  ...ui.buttonPrimary,
                  background: "#0b5",
                  ...(!canApply || isApplying ? ui.buttonDisabled : {}),
                }}
              >
                {isApplying ? "Applying..." : "Apply draft"}
              </button>

              {!canApply && (
                <div style={ui.muted}>
                  Need a product ID and a generated draft.
                </div>
              )}

              {applyResult?.ok === false && (
                <div style={{ color: "#a00" }}>
                  {applyResult.error ?? "Failed"}
                  {applyResult.paywall?.billingUrl && (
                    <span style={{ marginLeft: 10 }}>
                      <Link to={applyResult.paywall.billingUrl}>
                        Go to billing
                      </Link>
                    </span>
                  )}
                </div>
              )}

              {applyResult?.ok && (
                <div style={{ color: "#084" }}>
                  Applied to {applyResult.appliedToProductId}
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
