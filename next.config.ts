import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tauri packages the static `out` directory instead of running a Node server.
  output: 'export',
};

export default nextConfig;
