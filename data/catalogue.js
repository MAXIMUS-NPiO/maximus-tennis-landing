/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * The published catalogue (Founder's update of 14 October 2026). One record: the current edition.
 * Every edition keeps its own immutable file under /catalogue/<edition>/; the stable address
 * /catalogue/MAXIMUS_TENNIS_Catalogue.pdf serves the current edition's bytes (next.config.js
 * rewrite), so a link in a letter never breaks and never points at an older edition.
 * tests/catalogue-file.test.mjs checks the file, its size and SHA-256 and the product data version.
 */
export const catalogue = {
  edition: "6.0",
  date: "2026-10-16",
  productDataVersion: "2026-10-16.F",
  pages: 60,
  bytes: 3041659,
  sha256: "bcff5a897dcd1e8844730966227f4c0540605ed4f123bef1a607cbf035c8c76a",
  fileName: "MAXIMUS_TENNIS_Catalogue.pdf",
  stablePath: "/catalogue/MAXIMUS_TENNIS_Catalogue.pdf",
  editionPath: "/catalogue/6.0/MAXIMUS_TENNIS_Catalogue.pdf",
  /** First page of each chapter in the PDF: Idea, Racquets, Matrix, Training, Partners, Reference. */
  chapterPages: [3, 8, 22, 23, 33, 57],
  /** Page previews rendered from the PDF itself (page number, file, pixel size). */
  previews: [
    { page: 1, src: "/catalogue/6.0/page-01.webp", width: 720, height: 1296 },
    { page: 10, src: "/catalogue/6.0/page-10.webp", width: 480, height: 864 },
    { page: 17, src: "/catalogue/6.0/page-17.webp", width: 480, height: 864 },
    { page: 18, src: "/catalogue/6.0/page-18.webp", width: 480, height: 864 },
  ],
};
