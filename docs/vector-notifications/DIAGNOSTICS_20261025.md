# Notification diagnostics

Settings → notifications → **通知の診断を確認（送信しない）** reads sanitized diagnostic metadata through the existing authenticated app connection. It does not sync context, generate a message, send Push, or drain the shared log.

The display separates sync acceptance from the latest scheduled notification attempt and AI evaluation start. It shows the recorded skip/error/unknown result, persisted pause state, latest export check, and server-generated journal counts for pending, uncertain and confirmed receipts. Ordinary device-origin conversations are not part of those server counts. Push provider acceptance does not prove iPhone notification display.

The producer retains only the latest evaluation record and latest export record, as bounded timestamps and fixed enums in an additive SQLite table. No RP text, model output, credentials, raw exception payloads or explanatory model guesses are recorded. Existing generation rules, prompts, cooldown, capacity, unknown-outcome handling, encrypted body/outbox and independent receipts are unchanged. Recording failures preserve original notification behavior.

Results before this release are **not recorded/unknown**; sync acceptance cannot reconstruct them. An unfinished attempt remains explicitly uncertain. A model decline means only that the existing model response did not choose sending; no narrative reason is available.

Deployment order: producer code, then frontend. Keep existing flags, policy, secrets, bindings, namespaces, Cron and enrollment unchanged. The connection Worker needs no update. Compatibility build stays `vector-shared-setup-v2-20261024`; the asset cache is `vector-shared-setup-v2-20261024-notification-diagnostics-v1-20261025-assets`.

Verification used synthetic local fixtures: 53 Node tests, 13 diagnostic SQLite/runtime groups, 23 existing producer/shared-log groups, and 12 browser groups/cases. No external model, Push or Google test calls. Public frontend checks are `tests/vector-notifications/diagnostics.test.cjs`, `diagnostics-browser.cjs` and `tests/vector-candidate/cache.test.cjs`; the producer runtime checks were run against the deployment source in the isolated engineering workspace.

To update an existing iPhone installation, preserve any unfinished draft, close/reopen VECTOR online to receive the update, then close/reopen once more to load the cached release. The new diagnostic button is the visible patch indicator; the compatibility marker is deliberately unchanged. No reinstall, vault reset, new enrollment or synthetic test is needed.

Rollback restores prior producer/frontend code only, preserving settings, namespaces, history, outbox and receipts. Prior code ignores the additive diagnostics table. Do not delete it or any stored conversation data.
