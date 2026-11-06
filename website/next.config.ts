import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The site is now one page, so old localized home and article URLs lead to it.
  async redirects() {
    return [
      { source: "/:locale(en|zh|ja)", destination: "/", permanent: true },
      {
        source: "/:locale(en|zh|ja)/:slug(youtube-subtitle-translator|how-to-translate-youtube-subtitles|ai-providers|bring-your-own-api-key)",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
