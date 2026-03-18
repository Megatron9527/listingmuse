import { useEffect, useMemo, useState } from "react";
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

type ProductPickerItem = {
  id: string;
  title: string;
  status?: string | null;
  totalInventory?: number | null;
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

type EditableDraft = {
  title: string;
  descriptionHtml: string;
  bulletPointsText: string;
  tagsText: string;
  seoTitle: string;
  seoDescription: string;
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

type ProductSearchResponse = {
  ok: boolean;
  products?: ProductPickerItem[];
  error?: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

const toEditableDraft = (draft: ListingDraft): EditableDraft => ({
  title: draft.title ?? "",
  descriptionHtml: draft.descriptionHtml ?? "",
  bulletPointsText: (draft.bulletPoints ?? []).join("\n"),
  tagsText: (draft.tags ?? []).join(", "),
  seoTitle: draft.seo?.title ?? "",
  seoDescription: draft.seo?.description ?? "",
});

const splitLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

const splitTags = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export default function GeneratePage() {
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductPickerItem[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [productSearchError, setProductSearchError] = useState<string | null>(null);
  const [titleOverride, setTitleOverride] = useState("");
  const [imageUrlOverride, setImageUrlOverride] = useState("");
  const [showCompare, setShowCompare] = useState(false);
  const [editableDraft, setEditableDraft] = useState<EditableDraft | null>(null);

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

  useEffect(() => {
    const controller = new AbortController();
    const query = productSearch.trim();

    const run = async () => {
      setIsSearchingProducts(true);
      setProductSearchError(null);
      try {
        const searchUrl = query
          ? `/app/api/products?q=${encodeURIComponent(query)}`
          : "/app/api/products";
        const response = await fetch(searchUrl, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        const data = (await response.json()) as ProductSearchResponse;
        if (!response.ok || data.ok === false) {
          throw new Error(data.error || "Product search failed");
        }
        setProductResults(data.products ?? []);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setProductResults([]);
        setProductSearchError(
          error instanceof Error ? error.message : "Product search failed",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchingProducts(false);
        }
      }
    };

    const timeout = setTimeout(run, query ? 260 : 0);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [productSearch]);

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
    setEditableDraft(null);

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
      setShowCompare(false);
      if (data.listing) {
        setEditableDraft(toEditableDraft(data.listing));
      }
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
          generated: editableDraft
            ? {
                title: editableDraft.title,
                descriptionHtml: editableDraft.descriptionHtml,
                tags: splitTags(editableDraft.tagsText),
                seo: {
                  title: editableDraft.seoTitle,
                  description: editableDraft.seoDescription,
                },
              }
            : undefined,
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

  const previewDraft = editableDraft
    ? {
        title: editableDraft.title,
        descriptionHtml: editableDraft.descriptionHtml,
        bulletPoints: splitLines(editableDraft.bulletPointsText),
        tags: splitTags(editableDraft.tagsText),
        seo: {
          title: editableDraft.seoTitle,
          description: editableDraft.seoDescription,
        },
      }
    : null;

  const ui = {
    page: { padding: 18, maxWidth: 1180, margin: "0 auto" },
    hero: {
      display: "grid",
      gap: 14,
      marginBottom: 14,
      padding: 18,
      borderRadius: 16,
      border: "1px solid rgba(0,0,0,0.10)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(246,247,248,0.94) 100%)",
    },
    heroTitle: { margin: 0, fontSize: 28, lineHeight: 1.05, letterSpacing: "-0.03em" },
    heroSub: {
      margin: 0,
      opacity: 0.78,
      maxWidth: 780,
      lineHeight: 1.45,
      fontSize: 14,
    },
    heroStats: { display: "flex", gap: 10, flexWrap: "wrap" as const },
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
      padding: "7px 11px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.10)",
      background: "rgba(0,0,0,0.02)",
      textDecoration: "none",
      color: "inherit",
      fontSize: 13,
    },
    layout: {
      display: "grid",
      gridTemplateColumns: "minmax(320px, 380px) minmax(0, 1fr)",
      gap: 14,
      alignItems: "start",
    },
    sidebar: {
      display: "grid",
      gap: 12,
      position: "sticky" as const,
      top: 18,
      alignSelf: "start",
    },
    card: {
      border: "1px solid rgba(0,0,0,0.12)",
      borderRadius: 14,
      padding: 14,
      background: "rgba(255,255,255,0.94)",
      boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
    },
    sectionTitle: { fontWeight: 700, marginBottom: 10, letterSpacing: "-0.01em" },
    label: { display: "grid", gap: 6, fontSize: 13 },
    input: {
      padding: 10,
      borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.18)",
      background: "white",
      width: "100%",
      boxSizing: "border-box" as const,
    },
    textarea: {
      padding: 10,
      borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.18)",
      background: "white",
      width: "100%",
      boxSizing: "border-box" as const,
      minHeight: 120,
      font: "inherit",
      resize: "vertical" as const,
    },
    select: {
      padding: 10,
      borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.18)",
      background: "white",
    },
    buttonPrimary: {
      padding: "11px 14px",
      borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.18)",
      background: "#111",
      color: "white",
      cursor: "pointer",
      fontWeight: 700,
    },
    buttonSecondary: {
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.12)",
      background: "white",
      color: "#111",
      cursor: "pointer",
      fontWeight: 600,
    },
    buttonSuccess: {
      padding: "11px 14px",
      borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.16)",
      background: "#0b7a43",
      color: "white",
      cursor: "pointer",
      fontWeight: 700,
    },
    buttonDisabled: { opacity: 0.55, cursor: "not-allowed" },
    badge: {
      display: "inline-flex",
      alignItems: "center",
      padding: "4px 9px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.10)",
      background: "rgba(0,0,0,0.03)",
      fontSize: 12,
    },
    chip: {
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 10px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.10)",
      background: "rgba(255,255,255,0.96)",
      fontSize: 12,
    },
    muted: { opacity: 0.72 },
    resultGrid: { display: "grid", gap: 12 },
    row: { display: "flex", gap: 10, flexWrap: "wrap" as const, alignItems: "center" },
    metricRow: {
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: 10,
    },
    metricCard: {
      border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: 12,
      padding: 12,
      background: "rgba(0,0,0,0.02)",
    },
    codeBlock: {
      margin: 0,
      overflow: "auto",
      padding: 10,
      borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.10)",
      background: "rgba(0,0,0,0.02)",
    },
    compareRow: {
      display: "grid",
      gap: 6,
      padding: 12,
      borderRadius: 12,
      border: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(0,0,0,0.02)",
    },
    compareGrid: { display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" },
    htmlPreview: {
      padding: 12,
      borderRadius: 12,
      border: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(0,0,0,0.02)",
      whiteSpace: "pre-wrap" as const,
    },
    sectionSub: { fontSize: 12, opacity: 0.68, marginBottom: 8 },
    pickerList: {
      display: "grid",
      gap: 8,
      marginTop: 10,
      maxHeight: 280,
      overflowY: "auto" as const,
    },
    pickerItem: {
      border: "1px solid rgba(0,0,0,0.10)",
      borderRadius: 12,
      padding: 10,
      background: "rgba(0,0,0,0.02)",
      cursor: "pointer",
      display: "grid",
      gap: 6,
    },
    editorGrid: { display: "grid", gap: 12, marginTop: 14 },
  };

  const stripHtmlToText = (html: string) =>
    html
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/p\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

  const excerpt = (html: string | null | undefined, max: number) => {
    if (!html) return "";
    const txt = stripHtmlToText(html);
    if (txt.length <= max) return txt;
    const slice = txt.slice(0, max + 1);
    const lastSpace = slice.lastIndexOf(" ");
    const cut = lastSpace > 40 ? slice.slice(0, lastSpace) : txt.slice(0, max);
    return `${cut.trim()}...`;
  };

  const diffLabel = (before: string | null | undefined, after: string | null | undefined) => {
    const b = (before ?? "").trim();
    const a = (after ?? "").trim();
    if (!b && !a) return "Missing";
    if (b === a) return "Unchanged";
    if (!b && a) return "Added";
    if (b && !a) return "Removed";
    return "Updated";
  };

  const Badge = ({ children }: { children: string }) => <span style={ui.badge}>{children}</span>;
  const Chip = ({ children }: { children: string }) => <span style={ui.chip}>{children}</span>;

  const CompareRow = ({ label, before, after }: { label: string; before: string; after: string }) => {
    const status = diffLabel(before, after);
    return (
      <div style={ui.compareRow}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
          <span style={ui.badge}>{status}</span>
        </div>
        <div style={ui.compareGrid}>
          <div style={{ ...ui.codeBlock, padding: 10 }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>Current</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{before || "(empty)"}</div>
          </div>
          <div style={{ ...ui.codeBlock, padding: 10 }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>Edited</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{after || "(empty)"}</div>
          </div>
        </div>
      </div>
    );
  };

  const draftDescriptionText = previewDraft?.descriptionHtml
    ? stripHtmlToText(previewDraft.descriptionHtml)
    : "";

  const improvementCount = [
    diffLabel(current?.title ?? "", previewDraft?.title ?? ""),
    diffLabel((current?.tags ?? []).join(", "), (previewDraft?.tags ?? []).join(", ")),
    diffLabel(current?.seo?.title ?? "", previewDraft?.seo.title ?? ""),
    diffLabel(current?.seo?.description ?? "", previewDraft?.seo.description ?? ""),
    diffLabel(excerpt(current?.descriptionHtml ?? null, 180), excerpt(previewDraft?.descriptionHtml ?? null, 180)),
  ].filter((status) => status === "Updated" || status === "Added").length;

  const selectedProduct = productResults.find((product) => product.id === productId);

  return (
    <div style={ui.page}>
      <div style={ui.hero}>
        <div style={{ display: "grid", gap: 8 }}>
          <h1 style={ui.heroTitle}>ListingMuse</h1>
          <p style={ui.heroSub}>
            Turn rough product data into conversion-ready Shopify listings for cross-border stores.
            Pick a product, generate polished copy, edit it like a merchant, then publish with one click.
          </p>
        </div>
        <div style={ui.heroStats}>
          <Badge>English output</Badge>
          <Badge>Cross-border ready</Badge>
          <Badge>Editable before publish</Badge>
          {draft?.meta?.providerId ? <Badge>{draft.meta.providerId}</Badge> : null}
        </div>
      </div>

      <div style={ui.navRow}>
        <Link to="/app/batch" style={ui.navPill}>Batch</Link>
        <Link to="/app/settings" style={ui.navPill}>Settings</Link>
        {generateResult?.generationId ? <span style={ui.badge}>Draft ID: {generateResult.generationId}</span> : null}
      </div>

      <div style={ui.layout}>
        <div style={ui.sidebar}>
          <div style={ui.card}>
            <div style={ui.sectionTitle}>1. Choose product</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={ui.label}>
                <span>Search products</span>
                <input value={productSearch} onChange={(e) => setProductSearch(e.currentTarget.value)} placeholder="Search by product title" style={ui.input} />
              </label>
              <label style={ui.label}>
                <span>Selected product ID</span>
                <input value={productId} onChange={(e) => setProductId(e.currentTarget.value)} placeholder="Pick below or paste a Shopify product ID" style={ui.input} />
              </label>
              {selectedProduct ? (
                <div style={{ ...ui.codeBlock, padding: 12 }}>
                  <div style={{ fontWeight: 700 }}>{selectedProduct.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                    {selectedProduct.status || "ACTIVE"}
                    {typeof selectedProduct.totalInventory === "number" ? ` · Inventory ${selectedProduct.totalInventory}` : ""}
                  </div>
                </div>
              ) : null}
              <div style={ui.pickerList}>
                {productResults.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    style={{
                      ...ui.pickerItem,
                      ...(product.id === productId ? { border: "1px solid #111", background: "rgba(0,0,0,0.04)" } : {}),
                    }}
                    onClick={() => {
                      setProductId(product.id);
                      setTitleOverride("");
                      if (product.imageUrl) setImageUrlOverride(product.imageUrl);
                    }}
                  >
                    <div style={{ fontWeight: 700, textAlign: "left" }}>{product.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.72, textAlign: "left" }}>
                      {product.status || "ACTIVE"}
                      {typeof product.totalInventory === "number" ? ` · Inventory ${product.totalInventory}` : ""}
                    </div>
                  </button>
                ))}
              </div>
              {isSearchingProducts ? <div style={ui.muted}>Loading products...</div> : null}
              {productSearchError ? <div style={{ color: "#a00" }}>{productSearchError}</div> : null}
            </div>
          </div>

          <div style={ui.card}>
            <div style={ui.sectionTitle}>2. Generation settings</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={ui.label}>
                <span>Language</span>
                <select value={settings.language} onChange={(e) => setSettings((s) => ({ ...s, language: e.currentTarget.value === "en" ? "en" : "en" }))} style={ui.select}>
                  <option value="en">English</option>
                </select>
              </label>
              <label style={ui.label}>
                <span>Market</span>
                <select value={settings.market} onChange={(e) => setSettings((s) => ({ ...s, market: e.currentTarget.value === "cross-border" ? "cross-border" : "cross-border" }))} style={ui.select}>
                  <option value="cross-border">Cross-border independent stores</option>
                </select>
              </label>
              <label style={ui.label}>
                <span>Tone</span>
                <select value={settings.tone} onChange={(e) => setSettings((s) => ({ ...s, tone: e.currentTarget.value === "neutral" ? "neutral" : "conversion" }))} style={ui.select}>
                  <option value="conversion">Conversion-focused</option>
                  <option value="neutral">Neutral</option>
                </select>
              </label>
              <label style={ui.label}>
                <span>Title override</span>
                <input value={titleOverride} onChange={(e) => setTitleOverride(e.currentTarget.value)} placeholder="Optional: force a starting title" style={ui.input} />
              </label>
              <label style={ui.label}>
                <span>Image URL override</span>
                <input value={imageUrlOverride} onChange={(e) => setImageUrlOverride(e.currentTarget.value)} placeholder="Optional: use a specific hero image" style={ui.input} />
              </label>
            </div>
          </div>

          <div style={ui.card}>
            <div style={ui.sectionTitle}>3. Generate</div>
            <div style={{ display: "grid", gap: 10 }}>
              <button type="button" onClick={generate} disabled={!canGenerate || isGenerating} style={{ ...ui.buttonPrimary, ...(!canGenerate || isGenerating ? ui.buttonDisabled : {}) }}>
                {isGenerating ? "Generating..." : "Generate optimized listing"}
              </button>
              {!canGenerate ? <div style={ui.muted}>Pick a product or provide manual title/image input.</div> : null}
              {generateResult?.ok === false ? (
                <div style={{ color: "#a00", display: "grid", gap: 6 }}>
                  <div>{generateResult.error ?? "Failed"}</div>
                  {generateResult.paywall?.billingUrl ? <Link to={generateResult.paywall.billingUrl}>Go to billing</Link> : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div style={ui.resultGrid}>
          <div style={ui.card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={ui.sectionTitle}>Optimized listing editor</div>
                <div style={ui.sectionSub}>Generate first, then refine title, description, bullets, SEO, and tags before publishing.</div>
              </div>
              <div style={ui.row}>
                {previewDraft ? (
                  <button type="button" style={ui.buttonSecondary} onClick={() => setShowCompare((v) => !v)}>
                    {showCompare ? "Hide changes" : "Compare with current"}
                  </button>
                ) : null}
                <button type="button" onClick={apply} disabled={!canApply || isApplying} style={{ ...ui.buttonSuccess, ...(!canApply || isApplying ? ui.buttonDisabled : {}) }}>
                  {isApplying ? "Applying..." : "Apply to Shopify"}
                </button>
              </div>
            </div>

            {!previewDraft || !editableDraft ? (
              <div style={{ ...ui.muted, marginTop: 10 }}>No draft yet. Generate a listing to start editing.</div>
            ) : (
              <div style={ui.editorGrid}>
                <div style={ui.metricRow}>
                  <div style={ui.metricCard}>
                    <div style={{ fontSize: 12, opacity: 0.68 }}>Improved fields</div>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>{improvementCount}</div>
                  </div>
                  <div style={ui.metricCard}>
                    <div style={{ fontSize: 12, opacity: 0.68 }}>Bullet points</div>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>{splitLines(editableDraft.bulletPointsText).length}</div>
                  </div>
                  <div style={ui.metricCard}>
                    <div style={{ fontSize: 12, opacity: 0.68 }}>Tags</div>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>{splitTags(editableDraft.tagsText).length}</div>
                  </div>
                </div>

                <label style={ui.label}>
                  <span>Title</span>
                  <input style={ui.input} value={editableDraft.title} onChange={(e) => setEditableDraft((draftState) => (draftState ? { ...draftState, title: e.currentTarget.value } : draftState))} />
                </label>

                <label style={ui.label}>
                  <span>Product description</span>
                  <textarea style={{ ...ui.textarea, minHeight: 180 }} value={editableDraft.descriptionHtml} onChange={(e) => setEditableDraft((draftState) => (draftState ? { ...draftState, descriptionHtml: e.currentTarget.value } : draftState))} />
                </label>

                <label style={ui.label}>
                  <span>Bullet points (one per line)</span>
                  <textarea style={ui.textarea} value={editableDraft.bulletPointsText} onChange={(e) => setEditableDraft((draftState) => (draftState ? { ...draftState, bulletPointsText: e.currentTarget.value } : draftState))} />
                </label>

                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                  <label style={ui.label}>
                    <span>SEO title</span>
                    <input style={ui.input} value={editableDraft.seoTitle} onChange={(e) => setEditableDraft((draftState) => (draftState ? { ...draftState, seoTitle: e.currentTarget.value } : draftState))} />
                  </label>
                  <label style={ui.label}>
                    <span>SEO description</span>
                    <textarea style={{ ...ui.textarea, minHeight: 96 }} value={editableDraft.seoDescription} onChange={(e) => setEditableDraft((draftState) => (draftState ? { ...draftState, seoDescription: e.currentTarget.value } : draftState))} />
                  </label>
                </div>

                <label style={ui.label}>
                  <span>Tags (comma separated)</span>
                  <input style={ui.input} value={editableDraft.tagsText} onChange={(e) => setEditableDraft((draftState) => (draftState ? { ...draftState, tagsText: e.currentTarget.value } : draftState))} />
                </label>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={ui.sectionSub}>Live preview</div>
                  <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{previewDraft.title}</div>
                  <div style={ui.htmlPreview}>{stripHtmlToText(previewDraft.descriptionHtml) || "(empty)"}</div>
                  <div style={ui.row}>
                    {previewDraft.tags.length ? previewDraft.tags.map((tag) => <Chip key={tag}>{tag}</Chip>) : <span style={ui.muted}>(no tags)</span>}
                  </div>
                </div>

                {applyResult?.ok ? <div style={{ color: "#0b7a43", fontWeight: 700 }}>Applied to {applyResult.appliedToProductId}</div> : null}
                {applyResult?.ok === false ? (
                  <div style={{ color: "#a00", display: "grid", gap: 6 }}>
                    <div>{applyResult.error ?? "Failed"}</div>
                    {applyResult.userErrors?.length ? applyResult.userErrors.map((err) => <div key={`${err.field?.join(".")}-${err.message}`}>{err.message}</div>) : null}
                    {applyResult.paywall?.billingUrl ? <Link to={applyResult.paywall.billingUrl}>Go to billing</Link> : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {previewDraft && showCompare ? (
            <div style={ui.card}>
              <div style={ui.sectionTitle}>Change review</div>
              <div style={ui.sectionSub}>Keep this secondary. Merchants should focus on the result, then inspect changes only when needed.</div>
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                <CompareRow label="Title" before={current?.title ?? ""} after={previewDraft.title ?? ""} />
                <CompareRow label="Tags" before={(current?.tags ?? []).join(", ")} after={(previewDraft.tags ?? []).join(", ")} />
                <CompareRow label="SEO title" before={current?.seo?.title ?? ""} after={previewDraft.seo.title ?? ""} />
                <CompareRow label="SEO description" before={current?.seo?.description ?? ""} after={previewDraft.seo.description ?? ""} />
                <CompareRow label="Description excerpt" before={excerpt(current?.descriptionHtml ?? null, 180)} after={excerpt(previewDraft.descriptionHtml ?? null, 180)} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
