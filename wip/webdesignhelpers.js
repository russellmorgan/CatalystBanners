/*!
 * WebDesignHelpers v1.0.0
 * On-page guide lines, measurements and reference rectangles for
 * front-end alignment checks.
 *
 * Works two ways:
 *   1. Standalone: <script src="webdesignhelpers.js"></script>
 *   2. Chrome extension: injected by the toolbar icon (re-injection toggles).
 *
 * No dependencies. Everything renders inside a Shadow DOM overlay so page
 * CSS and tool CSS never interfere with each other.
 */
(function () {
  'use strict';

  // Re-injection (e.g. clicking the extension icon again) toggles the
  // existing instance instead of creating a second one.
  if (window.__WDH__) {
    window.__WDH__.toggle();
    return;
  }

  var MAX_Z = 2147483647;
  var SNAP_RADIUS = 6; // px — measure clicks snap to guides within this range
  var MIN_RECT = 8;    // px — minimum rectangle dimension

  var DEFAULTS = {
    lineColor: '#ff2d78',   // guides + measurements
    rectColor: '#2d8cff',   // rectangle border / fill base
    rectOpacity: 0.25,      // rectangle fill opacity
    imgOpacity: 0.5,        // reference image overlay opacity
    textSize: 12,           // measurement / label font size
    showRectLabels: true,   // W × H labels on rectangles (hotkey D)
    toggleKey: { key: 'k', ctrl: true, shift: true, alt: false, meta: false }
  };

  // ---------------------------------------------------------------- storage
  var storage = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync)
    ? {
        load: function (cb) {
          try {
            chrome.storage.sync.get('wdhPrefs', function (d) {
              cb((d && d.wdhPrefs) || {});
            });
          } catch (e) { cb({}); }
        },
        save: function (p) {
          try { chrome.storage.sync.set({ wdhPrefs: p }); } catch (e) { /* noop */ }
        }
      }
    : {
        load: function (cb) {
          var p = {};
          try { p = JSON.parse(localStorage.getItem('wdhPrefs')) || {}; } catch (e) { /* noop */ }
          cb(p);
        },
        save: function (p) {
          try { localStorage.setItem('wdhPrefs', JSON.stringify(p)); } catch (e) { /* noop */ }
        }
      };

  // Reference image overlays persist as data URLs, which are far too large
  // for chrome.storage.sync — use chrome.storage.local / localStorage.
  var imageStore = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)
    ? {
        load: function (cb) {
          try {
            chrome.storage.local.get('wdhImage', function (d) {
              cb((d && d.wdhImage) || null);
            });
          } catch (e) { cb(null); }
        },
        save: function (data, onFail) {
          try {
            chrome.storage.local.set({ wdhImage: data }, function () {
              if (chrome.runtime && chrome.runtime.lastError && onFail) onFail();
            });
          } catch (e) { if (onFail) onFail(); }
        },
        clear: function () {
          try { chrome.storage.local.remove('wdhImage'); } catch (e) { /* noop */ }
        }
      }
    : {
        load: function (cb) {
          var d = null;
          try { d = JSON.parse(localStorage.getItem('wdhImage')); } catch (e) { /* noop */ }
          cb(d);
        },
        save: function (data, onFail) {
          try { localStorage.setItem('wdhImage', JSON.stringify(data)); }
          catch (e) { if (onFail) onFail(); }
        },
        clear: function () {
          try { localStorage.removeItem('wdhImage'); } catch (e) { /* noop */ }
        }
      };

  // ------------------------------------------------------------------ state
  var prefs = clonePrefs(DEFAULTS);
  var state = {
    enabled: true,
    mode: null,          // null | 'measure' | 'rect'
    selected: null,      // item object
    items: [],           // { id, type: 'h'|'v'|'measure'|'rect', ... }
    lastMouse: null,     // page coords of the cursor
    recording: false,    // hotkey recorder armed
    nextId: 1
  };

  // ------------------------------------------------------------------- DOM
  var host = document.createElement('wdh-overlay');
  host.style.cssText =
    'position:absolute;left:0;top:0;width:0;height:0;z-index:' + MAX_Z + ';';
  var root = host.attachShadow({ mode: 'open' });

  root.innerHTML =
    '<style>' + css() + '</style>' +
    '<div class="layer"></div>' +
    '<div class="hint" hidden></div>' +
    '<div class="toast" hidden></div>' +
    '<button class="badge" title="WebDesignHelpers preferences (P)">' +
      '<span class="badge-dot"></span>WDH' +
    '</button>' +
    '<div class="prefs" hidden></div>' +
    '<input class="imgpick" type="file" accept="image/*" hidden>';

  var layer = root.querySelector('.layer');
  var hintEl = root.querySelector('.hint');
  var toastEl = root.querySelector('.toast');
  var badgeEl = root.querySelector('.badge');
  var prefsEl = root.querySelector('.prefs');
  var imgPickEl = root.querySelector('.imgpick');

  document.documentElement.appendChild(host);
  buildPrefsPanel();
  applyPrefs();
  updateLayerSize();

  storage.load(function (saved) {
    prefs = mergePrefs(DEFAULTS, saved);
    applyPrefs();
  });

  // ------------------------------------------------------------- utilities
  function clonePrefs(p) {
    return JSON.parse(JSON.stringify(p));
  }

  function mergePrefs(base, extra) {
    var out = clonePrefs(base);
    Object.keys(base).forEach(function (k) {
      if (extra[k] !== undefined && extra[k] !== null) out[k] = extra[k];
    });
    if (!out.toggleKey || typeof out.toggleKey.key !== 'string') {
      out.toggleKey = clonePrefs(DEFAULTS.toggleKey);
    }
    return out;
  }

  function hexToRgba(hex, alpha) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return 'rgba(45,140,255,' + alpha + ')';
    var n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function docSize() {
    var de = document.documentElement;
    var body = document.body;
    return {
      w: Math.max(de.scrollWidth, body ? body.scrollWidth : 0, de.clientWidth),
      h: Math.max(de.scrollHeight, body ? body.scrollHeight : 0, de.clientHeight)
    };
  }

  function updateLayerSize() {
    var s = docSize();
    layer.style.width = s.w + 'px';
    layer.style.height = s.h + 'px';
  }

  function mousePoint() {
    if (state.lastMouse) return { x: state.lastMouse.x, y: state.lastMouse.y };
    return {
      x: Math.round(window.scrollX + window.innerWidth / 2),
      y: Math.round(window.scrollY + window.innerHeight / 2)
    };
  }

  function eventTarget(e) {
    return (e.composedPath ? e.composedPath()[0] : e.target) || e.target;
  }

  function isEditable(el) {
    if (!el || !el.tagName) return false;
    var t = el.tagName.toLowerCase();
    return t === 'input' || t === 'textarea' || t === 'select' || el.isContentEditable;
  }

  function formatCombo(k) {
    var parts = [];
    if (k.ctrl) parts.push('Ctrl');
    if (k.alt) parts.push('Alt');
    if (k.shift) parts.push('Shift');
    if (k.meta) parts.push('⌘');
    parts.push(k.key.length === 1 ? k.key.toUpperCase() : k.key);
    return parts.join('+');
  }

  function matchesToggle(e) {
    var k = prefs.toggleKey;
    return e.key.toLowerCase() === k.key.toLowerCase() &&
      e.ctrlKey === !!k.ctrl && e.shiftKey === !!k.shift &&
      e.altKey === !!k.alt && e.metaKey === !!k.meta;
  }

  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 1400);
  }

  function showHint(msg) {
    hintEl.textContent = msg;
    hintEl.hidden = false;
  }

  function hideHint() {
    hintEl.hidden = true;
  }

  // -------------------------------------------------------------- selection
  function select(item) {
    if (state.selected === item) return;
    deselect();
    state.selected = item;
    itemEls(item).forEach(function (el) { el.classList.add('selected'); });
    if (item.type === 'h' || item.type === 'v') updateGuideTag(item);
  }

  function deselect() {
    if (!state.selected) return;
    itemEls(state.selected).forEach(function (el) { el.classList.remove('selected'); });
    state.selected = null;
  }

  function itemEls(item) {
    return item.type === 'measure' ? [item.lineEl, item.labelEl] : [item.el];
  }

  function deleteItem(item) {
    if (state.selected === item) state.selected = null;
    itemEls(item).forEach(function (el) { el.remove(); });
    var i = state.items.indexOf(item);
    if (i !== -1) state.items.splice(i, 1);
    if (item.type === 'img') imageStore.clear();
  }

  function clearAll() {
    state.items.slice().forEach(deleteItem);
    toast('Cleared all items');
  }

  // ----------------------------------------------------------- guide lines
  function addGuide(type, pos) {
    updateLayerSize();
    var el = document.createElement('div');
    el.className = 'guide ' + type;
    el.innerHTML = '<div class="line"></div><div class="tag"></div>';
    layer.appendChild(el);

    var item = { id: state.nextId++, type: type, pos: 0, el: el };
    state.items.push(item);
    setGuidePos(item, pos);
    bindGuideDrag(item);
    select(item);
    return item;
  }

  function setGuidePos(item, pos) {
    var s = docSize();
    var max = item.type === 'h' ? s.h - 1 : s.w - 1;
    item.pos = Math.min(Math.max(Math.round(pos), 0), Math.max(max, 0));
    if (item.type === 'h') {
      item.el.style.top = (item.pos - 4) + 'px';
    } else {
      item.el.style.left = (item.pos - 4) + 'px';
    }
    updateGuideTag(item);
  }

  function updateGuideTag(item) {
    var tag = item.el.querySelector('.tag');
    if (item.type === 'h') {
      tag.textContent = 'y: ' + item.pos + 'px';
      tag.style.left = (window.scrollX + 8) + 'px';
      tag.style.top = '';
    } else {
      tag.textContent = 'x: ' + item.pos + 'px';
      tag.style.top = (window.scrollY + 8) + 'px';
      tag.style.left = '';
    }
  }

  // Drags track pointermove/up on the window so they survive fast cursor
  // movement and don't depend on pointer capture being available.
  function trackDrag(el, e, onMove, onUp) {
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    function move(ev) { onMove(ev); }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (onUp) onUp();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function bindGuideDrag(item) {
    item.el.addEventListener('pointerdown', function (e) {
      if (!state.enabled || state.mode) return;
      e.preventDefault();
      select(item);
      var startPos = item.pos;
      var startPt = item.type === 'h' ? e.pageY : e.pageX;
      trackDrag(item.el, e, function (ev) {
        var cur = item.type === 'h' ? ev.pageY : ev.pageX;
        setGuidePos(item, startPos + (cur - startPt));
      });
    });
  }

  // Snap a point to nearby guides (used by measure mode).
  function snapToGuides(pt) {
    var out = { x: pt.x, y: pt.y };
    state.items.forEach(function (it) {
      if (it.type === 'v' && Math.abs(pt.x - it.pos) <= SNAP_RADIUS) out.x = it.pos;
      if (it.type === 'h' && Math.abs(pt.y - it.pos) <= SNAP_RADIUS) out.y = it.pos;
    });
    return out;
  }

  // ----------------------------------------------------------- measurements
  function createMeasureEls() {
    var lineEl = document.createElement('div');
    lineEl.className = 'mline';
    lineEl.innerHTML =
      '<div class="mcore"></div>' +
      '<div class="mtick start"></div>' +
      '<div class="mtick end"></div>';
    var labelEl = document.createElement('div');
    labelEl.className = 'mlabel';
    layer.appendChild(lineEl);
    layer.appendChild(labelEl);
    return { lineEl: lineEl, labelEl: labelEl };
  }

  function layoutMeasure(item) {
    var dx = item.b.x - item.a.x;
    var dy = item.b.y - item.a.y;
    var len = Math.hypot(dx, dy);
    var angle = Math.atan2(dy, dx) * 180 / Math.PI;

    item.lineEl.style.left = item.a.x + 'px';
    item.lineEl.style.top = (item.a.y - 4.5) + 'px';
    item.lineEl.style.width = len + 'px';
    item.lineEl.style.transform = 'rotate(' + angle + 'deg)';

    item.labelEl.style.left = (item.a.x + dx / 2) + 'px';
    item.labelEl.style.top = (item.a.y + dy / 2) + 'px';

    var text = Math.round(len) + ' px';
    if (Math.round(dx) !== 0 && Math.round(dy) !== 0) {
      text += '  (Δx ' + Math.abs(Math.round(dx)) + ', Δy ' + Math.abs(Math.round(dy)) + ')';
    }
    item.labelEl.textContent = text;
  }

  function addMeasure(a, b) {
    updateLayerSize();
    var els = createMeasureEls();
    var item = {
      id: state.nextId++, type: 'measure',
      a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y },
      lineEl: els.lineEl, labelEl: els.labelEl
    };
    state.items.push(item);
    layoutMeasure(item);

    function pick(e) {
      if (!state.enabled || state.mode) return;
      e.preventDefault();
      select(item);
    }
    item.lineEl.addEventListener('pointerdown', pick);
    item.labelEl.addEventListener('pointerdown', pick);
    select(item);
    return item;
  }

  // ------------------------------------------------------------- rectangles
  var HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  function addRect(r) {
    updateLayerSize();
    var el = document.createElement('div');
    el.className = 'rect';
    el.innerHTML = '<div class="rlabel"></div>' + HANDLES.map(function (h) {
      return '<div class="handle ' + h + '" data-h="' + h + '"></div>';
    }).join('');
    layer.appendChild(el);

    var item = {
      id: state.nextId++, type: 'rect',
      x: r.x, y: r.y, w: r.w, h: r.h, el: el
    };
    state.items.push(item);
    layoutRect(item);
    bindRectDrag(item);
    select(item);
    return item;
  }

  function layoutRect(item) {
    item.el.style.left = Math.round(item.x) + 'px';
    item.el.style.top = Math.round(item.y) + 'px';
    item.el.style.width = Math.round(item.w) + 'px';
    item.el.style.height = Math.round(item.h) + 'px';
    item.el.querySelector('.rlabel').textContent =
      Math.round(item.w) + ' × ' + Math.round(item.h);
  }

  function bindRectDrag(item) {
    item.el.addEventListener('pointerdown', function (e) {
      if (!state.enabled || state.mode) return;
      e.preventDefault();
      select(item);
      var target = eventTarget(e);
      var handle = target.classList && target.classList.contains('handle')
        ? target.dataset.h : null;
      var sx = e.pageX, sy = e.pageY;
      var start = { x: item.x, y: item.y, w: item.w, h: item.h };

      trackDrag(item.el, e, function (ev) {
        var dx = ev.pageX - sx;
        var dy = ev.pageY - sy;
        if (!handle) {
          item.x = start.x + dx;
          item.y = start.y + dy;
        } else {
          if (handle.indexOf('w') !== -1) {
            item.x = Math.min(start.x + dx, start.x + start.w - MIN_RECT);
            item.w = start.w - (item.x - start.x);
          }
          if (handle.indexOf('e') !== -1) {
            item.w = Math.max(start.w + dx, MIN_RECT);
          }
          if (handle.indexOf('n') !== -1) {
            item.y = Math.min(start.y + dy, start.y + start.h - MIN_RECT);
            item.h = start.h - (item.y - start.y);
          }
          if (handle.indexOf('s') !== -1) {
            item.h = Math.max(start.h + dy, MIN_RECT);
          }
        }
        layoutRect(item);
      });
    });
  }

  // -------------------------------------------------------- reference image
  // A single design comp displayed unscaled, fixed to the viewport, with
  // adjustable opacity (prefs panel). Persists across reloads via imageStore.
  function imageItem() {
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].type === 'img') return state.items[i];
    }
    return null;
  }

  function pickImage() {
    imgPickEl.value = '';
    imgPickEl.click();
  }

  imgPickEl.addEventListener('change', function () {
    var file = imgPickEl.files && imgPickEl.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var existing = imageItem();
      if (existing) deleteItem(existing);
      addImage(reader.result, 20, 20, true);
    };
    reader.onerror = function () { toast('Could not read image file'); };
    reader.readAsDataURL(file);
  });

  function addImage(src, x, y, save) {
    var el = document.createElement('div');
    el.className = 'img-item';
    var img = document.createElement('img');
    img.draggable = false;
    img.src = src;
    el.appendChild(img);
    layer.appendChild(el);

    var item = { id: state.nextId++, type: 'img', x: x, y: y, src: src, el: el };
    state.items.push(item);
    layoutImage(item);
    bindImageDrag(item);
    if (save) {
      select(item);
      saveImage(item);
      toast('Reference image added — drag to move, opacity in prefs (P)');
    }
    return item;
  }

  function layoutImage(item) {
    item.el.style.left = Math.round(item.x) + 'px';
    item.el.style.top = Math.round(item.y) + 'px';
  }

  function bindImageDrag(item) {
    item.el.addEventListener('pointerdown', function (e) {
      if (!state.enabled || state.mode) return;
      e.preventDefault();
      select(item);
      var sx = e.clientX, sy = e.clientY; // fixed positioning → viewport coords
      var start = { x: item.x, y: item.y };
      trackDrag(item.el, e, function (ev) {
        item.x = start.x + (ev.clientX - sx);
        item.y = start.y + (ev.clientY - sy);
        layoutImage(item);
      }, function () {
        saveImage(item);
      });
    });
  }

  function saveImage(item) {
    imageStore.save({ src: item.src, x: item.x, y: item.y }, function () {
      toast('Image too large to persist — it will not survive a reload');
    });
  }

  imageStore.load(function (data) {
    if (data && data.src && !imageItem()) {
      addImage(data.src, data.x || 20, data.y || 20, false);
    }
  });

  // ------------------------------------------------------------------ modes
  var capture = null;

  function enterMode(mode) {
    cancelMode();
    deselect();
    state.mode = mode;
    updateLayerSize();
    capture = document.createElement('div');
    capture.className = 'capture';
    layer.appendChild(capture);

    if (mode === 'measure') setupMeasureMode();
    if (mode === 'rect') setupRectMode();
  }

  function cancelMode() {
    if (!state.mode) return;
    state.mode = null;
    if (capture) { capture.remove(); capture = null; }
    if (preview) { destroyPreview(); }
    hideHint();
  }

  // -- measure mode
  var preview = null;

  function destroyPreview() {
    if (!preview) return;
    preview.lineEl.remove();
    preview.labelEl.remove();
    preview = null;
  }

  function setupMeasureMode() {
    showHint('Measure — click two points (clicks near a guide snap to it) · Esc cancels');
    var ptA = null;

    capture.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      var pt = snapToGuides({ x: e.pageX, y: e.pageY });
      if (!ptA) {
        ptA = pt;
        var els = createMeasureEls();
        preview = { a: ptA, b: pt, lineEl: els.lineEl, labelEl: els.labelEl };
        preview.lineEl.classList.add('preview');
        preview.labelEl.classList.add('preview');
        layoutMeasure(preview);
      } else {
        destroyPreview();
        cancelMode();
        addMeasure(ptA, pt);
      }
    });

    capture.addEventListener('pointermove', function (e) {
      if (!preview) return;
      preview.b = snapToGuides({ x: e.pageX, y: e.pageY });
      layoutMeasure(preview);
    });
  }

  // -- rectangle mode
  function setupRectMode() {
    showHint('Rectangle — click and drag to draw · Esc cancels');
    var anchor = null;
    var draft = null;

    capture.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      anchor = { x: e.pageX, y: e.pageY };
      draft = document.createElement('div');
      draft.className = 'rect draft';
      layer.appendChild(draft);
      try { capture.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    });

    capture.addEventListener('pointermove', function (e) {
      if (!anchor) return;
      var r = normRect(anchor, { x: e.pageX, y: e.pageY });
      draft.style.left = r.x + 'px';
      draft.style.top = r.y + 'px';
      draft.style.width = r.w + 'px';
      draft.style.height = r.h + 'px';
      showHint(Math.round(r.w) + ' × ' + Math.round(r.h));
    });

    capture.addEventListener('pointerup', function (e) {
      if (!anchor) return;
      var r = normRect(anchor, { x: e.pageX, y: e.pageY });
      draft.remove();
      draft = null;
      anchor = null;
      cancelMode();
      if (r.w >= 4 || r.h >= 4) {
        addRect({ x: r.x, y: r.y, w: Math.max(r.w, MIN_RECT), h: Math.max(r.h, MIN_RECT) });
      }
    });
  }

  function normRect(a, b) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y)
    };
  }

  // ------------------------------------------------------------ nudge / keys
  function nudge(item, dx, dy) {
    if (item.type === 'h') {
      setGuidePos(item, item.pos + dy);
    } else if (item.type === 'v') {
      setGuidePos(item, item.pos + dx);
    } else if (item.type === 'rect') {
      item.x += dx; item.y += dy;
      layoutRect(item);
    } else if (item.type === 'measure') {
      item.a.x += dx; item.a.y += dy;
      item.b.x += dx; item.b.y += dy;
      layoutMeasure(item);
    } else if (item.type === 'img') {
      item.x += dx; item.y += dy;
      layoutImage(item);
      saveImage(item);
    }
  }

  function onKeyDown(e) {
    // Hotkey recorder swallows the next keypress.
    if (state.recording) {
      e.preventDefault();
      e.stopPropagation();
      finishRecording(e);
      return;
    }

    // The master toggle works even while the tool is disabled.
    if (matchesToggle(e)) {
      e.preventDefault();
      api.toggle();
      return;
    }
    if (!state.enabled) return;
    if (isEditable(eventTarget(e))) return;

    var k = e.key.toLowerCase();
    var plain = !e.ctrlKey && !e.metaKey && !e.altKey;

    if (e.key === 'Escape') {
      if (!prefsEl.hidden) { togglePrefs(false); return; }
      if (state.mode) { cancelMode(); return; }
      deselect();
      return;
    }

    if (k === 'delete' || k === 'backspace') {
      if (state.selected) {
        e.preventDefault();
        deleteItem(state.selected);
      }
      return;
    }

    if (k.indexOf('arrow') === 0) {
      if (!state.selected) return;
      e.preventDefault();
      var step = e.shiftKey ? 10 : 1;
      var dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
      var dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
      nudge(state.selected, dx, dy);
      return;
    }

    if (!plain) return;

    if (k === 'h' && !e.shiftKey) {
      addGuide('h', mousePoint().y);
    } else if (k === 'v' && !e.shiftKey) {
      addGuide('v', mousePoint().x);
    } else if (k === 'm' && !e.shiftKey) {
      enterMode('measure');
    } else if (k === 'r' && !e.shiftKey) {
      enterMode('rect');
    } else if (k === 'i' && !e.shiftKey) {
      pickImage();
    } else if (k === 'd' && !e.shiftKey) {
      prefs.showRectLabels = !prefs.showRectLabels;
      storage.save(prefs);
      applyPrefs();
      toast('Rectangle labels ' + (prefs.showRectLabels ? 'on' : 'off'));
    } else if (k === 'p' && !e.shiftKey) {
      togglePrefs();
    } else if (k === 'x' && e.shiftKey) {
      clearAll();
    }
  }

  // ------------------------------------------------------------ preferences
  function buildPrefsPanel() {
    prefsEl.innerHTML =
      '<div class="prefs-title">WebDesignHelpers</div>' +
      '<label class="row"><span>Line color</span>' +
        '<input type="color" data-pref="lineColor"></label>' +
      '<label class="row"><span>Rectangle color</span>' +
        '<input type="color" data-pref="rectColor"></label>' +
      '<label class="row"><span>Rect opacity</span>' +
        '<input type="range" min="0.05" max="0.8" step="0.05" data-pref="rectOpacity">' +
        '<em class="val" data-val="rectOpacity"></em></label>' +
      '<label class="row"><span>Image opacity</span>' +
        '<input type="range" min="0.05" max="1" step="0.05" data-pref="imgOpacity">' +
        '<em class="val" data-val="imgOpacity"></em></label>' +
      '<div class="row"><span>Reference image</span>' +
        '<button class="mini" type="button" data-act="img">Choose…</button></div>' +
      '<label class="row"><span>Text size</span>' +
        '<input type="range" min="9" max="20" step="1" data-pref="textSize">' +
        '<em class="val" data-val="textSize"></em></label>' +
      '<label class="row"><span>Rect labels</span>' +
        '<input type="checkbox" data-pref="showRectLabels"></label>' +
      '<div class="row"><span>Disable hotkey</span>' +
        '<button class="hotkey-btn" type="button"></button></div>' +
      '<div class="row btns">' +
        '<button class="mini" type="button" data-act="clear">Clear all</button>' +
        '<button class="mini" type="button" data-act="reset">Reset</button></div>' +
      '<div class="keys">' +
        'H/V guide · M measure · R rect · I image · D labels · P prefs<br>' +
        'Del remove · Shift+X clear · arrows nudge · Esc cancel' +
      '</div>';

    prefsEl.querySelectorAll('[data-pref]').forEach(function (input) {
      input.addEventListener('input', function () {
        var key = input.dataset.pref;
        if (input.type === 'checkbox') prefs[key] = input.checked;
        else if (input.type === 'range') prefs[key] = parseFloat(input.value);
        else prefs[key] = input.value;
        storage.save(prefs);
        applyPrefs();
      });
    });

    var hotkeyBtn = prefsEl.querySelector('.hotkey-btn');
    hotkeyBtn.addEventListener('click', function () {
      state.recording = true;
      hotkeyBtn.textContent = 'Press keys…';
      hotkeyBtn.classList.add('recording');
    });

    prefsEl.querySelector('[data-act="img"]').addEventListener('click', pickImage);
    prefsEl.querySelector('[data-act="clear"]').addEventListener('click', clearAll);
    prefsEl.querySelector('[data-act="reset"]').addEventListener('click', function () {
      prefs = clonePrefs(DEFAULTS);
      storage.save(prefs);
      applyPrefs();
      toast('Preferences reset');
    });

    badgeEl.addEventListener('click', function () { togglePrefs(); });
  }

  function finishRecording(e) {
    var hotkeyBtn = prefsEl.querySelector('.hotkey-btn');
    state.recording = false;
    hotkeyBtn.classList.remove('recording');

    // Ignore bare modifier presses while recording.
    if (['control', 'shift', 'alt', 'meta'].indexOf(e.key.toLowerCase()) !== -1) {
      state.recording = true;
      hotkeyBtn.classList.add('recording');
      return;
    }
    if (e.key === 'Escape') {
      applyPrefs();
      return;
    }
    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
      toast('Include Ctrl, Alt or ⌘ in the hotkey');
      applyPrefs();
      return;
    }
    prefs.toggleKey = {
      key: e.key.toLowerCase(),
      ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey
    };
    storage.save(prefs);
    applyPrefs();
    toast('Disable hotkey: ' + formatCombo(prefs.toggleKey));
  }

  function togglePrefs(force) {
    var show = force !== undefined ? force : prefsEl.hidden;
    prefsEl.hidden = !show;
  }

  function applyPrefs() {
    host.style.setProperty('--wdh-line', prefs.lineColor);
    host.style.setProperty('--wdh-rect', prefs.rectColor);
    host.style.setProperty('--wdh-rect-bg', hexToRgba(prefs.rectColor, prefs.rectOpacity));
    host.style.setProperty('--wdh-img-opacity', prefs.imgOpacity);
    host.style.setProperty('--wdh-text', prefs.textSize + 'px');
    layer.classList.toggle('labels-off', !prefs.showRectLabels);

    prefsEl.querySelectorAll('[data-pref]').forEach(function (input) {
      var key = input.dataset.pref;
      if (input.type === 'checkbox') input.checked = !!prefs[key];
      else input.value = prefs[key];
    });
    prefsEl.querySelectorAll('[data-val]').forEach(function (em) {
      em.textContent = prefs[em.dataset.val];
    });
    var hotkeyBtn = prefsEl.querySelector('.hotkey-btn');
    if (hotkeyBtn) hotkeyBtn.textContent = formatCombo(prefs.toggleKey);
  }

  // -------------------------------------------------------------- listeners
  window.addEventListener('mousemove', function (e) {
    state.lastMouse = { x: e.pageX, y: e.pageY };
  }, { passive: true });

  window.addEventListener('keydown', onKeyDown, true);

  // Clicking the page (anything that isn't ours) deselects.
  window.addEventListener('pointerdown', function (e) {
    if (!state.enabled || state.mode) return;
    if (e.target === host) return;
    deselect();
  }, true);

  window.addEventListener('resize', function () {
    updateLayerSize();
    state.items.forEach(function (it) {
      if (it.type === 'h' || it.type === 'v') updateGuideTag(it);
    });
  });

  // Keep guide position tags readable while scrolling.
  window.addEventListener('scroll', function () {
    if (state.selected && (state.selected.type === 'h' || state.selected.type === 'v')) {
      updateGuideTag(state.selected);
    }
  }, { passive: true });

  // --------------------------------------------------------------- styles
  function css() {
    return [
      ':host{all:initial}',
      '*,*::before,*::after{box-sizing:border-box}',
      '.layer{position:absolute;left:0;top:0;pointer-events:none;' +
        'font:var(--wdh-text) -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
      ':host(.off) .layer,:host(.off) .badge,:host(.off) .prefs,:host(.off) .hint{display:none}',

      // guides
      '.guide{position:absolute;pointer-events:auto}',
      '.guide.h{left:0;width:100%;height:9px;cursor:row-resize}',
      '.guide.v{top:0;height:100%;width:9px;cursor:col-resize}',
      '.guide .line{position:absolute;background:var(--wdh-line)}',
      '.guide.h .line{top:4px;left:0;right:0;height:1px}',
      '.guide.v .line{left:4px;top:0;bottom:0;width:1px}',
      '.guide.selected .line{box-shadow:0 0 0 .5px var(--wdh-line),0 0 6px var(--wdh-line)}',
      '.guide .tag{display:none;position:absolute;padding:2px 6px;border-radius:4px;' +
        'background:#10131a;color:#fff;font-size:var(--wdh-text);line-height:1.3;' +
        'white-space:nowrap;top:8px;left:8px}',
      '.guide:hover .tag,.guide.selected .tag{display:block}',

      // measurements
      '.mline{position:absolute;height:9px;transform-origin:0 50%;pointer-events:auto;cursor:pointer}',
      '.mline .mcore{position:absolute;top:4px;left:0;width:100%;height:1px;background:var(--wdh-line)}',
      '.mline .mtick{position:absolute;top:-1px;width:1px;height:11px;background:var(--wdh-line)}',
      '.mline .mtick.start{left:0}',
      '.mline .mtick.end{right:0}',
      '.mline.selected .mcore,.mline.selected .mtick{box-shadow:0 0 0 .5px var(--wdh-line),0 0 6px var(--wdh-line)}',
      '.mline.preview,.mlabel.preview{pointer-events:none;opacity:.85}',
      '.mlabel{position:absolute;transform:translate(-50%,-160%);padding:2px 7px;' +
        'border-radius:4px;background:#10131a;color:#fff;font-size:var(--wdh-text);' +
        'line-height:1.35;white-space:nowrap;pointer-events:auto;cursor:pointer}',
      '.mlabel.selected{outline:1px solid var(--wdh-line)}',

      // rectangles
      '.rect{position:absolute;pointer-events:auto;cursor:move;' +
        'background:var(--wdh-rect-bg);border:1px solid var(--wdh-rect)}',
      '.rect.draft{pointer-events:none}',
      '.rect.selected{box-shadow:0 0 0 1px var(--wdh-rect),0 0 8px var(--wdh-rect-bg)}',
      '.rlabel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
        'padding:2px 7px;border-radius:4px;background:#10131a;color:#fff;' +
        'font-size:var(--wdh-text);line-height:1.3;white-space:nowrap;pointer-events:none}',
      '.layer.labels-off .rlabel{display:none}',
      '.handle{display:none;position:absolute;width:8px;height:8px;background:#fff;' +
        'border:1px solid var(--wdh-rect);border-radius:1px}',
      '.rect.selected .handle{display:block}',
      '.handle.nw{left:-4px;top:-4px;cursor:nwse-resize}',
      '.handle.n{left:calc(50% - 4px);top:-4px;cursor:ns-resize}',
      '.handle.ne{right:-4px;top:-4px;cursor:nesw-resize}',
      '.handle.e{right:-4px;top:calc(50% - 4px);cursor:ew-resize}',
      '.handle.se{right:-4px;bottom:-4px;cursor:nwse-resize}',
      '.handle.s{left:calc(50% - 4px);bottom:-4px;cursor:ns-resize}',
      '.handle.sw{left:-4px;bottom:-4px;cursor:nesw-resize}',
      '.handle.w{left:-4px;top:calc(50% - 4px);cursor:ew-resize}',

      // reference image overlay
      '.img-item{position:fixed;pointer-events:auto;cursor:move;' +
        'opacity:var(--wdh-img-opacity)}',
      '.img-item img{display:block;max-width:none;max-height:none}', // unscaled
      '.img-item.selected{outline:2px solid var(--wdh-line)}',

      // mode capture layer
      '.capture{position:absolute;left:0;top:0;width:100%;height:100%;' +
        'pointer-events:auto;cursor:crosshair}',

      // chrome: hint, toast, badge, prefs
      '.hint,.toast{position:fixed;left:50%;transform:translateX(-50%);' +
        'padding:5px 12px;border-radius:6px;background:#10131a;color:#fff;' +
        'font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
        'box-shadow:0 2px 10px rgba(0,0,0,.35);white-space:nowrap}',
      '.hint{top:10px}',
      '.toast{top:42px}',
      '.badge{position:fixed;right:12px;bottom:12px;pointer-events:auto;cursor:pointer;' +
        'display:flex;align-items:center;gap:5px;padding:5px 10px;border:0;border-radius:14px;' +
        'background:#10131a;color:#fff;font:600 11px -apple-system,BlinkMacSystemFont,' +
        '"Segoe UI",sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.35)}',
      '.badge-dot{width:7px;height:7px;border-radius:50%;background:var(--wdh-line)}',
      '.prefs{position:fixed;right:12px;bottom:48px;width:248px;pointer-events:auto;' +
        'padding:12px;border-radius:10px;background:#181c26;color:#e8eaf0;' +
        'font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
        'box-shadow:0 6px 24px rgba(0,0,0,.45)}',
      '.prefs-title{font-weight:700;margin-bottom:9px;font-size:12px;letter-spacing:.3px}',
      '.prefs .row{display:flex;align-items:center;gap:8px;margin:7px 0}',
      '.prefs .row span{flex:1}',
      '.prefs .row .val{font-style:normal;opacity:.7;min-width:24px;text-align:right}',
      '.prefs input[type=color]{width:34px;height:22px;padding:0;border:0;background:none;cursor:pointer}',
      '.prefs input[type=range]{width:90px;accent-color:var(--wdh-line)}',
      '.prefs input[type=checkbox]{accent-color:var(--wdh-line)}',
      '.hotkey-btn,.mini{padding:3px 9px;border:1px solid #3a4154;border-radius:5px;' +
        'background:#232938;color:#e8eaf0;font:inherit;cursor:pointer}',
      '.hotkey-btn:hover,.mini:hover{background:#2c3346}',
      '.hotkey-btn.recording{border-color:var(--wdh-line);color:var(--wdh-line)}',
      '.prefs .btns{justify-content:flex-end}',
      '.keys{margin-top:10px;padding-top:9px;border-top:1px solid #2c3346;' +
        'opacity:.65;line-height:1.6;font-size:11px}'
    ].join('\n');
  }

  // ------------------------------------------------------------------- API
  var api = {
    version: '1.0.0',
    enable: function () {
      state.enabled = true;
      host.classList.remove('off');
      updateLayerSize();
      toast('WebDesignHelpers ON · ' + formatCombo(prefs.toggleKey) + ' to disable');
    },
    disable: function () {
      cancelMode();
      deselect();
      state.enabled = false;
      host.classList.add('off');
      toast('WebDesignHelpers OFF · ' + formatCombo(prefs.toggleKey) + ' to enable');
    },
    toggle: function () {
      if (state.enabled) api.disable(); else api.enable();
    },
    clear: clearAll
  };

  window.__WDH__ = api;
  api.enable();
})();
