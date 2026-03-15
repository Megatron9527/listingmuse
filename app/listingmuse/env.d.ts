/// <reference types="vite/client" />
/// <reference types="@react-router/node" />

interface ImportMetaEnv {
  readonly LEMONSQUEEZY_STORE_ID?: string;
  readonly LEMONSQUEEZY_API_KEY?: string;
  readonly LEMONSQUEEZY_VARIANT_ID?: string;
  readonly LEMONSQUEEZY_WEBHOOK_SECRET?: string;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly LEMONSQUEEZY_STORE_ID?: string;
      readonly LEMONSQUEEZY_API_KEY?: string;
      readonly LEMONSQUEEZY_VARIANT_ID?: string;
      readonly LEMONSQUEEZY_WEBHOOK_SECRET?: string;
    }
  }
}

export {};
