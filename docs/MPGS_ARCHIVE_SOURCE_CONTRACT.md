<!-- © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. -->
# MPGS source evidence from the supplied archive

This is a source-only inspection of `/Users/maximuskiriyakulov/Downloads/site.tar`. Paths were listed first; only the active MPGS handler and addon version metadata were read. No configurations, databases, payment logs, backup handler, secret values or external SDK were read. Nothing from the archive was executed or installed. An archive snapshot is not proof of the currently deployed merchant configuration or bank capabilities.

Inspected entries:

- `./web/app/addons/mpgs_payment/payments/mpgs.php`: 20,591 bytes, SHA-256 `ada388d5b8be8d604cdf131a43dd6a1c073b85d12a32b825c9e3b6b6079642b7`, 469 lines.
- `./web/app/addons/mpgs_payment/addon.xml`: addon ID `mpgs_payment`, version `1.0`.

The archive also lists `./web/app/addons/mpgs_payment/func.php` and `./web/design/backend/templates/addons/mpgs_payment/views/payments/components/cc_processors/mpgs.tpl`. Their contents were not needed or read. Listed configuration/database/log paths were excluded.

## Source contracts

| Evidence | Handler lines | Observed source behavior |
| --- | --- | --- |
| REST version | 20 | `MPGS_API_VERSION` is the string `100`. |
| Authentication | 49–70 | Basic authentication is constructed from `merchant.<merchant_id>:<api_password>` variables. Headers are `Authorization: Basic <encoded>`, `Content-Type: application/json`, `Accept: application/json`. PHP cURL verifies TLS peer/host. Credential values are taken from processor parameters and are not reproduced here. |
| Session endpoint | 311, 356 | POST `<gateway_url>/api/rest/version/100/merchant/<merchant_id>/session`. |
| Initiation payload | 315–344 | `apiOperation: INITIATE_CHECKOUT`; `interaction.operation: PURCHASE`; `interaction.returnUrl`, `cancelUrl`, `merchant.name`; order amount/currency/id/reference/description; transaction reference; optional customer email. |
| Amount/currency | 299, 308, 331–339 | Amount is the CS-Cart total formatted to two decimals. Currency is uppercased `processor_params.currency`, falling back to AED. Order/provider references are the native order ID. |
| Session response | 362–385 | Accepts HTTP 200 or 201, `result === SUCCESS`, and nonempty `session.id`. Reads `session.version` and `successIndicator`; stores the success indicator in the PHP session. No provider session expiry/TTL is read. |
| Script path | 389 | `<gateway_url>/static/checkout/checkout.min.js`. This is an **unversioned SDK path**. REST version 100 does not establish a pinned browser SDK version. |
| Browser integration | 443–460 | Configures only `session.id`, then calls `Checkout.showPaymentPage()`. Script is loaded dynamically with `data-complete`, `data-error`, `data-cancel` callbacks and `data-cfasync=false`. No `showEmbeddedPage`, embedded mount, sizing, teardown or lifecycle contract exists in this handler. |
| Return flow | 303, 313, 424–440 | Return dispatcher is `payment_notification.return?payment=mpgs&order_id=<native_order_id>`; completion adds `resultIndicator` and `sessionVersion`. Error/cancel callbacks navigate to `checkout.checkout`. These are source-level native store routes, not proposed Tennis URLs. |
| Readback | 122–143 | Loads the native order/payment method, then GETs `<gateway_url>/api/rest/version/100/merchant/<merchant_id>/order/<native_order_id>`. |

The following minimal snippet contains only source-level browser contracts; placeholders are not real sessions or secrets:

```js
// Handler 389, 443–448: hosted payment-page presentation only.
const checkoutScript = '<gateway_url>/static/checkout/checkout.min.js';
Checkout.configure({ session: { id: '<private_session_id>' } });
Checkout.showPaymentPage();
// Handler 454–457: data-complete=completeCallback,
// data-error=errorCallback, data-cancel=cancelCallback, data-cfasync=false.
```

## Capture verifier limitations

The archived callback must not be reused as strict proof of capture. It extracts a transaction ID from successful `PAYMENT` **or `AUTHORIZATION`** rows and falls back to the final transaction ID (184–208). Its paid predicate accepts top-level `CAPTURED` **or `AUTHORIZED`**, or `result === SUCCESS` plus a transaction ID (211–214). Amount/currency absence is tolerated; amount checking uses floats with a 0.01 tolerance (217–235). It then changes CS-Cart status to `P` (237–272).

There is no check of `response.gatewayCode`, `totalCapturedAmount`, `totalRefundedAmount`, response merchant, exact successful `CAPTURE` type or reversal/refund history in this handler. `resultIndicator` equality is logged but is not the payment authority (162–173). The supplied code also logs raw provider responses and session/indicator fields; this behavior must not be copied into a new adapter.

The repository's stricter read-only MPGS movement parser remains the verification boundary: exact currency/order/merchant/amount, authenticated successful approved capture/refund evidence, cumulative totals and unsupported-history rejection. The archive does not itself prove every stricter projection field exists in the current merchant's actual Retrieve Order response; inspected schema evidence remains required before runtime wiring.

## USD evidence boundary

The handler is currency-configurable and does not contain a USD literal or currency-specific conversion branch. This supports a source-derived request shape carrying an explicit currency. It does **not** prove that merchant `300281` is currently configured for USD, that USD 1 is accepted, that this archived route is deployed, that a merchant origin is approved, or that the bank supports embedded checkout. Those facts require separate authorized configuration/provider evidence. No such evidence was obtained in this inspection.

For an isolated USD 1 control-payment adapter, `USD` and `100` minor units must be explicitly pinned in a separate contract. Existing approved-goods/AED behavior and its runtime gates remain unchanged. Session creation is not capture, USD permission or live payment proof. No provider TTL may be invented from this source.

The prepared adapter requires the merchant display name as a private constructor dependency, rather than inventing a configured display name. It pins an honest control-payment description. It omits customer email and display-control preferences; actual acceptance of the source-derived minimum payload remains a runtime verification prerequisite. A `localSessionDeadline` is a local attempt deadline, never provider TTL. The constructor currently accepts clean `https://maximus.tennis` return/cancel URLs only; it does not establish that the bank has approved that origin.

The adapter returns only the private session ID and its locally bound attempt fields. `session.version` and `successIndicator` are deliberately discarded: the inspected handler establishes neither a version format nor a need to treat these browser-return fields as money proof.
