# Legacy history compatibility correction — local review

Status: local tests only; publication requires the scoped owner approval. No Worker settings, grants, activation state, production history, destination, draft, outbox or receipt was changed by this investigation.

## Failure and evidence

The initial shared-log projection validates every record in all four collections on each save. Supported older app histories contain numeric or missing IDs; repeated legacy IDs also trigger the same guard. An unchanged old record therefore prevents both draft autosave and the atomic sender/intent save before `/chat`.

The deployed code reproduced the owner's exact `DUPLICATE_SOURCE_ID` send error for numeric, missing and repeated legacy IDs. In each localhost browser case there were zero chat requests, zero event requests and zero encrypted writes, with the typed draft remaining visible. The autosave toast was the generic storage advice from `autosave()`; it is not evidence of insufficient storage. The owner's exact historical record variant was not read from their vault.

The independent approved-document read after the reported error found the previous revision, one canonical header and one original synthetic event, with zero matching manual events. No test was resent. This is an observation at that read, not ongoing monitoring.

## Reviewed changes

* `local-shared-log/integration.mjs`: preserve exact, unexported legacy occurrences as an unchanged baseline. Do not assign IDs or import old text. Require strict unique string IDs for new records, reserve ambiguous legacy source names, and reject malformed or duplicated records that already carry a captured/server origin. Preserve original edit checks and monotonic receipt merging.
* The same module: a successful relay flush checks again when commits occurred during the flush. This prevents a reply saved during sender transmission from remaining pending until another user action. Any uncertain/error result stops the loop; it is not immediately retried. Model intent/response-loss protections and server read-before-append reconciliation remain unchanged.
* `app.js`: distinguish the ID-related autosave error and tell the owner to preserve the visible draft. Unknown errors no longer imply a capacity diagnosis or expose raw error details.
* `sw.js`: update only the asset-cache name to `vector-shared-setup-v2-20261024-legacy-source-id-v1-20261025-assets`.

Tests added: legacy projection regression, real encrypted-vault browser reproduction/correction, a real Service Worker upgrade, and autosave error notices. The existing cache test is updated to check replacement of the former cache without accessing vault storage.

## Build compatibility and update boundary

Keep `vector-shared-setup-v2-20261024` unchanged in app, vault, installer, setup UI and Service Worker. It is also persisted in the installed client configuration and returned by the deployed Workers. A frontend-only change to this compatibility marker would reject the existing installation and server response. This correction changes no protocol, enrollment or vault schema.

The new cache revision distinguishes this patch. The unchanged compatibility marker alone does **not** prove that a tab has reloaded the patch. The localhost old-to-new Service Worker test confirms that the new cache installs, the encrypted envelope is untouched during update, and the existing registration, policy, credentials placeholder, original histories and confirmed receipt survive reload without reinstalling. It also confirms that a copied, previously unsaved draft can be saved after update without sending it or importing history.

Before an owner refresh, preserve every visible draft that matters. Do not clear app data, vault, browser storage or receipts. After approved publication and Pages verification, close stale VECTOR tabs only after draft preservation, load the updated app, unlock normally, and restore the copied draft if needed. No new OAuth, document selection, synthetic test, activation or installer click is required. PC VECTOR remains outside the currently participating device scope.

## Verification and release scope

All browser network operations in these tests are intercepted; model, Worker and Docs responses are synthetic. Tests cover all four labels, unchanged legacy text/IDs, no historical import, stable new event IDs across restart, quota/atomic failure, competing tabs, concurrent receipt merging, independent device/Drive acknowledgments, full long COMMS text, response loss without duplicate append, pending reply completion, and no immediate retry on uncertainty. Default OFF and existing installation checks remain covered.

Final counts and commands are recorded in the companion local `tests/final-results.json`; individual logs and before/after hashes are retained with the local candidate. Passing mock tests do not establish live device-to-Google success.

Publication scope is three runtime files (`app.js`, `local-shared-log/integration.mjs`, `sw.js`), five test files and this note. Recheck remote main before publishing and preserve unrelated changes. No Worker deployment or configuration change is needed. Do not automatically resend the owner's message after publication; first verify the release and preserve/restore the draft. Any later send is a separate owner action followed by read-only delivery verification.

Rollback is code/cache-only and must use a fresh cache revision so clients actually load the chosen assets. Preserve the current encrypted vault, enrollment, outbox and receipts. Restoring the old projection would restore the legacy-ID failure, so retain drafts before any rollback refresh and prefer a forward correction.
