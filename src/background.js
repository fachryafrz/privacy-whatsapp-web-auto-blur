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
      lastScheduledTrigger: 0
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
  merged.styles = { ...defaultSettings.settings.styles, ...(currentSettings.styles || {}) };
  merged.varStyles = { ...defaultSettings.settings.varStyles, ...(currentSettings.varStyles || {}) };
  merged.blurOnIdle = { ...defaultSettings.settings.blurOnIdle, ...(currentSettings.blurOnIdle || {}) };
  merged.schedule = { ...defaultSettings.settings.schedule, ...(currentSettings.schedule || {}) };
  return merged;
}

function getMostRecentTransition(startTime, endTime) {
  const now = new Date();
  
  const getOccurrence = (timeStr, offsetDays = 0) => {
    const [h, m] = timeStr.split(":").map(Number);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, h, m, 0, 0);
  };

  const startToday = getOccurrence(startTime, 0);
  const startYesterday = getOccurrence(startTime, -1);
  const lastStart = startToday <= now ? startToday : startYesterday;

  const endToday = getOccurrence(endTime, 0);
  const endYesterday = getOccurrence(endTime, -1);
  const lastEnd = endToday <= now ? endToday : endYesterday;

  if (lastStart > lastEnd) {
    return { time: lastStart.getTime(), state: true };
  } else {
    return { time: lastEnd.getTime(), state: false };
  }
}

function checkSchedule() {
  browser.storage.sync.get([settingsIdentifier]).then((result) => {
    if (!result.hasOwnProperty(settingsIdentifier)) return;
    const schedule = result.settings.schedule;
    if (!schedule || !schedule.isEnabled) return;

    const mostRecent = getMostRecentTransition(schedule.startTime, schedule.endTime);
    
    // If the transition happened after the last one we processed
    if (mostRecent.time > (schedule.lastScheduledTrigger || 0)) {
      result.settings.on = mostRecent.state;
      result.settings.schedule.lastScheduledTrigger = mostRecent.time;
      browser.storage.sync.set(result);
    }
  });
}

function updateAlarms() {
  browser.storage.sync.get([settingsIdentifier]).then((result) => {
    if (!result.hasOwnProperty(settingsIdentifier)) return;
    const schedule = result.settings.schedule;
    
    browser.alarms.clearAll().then(() => {
      if (!schedule || !schedule.isEnabled) return;

      const getNextTimeMs = (timeStr) => {
        const [hours, minutes] = timeStr.split(":").map(Number);
        const now = new Date();
        const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
        if (target <= now) {
          target.setDate(target.getDate() + 1);
        }
        return target.getTime();
      };

      browser.alarms.create("scheduleStart", {
        when: getNextTimeMs(schedule.startTime),
        periodInMinutes: 1440
      });

      browser.alarms.create("scheduleEnd", {
        when: getNextTimeMs(schedule.endTime),
        periodInMinutes: 1440
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

  const scheduleChanged = !oldSettings || !oldSettings.schedule ||
    oldSettings.schedule.isEnabled !== newSettings.schedule.isEnabled ||
    oldSettings.schedule.startTime !== newSettings.schedule.startTime ||
    oldSettings.schedule.endTime !== newSettings.schedule.endTime;

  if (scheduleChanged) {
    updateAlarms();
    checkSchedule();
  }
});

// Handle alarm triggers
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "scheduleStart" || alarm.name === "scheduleEnd") {
    checkSchedule();
  }
});

// Initialize alarms and run check on load
updateAlarms();
checkSchedule();
