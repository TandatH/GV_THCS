import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@school/shared"],

  // Cloudflare Workers Static Assets: build toàn bộ giao diện Next.js thành HTML/CSS/JS tĩnh.
  // Dữ liệu, Auth, Storage và Cloud Functions vẫn dùng Firebase như trước.
  output: "export",
  trailingSlash: true,

  images: {
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
