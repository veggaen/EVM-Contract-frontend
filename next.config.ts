import type { NextConfig } from "next";

const nextConfig: NextConfig = {
   webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding", "@react-native-async-storage/async-storage");
    return config;
  },
  reactStrictMode: true,
};

export default nextConfig;
