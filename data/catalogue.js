/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * The published catalogue (Founder's update of 14 October 2026). One record: the current edition.
 * Every edition keeps its own immutable file under /catalogue/<edition>/; the stable address
 * /catalogue/MAXIMUS_TENNIS_Catalogue.pdf serves the current edition's bytes (next.config.js
 * rewrite), so a link in a letter never breaks and never points at an older edition.
 * tests/catalogue-file.test.mjs checks the file, its size and SHA-256 and the product data version.
 */
export const catalogue = {
  edition: "5.0",
  date: "2026-10-14",
  productDataVersion: "2026-10-13.D",
  pages: 23,
  bytes: 3622492,
  sha256: "a7000867a03a98beb68d9aff3e442f940bb261f679f7b5d01b4b70732cf7cb90",
  fileName: "MAXIMUS_TENNIS_Catalogue.pdf",
  stablePath: "/catalogue/MAXIMUS_TENNIS_Catalogue.pdf",
  editionPath: "/catalogue/5.0/MAXIMUS_TENNIS_Catalogue.pdf",
  /** Page previews rendered from the PDF itself (page number, file, pixel size). */
  previews: [
    { page: 1, src: "/catalogue/5.0/page-01.webp", width: 720, height: 1296 },
    { page: 6, src: "/catalogue/5.0/page-06.webp", width: 480, height: 864 },
    { page: 13, src: "/catalogue/5.0/page-13.webp", width: 480, height: 864 },
    { page: 16, src: "/catalogue/5.0/page-16.webp", width: 480, height: 864 },
  ],
};
