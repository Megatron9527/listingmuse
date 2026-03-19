import { useEffect, useMemo, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

type ProductPickerItem = {
  id: string;
  title: string;
  status?: string | null;
  totalInventory?: number | null;
  imageUrl?: string | null;
};

type ProductSearchResponse = {
  ok: boolean;
  products?: ProductPickerItem[];
  error?: string;
};

type ListingGenerationSettings = {
  language: "en";
  market: "cross-border";
  tone: "conversion" | "neutral";
};

type GeneratedListingDraft = {
  title: string;
  descriptionHtml?: string;
  bulletPoints: string[];
  tags: string[];
  seo: { title: string; description: string };
};

type BatchGenerateResponse = {
  ok: boolean;
  generationId?: string;
  product?: { id: string; title: string } | null;
  listing?: GeneratedListingDraft;
  error?: string;
  paywall?: {
    billingUrl?: string;
    checkoutPath?: string;
    reason?: string;
  };
};

type BatchRow = {
  product: ProductPickerItem;
  status: "queued" | "running" | "done" | "error";
  generationId?: string;
  listing?: GeneratedListingDraft;
  generatedTitle?: string;
  generatedTags?: string[];
  error?: string;
  paywall?: BatchGenerateResponse["paywall"];
  completedAt?: string;
};

type BatchWorkspaceState = {
  productSearch: string;
  selectedProducts: ProductPickerItem[];
  rows: BatchRow[];
  settings: ListingGenerationSettings;
  savedAt: string;
};

const BATCH_STORAGE_KEY = "listingmuse-batch-workspace-v1";
const SINGLE_DRAFT_STORAGE_KEY = "listingmuse-single-draft-v1";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

const toEditableDraft = (listing: GeneratedListingDraft) => ({
  title: listing.title ?? "",
  descriptionHtml: listing.descriptionHtml ?? "",
  bulletPointsText: (listing.bulletPoints ?? []).join("\n"),
  tagsText: (listing.tags ?? []).join(", "),
  seoTitle: listing.seo?.title ?? "",
  seoDescription: listing.seo?.description ?? "",
});

const parseBatchWorkspaceState = (raw: string | null): BatchWorkspaceState | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BatchWorkspaceState;
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.rows) || !Array.isArray(parsed.selectedProducts)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export default function BatchPage() {
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductPickerItem[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<ProductPickerItem[]>([]);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [productSearchError, setProductSearchError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchPaywall, setBatchPaywall] = useState<BatchGenerateResponse["paywall"] | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  const [settings, setSettings] = useState<ListingGenerationSettings>({
    language: "en",
    market: "cross-border",
    tone: "conversion",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = parseBatchWorkspaceState(window.localStorage.getItem(BATCH_STORAGE_KEY));
    if (!saved) return;

    setProductSearch(saved.productSearch ?? "");
    setSelectedProducts(saved.selectedProducts ?? []);
    setRows(saved.rows ?? []);
    setSettings(saved.settings ?? { language: "en", market: "cross-border", tone: "conversion" });
    setRestoreMessage("Recovered your last batch workspace after refresh.");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const shouldPersist = Boolean(productSearch || selectedProducts.length || rows.length);
    if (!shouldPersist) {
      window.localStorage.removeItem(BATCH_STORAGE_KEY);
      return;
    }

    const payload: BatchWorkspaceState = {
      productSearch,
      selectedProducts,
      rows,
      settings,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(BATCH_STORAGE_KEY, JSON.stringify(payload));
  }, [productSearch, rows, selectedProducts, settings]);

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

  const selectedIds = useMemo(
    () => new Set(selectedProducts.map((product) => product.id)),
    [selectedProducts],
  );

  const queueSummary = useMemo(() => {
    const queued = rows.filter((row) => row.status === "queued").length;
    const running = rows.filter((row) => row.status === "running").length;
    const done = rows.filter((row) => row.status === "done").length;
    const failed = rows.filter((row) => row.status === "error").length;
    return { queued, running, done, failed, total: rows.length };
  }, [rows]);

  const retryableRows = useMemo(
    () => rows.filter((row) => row.status === "error"),
    [rows],
  );

  const activeRow = useMemo(
    () => rows.find((row) => row.status === "running") ?? null,
    [rows],
  );

  const toggleProduct = (product: ProductPickerItem) => {
    setSelectedProducts((current) => {
      if (current.some((item) => item.id === product.id)) {
        return current.filter((item) => item.id !== product.id);
      }
      return [...current, product];
    });
  };

  const queueSelected = () => {
    setBatchError(null);
    setBatchMessage(null);
    setBatchPaywall(null);
    setRows(
      selectedProducts.map((product) => ({
        product,
        status: "queued",
      })),
    );
  };

  const clearCompleted = () => {
    setRows((current) => current.filter((row) => row.status !== "done"));
  };

  const retryFailed = () => {
    setBatchError(null);
    setBatchMessage(null);
    setBatchPaywall(null);
    setRows((current) =>
      current.map((row) =>
        row.status === "error"
          ? {
              ...row,
              status: "queued",
              error: undefined,
              paywall: undefined,
            }
          : row,
      ),
    );
  };

  const openInEditor = (row: BatchRow) => {
    if (typeof window === "undefined" || !row.generationId || !row.listing) return;

    window.localStorage.setItem(
      SINGLE_DRAFT_STORAGE_KEY,
      JSON.stringify({
        productId: row.product.id,
        titleOverride: "",
        imageUrlOverride: row.product.imageUrl ?? "",
        settings,
        generateResult: {
          ok: true,
          generationId: row.generationId,
          product: {
            id: row.product.id,
            title: row.product.title,
            imageUrl: row.product.imageUrl ?? null,
          },
          listing: row.listing,
        },
        editableDraft: toEditableDraft(row.listing),
        showCompare: false,
        savedAt: new Date().toISOString(),
      }),
    );
    window.location.assign("/app");
  };

  const runBatch = async () => {
    const pendingRows = rows.filter((row) => row.status === "queued" || row.status === "error");
    if (!pendingRows.length || isRunning) return;

    setIsRunning(true);
    setBatchError(null);
    setBatchMessage(null);
    setBatchPaywall(null);

    let doneCount = 0;
    let failedCount = 0;
    let blockedByBilling = false;

    for (const row of pendingRows) {
      setRows((current) =>
        current.map((item) =>
          item.product.id === row.product.id
            ? {
                ...item,
                status: "running",
                error: undefined,
                paywall: undefined,
              }
            : item,
        ),
      );

      try {
        const response = await fetch("/app/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            productId: row.product.id,
            imageUrl: row.product.imageUrl ?? undefined,
            settings,
          }),
        });

        const data = (await response.json()) as BatchGenerateResponse;
        if (!response.ok || data.ok === false || !data.listing) {
          const message =
            data.error === "payment_required"
              ? "Subscription required before batch generation can continue."
              : data.error || "Generation failed";
          const error = new Error(message);
          (error as Error & { paywall?: BatchGenerateResponse["paywall"] }).paywall =
            data.paywall;
          throw error;
        }

        doneCount += 1;
        setRows((current) =>
          current.map((item) =>
            item.product.id === row.product.id
              ? {
                  ...item,
                  status: "done",
                  generationId: data.generationId,
                  listing: data.listing,
                  generatedTitle: data.listing?.title,
                  generatedTags: data.listing?.tags ?? [],
                  error: undefined,
                  paywall: undefined,
                  completedAt: new Date().toISOString(),
                }
              : item,
          ),
        );
      } catch (error) {
        failedCount += 1;
        const paywall = (error as Error & { paywall?: BatchGenerateResponse["paywall"] }).paywall;
        if (paywall) {
          blockedByBilling = true;
          setBatchPaywall(paywall);
        }
        setRows((current) =>
          current.map((item) =>
            item.product.id === row.product.id
              ? {
                  ...item,
                  status: "error",
                  error: error instanceof Error ? error.message : "Generation failed",
                  paywall,
                }
              : item,
          ),
        );

        if (paywall) {
          setRows((current) =>
            current.map((item) =>
              item.status === "queued"
                ? {
                    ...item,
                    error: "Paused because billing must be activated before generation can continue.",
                  }
                : item,
            ),
          );
          break;
        }
      }
    }

    if (blockedByBilling) {
      setBatchError("Batch paused because billing is inactive. Activate billing, then retry the remaining products.");
    } else if (doneCount > 0 && failedCount > 0) {
      setBatchMessage(`Batch finished with partial success: ${doneCount} generated, ${failedCount} failed.`);
    } else if (doneCount > 0) {
      setBatchMessage(`Batch completed successfully for ${doneCount} product${doneCount === 1 ? "" : "s"}.`);
    } else if (failedCount > 0) {
      setBatchError(`Batch finished with ${failedCount} failed product${failedCount === 1 ? "" : "s"}. Review the errors below and retry.`);
    }

    setIsRunning(false);
  };

  const ui = {
    page: { padding: 18, maxWidth: 1180, margin: "0 auto" },
    hero: {
      display: "grid",
      gap: 10,
      marginBottom: 14,
      padding: 18,
      borderRadius: 16,
      border: "1px solid rgba(0,0,0,0.10)",
      background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(246,247,248,0.94) 100%)",
    },
    layout: {
      display: "grid",
      gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)",
      gap: 14,
      alignItems: "start",
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
    buttonDanger: {
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid rgba(160,0,0,0.16)",
      background: "#fff5f5",
      color: "#8f1111",
      cursor: "pointer",
      fontWeight: 700,
    },
    buttonDisabled: { opacity: 0.55, cursor: "not-allowed" },
    muted: { opacity: 0.72 },
    pickerList: { display: "grid", gap: 8, marginTop: 10, maxHeight: 320, overflowY: "auto" as const },
    pickerItem: {
      border: "1px solid rgba(0,0,0,0.10)",
      borderRadius: 12,
      padding: 10,
      background: "rgba(0,0,0,0.02)",
      cursor: "pointer",
      display: "grid",
      gap: 6,
      textAlign: "left" as const,
    },
    statusBadge: {
      display: "inline-flex",
      alignItems: "center",
      padding: "4px 9px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.10)",
      background: "rgba(0,0,0,0.03)",
      fontSize: 12,
    },
    notice: {
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

  return (
    <div style={ui.page}>
      <div style={ui.hero}>
        <h1 style={{ margin: 0, fontSize: 28, letterSpacing: "-0.03em" }}>Batch workspace</h1>
        <p style={{ margin: 0, opacity: 0.78, maxWidth: 760, lineHeight: 1.45 }}>
          Queue multiple Shopify products, generate optimized listings one by one,
          and review which items are ready. This is the first real batch workflow —
          focused on throughput, not spreadsheets.
        </p>
      </div>

      <div style={ui.layout}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={ui.card}>
            <div style={ui.sectionTitle}>1. Pick products</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={ui.label}>
                <span>Search products</span>
                <input value={productSearch} onChange={(e) => setProductSearch(e.currentTarget.value)} placeholder="Search by product title" style={ui.input} />
              </label>

              <div style={ui.pickerList}>
                {productResults.map((product) => {
                  const selected = selectedIds.has(product.id);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      style={{
                        ...ui.pickerItem,
                        ...(selected ? { border: "1px solid #111", background: "rgba(0,0,0,0.05)" } : {}),
                      }}
                      onClick={() => toggleProduct(product)}
                    >
                      <div style={{ fontWeight: 700 }}>{product.title}</div>
                      <div style={{ fontSize: 12, opacity: 0.72 }}>
                        {product.status || "ACTIVE"}
                        {typeof product.totalInventory === "number" ? ` · Inventory ${product.totalInventory}` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>

              {isSearchingProducts ? <div style={ui.muted}>Loading products...</div> : null}
              {!isSearchingProducts && !productSearchError && productResults.length === 0 ? (
                <div style={ui.notice}>
                  {productSearch.trim()
                    ? "No matching active Shopify products found. Try a broader keyword."
                    : "No active Shopify products available to queue yet."}
                </div>
              ) : null}
              {productSearchError ? <div style={ui.errorNotice}>{productSearchError}</div> : null}
            </div>
          </div>

          <div style={ui.card}>
            <div style={ui.sectionTitle}>2. Batch settings</div>
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
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" style={{ ...ui.buttonSecondary, ...(selectedProducts.length === 0 ? ui.buttonDisabled : {}) }} disabled={selectedProducts.length === 0} onClick={queueSelected}>
                  Queue {selectedProducts.length || "selected"}
                </button>
                <button type="button" style={{ ...ui.buttonPrimary, ...(!rows.length || isRunning ? ui.buttonDisabled : {}) }} disabled={!rows.length || isRunning} onClick={runBatch}>
                  {isRunning ? "Generating..." : `Run batch (${rows.filter((row) => row.status === "queued" || row.status === "error").length || rows.length})`}
                </button>
                <button type="button" style={{ ...ui.buttonSecondary, ...(retryableRows.length === 0 || isRunning ? ui.buttonDisabled : {}) }} disabled={retryableRows.length === 0 || isRunning} onClick={retryFailed}>
                  Retry failed ({retryableRows.length})
                </button>
                <button type="button" style={{ ...ui.buttonDanger, ...(queueSummary.done === 0 || isRunning ? ui.buttonDisabled : {}) }} disabled={queueSummary.done === 0 || isRunning} onClick={clearCompleted}>
                  Clear completed ({queueSummary.done})
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={ui.card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={ui.sectionTitle}>Batch queue</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={ui.statusBadge}>Queued {queueSummary.queued}</span>
                <span style={ui.statusBadge}>Running {queueSummary.running}</span>
                <span style={ui.statusBadge}>Done {queueSummary.done}</span>
                <span style={ui.statusBadge}>Failed {queueSummary.failed}</span>
              </div>
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              {restoreMessage ? <div style={ui.notice}>{restoreMessage}</div> : null}
              {isRunning && activeRow ? (
                <div style={ui.notice}>
                  Generating listings now. Currently processing <strong>{activeRow.product.title}</strong>.
                </div>
              ) : null}
              {batchMessage ? (
                <div style={ui.successNotice}>
                  <div>{batchMessage}</div>
                  <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Link to="/app">Open single-item editor</Link>
                    <Link to="/app/settings">Review settings</Link>
                  </div>
                </div>
              ) : null}
              {batchError ? <div style={ui.errorNotice}>{batchError}</div> : null}
              {batchPaywall?.billingUrl ? (
                <div style={ui.notice}>
                  Billing must be activated before the remaining products can be generated. <Link to={batchPaywall.billingUrl}>Open billing</Link>
                </div>
              ) : null}
            </div>

            {!rows.length ? (
              <div style={{ ...ui.notice, marginTop: 10 }}>
                No products queued yet. Select products on the left, then queue them for generation.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {rows.map((row) => (
                  <div key={row.product.id} style={{ border: "1px solid rgba(0,0,0,0.10)", borderRadius: 12, padding: 12, background: "rgba(0,0,0,0.02)", display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700 }}>{row.product.title}</div>
                      <span style={ui.statusBadge}>{row.status}</span>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.72 }}>{row.product.id}</div>
                    {row.generatedTitle ? (
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontSize: 12, opacity: 0.68 }}>Generated title</div>
                        <div>{row.generatedTitle}</div>
                      </div>
                    ) : null}
                    {row.generatedTags?.length ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {row.generatedTags.map((tag) => (
                          <span key={tag} style={ui.statusBadge}>{tag}</span>
                        ))}
                      </div>
                    ) : null}
                    {row.generationId ? <div style={{ fontSize: 12, opacity: 0.72 }}>Draft ID: {row.generationId}</div> : null}
                    {row.completedAt ? <div style={{ fontSize: 12, opacity: 0.72 }}>Ready for review just now.</div> : null}
                    {row.status === "running" ? <div style={ui.notice}>Generating copy for this product…</div> : null}
                    {row.status === "done" ? (
                      <div style={ui.successNotice}>
                        <div>Listing draft ready.</div>
                        <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button type="button" style={ui.buttonSecondary} onClick={() => openInEditor(row)}>
                            Open in editor
                          </button>
                          <span>Continue review and apply with this draft preloaded.</span>
                        </div>
                      </div>
                    ) : null}
                    {row.error ? <div style={ui.errorNotice}>{row.error}</div> : null}
                    {row.paywall?.billingUrl ? (
                      <div style={ui.notice}>
                        This item is blocked by billing. <Link to={row.paywall.billingUrl}>Go to billing</Link>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
