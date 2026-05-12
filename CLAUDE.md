# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a collection of HTML5 display banner advertisements for the Catalyst pharmaceutical client, delivered through Spring & Bond media agency. Banners are served through Google Campaign Manager (GCM) and must conform to strict technical and naming requirements.

## Architecture & Key Patterns

### Banner Structure

Each banner is a self-contained HTML5 creative with:
- **Meta tags** at the top defining: `ad.size` (e.g., `width=300,height=300`), `veeva-code` (e.g., `AGA-0000`), and `expiration-date` (MM/DD/YYYY format)
- **Static click tag declarations** in a `<script>` tag (never via event listeners — GCM validator requires inline declarations)
- **GSAP 3 timeline** controlling a 7-frame animation loop (30 seconds total, repeating)
- **Frame-based layout** with 6 frames at 3s each, plus a 7th end card frame (6.4s) with CTA bar
- **Enabler.js from Google** for GCM integration and click exit handling

### Click Handlers

Two exit points are standard:
- `clickTag`: Primary destination (main banner click)
- `clickTag2`: Secondary destination (typically prescribing information PDF)

Must use `onclick="exitHandler()"` inline HTML; **do not use addEventListener** — the GCM validator cannot detect programmatic listeners and assets will fail validation.

## File Organization

```
/
├── _BOILERPLATE_HTML5_Banner.html    (template with inline documentation)
├── 043026_Catalyst_HTML5_AGA-0000_*.html  (production banners, one per size)
├── client-instructions.md             (S&B requirements, specs, naming conventions)
├── assets/                            (images, animations, supporting files)
│   ├── *.png                          (frame images)
│   ├── falling-rocks.gif / .mp4       (background animation assets)
│   ├── text*.png                      (text overlay images)
│   └── text-master.psd                (source for text layers)
└── .claude/settings.local.json        (Claude Code config)
```

## Naming Convention

**Required format:** `MMDDYY_Client-Brand_Description_HTML5_VeevaCode_Size`

**Example:** `043026_Catalyst-Agamree_NowApproved_HTML5_AGA-0038_300x250`

- Date: MMDDYY
- Client and brand name hyphen-separated
- Description of creative (no spaces, use hyphens)
- `_HTML5_` literal string
- Veeva code (e.g., `AGA-0038`)
- Final size (e.g., `300x250`)

## Common Banner Sizes

Standard display sizes are:
- `160x600` (wide skyscraper)
- `300x50` (mobile banner)
- `300x250` (medium rectangle)
- `300x600` (half page)
- `320x50` (mobile leaderboard)
- `728x90` (leaderboard)

Each size requires adjustments to:
- `<meta name="ad.size">` (width and height)
- `#banner` CSS (width and height)
- Font sizes in `.headline` and `.subline` (smaller for skyscrapers, larger for rectangles)
- Padding and layout in frame containers (`.headline` z-index, spacing)
- PI exit zone dimensions (`#pi-exit` width/height/positioning)

## Technical Requirements

### GCM Validation

All banners must pass the **[Google HTML5 Validator](https://h5validator.appspot.com/dcm/asset)** before deployment.

**Critical for validation:**
- Click tags must be statically declared at the top of `<script>` (not dynamically added)
- Inline `onclick="exitHandler()"` and `onclick="exitHandler2()"` on click divs
- Enabler.js must be loaded: `<script src="https://s0.2mdn.net/ads/studio/Enabler.js"></script>`
- Click handlers must wrap clickTag variables in `Enabler.exit()` calls

### Click Tag & UTM Handling

- **Do NOT include UTMs in HTML** — GCM appends them at serve time via Enabler.exit()
- Destination URLs should be clean (e.g., `https://example.com`, not `https://example.com?utm_source=...`)
- If using multiple exit URLs, name them `clickTag`, `clickTag2`, `clickTag3`, etc.

### Asset File Paths

- Supported formats: PNG, JPG, GIF, SVG, and video (GIF/MP4 for animations)
- Total .zip size limit: 10 MB (all files combined)
- Individual static image files: < 150 KB

## Handoff Requirements

Per client instructions (see `client-instructions.md`), handoff deliverables must include:

1. **Veeva Code** (in meta tag and legal section)
2. **Expiration Date** (MM/DD/YYYY in meta tag and legal section)
3. **Destination URL** (clean URLs in clickTag variables, no UTMs)
4. **Annotated PDF** (showing which URLs map to which click zones)
5. **Assets should NOT have UTMs built in**

## Key External Resources

- **Google Campaign Manager Documentation**: [How to prepare HTML5 display assets](https://support.google.com/campaignmanager/answer/3145300)
- **Studio HTML5 SDK**: [Build an HTML5 creative](https://support.google.com/richmedia/answer/2672542)
- **Enabler Library Docs**: [studio.Enabler](https://www.google.com/doubleclick/studio/docs/sdk/html5/en/class_studio_Enabler.html)
- **GSAP 3 Docs**: [GSAP Timeline](https://greensock.com/docs/v3/GSAP/Timeline)
- **GCM HTML5 Validator**: https://h5validator.appspot.com/dcm/asset

### Customizing for Size Variants

When creating a new size variant:
1. Adjust `#banner` CSS dimensions
2. Scale font sizes proportionally (use smaller fonts for narrow banners like 160x600, 300x50)
3. Update frame padding (`padding: 0 16px` for 300x250 → `padding: 0 12px` for 160x600)
4. Adjust PI exit zone (`#pi-exit` width/height/position) to fit the banner
5. Update CTA bar height if needed (typically 40px is standard)

### Testing Locally

Since these are GCM creatives, local testing is limited to:
- **Visual inspection**: Open the HTML file in a browser; check frame transitions, alignment, and text placement
- **GCM validation**: Always validate with the [HTML5 validator](https://h5validator.appspot.com/dcm/asset) before handoff
- **Enabler simulation**: Enabler.js requires GCM context, so `Enabler.exit()` calls won't work locally; focus on frame animation and visual layout

## Important Notes

- **Veeva and expiration display**: The `#legal` div has `color: rgba(255,255,255,0.01)` which makes it nearly invisible. This is intentional per S&B spec — increase opacity if legal/ISI requires visibility.
- **Frame count flexibility**: The boilerplate defaults to 7 frames, but 6-frame versions are supported. Comments in the code indicate where to make these changes.
- **Asset optimization**: Keep PNGs for frames small; use compression tools to reduce file size before handoff.
- **Cursor handling**: The `cursor: pointer` is set on `html, body` so absolutely-positioned click zones (e.g., `#bg-exit`) inherit it and can't override it.
