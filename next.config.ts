import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.80"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
