import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@graph8/sdk"],
  devIndicators: false, // no framework badge on stage
};

export default nextConfig;
