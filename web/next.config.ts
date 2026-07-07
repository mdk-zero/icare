import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

module.exports = {
  allowedDevOrigins: ["192.168.1.100"],
};

export default nextConfig;
