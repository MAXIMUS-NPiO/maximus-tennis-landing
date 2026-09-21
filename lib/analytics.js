/**
 * Measurement boundary. No analytics platform or consent configuration has been supplied,
 * so events are not transmitted anywhere. The event names below are the agreed vocabulary
 * for when a consent-aware platform is authorised. Never pass personal data, engraving text
 * or form contents through this boundary.
 */
export const EVENTS = [
  "gps_started", "gps_completed", "config_started", "config_completed", "technical_request_composed",
  "fitting_request_composed", "partner_route_selected", "request_email_opened", "language_changed",
];

export function track(name, props = {}) {
  if (!EVENTS.includes(name)) return;
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[maximus:event]", name, props);
  }
}
