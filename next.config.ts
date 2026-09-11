import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.WORKSPACE_TEST_DIST_DIR?.match(/^\.next-workspace-test-[a-f0-9]+$/)
    ? { distDir: process.env.WORKSPACE_TEST_DIST_DIR, typescript: { tsconfigPath: `${process.env.WORKSPACE_TEST_DIST_DIR}.tsconfig.json` } } : {}),
  serverExternalPackages: ["pg", "pg-native"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        "pg-native": false,
      };
    }
    return config;
  },
};

export default nextConfig;
