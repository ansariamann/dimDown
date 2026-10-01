// ─────────────────────────────────────────────────────────
//  DimDown – content.js  (injected into every page)
// ─────────────────────────────────────────────────────────

(function () {
  'use strict';

  // Guard: prevent double-execution if script is injected twice
  if (window.__dimdownLoaded) return;
  window.__dimdownLoaded = true;

  const DIM_ID  = '__dimdown_dim__';
  const WARM_ID = '__dimdown_warm__';

  // ── Create / retrieve overlay element ─────────────────
  function getOrCreate(id) {
    let el = document.getElementById(id);
    if (el) return el;

    el = document.createElement('div');
    el.id = id;
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {
      position:      'fixed',
      inset:         '0',
      width:         '100vw',
      height:        '100vh',
      pointerEvents: 'none',
      zIndex:        '2147483647',
      opacity:       '0',
      transition:    'opacity 0.35s ease',
    });

    // Append to documentElement so it survives body replacements (SPAs)
    document.documentElement.appendChild(el);
    return el;
  }

  // ── Apply / remove overlays ───────────────────────────
  function applyDim({ enabled, brightness, warmEnabled, warmLevel }) {
    const dim  = getOrCreate(DIM_ID);
    const warm = getOrCreate(WARM_ID);

    if (!enabled) {
      dim.style.opacity  = '0';
      warm.style.opacity = '0';
      return;
    }

    dim.style.backgroundColor = '#000';
    dim.style.opacity = String(brightness / 100);

    if (warmEnabled && warmLevel > 0) {
      warm.style.backgroundColor = '#ff8c00';
      warm.style.opacity = String((warmLevel / 80) * 0.38);
    } else {
      warm.style.opacity = '0';
    }
  }

  // ── Load saved state on page init ─────────────────────
  const STORAGE_DEFAULTS = {
    enabled: false, brightness: 50, warmEnabled: false, warmLevel: 30,
  };

  chrome.storage.sync.get(STORAGE_DEFAULTS, data => {
    applyDim(data);
  });

  // ── Live updates from popup / background ──────────────
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'DIMDOWN_UPDATE') {
      applyDim(msg);
    } else if (msg.type === 'DIMDOWN_RESET') {
      applyDim({ enabled: false });
    }
  });

  // ── Re-attach overlays after SPA body replacement ─────
  // Watch documentElement (not body) so we catch body being swapped out
  const observer = new MutationObserver(() => {
    // If our overlays were ejected, re-create them with current state
    if (!document.getElementById(DIM_ID) || !document.getElementById(WARM_ID)) {
      chrome.storage.sync.get(STORAGE_DEFAULTS, applyDim);
    }
  });

  observer.observe(document.documentElement, { childList: true });

})();
