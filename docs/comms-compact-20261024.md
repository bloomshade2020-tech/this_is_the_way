# COMMS compact layout — development handoff

## Implementation

The text-only COMMS bubble and copy action now share a wrapper. The copy control aligns with the bubble's lower right; its target remains 44 × 44 CSS pixels. The action's top spacing is reduced and message gap changes from 18 to 12 pixels. Photo messages retain the existing content structure. HERE, BACKSTAGE, palette C, copy feedback and all storage, chat and notification behavior remain unchanged.

Files: `app.js`, `vector.css`; `sw.js` uses asset cache `vector-v07-comms-compact-20261024-assets`. No Worker or Cloudflare configuration changes are required. This release does not include delayed replies, a vault storage migration, or Google integration.

## Verification

Verified locally against base main `f93be6969862eb1f7c6e24a8086f5cb41bcd9cd0` using synthetic fixtures and mocked network:

- `node --check app.js` and `node --check sw.js`.
- `node tests/frontend-polish/comms-compact.cjs`: 320/375/390/430/1280 widths, both speakers, short/multiline text, 44px target, no text overlap or horizontal overflow.
- `node tests/frontend-polish/copy.cjs`: three widths and rooms, exact body, permission failure/unavailable API, keyboard, repeated navigation, pending copy navigation and draft preservation.
- `node tests/frontend-polish/palette.cjs`: four C colors unchanged.
- `node tests/vector-continuity/context.cjs`: 11 cases.
- `node tests/vector-notifications/durable-state.cjs`: save ordering, settings, typing, lock, failures/retry/restart.
- `node tests/vector-candidate/cache.test.cjs`: cache installation/offline assets and no vault storage access.

No real chat, Push, or user-vault operations were performed. iPhone/WebKit display and clipboard remain device checks.

## Publication status and follow-up

The change is prepared for the existing main-to-GitHub-Pages release. A repository commit is not proof of served deployment. At preparation time public Pages GET was blocked by this execution environment's CONNECT tunnel (403). Previous Actions/status access was forbidden and was not bypassed. Therefore terminal Pages build and live asset verification remain unconfirmed unless separately recorded in the release report.

On device, reopen the existing app normally and confirm the tighter COMMS spacing and copy feedback. Do not reinstall or clear site data. If rollback is needed, revert only this layout and use a new asset-cache name; preserve encrypted vault, localStorage and IndexedDB.
