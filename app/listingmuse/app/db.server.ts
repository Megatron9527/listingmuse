import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

/**
 * In dev, Remix/React-Router + Shopify tooling can hot-reload modules while
 * keeping the same Node process. PrismaClient is often cached on `global` to
 * avoid exhausting DB connections.
 *
 * However, when Prisma schema changes (e.g. adding Billing model) and the client
 * is regenerated, a stale cached client may not have the new model delegates
 * (e.g. `prisma.billing`), causing runtime crashes.
 *
 * This guard self-heals by re-instantiating PrismaClient if the cached instance
 * appears stale.
 */
const getPrismaClient = () => {
  const cached = global.prismaGlobal;

  // If we have a cached client but it doesn't expose expected delegates,
  // it's likely stale (generated from an older schema).
  if (cached && !("billing" in (cached as unknown as Record<string, unknown>))) {
    global.prismaGlobal = undefined;
  }

  if (process.env.NODE_ENV !== "production") {
    if (!global.prismaGlobal) {
      global.prismaGlobal = new PrismaClient();
    }
    return global.prismaGlobal;
  }

  return new PrismaClient();
};

const prisma = getPrismaClient();

export default prisma;
