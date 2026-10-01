// ─────────────────────────────────────────────────────────
//  DimDown – background.js  (service worker)
// ─────────────────────────────────────────────────────────

'use strict';

const DEFAULTS = {
  enabled:         false,
  brightness:      50,
  warmEnabled:     false,
  warmLevel:       30,
  scheduleEnabled: false,
  scheduleOn:      '20:00',
  scheduleOff:     '07:00',
};

const ALARM_NAME = 'dimdown_schedule';

// ── Create alarm only once (guard against duplicate creation) ──
// Service workers can restart multiple times; chrome.alarms.create
// with the same name is idempotent only when 'when' changes,
// so we check existence first.
chrome.alarms.get(ALARM_NAME, existing => {
  if (!existing) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  }
});

// ── Re-apply overlay when a tab finishes loading ────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || /^(chrome|chrome-extension|about|devtools):/.test(tab.url)) return;

  chrome.storage.sync.get(DEFAULTS, data => {
    if (!data.enabled) return;
    chrome.tabs.sendMessage(tabId, {
      type:        'DIMDOWN_UPDATE',
      enabled:     data.enabled,
      brightness:  data.brightness,
      warmEnabled: data.warmEnabled,
      warmLevel:   data.warmLevel,
    }).catch(() => {
      // Content script not loaded yet — it will read storage on init, safe to ignore
    });
  });
});

// ── Schedule alarm handler ───────────────────────────────
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== ALARM_NAME) return;

  chrome.storage.sync.get(DEFAULTS, state => {
    if (!state.scheduleEnabled) return;

    const now  = new Date();
    const hhmm = pad(now.getHours()) + ':' + pad(now.getMinutes());
    const shouldBeOn = isInRange(hhmm, state.scheduleOn, state.scheduleOff);

    if (shouldBeOn === state.enabled) return; // no change needed

    chrome.storage.sync.set({ enabled: shouldBeOn }, () => {
      broadcastAll({
        type:        'DIMDOWN_UPDATE',
        enabled:     shouldBeOn,
        brightness:  state.brightness,
        warmEnabled: state.warmEnabled,
        warmLevel:   state.warmLevel,
      });
    });
  });
});

// ── Helpers ──────────────────────────────────────────────
function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Returns true if `now` falls within [onTime, offTime).
 * Handles overnight ranges (e.g. 22:00 → 06:00).
 */
function isInRange(now, onTime, offTime) {
  if (onTime <= offTime) {
    return now >= onTime && now < offTime;
  }
  // Overnight
  return now >= onTime || now < offTime;
}

function broadcastAll(msg) {
  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      if (/^(chrome|chrome-extension|about|devtools):/.test(tab.url)) continue;
      chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
  });
}
