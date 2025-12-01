/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  eslint: {
    ignoreDuringBuilds: true,
  },

  // Performance
  swcMinify: true,
  compress: true,

  // ❌ تعطيل optimizeCss لأنه يسبب مشكلة critters
  experimental: {
    optimizeCss: false,
    optimizeServerReact: true,
  },

  webpack: (config) => {
    // تمكين Tree Shaking
    config.optimization.usedExports = true;

    // تحسين فصل الحزم
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
