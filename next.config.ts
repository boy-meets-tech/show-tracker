import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Send PostHog traffic through this site (/ingest) so ad blockers don't
  // drop it. PostHog's API uses trailing slashes, so don't redirect them.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
    const assets = host.replace(/^https:\/\/(us|eu)\.i\./, "https://$1-assets.i.");
    return [
      { source: "/ingest/static/:path*", destination: `${assets}/static/:path*` },
      { source: "/ingest/array/:path*", destination: `${assets}/array/:path*` },
      { source: "/ingest/:path*", destination: `${host}/:path*` },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
