import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Hides Next.js' development-only compile/render badge without hiding real errors.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  distDir: process.env.NEXORAO_DIST_DIR ?? ".next",
  images: {
    // Provider brand marks are local, audited SVG assets under /brand/models.
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  async headers() {
    const devEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";
    const securityHeaders = [
      { key: "Content-Security-Policy", value: [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline'${devEval} https://checkout.razorpay.com`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://api.razorpay.com",
        "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self' https://api.razorpay.com",
      ].join("; ") },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
