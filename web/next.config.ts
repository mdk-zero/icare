import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the workspace root to web/ so Turbopack never falls back to scanning
  // the whole monorepo (mobile/node_modules, ml/, …), which spikes CPU/RAM.
  turbopack: {
    root: path.join(__dirname),
  },
  // LAN origins allowed to reach the dev server (phones/emulators testing
  // the mobile app against this machine).
  allowedDevOrigins: ["192.168.1.100", "192.168.1.11"],
};

export default nextConfig;
