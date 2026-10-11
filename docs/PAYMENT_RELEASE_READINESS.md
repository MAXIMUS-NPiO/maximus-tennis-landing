# Existing merchant payment release

This checkout extends main commit `5c330af90945bcae1ee09d89d95da4004b3e5508` on branch
`feat/existing-store-checkout`. Current main `3aed3a5d9b86c8a7b525e313811a31948ff38090`
has also been integrated, preserving its authorship, confidential-content guard and language room.
Selective commerce reuse from `867e6a8` is recorded in
`COMMERCE_REUSE_MANIFEST.json`; it is not evidence of a new live payment integration.

## Implemented locally

- Immutable order intake, technical confirmation, private order capability and atomic store.
- A verified account session can bind a new order to its customer. Form email/ID claims cannot.
- A separate durable account-link transaction can be retried without losing or duplicating the order.
- Customer/admin ledger views derive amounts from posted journal entries. Unpaid B/C proposal
  calculations are omitted from the public order response. The journal does not imply bank balance.
- Production administrative access keeps mandatory MFA. No admin account or role is seeded.
- Existing site design, locales and current main changes remain the basis of this release.

Implementation, test success and local build success are separate from runtime activation.
Individual component test runs overlap the full suite; they must not be added together.

## Current merchant evidence

The public existing store is reachable at `https://maximussports.ae`. After the owner's normal
login on October 10, the task's existing browser successfully reads CS-Cart administration.
Current payment `18` is active for MAXIMUS SPORTS DUBAI, with processor Mastercard MPGS,
currency AED and gateway `https://ap-gateway.mastercard.com`. Its current numeric merchant
identifier differs from the historical October 5 record; that old record must not configure
the live route. Only non-secret fields were read. No processor operation or live capture is
proved by these settings. The current safe unauthenticated GET
`https://maximussports.ae/api/payments/18` returns `401`; its response body was discarded.
This proves API reachability/authentication is required, not valid MPGS credentials or capture.

The current downloaded add-ons administration independently shows `mpgs_payment` version 1.0,
status Active. Its configuration page exposes general add-on metadata; no current payment
operation, API version or server capture verifier was established from that interface.

The authenticated administration is at `https://maximussports.ae/psadmin.php`.
No other browser/profile/native surface is connected.
No session cookies, passwords or API key files were read.

Product `9444` publicly lists a 300 g POWER & SPIN racquet for AED 1500 with a 50 sq in head,
12×14 pattern, 325 mm balance and L2–L4 grips. The fresh administration read confirms SKU
V50-300G, AED 1500.00 and stock 100. It is a possible existing ordinary-goods control item,
not a substitute for a different individual specification. The first goods checkout does not
depend on an individually agreed quotation; those approvals remain private. No automatic
currency conversion or mapping to a custom configuration has been made. The authenticated
product has five active option groups: grip, stringing,
strings, grip treatment and cover. A guest cart read with one V50-300G, L2, no stringing,
no paid strings/grip treatment/cover confirms AED 1500 merchandise. Native checkout selects
payment `18` and initially shows AED 75 shipping plus AED 75 VAT (5%), total AED 1650.
Choosing the existing free shop-pickup method `105` recalculates the displayed total to
AED 1575 (AED 1500 goods + AED 75 VAT). These are observed cart totals, not a submitted order
or a guaranteed total after the owner changes address/options. Terms were not accepted,
Place Order was not pressed, and no card details were entered. The owner must choose a
real intended purchase; they are not being asked to buy this racquet solely for testing.

The current currency administration confirms AED as checked Primary currency, rate 1,
active and available to storefront MAXIMUS SPORTS DUBAI. The public product's free-shipping
badge does not override the native checkout shipping calculation.

After the owner's separate Vercel login, this same task browser can read the exact existing
project `maximus-fdc6/maximus-tennis-landing`. It shows repository
`MAXIMUS-NPiO/maximus-tennis-landing`, domain `maximus.tennis`, production status Ready,
and source main commit `3aed3a5d9b86c8a7b525e313811a31948ff38090`. This proves a supported
browser route even though the separate connector token previously returned 403. The displayed
production is the existing site, not this payment work.

Only environment-variable names and scopes were inspected: KV_REST_API_URL and
KV_REST_API_TOKEN are displayed for Production and Preview; SMTP_HOST, SMTP_PORT, SMTP_USER
and LEAD_NOTIFY_FROM for Production. SMTP_PASS, portal activation flags and the admin MFA key
were not displayed in the project list. No value was revealed, copied or changed. Names alone
do not establish successful Redis ping, SMTP authentication or account runtime readiness.

The native administration search filtered to payment 18 returned a generic HTTP 500. A
subsequent compact read-only search opened the orders list, but its filter applicability
was not independently confirmed. Existing order `4287` (October 10, total AED 350, a Prince
tennis-net goods payment) separately shows VISA / MasterCard, status Paid, transaction `UF5W82`
and processor response "Payment captured successfully". This is a stored CS-Cart payment
record, not a fresh independent authenticated MPGS retrieval or a tennis-to-ledger mapping.
No order or payment was created to compensate for the search error.

The local ordinary-goods launch adds a clearly separate stock-product section for
V50-300G and its exact native product URL. It must not replace a selected configurator model,
imply custom precision/other grips, or claim that a store purchase automatically updates the
new tennis account or bonus journal. Native cart/checkout stays with the existing merchant.
Automated order/capture/refund/account linkage remains a separate server integration.

The public-source release excludes an unused historical banking module and private individual
price books. The original local source checkout remains intact. Runtime-approved quotations
must come from the private server-injected registry; this does not change the existing store's
SKU price or seller. A sanitized connector snapshot based directly on current remote main avoids
publishing private data from intermediate local commit history.

## Exact remaining actions

1. Continue reading the now-authenticated CS-Cart administration.
   Inspect selected storefront/products/options, runtime API access and installed
   MPGS checkout implementation without creating a new key or reading secret values.
2. Establish the actual immutable tennis order → native store order → MPGS payment mapping and
   authoritative server capture/refund evidence. The standard order API returning an `O` order ID,
   a browser return, a screenshot or a manually selected `P` status is insufficient.
3. Bind a real approved goods item, seller `MAXIMUS SPORTS EQUIPMENT TRADING LLC`, amount,
AED currency, shipping/tax and technical options to that inspected existing checkout.
4. Use the confirmed existing Vercel browser session and linked Git repository. The separate
   connector account `maximus-npio` has default team
   `team_HgBESQj8VMCIRjcL6RwWS63V`, but reading project
   `prj_4PjBlUMxH0KHUu4A8FBNbuvJ6nOX` returns 403 for `maximus-fdc6`.
   The existing authorized browser route is
   `https://vercel.com/maximus-fdc6/maximus-tennis-landing`; do not treat connector 403 as a
   refusal in that separately authenticated browser session.
   No local Vercel CLI was found; no installation or authorization bypass was attempted.
5. Verify the existing durable store/SMTP runtime and operator MFA readiness before enabling portal
   routes. Flags alone are not runtime evidence. Secrets remain server-side and are not requested
   as chat text. No live role, credential or financial program is created automatically. Portal
   verification mail has a server SMTP implementation; the reused commercial confirmation/invoice
   sender remains test-only and cannot provide a live customer receipt by changing a flag.
6. After tests, build, exact commit/deployment review and real mapping verification, prepare the
   owner's card-test link and expected capture/receipt/ledger statuses. The owner performs the
   payment. This task does not automatically charge, refund or transact with a real card.

The current default remains disabled for order/payment/portal runtime. Mock transport and TEST
documents must not be promoted to a live integration by changing a flag or label. Current accounts
and ordinary goods development do not depend on legal research. Financial program activation
requires its separately approved program/merchant conditions; no default 20% or withdrawal
promise is enabled.

After the first verified launch, the same inspected merchant/backend contour can be evaluated for
MaximusBabyTennis.com and the existing mobile/PWA sources. App Store publication is a separate
deliverable and has not occurred.
