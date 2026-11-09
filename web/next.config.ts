import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { execSync } from "child_process";
import path from "path";

/**
 * Which web code this build is, for UpdateToast: the last commit that changed
 * web/. Vercel deploys every push to main, docs- and mobile-only ones too, and
 * those change nothing a browser runs, so they shouldn't ask anyone to
 * refresh. Falls back to the pushed commit if git can't say, and to the
 * deployment off git; empty off Vercel, which turns the check off. (In a
 * shallow clone with no web change in reach, git names the clone's oldest
 * commit, which costs at most an extra prompt.)
 */
function webBuildId(): string {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!commit) return process.env.VERCEL_DEPLOYMENT_ID || "";
  try {
    const lastWebChange = execSync("git log -1 --format=%H -- .", {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return lastWebChange || commit;
  } catch {
    return commit;
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Lets a one-off build write somewhere other than .next, e.g.
  // `NEXT_DIST_DIR=.next-build npm run build`. Running a build into .next while
  // `next dev` is live leaves the dev server serving a half-updated CSS chunk.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    // Baked into the browser bundle and the server alike. /api/version
    // answers with the live deployment's, and an open tab holding an older
    // one offers a refresh (UpdateToast). A commit rather than the
    // deployment, so a redeploy of the same code (an env var change) prompts
    // nobody either.
    ICARE_BUILD_ID: webBuildId(),
  },
  typescript: {
    // check.sh type-checks first, with tsconfig.check.json, and its build
    // skips a second pass: `next build` checks everything tsconfig.json
    // includes, .next/dev/types among it, and fails on a file a dev server
    // left half-written. Every other build (CI, Vercel) still type-checks.
    ignoreBuildErrors: process.env.CHECK_SH_BUILD === "1",
  },
  // Pin the workspace root to web/ so Turbopack never falls back to scanning
  // the whole monorepo (mobile/node_modules, ml/, …), which spikes CPU/RAM.
  turbopack: {
    root: path.join(__dirname),
  },
  // pdf.js starts its worker by importing a pdf.worker.mjs beside itself at
  // runtime. Bundled into a server chunk, that file is left behind and every
  // lesson PDF fails to parse, so pdf-parse loads from node_modules instead —
  // and the worker, which file tracing can't see through a runtime import, is
  // shipped explicitly to the routes that read lessons.
  serverExternalPackages: ["pdf-parse"],
  outputFileTracingIncludes: {
    // The PDF letterhead reads the logo from disk (app/lib/reports/kit.tsx).
    "/api/faculty/reports/*": ["./public/logo-no-bg.png"],
    "/api/admin/reports/*": ["./public/logo-no-bg.png"],
    "/api/faculty/scenarios/analyze-lesson": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
    "/api/faculty/assessments/*/questions/generate-from-lesson": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
  experimental: {
    // Hold route segments in the client router cache instead of re-requesting
    // the RSC payload on every navigation. Without this `dynamic` is 0s, so
    // moving between two pages re-renders both server-side every time.
    staleTimes: {
      dynamic: 180,
      static: 300,
    },
  },
  // LAN origins allowed to reach the dev server (phones/emulators testing
  // the mobile app against this machine).
  allowedDevOrigins: ["192.168.1.100", "192.168.1.11"],
  // The student web app (lib/student-web) is a single-page app published into
  // public/student by mobile/scripts/publish-web.mjs. Its own router handles
  // every address under /student, so a path there that isn't a file gets its
  // index.html. Fallback rewrites run after public files, so the app's
  // scripts and images are served as they are.
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        { source: "/student", destination: "/student/index.html" },
        { source: "/student/:path*", destination: "/student/index.html" },
      ],
    };
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "icare-9z",

  project: "icare-slug",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
