/* Privacy for WhatsApp Web (Auto Blur WA)                           */
/* Original Copyright (c) 2024 Lukas Lenhardt - lukaslen.com         */
/* Fork & Maintenance Copyright (c) 2026 M Aryo Muzakki - muzakki.id */
/* Released under the MIT license, see LICENSE file for details      */

// Remove this upon Chrome supporting the browser namespace
if (typeof browser == "undefined") {
  // Redefine browser namespace for Chrome for interoperability with Firefox
  globalThis.browser = chrome;
}

const settingsIdentifier = "settings";
const defaultSettings = {
  settings: {
    on: true,
    currentPopupMessage: "",
    styles: {
      mediaGallery: true,
      mediaPreview: true,
      messages: true,
      messagesPreview: true,
      name: false,
      noDelay: false,
      profilePic: false,
      textInput: true,
      unblurActive: false
    },
    varStyles: {
      mdgBlur: "20px",
      mdpBlur: "20px",
      msBlur: "8px",
      mspBlur: "8px",
      nmBlur: "5px",
      ppSmBlur: "3px",
      ppBlur: "8px",
      ppLgBlur: "12px",
      wiBlur: "14px",
    },
    blurOnIdle: {
      isEnabled: false,
      idleTimeout: 15,
    },
    schedule: {
      isEnabled: false,
      startTime: "09:00",
      endTime: "17:00",
      days: [0, 1, 2, 3, 4, 5, 6]
    }
  }
};
const requiredPermissions = { 
  origins: ["https://web.whatsapp.com/*"],
  permissions: ["storage"]
}

function mergeDefaultSettings(currentSettings) {
  if (!currentSettings || typeof currentSettings !== "object") {
    return defaultSettings.settings;
  }
  const merged = { ...defaultSettings.settings, ...currentSettings };
  merged.styles = { ...defaultSettings.settings.styles, ...(currentSettings.styles ?? {}) };
  merged.varStyles = { ...defaultSettings.settings.varStyles, ...(currentSettings.varStyles ?? {}) };
  merged.blurOnIdle = { ...defaultSettings.settings.blurOnIdle, ...(currentSettings.blurOnIdle ?? {}) };
  merged.schedule = { ...defaultSettings.settings.schedule, ...(currentSettings.schedule ?? {}) };
  return merged;
}

function isScheduleActive(schedule, date = new Date()) {
  if (!schedule || !schedule.isEnabled) return false;

  const days = Array.isArray(schedule.days) ? schedule.days : [0, 1, 2, 3, 4, 5, 6];
  if (days.length === 0) return false;

  const [startH, startM] = (schedule.startTime ?? "09:00").split(":").map(Number);
  const [endH, endM] = (schedule.endTime ?? "17:00").split(":").map(Number);

  const isSameDay = startH < endH || (startH === endH && startM < endM);

  // Check today's active window
  const todayDay = date.getDay();
  if (days.includes(todayDay)) {
    const todayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startH, startM, 0, 0);
    const todayEnd = isSameDay
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), endH, endM, 0, 0)
      : new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, endH, endM, 0, 0);

    if (date >= todayStart && date < todayEnd) {
      return true;
    }
  }

  // If overnight schedule, check if we are in the tail of yesterday's active window
  if (!isSameDay) {
    const yesterday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, 0, 0, 0, 0);
    const yesterdayDay = yesterday.getDay();
    if (days.includes(yesterdayDay)) {
      const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), startH, startM, 0, 0);
      const yesterdayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endH, endM, 0, 0);

      if (date >= yesterdayStart && date < yesterdayEnd) {
        return true;
      }
    }
  }

  return false;
}

function checkSchedule() {
  return browser.storage.sync.get([settingsIdentifier]).then((result) => {
    if (!result.hasOwnProperty(settingsIdentifier)) return null;
    const schedule = result.settings.schedule;
    if (!schedule || !schedule.isEnabled) return result.settings.on;

    const shouldBeOn = isScheduleActive(schedule);
    if (result.settings.on !== shouldBeOn) {
      result.settings.on = shouldBeOn;
      return browser.storage.sync.set(result).then(() => shouldBeOn);
    }
    return shouldBeOn;
  });
}

function updateAlarms() {
  browser.storage.sync.get([settingsIdentifier]).then((result) => {
    if (!result.hasOwnProperty(settingsIdentifier)) return;
    const schedule = result.settings.schedule;
    
    browser.alarms.clearAll().then(() => {
      if (!schedule || !schedule.isEnabled) return;

      const getNextTimeMs = (timeStr) => {
        const [hours, minutes] = (timeStr ?? "09:00").split(":").map(Number);
        const now = new Date();
        const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
        if (target <= now) {
          target.setDate(target.getDate() + 1);
        }
        return target.getTime();
      };

      browser.alarms.create("scheduleStart", {
        when: getNextTimeMs(schedule.startTime ?? "09:00"),
        periodInMinutes: 1440
      });

      browser.alarms.create("scheduleEnd", {
        when: getNextTimeMs(schedule.endTime ?? "17:00"),
        periodInMinutes: 1440
      });

      browser.alarms.create("scheduleHeartbeat", {
        periodInMinutes: 5
      });
    });
  });
}

// On install
browser.runtime.onInstalled.addListener(() => {
  // Request host permissions
  browser.permissions.contains(requiredPermissions).then((hasPermissions) => {
    if (hasPermissions) return;
    browser.permissions.request(requiredPermissions);
  });

  // Set default settings or merge with existing ones upon install/upgrade
  browser.storage.sync.get([settingsIdentifier]).then((result) => {
    const currentSettings = result.hasOwnProperty(settingsIdentifier) ? result.settings : null;
    const merged = mergeDefaultSettings(currentSettings);
    browser.storage.sync.set({ settings: merged }).then(() => {
      updateAlarms();
      checkSchedule();
    });
  });
});

// Handle toggle command
browser.commands.onCommand.addListener((command) => {
  if (command != "toggle") return;

  browser.storage.sync.get([settingsIdentifier]).then((result) => {
    if (!result.hasOwnProperty(settingsIdentifier)) {
      browser.runtime.reload();
      return;
    }

    result.settings.on = !result.settings.on;
    browser.storage.sync.set(result);
  });
});

// Update icon on setting change and handle alarm changes
browser.storage.onChanged.addListener((changes, area) => {
  if (area != "sync" || changes.settings == null) return;

  browser.action.setIcon({
    path: "images/status" + (changes.settings.newValue.on == true ? "On" : "Off") + ".png"
  });

  const oldSettings = changes.settings.oldValue;
  const newSettings = changes.settings.newValue;

  const oldDays = oldSettings?.schedule?.days ? JSON.stringify(oldSettings.schedule.days) : "";
  const newDays = newSettings?.schedule?.days ? JSON.stringify(newSettings.schedule.days) : "";

  const scheduleChanged = !oldSettings || !oldSettings.schedule ||
    oldSettings.schedule.isEnabled !== newSettings.schedule.isEnabled ||
    oldSettings.schedule.startTime !== newSettings.schedule.startTime ||
    oldSettings.schedule.endTime !== newSettings.schedule.endTime ||
    oldDays !== newDays;

  if (scheduleChanged) {
    updateAlarms();
    checkSchedule();
  }
});

// Handle alarm triggers
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "scheduleStart" || alarm.name === "scheduleEnd" || alarm.name === "scheduleHeartbeat") {
    checkSchedule();
  }
});

// Handle messages from contentScript or popup to check schedule
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.action === "checkSchedule") {
    checkSchedule().then((isOn) => {
      sendResponse({ on: isOn });
    });
    return true;
  }
});

// Initialize alarms and run check on load
updateAlarms();
checkSchedule();
