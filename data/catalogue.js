/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * The published catalogue (Founder's update of 14 October 2026). One record: the current edition.
 * Every edition keeps its own immutable file under /catalogue/<edition>/; the stable address
 * /catalogue/MAXIMUS_TENNIS_Catalogue.pdf serves the current edition's bytes (next.config.js
 * rewrite), so a link in a letter never breaks and never points at an older edition.
 * tests/catalogue-file.test.mjs checks the file, its size and SHA-256 and the product data version.
 */
export const catalogue = {
  edition: "5.1",
  date: "2026-10-15",
  productDataVersion: "2026-10-15.E",
  pages: 24,
  bytes: 3655045,
  sha256: "820c3394224f39f0829a512cbd0f78f5e97119e2278a42929b57aa5dd1a8cf57",
  fileName: "MAXIMUS_TENNIS_Catalogue.pdf",
  stablePath: "/catalogue/MAXIMUS_TENNIS_Catalogue.pdf",
  editionPath: "/catalogue/5.1/MAXIMUS_TENNIS_Catalogue.pdf",
  /** First page of each chapter in the PDF: Idea, Racquets, Matrix, Training, Partners, Reference. */
  chapterPages: [3, 6, 14, 15, 18, 22],
  /** Page previews rendered from the PDF itself (page number, file, pixel size). */
  previews: [
    { page: 1, src: "/catalogue/5.1/page-01.webp", width: 720, height: 1296 },
    { page: 6, src: "/catalogue/5.1/page-06.webp", width: 480, height: 864 },
    { page: 12, src: "/catalogue/5.1/page-12.webp", width: 480, height: 864 },
    { page: 14, src: "/catalogue/5.1/page-14.webp", width: 480, height: 864 },
  ],
};
