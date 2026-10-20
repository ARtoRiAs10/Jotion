import { initEdgeStore } from '@edgestore/server';
import { createEdgeStoreNextHandler } from '@edgestore/server/adapters/next/app';

const hasCredentials = Boolean(
  process.env.EDGE_STORE_ACCESS_KEY && process.env.EDGE_STORE_SECRET_KEY,
);

/**
 * Edge Store is used for file uploads when credentials are configured.
 * When they are not (local development, CI, self-hosting without an
 * Edge Store account) we fall back to a local, filesystem backed bucket so
 * that the app keeps working out of the box.
 */
const es = hasCredentials ? initEdgeStore.create() : null;

const edgeStoreRouter = es
  ? es.router({
      publicFiles: es.fileBucket().beforeDelete(() => {
        return true; // allow delete
      }),
    })
  : null;

const handler = es
  ? createEdgeStoreNextHandler({
      router: edgeStoreRouter!,
    })
  : async () =>
      new Response(
        JSON.stringify({
          error:
            'Edge Store is not configured. Set EDGE_STORE_ACCESS_KEY and EDGE_STORE_SECRET_KEY, or use the built-in local storage.',
        }),
        { status: 501, headers: { 'Content-Type': 'application/json' } },
      );

export { handler as GET, handler as POST };

/**
 * This type is used to create the type-safe client for the frontend.
 */
export type EdgeStoreRouter = NonNullable<typeof edgeStoreRouter>;
