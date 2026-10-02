/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  reactStrictMode: true,
  async rewrites() {
    return [...["/pos", "/products", "/products/new", "/products/deleted", "/products/:id/edit", "/orders", "/finance", "/audit-log", "/reports", "/reports/comparison", "/reports/day/:date", "/team", "/settings", "/stores"].map((source)=>({source,destination:"/"})), { source: "/backend/:path*", destination: `${process.env.API_ORIGIN || "http://localhost:6030"}/marpos/api/:path*` }];
  },
  async headers() {
    return [{source:"/sw.js",headers:[{key:"Cache-Control",value:"no-cache, no-store, must-revalidate"}]}];
  },
  devIndicators: false,
  allowedDevOrigins: ['marpos.cabocil.com'],
};

export default nextConfig;
