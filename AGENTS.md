# AGENTS.md — CatalystBanners

## What this repo is

HTML5 display banners for Catalyst/Agamree, served via Google Campaign Manager (GCM). Each file is a standalone ad creative — no build system, no tests, no framework.

## Starting a new banner

1. Copy `_BOILERPLATE_HTML5_Banner.html` → `MMDDYY_Catalyst_Description_HTML5_VeevaCode_SIZExSIZE.html`
2. Update `<meta>` tags: `ad.size`, `veeva-code`, `expiration-date`
3. Update `clickTag`/`clickTag2` URLs in the top `<script>` block
4. Adjust `#banner` CSS dimensions, font sizes, and frame padding for the new size
5. Validate at https://h5validator.appspot.com/dcm/asset before handoff

## Must-dos (GCM validator failures happen here)

- **Static click tag declarations** at the top of `<script>`, never added dynamically
- **Inline `onclick="exitHandler()"` on click divs** — never `addEventListener` or jQuery click handlers. GCM's validator cannot detect programmatic listeners.
- **`Enabler.exit("clickTag", clickTag)`** — wrap clickTag values in `Enabler.exit()`, not bare navigation
- **No UTMs in the HTML** — GCM appends them at serve time. URLs in the file should be clean.
- All assets must live in `assets/` and reference as `src="assets/filename.png"` — GCM rejects external references
- Static images < 150 KB each; total .zip < 10 MB
- `clickTag`/`clickTag2`/`clickTag3` — numbered sequentially for multiple exits

## Naming convention

`MMDDYY_Catalyst-Brand_Description_HTML5_VeevaCode_SIZExSIZE`

Example: `043026_Catalyst-Agamree_NowApproved_HTML5_AGA-0038_300x250`

## Size variants

Each size needs: meta `ad.size`, `#banner` CSS dimensions, font scaling, frame padding, and PI exit zone (`#pi-exit`) adjustments. See `CLAUDE.md` for specifics.

## Key files

| File | Purpose |
|---|---|
| `_BOILERPLATE_HTML5_Banner.html` | Template — always start here |
| `client-instructions.md` | S&B/Spring & Bond specs, naming, handoff rules |
| `CLAUDE.md` | Architecture, GSAP animation patterns, GCM requirements |
| `assets/animations.js` | Reusable animation helpers (color block, fade, etc.) |
| `creative-instructions.md` | Additional creative guidelines |

## Legal/ISI display

The `#legal` div uses `color: rgba(255,255,255,0.01)` (nearly invisible) by default per S&B spec. Increase opacity if legal/ISI text must be visible.

## No instructions files exist

No README, no CI, no lint/test config. This is a flat static file collection.
