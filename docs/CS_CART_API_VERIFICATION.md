# Existing CS-Cart read-only API inspection

Implemented in `lib/commerce/cscart-api.js`, with the operator entry point
`scripts/inspect-cscart.mjs`. This client prepares a real native API read of the
existing store at `https://maximussports.ae`. It is not connected to the checkout
adapter and cannot create an order, log in a customer, initiate a payment, change
a payment method, or confirm settlement.

## Scope and sources

The CS-Cart 4.18 documentation describes Basic HTTP authentication using the
administrator email and generated API key. API 2.0 is its recommended URL form;
the tool defaults to that form. An operator can explicitly choose API 1.0 if the
installed server requires it. There is no automatic version fallback or retry.
[Official REST API documentation](https://docs.cs-cart.com/4.18.x/developer_guide/api/index.html).

The allowed reads are payment **18**, one explicitly selected store, up to ten
explicitly selected products, and the options of those products. No order or
customer collection is queried. Payment metadata includes its name, status,
processor name/ID/type and company ID.
[Official payment entity](https://docs.cs-cart.com/4.18.x/developer_guide/api/entities/payments.html),
[official store entity](https://docs.cs-cart.com/4.18.x/developer_guide/api/entities/stores.html).

Product prices and absolute option modifiers refer to the store's primary
currency. The documented store entity does not expose a primary-currency field.
The report therefore preserves decimal prices, shows an explicitly reported
product currency if present, and labels any operator declaration of the primary
currency as unverified. From processor settings it exposes only a valid
three-letter `currency` value; it never returns the `processor_params` object.
This processor-specific value does not prove the store's primary currency or an
approved EUR-to-AED conversion.
[Official product fields](https://docs.cs-cart.com/4.18.x/developer_guide/api/entities/products.html),
[official option fields and variants](https://docs.cs-cart.com/4.18.x/developer_guide/api/entities/options.html).

## Operator use

Supply `CS_CART_API_USER` and `CS_CART_API_KEY` through an authorized private
runtime. The tool does not read `.env`, credential files, the browser, or stored
merchant settings. Do not put credentials in chat, shell arguments, or a saved
report. Replace the selected ID placeholders with IDs already verified in the
existing CS-Cart administration:

```text
node scripts/inspect-cscart.mjs --store-id STORE_ID --product-id PRODUCT_ID --primary-currency AED
```

`--product-id` can be repeated. `--primary-currency` is optional and remains an
operator declaration. `--api-version 1.0` explicitly selects the older API URL
form. `--help` performs no request and requires no credentials.

## Security and verification

All requests use GET, a literal HTTPS origin allowlist, a manually constructed
Basic authorization header, omitted browser credentials and no-store caching.
Redirects and unexpected final response URLs are rejected. A deadline covers
both response headers and streamed body reading; the default is 10 seconds per
request. The response limit is 256 KiB. JSON and UTF-8 are validated. IDs from a
response must match the selected entity, and option variants must belong to
their reported option. Global product options retain an explicit product ID 0.

Only a fixed set of metadata fields leaves the client. API credential values and
their common encoded forms are redacted even if echoed in a metadata name.
Error output contains fixed error codes and an optional HTTP status. Raw error
text, response bodies, authorization headers, causes, merchant identifiers,
processor hosts and processor passwords are not returned or logged.

Local verification used injected fetch responses and fake credentials:

```text
/tmp/node-v24.21.0-darwin-x64/bin/node --no-warnings --test tests/cscart-api.test.mjs
12 passed, 0 failed, 0 cancelled, 0 skipped
```

Tests cover exact routes/headers, forbidden origins and IDs, explicit API 1.0,
redirect refusal, HTTP/network error redaction, declared/streamed byte limits,
fetch/body deadlines, MIME/JSON/UTF-8 validation, entity/option binding, currency
provenance, secret-bearing fixtures, and safe CLI output.

## Remaining evidence

No authorized runtime credentials or selected production IDs were supplied to
this implementation task, so no authenticated request to the real store was
executed. The historical payment 18 / Mastercard MPGS / AED configuration is a
discovery clue, not today's authorization or settlement evidence. Every report
sets `readyForPayments: false` and identifies the evidence still needed: current
checkout authorization and mode, verified currency/price mapping, selected
option combinations, and a PSP result bound to the correct order. The existing
direct MPGS mock adapter remains unchanged and disabled for live use.
