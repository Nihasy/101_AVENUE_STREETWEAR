# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static site — one self-contained HTML file per page — for running a streetwear reselling operation in Antananarivo (Madagascar). The UI is entirely in French and amounts are in Ariary (Ar).

- `index.html` — hub linking to the three tools, with a live summary read from `localStorage`.
- `carnet.html` — stock and sales ledger for the "100 tees" test batch. Add inventory, mark items sold, read KPIs and breakdowns.
- `roadmap.html` — phased operational checklist (phases 00–04) with per-phase deadline countdowns and a completion meter.
- `strategie.html` — ad-budget strategy: unit-economics calculator deriving a CPA ceiling, four spend waves against a 100 000 Ar cap, a results dashboard, and an automatic verdict.

The three tools share no data with each other; the hub reads all three storage keys read-only to display counts.

Each tool page carries the same three-tab `<nav class="nav">` before its `<header>`, with `class="on"` on the current page. Adding a page means updating that nav in every tool page plus the hub cards.

## Running / testing

There is no build, no package manager, no test suite, and no dependencies to install. Open `index.html` directly in a browser, or serve the folder to match production URL behaviour:

```powershell
start index.html      # suffisant dans la plupart des cas
npx serve .           # reproduit les URL propres de Vercel
```

The only network requirement is the Google Fonts CDN link (Archivo + Space Mono); everything else works offline. Verify changes by opening the page and exercising the UI — there is nothing to compile or lint.

## Deployment

Deployed on Vercel as a static site from `main`; every push redeploys. There is no framework preset and no build command — Vercel serves the repo root as-is.

`vercel.json` sets `cleanUrls: true` (so `/carnet` serves `carnet.html`, and `/carnet.html` 308-redirects to `/carnet`) plus `X-Robots-Tag: noindex, nofollow` and basic security headers.

**Internal links must stay relative and keep the `.html` extension** (`href="carnet.html"`, not `href="/carnet"`). Extensionless absolute paths only resolve on Vercel and 404 under `npx serve`, a plain static server, or `file://`. The `.html` form works everywhere and still lands on the clean URL in production thanks to the redirect.

## Architecture and conventions

**Everything inline.** Each file is `<style>` + markup + `<script>` in one document. Keep it that way — do not extract CSS/JS into separate files or introduce a bundler, framework, or npm dependency without being asked.

**Plain ES5, no framework.** `var`, `function`, `[].slice.call(...)`, string-concatenated `innerHTML`, and inline `onclick="fn(id)"` attributes. New code should match this style rather than introducing modern syntax inconsistently.

**`sync.js` is the one shared script**, and the only deliberate exception to the inline rule — sync logic must be byte-identical across four pages, so it is a file, not four copies. Each page loads `config.js` then `sync.js` after its own inline script. It works by patching `localStorage.setItem`/`removeItem` to detect writes to the three data keys, so **no page's own logic knows sync exists**. Keep it that way: a new tool page needs only the two script tags plus its key added to `KEYS` in `sync.js`.

**localStorage is still the source of truth on each device**; Supabase only carries copies between devices.
- `carnet.html` → key `swops.stock.v2`, holding the full `DATA` array of item objects.
- `roadmap.html` → key `swops.roadmap.v1`, holding a `{taskKey: 1}` map of checked tasks.
- `strategie.html` → key `swops.strategie.v1`, holding `{eco, waves, rows}` — calculator inputs, per-wave `{l, d}` flags, and dashboard rows.

`sync.js` adds three of its own keys — `swops.sync.code` (the shared secret linking devices), `swops.sync.at` (server timestamp of the last successful sync), `swops.sync.dirty` (unpushed local changes). These are per-device and deliberately never synced.

**Sync conflict rule:** whole-snapshot, last-writer-wins, *except* that a device with unpushed local changes never gets silently overwritten — it shows a banner and makes the user choose. A device holding data with no `swops.sync.at` counts as dirty, which protects data entered before sync was switched on. If you ever add per-item merging, that safety net is the thing not to lose.

**Security model:** the Supabase `anon` key is public by design and ships in `config.js`. The `state` table has RLS enabled with **no policies**, so that key alone reads nothing. All access goes through the `pull_state`/`push_state` SECURITY DEFINER functions, which require a sync code of at least 12 characters. The generated codes are 24 characters. Never add an RLS policy that grants `anon` direct table access — that would expose every user's data to anyone holding the public key.

Changing a key string silently orphans the user's existing data. If a data-shape change forces it, bump the version suffix deliberately and expect the reset — the footer warns users to export first for a reason.

**Roadmap checkbox keys are positional.** `boxes.forEach(function(b,i){b.dataset.k="t"+i})` assigns storage keys by DOM order. Inserting, removing, or reordering any `<li>` shifts every subsequent task's saved state, so previously completed tasks appear checked/unchecked at random. Append new tasks at the end of the last phase when possible, and tell the user when a change will scramble their saved progress.

**Roadmap init order matters.** `dayBadges()` reads `p.dataset.done`, which is only set by `refresh()`. The trailing `load(); refresh(); dayBadges();` sequence must keep that order, and any handler that re-renders badges must call `refresh()` first.

**Carnet data model: one record per physical unit.** There is no quantity field on an item. "Qté / taille" in the add form is a loop counter — selecting 3 sizes × 2 qty pushes 6 separate objects. This is why every metric in `render()` and `breakdowns()` is a plain `filter`/`reduce` over `DATA` with no weighting. Preserve that invariant; adding a `qty` field would break every calculation.

Item shape:
```js
{id, brand, style, note, grade /* "TOP"|"MID" */, size, price, cost,
 sold, soldPrice, chan, date /* "YYYY-MM-DD" */}
```
`price` is the asking price and `cost` the unit purchase cost, both captured at add time; `soldPrice` is the real negotiated price entered at sale. Revenue and margin always use `soldPrice`/`cost` of sold items only, while the "récupération de la mise" bar measures revenue against the cost of *all* stock — that asymmetry is intentional.

**Grade drives default price.** Selecting TOP/MID in the add form overwrites the price input (35000 / 20000). These numbers, along with the channel list `CH` and the size buttons, are hardcoded near their point of use.

**Escaping.** All user-supplied strings go through `esc()` before entering `innerHTML`. Any new field rendered into the list or breakdowns must do the same.

## Design system

All three pages share an identical `:root` token block (`--paper`, `--card`, `--ink`, `--muted`, `--stamp` red, `--green`, `--line`, `--line2`) and the same visual language: dotted-paper background, hard 1.5–2px black borders, zero border-radius, Archivo 900 headings with Space Mono uppercase micro-labels. The tokens are duplicated, not shared — a palette change must be applied in all three files.

Mobile-first: layouts use `repeat(auto-fit, minmax(...))` grids and `clamp()` type. The tools are used on a phone during live sales, so touch targets and single-column reflow matter more than desktop polish.

## Domain rules that constrain the content

Stated as "loi du jeu" in the roadmap header and reflected throughout:
- **Velocity over margin** — the goal is proving throughput, not maximizing per-unit profit.
- **Zero brand names publicly.** The `Adidas / Nike / Puma / Redbat` options in `carnet.html` are labelled "Modèle (interne)" — they are private bookkeeping labels. Do not surface them in anything customer-facing, and keep `<meta name="robots" content="noindex, nofollow">` on every page (the `X-Robots-Tag` header in `vercel.json` backs it up).
- **The ad budget is capped at 100 000 Ar** and does not get extended mid-run. Absolute CPA ceiling is 6 000 Ar (`CPA_MAX` in `strategie.html`), steering target 2 500–3 500 Ar. The MID grade never gets paid promotion — its residual margin is around 2 000 Ar, so only TOP is advertised.
- **Each phase has a gate**, a hard condition before advancing. Phase deadlines in `data-deadline` are not chronologically ordered (phase 03 predates phase 02's end); that reflects overlapping real-world work, not a bug.
