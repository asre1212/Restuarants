# Restuarants

# Restaurants

[Open Restaurants on GitHub Pages](https://asre1212.github.io/Restuarants/)

## GitHub-hosted app

The notebook lives at **https://asre1212.github.io/Restuarants/**. All source is in this repository. GitHub Actions tests and publishes the static app on each main-branch app change. `npm run build:pages` creates an explicit static-only artifact; it excludes inbox envelopes, server code, backups, tests, and repository metadata. The installed PWA works offline after its first online launch.

### Private, read-only assistant copy

On the phone that holds your complete journal, open **Tools → Private assistant copy → Enable private copy** and sign in with the same ChatGPT account. Saved entries across all cities, exact ratings and notes, category notes, and Trash are copied automatically while the app is open and online. **Last shared** shows the last successful upload. Offline changes retry on reconnection, launch, return to the app, and every 30 seconds while visible. iOS does not guarantee work while the app is closed. The phone remains authoritative; the copy never writes back to it.

The Restaurants plugin exposes `restaurant_notebook_status` and `read_restaurant_notebook`. These tools are read only, account scoped, searchable and paginated; Trash is hidden by default. The assistant must report freshness honestly. Enabling does not recover data from a different browser or installation. Keep exporting JSON backups for recovery.

**Turn off & remove private copy** revokes this device’s publisher credential and removes the shared snapshot without deleting local entries. Offline removal is queued and clearly marked pending. Only one device publishes per account; replacing it requires the explicit **Make this device primary** action. A new primary retains the preceding snapshot until it successfully uploads. Signing out of the connection window does not disable an already authorized publisher; use the sharing controls to revoke it.

The retained Sites service stores an AES-GCM encrypted snapshot in private R2 storage, bound to the authenticated site-scoped user ID. An upload-only HMAC credential is saved in IndexedDB and excluded from backups, exports, and snapshots. It cannot read the copy. Each connection has a fresh revocable ID. Monotonic sequences and conditional R2 writes prevent delayed uploads from replacing newer data or undoing revocation. Credentials are accepted only on the publishing endpoints, never as read/MCP authentication. CORS allows the app’s exact GitHub origin and the service’s own origin. Nothing is written to the public repository. Snapshots are bounded to 8 MB and 10,000 entries; size failures preserve the preceding copy and report an error on the phone.

Run `npm run test:private` for account isolation, exact notes, credential scope, stale-write rejection and revoke races. `npm test` checks offline retries, credential exclusion and local-data preservation. Reference contracts: [R2 conditional writes](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#conditional-operations), [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/), [CORS preflight](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#preflighted_requests).

### Move your complete notebook

1. In the existing installed app, use **Tools → Export backup** and save the JSON file to Files. Keep that installation until transfer is verified.
2. Open the GitHub URL in Safari, add it to your Home Screen, and open that new installation.
3. Use **Tools → Restore full backup**, choose the file, review the entry/Trash/category-note counts, and choose **Restore all entries**.
4. Check your collection and keep the backup.

A different host has separate browser storage, so the assistant cannot copy the iPhone database remotely. This restore keeps distinct same-name records, IDs, saved dates, notes, ratings, coordinates, Michelin selections, and Trash. It transfers delivery receipts when included in a new backup. Old version-1 JSON backups still work. Matching IDs with different content keep both versions; retrying the same backup is safe. Existing entries are never cleared or replaced.

### Automatic app updates

The app checks for a release on startup, return to the foreground, reconnection, and every five minutes while open. Each Pages build derives a release ID from all app-shell files, so releases need no manual cache-version bump. A waiting release asks every open app tab whether it can update. Open forms, pending saves, and active text fields defer activation and reload; an older tab that cannot answer must be closed. Failed/offline downloads retain the installed shell. Updates never touch IndexedDB and only prune this app's scoped old shell caches. These are app updates, not notebook synchronization.

### Assistant deliveries

GitHub Pages serves static files and cannot run the authenticated MCP/encryption service. That small service remains at https://table-notes-restaurants.asar1111.chatgpt.site; its complete source is in `worker/` in this repo. On GitHub, **Force pull list** opens a sign-in/inbox window. A bounded, origin/source/channel-checked bridge retrieves encrypted GitHub deliveries. The GitHub notebook saves and verifies each batch locally before sending the signed acknowledgement. Deliveries do not upload the notebook; optional private sharing is described below. The normal authenticated-host same-origin flow is retained for the old installation.

Install the Restaurants plugin in ChatGPT. The assistant calls `add_restaurants`, writes the returned encrypted envelope and index entry to this repo, and then confirms it is queued. Incoming deliveries and an explicitly enabled private copy use separate server storage. GitHub cleanup deletes current encrypted files only after verified acknowledgement. Deliveries are a handoff queue, not a backup or sync service. No key, GitHub token, notebook record, or export is committed with the static app.

The old hosted installation remains available for export and the inbox service. There is no automatic redirect from its app to GitHub, because that could strand an existing device notebook. `npm run build` and `npm run validate` build/validate the retained service and transfer UI; Sites publication is needed only for service/bridge changes, not routine GitHub app updates.

`worker/index.js` is generated from the tracked source by `npm run build` and is not stored in Git. Run that build before the separate Worker/inbox test scripts. The new dining icon is generated artwork with platform-sized exports; see `icons/README.md`.

## Run

Use an HTTP server, not `file://`:

```sh
npm run serve
```

Open http://localhost:8080. HTTPS is required for service workers outside localhost.

## Deploy to GitHub Pages

Set the repository's **Settings → Pages → Source** to **GitHub Actions**. `.github/workflows/pages.yml` runs the test suites, builds `pages-dist/`, and publishes it. The source branch is `main`; retain the exact `/Restuarants/` path and relative manifest identity. Future updates use the same URL and preserve local data. `inbox/`-only changes do not deploy the app.

Other applications under the same `asre1212.github.io` origin share the browser's origin boundary. This app uses its existing distinct `table-notes-local-v1` database and scope-prefixed caches and never clears another app's storage.

## Privacy and storage

Restaurants, ratings, notes, addresses, URLs, tags, and Trash stay in the `table-notes-local-v1` IndexedDB database. Local settings include the last backup-export time and delivery receipt IDs. No localStorage is used. Service-worker caches contain an explicit allowlist of static app files only; third-party URLs and imported data are never cached. Clicking a restaurant website opens that site separately. The hosting provider can see ordinary static-file requests.

Device-only data may be removed by the OS/browser, private browsing, uninstalling, or clearing site data. Request durable storage when available, but keep backups. An export reminder appears when data exists and the last export was over seven days ago. Download initiation cannot verify that the user actually saved the file. Save it to Files/iCloud Drive or another trusted place. To move phones, export on the old phone and import that file in the new installed app. Browser and installed-app storage may differ, especially on iOS.

## Features

- City navigation and collapsible cuisine groups
- Rating 0–5, with decimals; unrated always last; alphabetical tie-breaking
- Search across name, city, cuisine, notes, address, and tags
- Add/edit and recoverable Trash; backups include Trash
- Batch-add multiline names, header-based CSV, or structured JSON
- Review and edit every imported row before saving; invalid rows block saving unless deselected or corrected
- Atomic merge-only imports; existing records never overwritten
- Duplicate identity: normalized name + city + cuisine + address (including Trash)
- Readable .txt export with native Share, Copy text, and manual-copy fallback
- Versioned JSON backup export and restore
- Connected assistant inbox: automatic device-local delivery imports and new-entry badges
- Paste/file handoff remains available with local review

## Share a readable notebook

Choose **Export text** to export all active restaurants, regardless of the current city, cuisine, search, or Michelin filters. The preview includes each restaurant's city, cuisine, exact saved overall rating, To try / Visited status, original multiline notes (including tasting scores), Michelin count, address, website, coordinates, tags, and all saved category notes. Trash is excluded. Blank overall ratings mean To try; zero is a rated visit. No scores are calculated or rounded during export.

Choose **Save .txt**, **Share**, or **Copy text**. On iPhone, Share can send the .txt file to **Save to Files** for later attachment. Where file sharing is unsupported, Share uses plain text; where clipboard access is unavailable, the preview is selected for manual copying. Canceling the share sheet leaves the notebook unchanged. The export is generated locally and never automatically uploaded. Sharing exposes the text only to the destination you choose. **Export backup** still downloads the full restorable JSON backup, including Trash and category notes. A text export does not reset the JSON-backup reminder and is not intended for re-import or restore.

## Import formats

JSON backup: `format: "restaurant-log-backup"`, `version: 1`, `restaurants: [...]`.
Assistant packet: `format: "restaurant-log-import"`, `version: 1`, `restaurants: [...]`.
A plain array of restaurant objects is also accepted.

Restaurant fields:

```json
{
  "name": "Restaurant name",
  "city": "City",
  "cuisine": "Cuisine",
  "rating": null,
  "notes": "",
  "address": "",
  "url": "",
  "tags": []
}
```

The example is a schema illustration, not preloaded restaurant data. Required fields are name, city, and cuisine. Default city/cuisine can be supplied in the import form. Ratings are never inferred. Missing ratings stay null. Only absolute http/https URLs are allowed. Imports are limited to 5 MB and 2,000 rows at a time; individual notes are limited to 20,000 characters and other text fields to 1,000. Split larger imports before loading them.

CSV header supports `name,city,cuisine,rating,notes,address,url,tags`; use semicolons between tags, standard CSV quotes for commas/newlines, and `""` for embedded quotes. Headerless input is one complete name per line, even if it contains numbers or commas. The parser deliberately does not guess field positions or ratings.

When an authorized browser assistant is operating the open app, `window.tableNotes.prepareImport(packet)` can open the same review UI. This helper does not save anything. The user must still confirm the reviewed import. The separate connected inbox accepts only new deliveries and cannot read the local notebook.

## Verification

`npm test` runs the dependency-free parsing, validation, sorting, backup round-trip, and deduplication tests. `node --check app.js` and `node --check sw.js` check syntax. For the optional DOM/IndexedDB simulation, run `npm install` then `npm run test:dom` (dev dependencies only; production needs none). See `QA.md` for executed checks and remaining manual tests.


## Michelin collection

Each listing has a Michelin checkbox and a 1–3 star selector; the editor has the same controls. Starred entries appear automatically in the Michelin tab, ordered by stars (3 first), then personal rating (highest first, unrated last), then name. Both tabs reference the same local record, so edits, removal, Trash and restoration stay consistent. Older records default to unstarred. JSON and CSV imports and backups preserve `michelinStars` (0–3). Michelin values are entered by the user, not verified or inferred.

## Tasting notes

Enter one food or drink score per line, for example `Burger — 4.75/5. Ask for relish on the side.` Explicit `/5` and `:5` scores render as a compact tasting list with comments. General notes remain separate. Dish scores are never averaged into an overall restaurant rating, and the raw notes are retained in local storage and backups.

## Force pull from GitHub

NYC `Korean-pocha` and `Korean / Pocha` entries use one canonical `Korean / Pocha` category. On startup, the app relabels existing records in place, including Trash, preserving IDs and all other fields. It never merges or deletes restaurant records, even if their resulting import keys match. New imports and edits normalize the same aliases. Original category notes are retained and copied once into the combined Korean → Pocha section; repeated startup and backup restoration do not append the same notes again. The app-shell release is v22.

The **Force pull list** button reads encrypted envelopes from `inbox/` on `asre1212/Restuarants` main. The signed-in owner's verified account authorizes decryption; the runtime secret never goes to GitHub or the browser. No list is consumed by a page preview or an automatic check. The app commits locally and rereads records to verify them before acknowledging deletion. Matching entries are skipped; a delivery explicitly marked `updateRatings` may update only the overall rating of matching entries, preserving notes, Michelin stars, IDs and Trash.

A GitHub Actions workflow checks acknowledged envelopes on its five-minute schedule and deletes only confirmed deliveries. GitHub can delay scheduled runs. Deletion removes the current file; Git history retains encrypted ciphertext. Private sharing is a separate opt-in feature; it never stores notebook data in GitHub. For future assistant additions, save the `add_restaurants` tool's returned `github_payload` to its `github_path` using GitHub before telling the user it is queued.

The force-pull reader uses raw GitHub files and the checked `inbox/index.json` index, avoiding unauthenticated GitHub REST API rate limits. Add each prepared delivery filename to that index. The cleanup workflow updates the index after removing acknowledged deliveries.

Navigation is one horizontal row: All restaurants, local cities alphabetically, and Michelin last. On small screens the row scrolls horizontally.

### Local restaurant map
List / Map switches between compact entries and interactive rating pins. City, cuisine, search and Michelin filters work in both views. Coordinates are optional `latitude`/`longitude` fields in JSON or CSV and included in backups. New entries are looked up through Photon using only restaurant name, address and city; results are cached in local IndexedDB, sequential requests are spaced by 1.2 seconds. Only a unique exact restaurant-name and city match is placed automatically. Review unmapped offers candidates and manual coordinates for ambiguous branches or missing results. Map lookups never send notes or ratings. Map backgrounds use OpenStreetMap's normal interactive tile requests and browser cache, with visible attribution; map tiles are never prefetched or saved by the service worker. Map backgrounds and address lookup need internet; the notebook remains available offline.

Assistant workflow: research and verify each incoming branch, include its address and coordinates in encrypted deliveries when possible. Never guess chain branches or locations. The add_restaurants tool prepares encrypted delivery; save its returned GitHub payload and index entry to queue it. The assistant can read a private copy only after the phone enables sharing. It cannot edit or geocode the saved device notebook remotely.

Mapping references: https://leafletjs.com/examples/quick-start/ ; https://operations.osmfoundation.org/policies/tiles/ ; https://github.com/komoot/photon . Vendored Leaflet 1.9.4 license: vendor/leaflet-LICENSE.txt.

Listing presentation: Michelin selection appears only in the restaurant editor. Saved listings show one, two, or three copies of the requested red Michelin star rosette supplied by the user next to the name, matching the saved Michelin star count. One, two, or three rosettes represent the saved Michelin star count. The transparent source image is used unchanged. Tags remain stored and searchable but are hidden from compact listings. Pencil / trash icons sit beside the personal rating; Trash requires confirmation and can be undone through Restore.

Ratings are rounded to the nearest quarter point (0.25). Explicit overall ratings round after validation; requested averages use original rated items, then round the mean. Existing overall scores round locally in a single IndexedDB transaction on launch, preserving notes, Michelin counts, map coordinates, and Trash. Tasting scores display quarter points while original notes retain their entered precision. New imports and encrypted deliveries round overall ratings through the shared validator.

### Expired-delivery recovery
Expired envelopes no longer abort a batch containing fresh deliveries. Previously acknowledged envelopes are skipped. The October 24, 2026 owner-requested recovery is restricted to the exact IDs, recipient hashes and ciphertext hashes in `worker/expired-recovery.json`, until November 1, 2026 00:30 UTC. Recovery preserves original delivery IDs and disables old rating updates. Device receipts prevent reimport of renamed or trashed entries; existing matching records are never overwritten. No notebook data is uploaded and unacknowledged files are retained. Other expired deliveries remain skipped, while malformed or tampered fresh deliveries still fail visibly.


## Modern notebook redesign — October 2026

The visual update keeps the existing hosted origin, app identity, IndexedDB database, imports, exports, Michelin stars, category notes, map, and assistant inbox behavior. No restaurant data is shipped with the app. Open **Tools** in the bottom navigation or the top menu for Force pull list, imports, backups, text export, Trash, and installation help. The app-shell cache advances to v19; an installed app offers **Update app** without clearing its notebook.

The account's 34 repositories were inventoried. The main design references were:

| Reference | Applied to Restaurants |
| --- | --- |
| [Wine](https://github.com/asre1212/wine/blob/main/style.css) | Warm paper surfaces, serif hierarchy, fine rules |
| [Matcha](https://github.com/asre1212/matcha/blob/main/index.html) | Calm spacing, understated navigation and form treatment |
| [Hotel](https://github.com/asre1212/hotel/blob/main/index.html) | Compact masthead and editorial restaurant titles |
| [Hiking Trails](https://github.com/asre1212/Hiking-Trails/blob/main/dist/style.css) | Forest-green accents and clear list/map controls |
| [Lifting](https://github.com/asre1212/Lifting/blob/main/index.html) | Persistent, thumb-accessible bottom navigation |

Verified with the existing unit, DOM, export, inbox, pagination, expiry-recovery, and service-worker checks. Browser inspection covered desktop and 390/320-pixel layouts with synthetic preview-only records, tools-to-export navigation, nested cuisine groups and rating badges. The managed HTTP preview cannot exercise secure-context APIs such as `crypto.randomUUID` or installed-PWA updates; add/import persistence is covered by the DOM suite. Physical iPhone/Safari and installed-app upgrade testing remain manual.

Online restaurant-app references were also reviewed:

| Reference | Applied pattern |
| --- | --- |
| [Beli](https://beliapp.com/) | Distinct numerical rating badges, ranked lists, and quick Visited / To try filters |
| [Mapstr](https://en.mapstr.com/) | Saved-place collections and consistent filters across list and map |
| [The Infatuation](https://www.theinfatuation.com/mobile-apps) | Prominent search, cuisine filtering, and a clear list/map switch |

The visit filters use the notebook's existing classification: a saved rating, including zero, is Visited; an unrated entry is To try. They combine with city, cuisine, search, and Michelin filters without changing records. No third-party branding, photos, or screenshots are bundled.

### Skip unmapped locations
In **Map → Review unmapped**, **Use this location** saves the coordinates and keeps the dialog open on the next unresolved restaurant, preserving any skips in the current pass. **Skip for now** opens the next unresolved restaurant without changing its saved details or coordinates. Skipping works while a lookup is loading or after an error. At the end, the dialog closes with a summary; start Review unmapped again to revisit skipped places. Late lookup results cannot replace the next restaurant’s review.

### Compact navigation — November 2026

Collections are US, International, and Michelin. City selectors replace the city-tab list; International and Michelin also offer country selectors. Search opens from Filter, while sort, cuisine and All visits / Visited / To try share one compact row. The backup reminder lives in Tools → Export & transfer. Typography, list rows, headings and spacing are smaller; editing fields retain 16px text.

Recognized cities use display-only country defaults. Optional Country in the restaurant editor overrides the default and survives JSON/CSV import and backup. Unknown cities remain reachable in both regional collections, labelled as needing a country; International offers Country not set. Navigation never rewrites or deletes saved entries. Filters apply equally to the list and map, while exports still include the entire notebook.
