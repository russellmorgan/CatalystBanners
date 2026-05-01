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

### Frame Animation Pattern

The animation uses a GSAP timeline with:
- 0.4s fade-in, N-second hold, 0.4s fade-out per frame
- Frame 7 (end card) holds 6.4s instead of 3s and animates in the CTA bar
- Timeline repeats infinitely with `repeat: -1`
- All 7 frames can be toggled to 6 frames by commenting out frame-7 and adjusting hold times

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

- All images/assets must be in the `assets/` folder and referenced as `src="assets/filename.png"`
- Supported formats: PNG, JPG, GIF, SVG, and video (GIF/MP4 for animations)
- Total .zip size limit: 10 MB (all files combined)
- Individual static image files: < 150 KB

### Animation Duration

- Standard duration: **30 seconds**, looping infinitely
- Prefer 7 frames (6 @ 3s each + 1 end card @ 6.4s)
- Can be reduced to 6 frames by adjusting hold times and disabling frame-7

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

## Development Workflow

### Starting a New Banner

1. **Duplicate the boilerplate**: `_BOILERPLATE_HTML5_Banner.html` → `MMDDYY_Catalyst_Description_HTML5_VeevaCode_SIZExSIZE.html`
2. **Update meta tags**: `ad.size`, `veeva-code`, `expiration-date`
3. **Update click tags**: Replace `clickTag` and `clickTag2` with actual destination URLs
4. **Adjust dimensions**: Update CSS `#banner` width/height to match `ad.size`
5. **Add frame images**: Place 7 images in `assets/` folder and reference them in frame divs
6. **Test in GCM validator**: Upload to https://h5validator.appspot.com/dcm/asset and verify no errors

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

### Using Global Animations

The project includes a **reusable animation library** in `assets/animations.js`:

#### Color Block with Fade Animation

Animates a solid block of color sliding in from the left, then fades in nested content.

**HTML structure:**
```html
<div class="color-block-animation">
  <div class="color-block"></div>
  <img src="assets/frame.png" alt="Content" />
</div>
```

**CSS setup:**
```css
.color-block {
  width: 100px;
  height: 100%;
  background: #ff6600;
  transform: translateX(-100%);  /* Start off-screen left */
}

img {
  opacity: 0;
  visibility: hidden;  /* Use autoAlpha for fade-in */
}
```

**JavaScript:**
```javascript
import { createColorBlockWithFadeAnimation } from 'assets/animations.js';

const container = document.querySelector('.color-block-animation');
const animation = createColorBlockWithFadeAnimation(container, {
  blockDuration: 1.2,    // Block slide duration (seconds)
  fadeDuration: 0.8,     // Image fade duration (seconds)
  blockEase: 'power3.out',
  fadeEase: 'power1.inOut'
});

// Add to main timeline
tl.add(animation, 'labelName');  // Add at a label
// Or play standalone
// animation.play();
```

### Common Edits

- **Change frame hold duration**: Modify the duration parameter in `buildTimeline()` (e.g., `3.0` → `2.5`)
- **Add text overlay**: Uncomment `<p class="headline">Text</p>` in frame and adjust z-index if needed
- **Change CTA text**: Edit `<span>Learn More</span>` in `#cta-bar`
- **Adjust colors**: Update hex colors in CSS (e.g., `background: #ff6600` for CTA bar)
- **Change animation easing**: Modify `ease: "power2.inOut"` to other GSAP easings

## Important Notes

- **Veeva and expiration display**: The `#legal` div has `color: rgba(255,255,255,0.01)` which makes it nearly invisible. This is intentional per S&B spec — increase opacity if legal/ISI requires visibility.
- **Frame count flexibility**: The boilerplate defaults to 7 frames, but 6-frame versions are supported. Comments in the code indicate where to make these changes.
- **Asset optimization**: Keep PNGs for frames small; use compression tools to reduce file size before handoff.
- **Cursor handling**: The `cursor: pointer` is set on `html, body` so absolutely-positioned click zones (e.g., `#bg-exit`) inherit it and can't override it.
