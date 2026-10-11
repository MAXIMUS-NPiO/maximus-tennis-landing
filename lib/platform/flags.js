/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Server-side feature flags (APP-072). Read from the environment on the server only; the client
 * learns a flag's value through the API, never through the bundle. Funding B/C can never be made
 * live by a flag alone — see funding gates in orders.js.
 */
export function readFlags(env = process.env) {
  const on = (k, d = false) => (env[k] === undefined ? d : env[k] === "true" || env[k] === "1");
  const production = env.NODE_ENV === "production";
  return {
    accountsEnabled: on("ACCOUNTS_ENABLED", true),
    checkoutEnabled: on("CHECKOUT_ENABLED", true),
    bankTransferEnabled: on("BANK_TRANSFER_ENABLED", true),
    pspEnabled: on("PSP_ENABLED", false),
    fundingLiveEnabled: on("FUNDING_LIVE_ENABLED", false),
    adminRequireMfa: production || on("ADMIN_REQUIRE_MFA", false),
    adminMfaProvider: env.ADMIN_MFA_PROVIDER || null,
    production,
  };
}

/** Who stops checkout: an owner/administrator sets CHECKOUT_ENABLED=false (or the kill switch below) when a price or reconciliation is in doubt. */
export async function checkoutKillSwitch(store) {
  try {
    const s = await store.get("setting", "checkout_kill_switch");
    if (!s) return { active: false };
    if (typeof s.doc?.active !== "boolean") return { active: true, reason: "verification_unavailable" };
    return { active: s.doc.active, reason: s.doc.reason || null, setBy: s.doc.setBy || null, at: s.doc.at || null };
  } catch {
    return { active: true, reason: "verification_unavailable" };
  }
}
