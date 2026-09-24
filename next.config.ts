import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // The prototype ships no real executive data; CSP is still set so the
  // security posture is visible to the client during review.
  // Plain-language aliases for the renamed sections, and the retired phone
  // "More" page, so older links keep working.
  async redirects() {
    return [
      { source: "/calendar", destination: "/schedule", permanent: false },
      { source: "/notes", destination: "/workspace", permanent: false },
      { source: "/posts", destination: "/publish", permanent: false },
      { source: "/people", destination: "/org-chart", permanent: false },
      { source: "/more", destination: "/", permanent: false },
      { source: "/today", destination: "/", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Content-Security-Policy",
            value:
              `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
