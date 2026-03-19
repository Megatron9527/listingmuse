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
  userErrors?: Array<{ field?: string[]; fieldLabel?: string | null; message: string }>;
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

type PersistedDraftState = {
  productId: string;
  titleOverride: string;
  imageUrlOverride: string;
  settings: ListingGenerationSettings;
  generateResult: GenerateResponse | null;
  editableDraft: EditableDraft | null;
  showCompare: boolean;
  savedAt: string;
};

const DRAFT_STORAGE_KEY = "listingmuse-single-draft-v1";

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const parsePersistedDraftState = (raw: string | null): PersistedDraftState | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedDraftState;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

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
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [generationSuccessMessage, setGenerationSuccessMessage] = useState<string | null>(null);

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
    if (typeof window === "undefined") return;
    const saved = parsePersistedDraftState(window.localStorage.getItem(DRAFT_STORAGE_KEY));
    if (!saved) return;

    const params = new URLSearchParams(window.location.search);
    const productIdFromUrl = params.get("productId")?.trim() ?? "";
    const generationIdFromUrl = params.get("generationId")?.trim() ?? "";
    const restoredProductId =
      productIdFromUrl ||
      (saved.productId ?? "").trim() ||
      (saved.generateResult?.product?.id ?? "").trim();
    const restoredGenerationId =
      generationIdFromUrl ||
      (saved.generateResult?.generationId ?? "").trim();

    setProductId(restoredProductId);
    setTitleOverride(saved.titleOverride ?? "");
    setImageUrlOverride(saved.imageUrlOverride ?? "");
    setSettings(saved.settings ?? { language: "en", market: "cross-border", tone: "conversion" });
    setGenerateResult(
      saved.generateResult
        ? {
            ...saved.generateResult,
            generationId: restoredGenerationId || saved.generateResult.generationId,
            product: saved.generateResult.product
              ? { ...saved.generateResult.product, id: restoredProductId || saved.generateResult.product.id }
              : saved.generateResult.product,
          }
        : null,
    );
    setEditableDraft(saved.editableDraft ?? null);
    setShowCompare(Boolean(saved.showCompare));
    setRestoreMessage("Recovered your last draft after refresh. You can continue editing or apply it now.");
  }, []);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const shouldPersist = Boolean(productId || titleOverride || imageUrlOverride || generateResult || editableDraft);
    if (!shouldPersist) {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }

    const payload: PersistedDraftState = {
      productId,
      titleOverride,
      imageUrlOverride,
      settings,
      generateResult,
      editableDraft,
      showCompare,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
  }, [editableDraft, generateResult, imageUrlOverride, productId, settings, showCompare, titleOverride]);

  const canGenerate = useMemo(() => {
    return Boolean(
      productId.trim() || titleOverride.trim() || imageUrlOverride.trim(),
    );
  }, [imageUrlOverride, productId, titleOverride]);

  const canApply = useMemo(() => {
    return Boolean(productId.trim()) && Boolean(generateResult?.generationId) && Boolean(editableDraft);
  }, [editableDraft, generateResult?.generationId, productId]);

  const selectedProduct = productResults.find((product) => product.id === productId);

  const generate = async () => {
    if (isGenerating) return;

    setValidationMessage(null);
    setGenerationSuccessMessage(null);
    setIsGenerating(true);
    setApplyResult(null);
    setGenerateResult(null);
    setEditableDraft(null);
    setRestoreMessage(null);

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
        setGenerationSuccessMessage("Draft generated successfully. Review the copy below, then apply it to Shopify when ready.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      setGenerateResult({ ok: false, error: message });
    } finally {
      setIsGenerating(false);
    }
  };

  const apply = async () => {
    if (isApplying) return;

    setValidationMessage(null);

    if (!productId.trim()) {
      setApplyResult({ ok: false, error: "Select a Shopify product before applying the draft." });
      return;
    }
    if (!generateResult?.generationId) {
      setApplyResult({ ok: false, error: "Generate a draft first, then apply it to Shopify." });
      return;
    }
    if (!editableDraft) {
      setApplyResult({ ok: false, error: "The draft is missing. Regenerate the listing before applying." });
      return;
    }

    const normalizedDraft = {
      title: editableDraft.title.trim(),
      descriptionHtml: editableDraft.descriptionHtml.trim(),
      tags: splitTags(editableDraft.tagsText),
      seo: {
        title: editableDraft.seoTitle.trim(),
        description: editableDraft.seoDescription.trim(),
      },
    };

    if (
      !normalizedDraft.title &&
      !normalizedDraft.descriptionHtml &&
      normalizedDraft.tags.length === 0 &&
      !normalizedDraft.seo.title &&
      !normalizedDraft.seo.description
    ) {
      setApplyResult({ ok: false, error: "The draft is empty. Add content or regenerate before applying." });
      return;
    }

    setIsApplying(true);
    setApplyResult(null);
    setGenerationSuccessMessage(null);

    try {
      const response = await fetch("/app/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          productId: productId.trim(),
          generationId: generateResult.generationId,
          generated: normalizedDraft,
        }),
      });

      const data = (await response.json()) as ApplyResponse;
      setApplyResult(data);
      if (data.ok && typeof window !== "undefined") {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        setRestoreMessage(null);
      }
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
    infoNotice: {
      borderRadius: 12,
      padding: 12,
      border: "1px solid rgba(0,0,0,0.10)",
      background: "rgba(0,0,0,0.03)",
      fontSize: 13,
      lineHeight: 1.45,
    },
    errorNotice: {
      borderRadius: 12,
      padding: 12,
      border: "1px solid rgba(160,0,0,0.18)",
      background: "#fff5f5",
      color: "#8f1111",
      fontSize: 13,
      lineHeight: 1.45,
    },
    successNotice: {
      borderRadius: 12,
      padding: 12,
      border: "1px solid rgba(11,122,67,0.18)",
      background: "#f1fbf6",
      color: "#0b7a43",
      fontSize: 13,
      lineHeight: 1.45,
    },
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

  const improvementCount = [
    diffLabel(current?.title ?? "", previewDraft?.title ?? ""),
    diffLabel((current?.tags ?? []).join(", "), (previewDraft?.tags ?? []).join(", ")),
    diffLabel(current?.seo?.title ?? "", previewDraft?.seo.title ?? ""),
    diffLabel(current?.seo?.description ?? "", previewDraft?.seo.description ?? ""),
    diffLabel(excerpt(current?.descriptionHtml ?? null, 180), excerpt(previewDraft?.descriptionHtml ?? null, 180)),
  ].filter((status) => status === "Updated" || status === "Added").length;

  const errorFieldSet = new Set((applyResult?.userErrors ?? []).flatMap((item) => item.field ?? []));
  const hasTitleError = errorFieldSet.has("title");
  const hasDescriptionError = errorFieldSet.has("descriptionHtml");
  const hasTagsError = errorFieldSet.has("tags");
  const hasSeoTitleError = errorFieldSet.has("seo") || errorFieldSet.has("title") || errorFieldSet.has("seo.title");
  const hasSeoDescriptionError = errorFieldSet.has("seo") || errorFieldSet.has("description") || errorFieldSet.has("seo.description");

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
              {selectedProduct ? (
                <div style={{ ...ui.codeBlock, padding: 12 }}>
                  <div style={{ fontWeight: 700 }}>{selectedProduct.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                    {selectedProduct.status || "ACTIVE"}
                    {typeof selectedProduct.totalInventory === "number" ? ` · Inventory ${selectedProduct.totalInventory}` : ""}
                  </div>
                </div>
              ) : productId ? (
                <div style={{ ...ui.codeBlock, padding: 12 }}>
                  <div style={{ fontWeight: 700 }}>Selected product ready</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Product ID: {productId}</div>
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
              {!isSearchingProducts && !productSearchError && productResults.length === 0 ? (
                <div style={ui.infoNotice}>No matching products found yet. Try another keyword or pick from the available Shopify products.</div>
              ) : null}
              {productSearchError ? <div style={ui.errorNotice}>{productSearchError}</div> : null}
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
              {restoreMessage ? <div style={ui.infoNotice}>{restoreMessage}</div> : null}
              {isGenerating ? <div style={ui.infoNotice}>Generating your optimized listing now. Keep this page open while we prepare the draft.</div> : null}
              {generationSuccessMessage ? (
                <div style={ui.successNotice}>
                  <div>{generationSuccessMessage}</div>
                  <div style={{ marginTop: 6 }}>Next step: refine the draft in the editor, then apply it to Shopify.</div>
                </div>
              ) : null}
              {generateResult?.ok === false ? (
                <div style={ui.errorNotice}>
                  <div>{generateResult.error ?? "Failed"}</div>
                  {generateResult.paywall?.billingUrl ? <div style={{ marginTop: 6 }}><Link to={generateResult.paywall.billingUrl}>Go to billing</Link></div> : null}
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

            {validationMessage ? <div style={{ ...ui.errorNotice, marginTop: 12 }}>{validationMessage}</div> : null}

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
                  <input style={{ ...ui.input, ...(hasTitleError ? { border: "1px solid #c62828", background: "#fff8f8" } : {}) }} value={editableDraft.title} onChange={(e) => {
                    const value = e.currentTarget.value;
                    setEditableDraft((draftState) => (draftState ? { ...draftState, title: value } : draftState));
                  }} />
                </label>

                <label style={ui.label}>
                  <span>Product description</span>
                  <textarea style={{ ...ui.textarea, minHeight: 180, ...(hasDescriptionError ? { border: "1px solid #c62828", background: "#fff8f8" } : {}) }} value={editableDraft.descriptionHtml} onChange={(e) => {
                    const value = e.currentTarget.value;
                    setEditableDraft((draftState) => (draftState ? { ...draftState, descriptionHtml: value } : draftState));
                  }} />
                </label>

                <label style={ui.label}>
                  <span>Bullet points (one per line)</span>
                  <textarea style={ui.textarea} value={editableDraft.bulletPointsText} onChange={(e) => {
                    const value = e.currentTarget.value;
                    setEditableDraft((draftState) => (draftState ? { ...draftState, bulletPointsText: value } : draftState));
                  }} />
                </label>

                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                  <label style={ui.label}>
                    <span>SEO title</span>
                    <input style={{ ...ui.input, ...(hasSeoTitleError ? { border: "1px solid #c62828", background: "#fff8f8" } : {}) }} value={editableDraft.seoTitle} onChange={(e) => {
                      const value = e.currentTarget.value;
                      setEditableDraft((draftState) => (draftState ? { ...draftState, seoTitle: value } : draftState));
                    }} />
                  </label>
                  <label style={ui.label}>
                    <span>SEO description</span>
                    <textarea style={{ ...ui.textarea, minHeight: 96, ...(hasSeoDescriptionError ? { border: "1px solid #c62828", background: "#fff8f8" } : {}) }} value={editableDraft.seoDescription} onChange={(e) => {
                      const value = e.currentTarget.value;
                      setEditableDraft((draftState) => (draftState ? { ...draftState, seoDescription: value } : draftState));
                    }} />
                  </label>
                </div>

                <label style={ui.label}>
                  <span>Tags (comma separated)</span>
                  <input style={{ ...ui.input, ...(hasTagsError ? { border: "1px solid #c62828", background: "#fff8f8" } : {}) }} value={editableDraft.tagsText} onChange={(e) => {
                    const value = e.currentTarget.value;
                    setEditableDraft((draftState) => (draftState ? { ...draftState, tagsText: value } : draftState));
                  }} />
                </label>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={ui.sectionSub}>Live preview</div>
                  <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{previewDraft.title}</div>
                  <div style={ui.htmlPreview}>{stripHtmlToText(previewDraft.descriptionHtml) || "(empty)"}</div>
                  <div style={ui.row}>
                    {previewDraft.tags.length ? previewDraft.tags.map((tag) => <Chip key={tag}>{tag}</Chip>) : <span style={ui.muted}>(no tags)</span>}
                  </div>
                </div>

                {isApplying ? <div style={ui.infoNotice}>Applying the approved copy back to Shopify now…</div> : null}
                {applyResult?.ok ? (
                  <div style={ui.successNotice}>
                    <div>Applied to {applyResult.appliedToProductId}</div>
                    <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Link to="/app/batch">Back to batch workspace</Link>
                      <button type="button" style={ui.buttonSecondary} onClick={() => {
                        setGenerateResult(null);
                        setEditableDraft(null);
                        setApplyResult(null);
                        setGenerationSuccessMessage(null);
                        setShowCompare(false);
                      }}>Start another listing</button>
                    </div>
                  </div>
                ) : null}
                {applyResult?.ok === false ? (
                  <div style={ui.errorNotice}>
                    <div>{applyResult.error ?? "Failed"}</div>
                    {applyResult.userErrors?.length ? (
                      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                        {applyResult.userErrors.map((err) => (
                          <div key={`${err.field?.join(".")}-${err.message}`}>
                            <strong>{err.fieldLabel ?? (err.field?.join(" → ") || "Shopify")}: </strong>
                            <span>{err.message}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {applyResult.paywall?.billingUrl ? <div style={{ marginTop: 6 }}><Link to={applyResult.paywall.billingUrl}>Go to billing</Link></div> : null}
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
