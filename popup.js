// ─────────────────────────────────────────────────────────
//  DimDown – popup.js  (clean rewrite)
// ─────────────────────────────────────────────────────────

'use strict';

const DEFAULTS = {
  enabled:      false,
  brightness:   50,
  warmEnabled:  false,
  warmLevel:    30,
  // schedule lives in background.js / storage only, not driven from popup
  scheduleEnabled: false,
  scheduleOn:   '20:00',
  scheduleOff:  '07:00',
};

// ── DOM ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const masterToggle   = $('masterToggle');
const brightnessSldr = $('brightnessSlider');
const dialNumber     = $('dialNumber');
const warmToggle     = $('warmToggle');
const warmSlider     = $('warmSlider');
const warmSliderWrap = $('warmSliderWrap');
const statusPill     = $('statusPill');
const statusLabel    = $('statusLabel');
const mainControls   = $('mainControls');
const footerHint     = $('footerHint');
const resetBtn       = $('resetBtn');
const presetBtns     = document.querySelectorAll('.preset');

// ── State ───────────────────────────────────────────────
let state = { ...DEFAULTS };

// ── Debounce: prevent flooding tabs on fast slider drag ──
let _applyTimer = null;
function debouncedApply(delay = 60) {
  clearTimeout(_applyTimer);
  _applyTimer = setTimeout(() => broadcast(), delay);
}

// ── Init ────────────────────────────────────────────────
chrome.storage.sync.get(DEFAULTS, stored => {
  state = { ...DEFAULTS, ...stored };
  render();
});

// ── Event listeners ─────────────────────────────────────
masterToggle.addEventListener('change', () => {
  state.enabled = masterToggle.checked;
  persistAndBroadcast();
  renderStatus();
  renderControls();
});

brightnessSldr.addEventListener('input', () => {
  state.brightness = parseInt(brightnessSldr.value, 10);
  renderDial();
  renderSliderFill(brightnessSldr, state.brightness, 95, false);
  markActivePreset();
  footerHint.textContent = `${state.brightness}% dark`;
  debouncedApply();
});

brightnessSldr.addEventListener('change', () => {
  // Fires on mouse-up: persist final value
  persist();
});

warmToggle.addEventListener('change', () => {
  state.warmEnabled = warmToggle.checked;
  warmSliderWrap.classList.toggle('open', state.warmEnabled);
  persistAndBroadcast();
});

warmSlider.addEventListener('input', () => {
  state.warmLevel = parseInt(warmSlider.value, 10);
  renderSliderFill(warmSlider, state.warmLevel, 80, true);
  debouncedApply();
});

warmSlider.addEventListener('change', () => {
  persist();
});

presetBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    state.brightness = parseInt(btn.dataset.value, 10);
    brightnessSldr.value = state.brightness;
    renderDial();
    renderSliderFill(brightnessSldr, state.brightness, 95, false);
    markActivePreset();
    footerHint.textContent = `${state.brightness}% dark`;
    persistAndBroadcast();
  });
});

resetBtn.addEventListener('click', () => {
  state = { ...DEFAULTS };
  render();
  persist();
  sendToAllTabs({ type: 'DIMDOWN_RESET' });
});

// ── Render helpers ───────────────────────────────────────
function render() {
  masterToggle.checked  = state.enabled;
  brightnessSldr.value  = state.brightness;
  warmToggle.checked    = state.warmEnabled;
  warmSlider.value      = state.warmLevel;

  warmSliderWrap.classList.toggle('open', state.warmEnabled);
  renderDial();
  renderSliderFill(brightnessSldr, state.brightness, 95, false);
  renderSliderFill(warmSlider, state.warmLevel, 80, true);
  renderStatus();
  renderControls();
  markActivePreset();
}

function renderStatus() {
  const on = state.enabled;
  statusPill.classList.toggle('on', on);
  statusLabel.textContent = on ? 'On' : 'Off';
}

function renderControls() {
  const on = state.enabled;
  mainControls.classList.toggle('off', !on);
  dialNumber.classList.toggle('dim', !on);
  footerHint.textContent = on ? `${state.brightness}% dark` : 'All tabs';
}

function renderDial() {
  dialNumber.textContent = state.brightness;
}

/**
 * Paints a left→right gradient fill on a range input.
 * @param {HTMLInputElement} el
 * @param {number} val  current value
 * @param {number} max  input max
 * @param {boolean} warm  use amber palette instead of violet
 */
function renderSliderFill(el, val, max, warm) {
  const pct = (val / max) * 100;
  const [c1, c2] = warm
    ? ['#f59e0b', '#f97316']
    : ['#7c6cf8', '#a78bfa'];
  el.style.background =
    `linear-gradient(to right, ${c1}, ${c2} ${pct}%, #111118 ${pct}%)`;
}

function markActivePreset() {
  presetBtns.forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.value, 10) === state.brightness);
  });
}

// ── Storage ──────────────────────────────────────────────
function persist() {
  chrome.storage.sync.set(state);
}

function persistAndBroadcast() {
  persist();
  broadcast();
}

function broadcast() {
  sendToAllTabs({
    type:        'DIMDOWN_UPDATE',
    enabled:     state.enabled,
    brightness:  state.brightness,
    warmEnabled: state.warmEnabled,
    warmLevel:   state.warmLevel,
  });
}

// ── Tab messaging ────────────────────────────────────────
// Tracks tabs currently being injected to avoid duplicate injection
const _injecting = new Set();

function sendToAllTabs(msg) {
  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      if (/^(chrome|chrome-extension|about|devtools):/.test(tab.url)) continue;
      dispatchToTab(tab.id, msg);
    }
  });
}

function dispatchToTab(tabId, msg) {
  chrome.tabs.sendMessage(tabId, msg).catch(() => {
    // Content script not present — inject once, then re-send
    if (_injecting.has(tabId)) return;
    _injecting.add(tabId);

    chrome.scripting.executeScript({
      target: { tabId },
      files:  ['content.js'],
    }).then(() => {
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, msg).catch(() => {});
        _injecting.delete(tabId);
      }, 120);
    }).catch(() => {
      _injecting.delete(tabId);
    });
  });
}
