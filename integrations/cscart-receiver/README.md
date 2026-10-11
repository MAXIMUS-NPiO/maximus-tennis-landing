# Local CS-Cart receiving-side scaffold

**Local test only. Not a CS-Cart PHP add-on, not production-ready, not connected to SPORTS.**
No live transport is included. The service refuses any mode except `local-test` and adapters except
`local-mock`; HTTP always binds `127.0.0.1` on an ephemeral port. No merchant/store/API credential is
read from environment here. Registry and test keys are passed by the test harness.

- `service.js`: validates the site's signed handoff against project/route/product data; atomically
  claims nonce plus permanent `(project_id, source_order_id)` record; calls injected mock order creation.
- `store.js`: local state survives receiver restart. Exclusive lock + write/fsync/rename protect concurrent
  writers; an orphan lock intentionally freezes creation for manual recovery. This is not proof of
  production CS-Cart database transaction semantics.
- `http.js`: `/handoff` accepts signed sessions; `/status` accepts a fresh project-signed query and
  retrieves the server mock PSP. A status field in a client/callback body is ignored.
- Actual CS-Cart O/P status is never payment proof. Source ↔ native order ↔ PSP order/merchant/currency/
  amount are bound before returning proof. Uncertain order creation is not automatically repeated.

Run `npm run test:receiver` after dependencies/runtime are available. It uses Node built-ins and this
repository's code, not Next, Redis, PHP or a live store. Local HTTP listen may require executor permission.
The test creates state under the OS temporary directory and deletes it afterwards.

The native CS-Cart add-on still requires the installed CS-Cart edition/version/source and normal
maintenance access. Its eventual DB tables must use unique constraints for source project/order and
PSP/native-order binding, and create the native open order plus permanent mapping within one verified
transaction. Native add-on hooks/payment API conventions have not been guessed in this scaffold.
Production durable replay state, operational crash recovery, actual store product/options mapping and
approved PSP route/currency must be verified in the store test environment before any activation.
