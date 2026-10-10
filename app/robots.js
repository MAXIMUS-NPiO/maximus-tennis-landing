/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { site } from "../data/site";

/**
 * Search engines read the whole site. Crawlers that collect text and images to train artificial
 * intelligence do not: the author reserves text and data mining (terms page, "copyright"; the
 * machine-readable reservation is /.well-known/tdmrep.json). Search crawlers of the same companies
 * are separate agents and are not affected.
 */
const AI_TRAINING = [
  "GPTBot", "Google-Extended", "Applebot-Extended", "CCBot", "ClaudeBot", "anthropic-ai",
  "Bytespider", "meta-externalagent", "cohere-training-data-crawler", "Diffbot", "omgili",
];

export default function robots() {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/"] },
      { userAgent: AI_TRAINING, disallow: "/" },
    ],
    sitemap: `${site.website}/sitemap.xml`,
    host: site.website,
  };
}
