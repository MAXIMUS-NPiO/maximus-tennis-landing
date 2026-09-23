import { site } from "../data/site";
export default function robots() {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }], sitemap: `${site.website}/sitemap.xml`, host: site.website };
}
