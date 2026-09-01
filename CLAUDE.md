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

### GSAP Timeline Construction — read this before writing any timeline

These rules exist because of a real bug (fixed in the CAL-0166 "Surface" set): every banner
blinked ~1s after it started. Follow them and the class of bug cannot recur.

**The controlling fact:** `buildTimeline()` waits for the Enabler `INIT` event, and that event
fires roughly **1 second after the browser has already painted the banner** (measured in the
local test environment; it is never instantaneous in production either). So the DOM is on
screen, visible to the user, for a long moment before GSAP touches anything. Anything the
timeline writes to the DOM at *build* time is therefore a visible flash.

**Rule 1 — the CSS load state must be identical to the timeline at time 0.**
CSS owns the start state (hidden layers at `opacity: 0`, colour blocks pre-collapsed with
`transform: scaleX/scaleY(...)`). The timeline only ever tweens *away* from that state. If the
first tick would change something the browser has already painted, that is a blink.

**Rule 2 — never use `from()` or `fromTo()`. Ever.**
Both default to `immediateRender: true`: GSAP writes the "from" values to the DOM the instant
the tween is *created*, regardless of where it sits on the timeline. With the ~1s Enabler
delay, that lands on screen as a flash. This is what caused both the frame-1 blink and the
earlier end-card flash. Adding `immediateRender: false` technically works but is a trap for the
next person — don't reintroduce these calls.

**Rule 3 — reveal with `set()` + `to()` at the same position instead.**

```js
tl.set('#f2rock', { opacity: 1, y: -300 }, 5.25);          // start state, applied at 5.25s
tl.to('#f2rock',  { y: 0, duration: 0.5, ease: 'back.out(0.8)' }, 5.25);
```

A zero-duration `set()` placed at a position other than the parent's current playhead does
**not** immediate-render (GSAP 3.12.5, `Tween` constructor: it only renders early when
`_start === parent._time`). This is the safe primitive. Verified empirically, not assumed.

**Rule 4 — one paused master timeline; no nested child timelines.**
`animationSequence(tl)` takes the master timeline and adds steps to it:

```js
var mainTimeline = gsap.timeline({ paused: true });
function buildTimeline() {
  animationSequence(mainTimeline);
  mainTimeline.play();
  window.mainTimeline = mainTimeline;   // required by debug-panel.js
}
```

Do **not** do `mainTimeline.add(animationSequence())` where the child was made with
`gsap.timeline()` — that child is live on the root ticker between creation and `add()`. A
paused ancestor also suppresses early rendering of zero-duration steps, so this shape is
defence in depth. (A child created with `{ paused: true }` and then `add()`ed never plays —
don't "fix" it that way.)

**Rule 5 — frame 1's base art stays visible in CSS; don't animate it in.**
The background photo/panel of frame 1 must be painted by CSS and left alone by the timeline.
It doubles as the static fallback: if the Enabler is slow, the CDN is blocked, or JS throws,
the ad still shows a sensible first frame instead of a black box. Corollary: no "fade up from
black" opener — it requires the banner to start black, which is exactly the failure state.

**Rule 6 — `transform-origin` goes in CSS, not in tween vars.**
Passing `transformOrigin` inside a tween makes GSAP change the origin mid-flight and can jump
an element that already carries a transform. Put it on the CSS rule and let it stay static.

**Rule 7 — animate `transform` and `opacity` only.**
Compositor-only properties. Collapse/expand panels with `scaleX`/`scaleY` plus a
`transform-origin`, never with `width`/`height`/`top`. Keep `will-change: transform` on the
handful of elements that actually get transformed.

**Before handoff, grep every banner:** `grep -n "fromTo\|\.from(" *.html` must return nothing
but comments.

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

#### Catching flashes and blinks (per-frame trace)

A blink is one or two frames long — you cannot see it reliably by eye, and screenshots miss it.
Trace the DOM instead. This is how the CAL-0166 blink was found and how the fix was proven:

1. Copy the banner HTML next to itself (e.g. `_blinktest.html`, in the same directory so
   `img/` paths still resolve) and inject a `requestAnimationFrame` loop into `<head>` that
   samples `getComputedStyle(el).opacity` and `.transform` for every `#f1*/#f2*/#f3*` layer,
   logging only when the sampled state string **changes**.
2. Serve the folder (`python3 -m http.server 8899`) — `file://` skews asset/Enabler timing.
3. Run headless Chrome with `--remote-debugging-port` plus
   `--disable-background-timer-throttling --disable-renderer-backgrounding
   --disable-backgrounding-occluded-windows` (without these, rAF throttles to ~1fps and the
   trace is useless), drive it over CDP from a small Node script, and collect
   `Runtime.consoleAPICalled`.
4. Between runs, navigate to `about:blank` first and wait — a previous page keeps its rAF loop
   running and its logs will contaminate the next run.
5. **Read the trace like this:** nothing at all should change between `domready` and the first
   intended cue. A layer that appears, disappears, or jumps around the ~1s Enabler INIT mark is
   a build-time immediate render (see Rule 2 above). Delete `_blinktest.html` when done.

## Important Notes

- **Veeva and expiration display**: The `#legal` div has `color: rgba(255,255,255,0.01)` which makes it nearly invisible. This is intentional per S&B spec — increase opacity if legal/ISI requires visibility.
- **Frame count flexibility**: The boilerplate defaults to 7 frames, but 6-frame versions are supported. Comments in the code indicate where to make these changes.
- **Asset optimization**: Keep PNGs for frames small; use compression tools to reduce file size before handoff.
- **Cursor handling**: The `cursor: pointer` is set on `html, body` so absolutely-positioned click zones (e.g., `#bg-exit`) inherit it and can't override it.
- **Recent sets are 3-frame, non-repeating**: `banners4` (CAL-0161 "Approach") and `banners5` (CAL-0166 "Surface") run a single ~14s pass over 3 frames, with all copy baked into PNG/SVG art rather than live text. The 7-frame looping description above belongs to the older boilerplate.
- **`debug-panel.js` is review-only**: it polls for `window.mainTimeline` and injects a scrubber below `#banner`. Keep `window.mainTimeline` assigned in `buildTimeline()`. Remove the `<script src="debug-panel.js">` tag (and the file) before GCM handoff.
- **The `impeccable` design hook's font findings are false positives here**: it flags `font-family: Arial` (`overused-font`, `single-font`) on every banner. All visible type is baked into the art; that declaration only backs the near-invisible legal div and is the S&B boilerplate convention. Leave it alone — don't restyle and don't add suppressions without asking.
