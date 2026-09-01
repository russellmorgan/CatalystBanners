/**
 * debug-panel.js — GSAP review control panel
 *
 * Injects a play/pause/restart panel with a timeline scrubber below #banner.
 * Drop-in module: add <script src="assets/debug-panel.js"></script> at the end
 * of <body>. Remove that tag to strip the panel entirely — no other cleanup needed.
 *
 * Requirements in the host banner:
 *   - A <div id="banner"> element
 *   - window.mainTimeline set to the GSAP timeline after buildTimeline() runs
 *     (use `var mainTimeline` at script top-level, or assign `window.mainTimeline = tl`
 *      at the end of buildTimeline() for banners that use a local var)
 *
 * To change the gap between banner and panel: edit margin-top in injectStyles().
 * To change the minimum panel width: edit the Math.max() call in buildPanel().
 * To change colors: edit the hex values in injectStyles() — brand palette is:
 *   #8ebe4e (Catalyst green), #44264a (purple), #1a1a2e (dark navy background)
 */

(function () {
  'use strict';

  // How often to check for window.mainTimeline (ms), and how many times to try
  // before giving up. Default: 100ms × 100 attempts = 10 second timeout.
  var POLL_INTERVAL_MS  = 100;
  var POLL_MAX_ATTEMPTS = 100;

  // CSS id for the panel element — change this if it conflicts with a banner's own ids
  var PANEL_ID = 'gsap-debug-panel';

  // Internal state
  var tl           = null;   // reference to window.mainTimeline once found
  var rafId        = null;   // requestAnimationFrame handle for the update loop
  var isScrubbing  = false;  // true while the user is dragging the range input
  var pollAttempts = 0;

  // DOM references populated by buildPanel()
  var panel, btnPlay, btnPause, btnRestart,
      scrubber, timeDisplay, statusDot;

  // ---------------------------------------------------------------------------
  // STYLES
  // All CSS is written into a <style> tag scoped to #gsap-debug-panel so it
  // cannot bleed into the banner above. Edit values here to restyle the panel.
  // ---------------------------------------------------------------------------
  function injectStyles() {
    var s = document.createElement('style');
    s.textContent = [
      // Scoped reset so banner's global * rule doesn't affect the panel children
      '#' + PANEL_ID + ' * { box-sizing: border-box; margin: 0; padding: 0; font-family: "SF Mono","Fira Code","Consolas",monospace; }',

      // Outer container
      '#' + PANEL_ID + ' {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 10px;',
      '  padding: 12px 14px;',
      '  margin-top: 100px;',       /* vertical gap between banner and panel */
      '  background: #1a1a2e;',
      '  border: 1px solid #2a2a4a;',
      '  font-size: 11px;',
      '  color: #c8c8e8;',
      '  user-select: none;',
      '  -webkit-user-select: none;',
      '  border-radius: 6px;',
      '}',

      // Top row: status dot + "mainTimeline" label + time readout
      '#' + PANEL_ID + ' .dp-info-row {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 7px;',
      '}',

      // Status indicator dot — color changes via .playing / .paused / .finished class
      '#' + PANEL_ID + ' .dp-dot {',
      '  width: 8px; height: 8px;',
      '  border-radius: 50%;',
      '  background: #44264a;',     /* idle: purple */
      '  flex-shrink: 0;',
      '  transition: background 0.15s;',
      '}',
      '#' + PANEL_ID + ' .dp-dot.playing  { background: #8ebe4e; }',  /* green */
      '#' + PANEL_ID + ' .dp-dot.paused   { background: #f5a623; }',  /* amber */
      '#' + PANEL_ID + ' .dp-dot.finished { background: #4a90e2; }',  /* blue */

      '#' + PANEL_ID + ' .dp-label { color: #5555aa; letter-spacing: 0.05em; }',

      // Time display — right-aligned, tabular numbers so it doesn't jitter
      '#' + PANEL_ID + ' .dp-time {',
      '  margin-left: auto;',
      '  color: #7777bb;',
      '  letter-spacing: 0.03em;',
      '  font-variant-numeric: tabular-nums;',
      '}',

      // Scrubber (range input) — styled consistently across browsers
      '#' + PANEL_ID + ' .dp-scrubber {',
      '  width: 100%;',
      '  -webkit-appearance: none;',
      '  appearance: none;',
      '  height: 5px;',
      '  border-radius: 3px;',
      '  background: #2a2a4a;',
      '  outline: none;',
      '  cursor: pointer;',
      '  accent-color: #8ebe4e;',   /* thumb color on browsers that support accent-color */
      '}',
      // Webkit/Blink thumb
      '#' + PANEL_ID + ' .dp-scrubber::-webkit-slider-thumb {',
      '  -webkit-appearance: none;',
      '  width: 14px; height: 14px;',
      '  border-radius: 50%;',
      '  background: #8ebe4e;',
      '  cursor: pointer;',
      '  border: 2px solid #1a1a2e;',
      '}',
      // Firefox thumb
      '#' + PANEL_ID + ' .dp-scrubber::-moz-range-thumb {',
      '  width: 14px; height: 14px;',
      '  border-radius: 50%;',
      '  background: #8ebe4e;',
      '  cursor: pointer;',
      '  border: 2px solid #1a1a2e;',
      '}',

      // Button row — three equal-width buttons
      '#' + PANEL_ID + ' .dp-btn-row { display: flex; gap: 7px; }',

      '#' + PANEL_ID + ' .dp-btn {',
      '  flex: 1;',
      '  padding: 6px 0;',
      '  border: 1px solid #3a3a6a;',
      '  border-radius: 4px;',
      '  background: #22224a;',
      '  color: #c8c8e8;',
      '  font-family: "SF Mono","Fira Code","Consolas",monospace;',
      '  font-size: 11px;',
      '  letter-spacing: 0.06em;',
      '  cursor: pointer;',
      '  transition: background 0.1s, border-color 0.1s;',
      '}',
      '#' + PANEL_ID + ' .dp-btn:hover  { background: #2c2c5c; border-color: #5a5aaa; }',
      '#' + PANEL_ID + ' .dp-btn:active { background: #18183a; }',
      // .active highlights whichever button reflects the current state (PLAY or PAUSE)
      '#' + PANEL_ID + ' .dp-btn.active { border-color: #8ebe4e; color: #8ebe4e; }',
    ].join('\n');
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------------------
  // DOM
  // Builds the panel and inserts it immediately after #banner in the document.
  // Width is set to match the banner, with a 300px minimum.
  // ---------------------------------------------------------------------------
  function buildPanel() {
    panel = document.createElement('div');
    panel.id = PANEL_ID;

    var bannerEl = document.getElementById('banner');
    var bannerW  = bannerEl ? bannerEl.offsetWidth : 0;
    panel.style.width = Math.max(300, bannerW) + 'px';  /* min 300px */

    // Row 1: status dot + label + time readout
    var infoRow = document.createElement('div');
    infoRow.className = 'dp-info-row';

    statusDot = document.createElement('span');
    statusDot.className = 'dp-dot';

    var label = document.createElement('span');
    label.className = 'dp-label';
    label.textContent = 'mainTimeline';

    timeDisplay = document.createElement('span');
    timeDisplay.className = 'dp-time';
    timeDisplay.textContent = '0.00s / --';

    infoRow.appendChild(statusDot);
    infoRow.appendChild(label);
    infoRow.appendChild(timeDisplay);

    // Row 2: scrubber — range 0–1000 gives smooth 0.1% steps without floats
    scrubber = document.createElement('input');
    scrubber.type      = 'range';
    scrubber.min       = '0';
    scrubber.max       = '1000';
    scrubber.value     = '0';
    scrubber.className = 'dp-scrubber';

    // Row 3: control buttons
    var btnRow = document.createElement('div');
    btnRow.className = 'dp-btn-row';

    btnPlay    = document.createElement('button');
    btnPause   = document.createElement('button');
    btnRestart = document.createElement('button');

    btnPlay.className    = 'dp-btn active';  // PLAY is highlighted on load
    btnPause.className   = 'dp-btn';
    btnRestart.className = 'dp-btn';

    btnPlay.textContent    = 'PLAY';
    btnPause.textContent   = 'PAUSE';
    btnRestart.textContent = 'RESTART';

    btnRow.appendChild(btnPlay);
    btnRow.appendChild(btnPause);
    btnRow.appendChild(btnRestart);

    panel.appendChild(infoRow);
    panel.appendChild(scrubber);
    panel.appendChild(btnRow);

    // Insert directly after #banner (not inside it, so GCM click zones are unaffected)
    if (bannerEl && bannerEl.parentNode) {
      bannerEl.parentNode.insertBefore(panel, bannerEl.nextSibling);
    } else {
      document.body.appendChild(panel);
    }
  }

  // ---------------------------------------------------------------------------
  // CONTROLS
  // Wires up button clicks and scrubber drag events.
  // ---------------------------------------------------------------------------
  function bindControls() {
    btnPlay.addEventListener('click', function () {
      if (!tl) return;
      // If a finite timeline has reached the end, restart instead of play
      // (play() from progress=1 on a non-repeating timeline does nothing)
      if (tl.progress() >= 1 && tl.repeat() === 0) {
        tl.restart();
      } else {
        tl.play();
      }
    });

    btnPause.addEventListener('click', function () {
      if (tl) tl.pause();
    });

    btnRestart.addEventListener('click', function () {
      if (tl) tl.restart();
    });

    // Pause while the user drags so the scrubber position drives the timeline,
    // not the other way around. Resume on release.
    scrubber.addEventListener('mousedown', function () {
      isScrubbing = true;
      if (tl) tl.pause();
    });
    scrubber.addEventListener('touchstart', function () {
      isScrubbing = true;
      if (tl) tl.pause();
    }, { passive: true });

    // Seek to the scrubber's position on every input event (fires continuously while dragging)
    scrubber.addEventListener('input', function () {
      if (!tl) return;
      tl.progress(parseInt(scrubber.value, 10) / 1000);
    });

    scrubber.addEventListener('mouseup',  function () { isScrubbing = false; });
    scrubber.addEventListener('touchend', function () { isScrubbing = false; });
  }

  // ---------------------------------------------------------------------------
  // STATUS HELPER
  // Returns a string used as the status dot's CSS class.
  // ---------------------------------------------------------------------------
  function getStatus() {
    if (!tl)                 return 'idle';
    if (tl.isActive())       return 'playing';
    if (tl.paused())         return 'paused';
    if (tl.progress() >= 1)  return 'finished';
    return 'paused';
  }

  // ---------------------------------------------------------------------------
  // UPDATE LOOP
  // Runs every animation frame. Syncs the scrubber position and time display
  // to the current timeline state. Uses tl.progress() (0–1 within one iteration)
  // rather than tl.totalProgress() so infinite repeat:-1 timelines work correctly.
  // ---------------------------------------------------------------------------
  function tick() {
    rafId = requestAnimationFrame(tick);
    if (!tl) return;

    var progress   = tl.progress();
    var isInfinite = tl.repeat() === -1;

    // Only update the scrubber handle when the user isn't dragging it
    if (!isScrubbing) {
      scrubber.value = Math.round(progress * 1000);
    }

    // Time display: "1.40s / loop" or "1.40s / 24.00s"
    var cur = (progress * tl.duration()).toFixed(2) + 's';
    var tot = isInfinite ? 'loop' : tl.duration().toFixed(2) + 's';
    timeDisplay.textContent = cur + ' / ' + tot;

    // Status dot and active button highlight
    var status = getStatus();
    statusDot.className = 'dp-dot ' + status;

    if (status === 'playing') {
      btnPlay.className  = 'dp-btn active';
      btnPause.className = 'dp-btn';
    } else {
      btnPlay.className  = 'dp-btn';
      btnPause.className = 'dp-btn active';
    }
  }

  // ---------------------------------------------------------------------------
  // TIMELINE POLL
  // Called on a setInterval until window.mainTimeline exists AND has a non-zero
  // duration (an empty timeline is created before buildTimeline() populates it,
  // so we wait for duration > 0 to confirm it's ready). Returns true to stop polling.
  // ---------------------------------------------------------------------------
  function pollForTimeline() {
    pollAttempts++;

    if (
      typeof window.mainTimeline !== 'undefined' &&
      window.mainTimeline !== null &&
      typeof window.mainTimeline.duration === 'function' &&
      window.mainTimeline.duration() > 0
    ) {
      tl = window.mainTimeline;
      return true;  // found — stop polling
    }

    if (pollAttempts >= POLL_MAX_ATTEMPTS) {
      // Timed out — Enabler.js may not have fired or mainTimeline was never assigned
      if (timeDisplay) timeDisplay.textContent = 'timeline not found';
      return true;  // stop polling
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // INIT
  // Entry point. Overrides the banner's overflow:hidden so the panel is visible,
  // builds the UI, starts the RAF loop, and begins polling for the timeline.
  // ---------------------------------------------------------------------------
  function init() {
    // Banners set overflow:hidden on html and body to prevent scroll bars in GCM.
    // Override both so the panel below the banner is reachable.
    document.body.style.overflow = 'visible';
    document.body.style.height   = 'auto';
    document.documentElement.style.overflow = 'visible';
    document.documentElement.style.height   = 'auto';

    injectStyles();
    buildPanel();
    bindControls();

    // Start the RAF loop immediately — shows idle state while waiting for the timeline
    rafId = requestAnimationFrame(tick);

    var pollTimer = setInterval(function () {
      if (pollForTimeline()) clearInterval(pollTimer);
    }, POLL_INTERVAL_MS);
  }

  // Wait for the DOM to be ready before building the panel
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose a minimal public handle — useful for console inspection during review
  window.DebugPanel = { getTimeline: function () { return tl; } };
})();
