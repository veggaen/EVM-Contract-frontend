import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding", "@react-native-async-storage/async-storage");
    return config;
  },
  reactStrictMode: true,
  // Force a unique build id each build to invalidate any cached chunk URLs
  generateBuildId: async () => `build-${Date.now()}`,
};

export default nextConfig;
