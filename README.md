# Restuarants

# Restaurants

[Open the hosted app](https://table-notes-restaurants.savorymug256.chatgpt.site/)

## Assistant inbox

Install the Restaurants plugin offered in ChatGPT. Open the hosted app and click **Connect assistant inbox with ChatGPT** once using the same account. Then tell ChatGPT: “Use Restaurants to add [restaurant], in [city], cuisine [cuisine].” The `add_restaurants` tool queues a delivery; it cannot read your notebook. Open the app to receive entries automatically and see **New from assistant** badges. Use **Mark seen** to clear the badges. Checks run on launch, return to the app, and when a form closes. **Check assistant inbox** runs one manually.

Only incoming deliveries live in the account-isolated hosted inbox. Your existing restaurants, personal edits, ratings, notes, Trash, and backups remain local and are never uploaded. The app commits entries and a receipt atomically before requesting deletion from the inbox. Retries and cross-tab imports do not add duplicate deliveries. The first device to import drains the delivery; other devices do not sync. Deliveries expire after seven days and expired packets are deleted on the next inbox access. The inbox is a handoff queue, not a backup.

Hosting runs in a Cloudflare Worker through Sites. `worker/inbox.js` implements authenticated MCP tools and inbox GET/receipt endpoints. Sites provides caller identity; all storage keys are account-scoped. Inbox responses are never cached. `scripts/embed-app.mjs` builds the allowlisted static assets into the Worker. Run `npm run build`, then `npm run validate`. The original static app remains usable without a backend, but assistant delivery requires the hosted origin.


A buildless, local-only restaurant notebook. No analytics or external fonts. The optional inbox uses ChatGPT sign-in and temporary delivery storage. First launch is empty.

## Run

Use an HTTP server, not `file://`:

```sh
npm run serve
```

Open http://localhost:8080. HTTPS is required for service workers outside localhost.

## Deploy to GitHub Pages

Publish this directory's static files at a stable path. Every asset, manifest entry, and service-worker scope is relative, so a project prefix such as `/restaurants/` or `/wine/restaurants/` works without rebuilding. Include `icons/`. No build step or dependency installation is needed. Never commit exported restaurant backups or any private user data.

Keep the origin and deployment path stable: origin changes create separate browser storage and changing the path may change the installed app's identity. Back up before any move. A Pages subpath is **not** a security boundary: JavaScript in another app on the same origin could access IndexedDB. This app never reads or modifies other apps' databases, workers, or caches. Check other apps for origin-wide cleanup operations before co-hosting.

For updates, change the `CACHE` release suffix in `sw.js` whenever an app-shell asset changes. New versions wait and display an Update app button. Updating never deletes IndexedDB. The button refuses to reload while a dialog is open. App caches are scope-namespaced; only older caches with that exact scope prefix are deleted.

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

The **Force pull list** button reads encrypted envelopes from `inbox/` on `asre1212/Restuarants` main. The signed-in owner's verified account authorizes decryption; the runtime secret never goes to GitHub or the browser. No list is consumed by a page preview or an automatic check. The app commits locally and rereads records to verify them before acknowledging deletion. Matching entries are skipped; a delivery explicitly marked `updateRatings` may update only the overall rating of matching entries, preserving notes, Michelin stars, IDs and Trash.

A GitHub Actions workflow checks acknowledged envelopes on its five-minute schedule and deletes only confirmed deliveries. GitHub can delay scheduled runs. Deletion removes the current file; Git history retains encrypted ciphertext. The local notebook is never uploaded. For future assistant additions, save the `add_restaurants` tool's returned `github_payload` to its `github_path` using GitHub before telling the user it is queued.

The force-pull reader uses raw GitHub files and the checked `inbox/index.json` index, avoiding unauthenticated GitHub REST API rate limits. Add each prepared delivery filename to that index. The cleanup workflow updates the index after removing acknowledged deliveries.

Navigation is one horizontal row: All restaurants, local cities alphabetically, and Michelin last. On small screens the row scrolls horizontally.

### Local restaurant map
List / Map switches between compact entries and interactive rating pins. City, cuisine, search and Michelin filters work in both views. Coordinates are optional `latitude`/`longitude` fields in JSON or CSV and included in backups. New entries are looked up through Photon using only restaurant name, address and city; results are cached in local IndexedDB, sequential requests are spaced by 1.2 seconds. Only a unique exact restaurant-name and city match is placed automatically. Review unmapped offers candidates and manual coordinates for ambiguous branches or missing results. No notes or ratings leave the device. Map backgrounds use OpenStreetMap's normal interactive tile requests and browser cache, with visible attribution; map tiles are never prefetched or saved by the service worker. Map backgrounds and address lookup need internet; the notebook remains available offline.

Assistant workflow: research and verify each incoming branch, include its address and coordinates in encrypted deliveries when possible. Never guess chain branches or locations. The add_restaurants tool prepares encrypted delivery; save its returned GitHub payload and index entry to queue it. Existing local notebooks cannot be remotely read or geocoded by an assistant.

Mapping references: https://leafletjs.com/examples/quick-start/ ; https://operations.osmfoundation.org/policies/tiles/ ; https://github.com/komoot/photon . Vendored Leaflet 1.9.4 license: vendor/leaflet-LICENSE.txt.

Listing presentation: Michelin selection appears only in the restaurant editor. Saved listings show one, two, or three copies of the requested red Michelin star rosette supplied by the user next to the name, matching the saved Michelin star count. One, two, or three rosettes represent the saved Michelin star count. The transparent source image is used unchanged. Tags remain stored and searchable but are hidden from compact listings. Pencil / trash icons sit beside the personal rating; Trash requires confirmation and can be undone through Restore.

Ratings are rounded to the nearest quarter point (0.25). Explicit overall ratings round after validation; requested averages use original rated items, then round the mean. Existing overall scores round locally in a single IndexedDB transaction on launch, preserving notes, Michelin counts, map coordinates, and Trash. Tasting scores display quarter points while original notes retain their entered precision. New imports and encrypted deliveries round overall ratings through the shared validator.
