import { site } from "../data/site";

/**
 * Governing-version notice for the legal pages.
 *
 * The translations are published for readability; the English text is the one that governs.
 * Shown on every language except the master, so the English page carries no redundant line.
 */
export default function GoverningVersion({ locale, text }) {
  if (locale === site.defaultLocale || !text) return null;
  return <p className="governing-note">{text}</p>;
}
