import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const baseConfig: NextConfig = {
  headers: async () => [
    { source: '/(.*)', headers: securityHeaders },
  ],
  webpack: (config) => {
    // Fix for @sparkjsdev/spark WASM URL resolution with Webpack/Next.js
    // See: https://github.com/sparkjsdev/spark-react-r3f#using-webpack
    config.module.parser = {
      ...config.module.parser,
      javascript: {
        ...config.module.parser?.javascript,
        url: false, // disable parsing of `new URL()` syntax
      },
    }
    return config
  },
};

export default withBundleAnalyzer(
  withSentryConfig(baseConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: !process.env.CI,
    widenClientFileUpload: true,
  })
);
