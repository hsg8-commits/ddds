import type { NextConfig } from "next";
import type { Configuration } from "webpack";

const nextConfig: NextConfig = {
  reactStrictMode: false,

  eslint: {
    ignoreDuringBuilds: true,
  },

  swcMinify: true,
  compress: true,

  experimental: {
    optimizeCss: false,          // إيقاف الميزة التي تسبب خطأ critters
    optimizeServerReact: true,
  },

  webpack: (config: Configuration) => {
    if (config.optimization) {
      config.optimization.usedExports = true;

      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...(config.optimization.splitChunks?.cacheGroups || {}),
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendors",
            chunks: "all",
          },
        },
      };
    }

    return config;
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.vercel.app",
      },
      {
        protocol: "https",
        hostname: "storage.c2.liara.space",
        pathname: "/tlgrm/**",
      },
      {
        protocol: "https",
        hostname: "*.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
