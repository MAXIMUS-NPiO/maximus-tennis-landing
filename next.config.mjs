/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
// The build year is fixed into the bundle (lib/authorship.js reads it), so the server render and
// the browser print the same copyright years.
const BUILD_YEAR = String(new Date().getUTCFullYear());
const YEARS = BUILD_YEAR === "2026" ? "2026" : `2026–${BUILD_YEAR}`;
// Every script and stylesheet the site delivers opens with the author's notice: the calculations,
// logic and algorithms reach the visitor as code, and the code carries his name (Founder,
// 10 October 2026). Added after minification, so no minifier can strip it.
const BANNER = `/*! © ${YEARS} Maximus Kiriyakulov. All rights reserved. maximus.tennis code, calculations and algorithms are proprietary; no licence is granted. */`;

import { catalogue } from "./data/catalogue.js";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_YEAR: BUILD_YEAR },
  webpack(config, { webpack }) {
    config.plugins.push(
      new webpack.BannerPlugin({
        banner: BANNER,
        raw: true,
        entryOnly: false,
        test: /\.(js|css)$/,
        stage: webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
      }),
    );
    return config;
  },
  poweredByHeader: false,
  serverExternalPackages: ["nodemailer"],
  images: { formats: ["image/avif", "image/webp"] },
  // The stable catalogue address answers with the current edition's file itself (no redirect), so a
  // link printed in a letter keeps working when a new edition is published under its own folder.
  async rewrites() {
    return [{ source: catalogue.stablePath, destination: catalogue.editionPath }];
  },
  async headers() {
    return [
      { source: "/catalogue/:edition/:file+", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: catalogue.stablePath, headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
