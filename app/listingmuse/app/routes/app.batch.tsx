import { useEffect, useMemo, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
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

type BatchGenerateResponse = {
  ok: boolean;
  generationId?: string;
  product?: { id: string; title: string } | null;
  listing?: {
    title: string;
    bulletPoints: string[];
    tags: string[];
    seo: { title: string; description: string };
  };
  error?: string;
};

type BatchRow = {
  product: ProductPickerItem;
  status: "queued" | "running" | "done" | "error";
  generationId?: string;
  generatedTitle?: string;
  generatedTags?: string[];
  error?: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function BatchPage() {
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductPickerItem[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<ProductPickerItem[]>([]);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [productSearchError, setProductSearchError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const [settings, setSettings] = useState<ListingGenerationSettings>({
    language: "en",
    market: "cross-border",
    tone: "conversion",
  });

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

  const toggleProduct = (product: ProductPickerItem) => {
    setSelectedProducts((current) => {
      if (current.some((item) => item.id === product.id)) {
        return current.filter((item) => item.id !== product.id);
      }
      return [...current, product];
    });
  };

  const queueSelected = () => {
    setRows(
      selectedProducts.map((product) => ({
        product,
        status: "queued",
      })),
    );
  };

  const runBatch = async () => {
    if (!rows.length || isRunning) return;
    setIsRunning(true);

    for (const row of rows) {
      setRows((current) =>
        current.map((item) =>
          item.product.id === row.product.id ? { ...item, status: "running", error: undefined } : item,
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
          throw new Error(data.error || "Generation failed");
        }

        setRows((current) =>
          current.map((item) =>
            item.product.id === row.product.id
              ? {
                  ...item,
                  status: "done",
                  generationId: data.generationId,
                  generatedTitle: data.listing?.title,
                  generatedTags: data.listing?.tags ?? [],
                }
              : item,
          ),
        );
      } catch (error) {
        setRows((current) =>
          current.map((item) =>
            item.product.id === row.product.id
              ? {
                  ...item,
                  status: "error",
                  error: error instanceof Error ? error.message : "Generation failed",
                }
              : item,
          ),
        );
      }
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
              {productSearchError ? <div style={{ color: "#a00" }}>{productSearchError}</div> : null}
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
                  {isRunning ? "Generating..." : `Run batch (${rows.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={ui.card}>
            <div style={ui.sectionTitle}>Batch queue</div>
            {!rows.length ? (
              <div style={ui.muted}>No products queued yet. Select products on the left, then queue them for generation.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
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
                    {row.error ? <div style={{ color: "#a00" }}>{row.error}</div> : null}
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
