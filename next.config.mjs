/** @type {import('next').NextConfig} */
const nextConfig = {
  // 禁用图片优化域名限制，因为我们用自定义 /api/image 路由服务本地图片
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
