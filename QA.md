# Verification status

## Passed

- Eleven Node unit tests (seven core tests plus four service-worker/manifest tests): decimals/zero, invalid ratings and unsafe links; best/worst ordering with unrated last and name ties; multiline names without guessed ratings; quoted CSV with multiline notes and tags; invalid JSON/version/rows; backup round-trip including notes/Trash; deduplication, address differentiation, and required fields.
- DOM + simulated IndexedDB tests using jsdom/fake-indexeddb: empty launch, create/edit, database reads, XSS-safe text rendering, Trash/restore, reviewed CSV import, rating sort, invalid-row repair, duplicate skip, search, local assistant helper review-before-commit. This is simulation, not real-browser verification.
- Service-worker simulation: correct project subpath allowlist; sibling/external/private URLs ignored; only own old cache removed; explicit update activation; manifest scope/id/start_url.
- JavaScript syntax checks for app and service worker.
- Static inspection: relative URLs, explicit app-shell cache allowlist, scope-specific cache cleanup, IndexedDB separate from caches, no external resources, no user-data network submission, no innerHTML rendering.

## Not yet verified on a real browser

Cloud Chromium could not launch because this execution environment disallows the process-singleton socket. A second permitted launch attempt hit the same platform restriction. No user-computer browser was accessed.

Before declaring production-ready, test on iPhone Safari and an installed Home Screen app:

1. Empty first launch; add/edit, decimal and zero ratings, search and city/cuisine navigation.
2. Reload persistence; move to Trash and restore.
3. CSV/JSON/text imports: review, correct invalid fields, deselect rows, dedup, cancel, retry, repeated clicks.
4. Export a backup and restore on a fresh profile/device, including notes/tags/Trash.
5. Install, open once online, close, enable airplane mode, launch and edit, then reopen.
6. Deploy a bumped cache version; ensure Update app appears, refuses while a form is open, and preserves saved data.
7. Verify narrow-screen layout, keyboard navigation, dialog focus, and screen-reader labels.
8. Test under the exact intended GitHub Pages subpath and check for interference from other apps on the same origin.


## 2026-10-13 assistant inbox update

Passed: 11 existing core/service-worker tests; Worker authentication, per-account isolation, URL validation, duplicate pending packet retries, CSRF receipt protection, receipt traversal rejection, expiry cleanup, main-page and asset serving. Syntax checks passed for client, service worker, database module and Worker. Artifact ESM validation passed. Browser QA and optional DOM/IndexedDB simulation were unavailable (no browser skill or cached development dependencies); sign-in and installed-iPhone behavior still need device verification.

## 2026-10-13 Restaurants design and Michelin update

Reviewed Coffee, Matcha and Wine repository UI sources. Passed 18 core, Michelin, tasting-note and service-worker tests; hosted inbox authentication/isolation checks; client/database/service-worker syntax checks; Worker artifact validation. Michelin ranking, old backup compatibility, star preservation and duplicate prevention passed. Browser and iPhone visual/interaction QA remain unverified because the supported browser-preview skill is unavailable.

## Force-pull GitHub queue

Added authenticated decryption, explicit user-click pull, ciphertext-only public queue, verified local-save-before-ack, signed account-bound acknowledgement, and scheduled GitHub file cleanup. Force-pull state is not consumed by automatic inbox checks. Compact listing spacing and preserved tasting details. Overall rating updates are explicitly authorized inside the encrypted user packet.

## 2026-10-22 readable notebook export

Added Export text with a local preview, UTF-8 .txt download, file/text native sharing, clipboard copy and visible manual-selection fallback. All active entries are exported independently of filters; Trash is excluded. Exact saved overall scores and original tasting-note precision are retained. Category notes include current drafts. JSON backup and its reminder behavior are unchanged. The database module, schema, hosting identity, access level and inbox endpoints are unchanged.

Passed: all 29 Node unit tests; existing DOM/IndexedDB regression suite; new text-export DOM tests for empty data, Unicode/multiline text, category-note drafts and city scopes, zero/unrated status, filter independence, Trash exclusion, .txt contents/MIME, copy success/denial, file/text sharing, canceled/failed sharing, repeated clicks, close/reopen with stale async completion, JSON-backup preservation, unchanged notebook records, and no notebook-data network transmission. Hosted inbox, encrypted GitHub queue and pagination tests passed after rebuilding. JavaScript syntax checks, git diff whitespace check and Worker artifact ESM validation passed.

Real-browser verification remains unavailable: cloud Chromium launch failed with `process_singleton_posix.cc: socket() failed: Operation not permitted`. No browser security settings were changed and no user-device data was accessed. Native iPhone Safari/Home Screen share sheet, Save to Files, clipboard permissions and visual layout still require device verification. The text preview/manual-copy route remains available when native APIs fail. To receive v17, reopen the same installed app and use Update app when shown; never clear site storage or reinstall to update.
