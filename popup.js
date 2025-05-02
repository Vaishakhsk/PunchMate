document.addEventListener("DOMContentLoaded", function () {
  // Load saved settings
  chrome.storage.sync.get(
    {
      enabled: false,
      clockInTime: "09:30",
      clockOutTime: "19:00",
      bufferMinutes: 1,
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false,
      lastClockInDate: "",
      lastClockOutDate: "",
    },
    function (items) {
      document.getElementById("enabled").checked = items.enabled;
      document.getElementById("clockInTime").value = items.clockInTime;
      document.getElementById("clockOutTime").value = items.clockOutTime;
      document.getElementById("bufferMinutes").value = items.bufferMinutes;
      document.getElementById("monday").checked = items.monday;
      document.getElementById("tuesday").checked = items.tuesday;
      document.getElementById("wednesday").checked = items.wednesday;
      document.getElementById("thursday").checked = items.thursday;
      document.getElementById("friday").checked = items.friday;
      document.getElementById("saturday").checked = items.saturday;
      document.getElementById("sunday").checked = items.sunday;

      updateStatusMessage(items);

      // Check current clock status
      checkCurrentClockStatus();
    }
  );

  // Save settings
  document.getElementById("saveButton").addEventListener("click", function () {
    const settings = {
      enabled: document.getElementById("enabled").checked,
      clockInTime: document.getElementById("clockInTime").value,
      clockOutTime: document.getElementById("clockOutTime").value,
      bufferMinutes:
        parseInt(document.getElementById("bufferMinutes").value) || 5,
      monday: document.getElementById("monday").checked,
      tuesday: document.getElementById("tuesday").checked,
      wednesday: document.getElementById("wednesday").checked,
      thursday: document.getElementById("thursday").checked,
      friday: document.getElementById("friday").checked,
      saturday: document.getElementById("saturday").checked,
      sunday: document.getElementById("sunday").checked,
    };

    chrome.storage.sync.set(settings, function () {
      updateStatusMessage(settings);

      // Notify the background script that settings have changed
      chrome.runtime.sendMessage({ action: "settingsUpdated" });

      // Show saved notification
      const statusMessage = document.getElementById("statusMessage");
      const originalText = statusMessage.textContent;
      statusMessage.textContent = "Settings saved!";
      statusMessage.style.backgroundColor = "#d4edda";

      setTimeout(function () {
        statusMessage.textContent = originalText;
        statusMessage.style.backgroundColor = "#f0f0f0";
      }, 2000);
    });
  });

  // Toggle enabled state
  document.getElementById("enabled").addEventListener("change", function () {
    const enabled = this.checked;
    chrome.storage.sync.set({ enabled: enabled }, function () {
      chrome.runtime.sendMessage({ action: "settingsUpdated" });
    });
    updateStatusMessage({ enabled: enabled });
  });
  
  // Add a test button to the status message
  const statusMessage = document.getElementById("statusMessage");
  const testButton = document.createElement("button");
  testButton.textContent = "Test Scheduling";
  testButton.style.marginTop = "10px";
  testButton.style.padding = "5px 10px";
  testButton.style.backgroundColor = "#4285f4";
  testButton.style.color = "white";
  testButton.style.border = "none";
  testButton.style.borderRadius = "4px";
  testButton.style.cursor = "pointer";
  testButton.addEventListener("click", function() {
    statusMessage.innerHTML = "Testing auto schedule function... Check extension logs for details.";
    // Trigger a manual check in the background script
    chrome.runtime.sendMessage({ action: "checkStatus" }, function(response) {
      console.log("Manual check response:", response);
      // Add the test button back after testing
      setTimeout(() => {
        statusMessage.innerText = "Manual check completed. Check extension logs.";
        statusMessage.appendChild(document.createElement("br"));
        statusMessage.appendChild(testButton);
      }, 2000);
    });
  });
  statusMessage.appendChild(document.createElement("br"));
  statusMessage.appendChild(testButton);

  // Manual clock in button
  document
    .getElementById("manualClockIn")
    .addEventListener("click", function () {
      const actionStatus = document.getElementById("actionStatus");
      actionStatus.textContent = "Attempting to clock in...";
      actionStatus.style.backgroundColor = "#f0f0f0";

      // Get active tab and send message to content script
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs.length === 0) {
          // No active tab, open Keka
          chrome.tabs.create(
            { url: "https://newstreet.keka.com/#/home/dashboard" },
            function (tab) {
              // Wait for page to load before sending message
              setTimeout(() => {
                sendClockInMessage(tab.id, actionStatus);
              }, 5000);
            }
          );
        } else {
          const activeTab = tabs[0];
          if (activeTab.url.includes("newstreet.keka.com")) {
            // We're already on Keka, send message directly
            sendClockInMessage(activeTab.id, actionStatus);
          } else {
            // Not on Keka, navigate to it
            chrome.tabs.update(
              activeTab.id,
              { url: "https://newstreet.keka.com/#/home/dashboard" },
              function (tab) {
                // Wait for page to load before sending message
                setTimeout(() => {
                  sendClockInMessage(tab.id, actionStatus);
                }, 5000);
              }
            );
          }
        }
      });
    });

  // Manual clock out button
  document
    .getElementById("manualClockOut")
    .addEventListener("click", function () {
      const actionStatus = document.getElementById("actionStatus");
      actionStatus.textContent = "Attempting to clock out...";
      actionStatus.style.backgroundColor = "#f0f0f0";

      // Get active tab and send message to content script
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs.length === 0) {
          // No active tab, open Keka
          chrome.tabs.create(
            { url: "https://newstreet.keka.com/#/home/dashboard" },
            function (tab) {
              // Wait for page to load before sending message
              setTimeout(() => {
                sendClockOutMessage(tab.id, actionStatus);
              }, 5000);
            }
          );
        } else {
          const activeTab = tabs[0];
          if (activeTab.url.includes("newstreet.keka.com")) {
            // We're already on Keka, send message directly
            sendClockOutMessage(activeTab.id, actionStatus);
          } else {
            // Not on Keka, navigate to it
            chrome.tabs.update(
              activeTab.id,
              { url: "https://newstreet.keka.com/#/home/dashboard" },
              function (tab) {
                // Wait for page to load before sending message
                setTimeout(() => {
                  sendClockOutMessage(tab.id, actionStatus);
                }, 5000);
              }
            );
          }
        }
      });
    });
});

// Helper function to send clock in message to content script
function sendClockInMessage(tabId, actionStatus) {
  // First inject the content script if it's not already there
  chrome.scripting.executeScript(
    {
      target: { tabId: tabId },
      files: ["content.js"],
    },
    function () {
      if (chrome.runtime.lastError) {
        actionStatus.textContent = "Error: " + chrome.runtime.lastError.message;
        actionStatus.style.backgroundColor = "#f8d7da";
        return;
      }

      // Now send the message to the content script
      chrome.tabs.sendMessage(
        tabId,
        { action: "clockIn" },
        function (response) {
          if (chrome.runtime.lastError) {
            actionStatus.textContent =
              "Error: " + chrome.runtime.lastError.message;
            actionStatus.style.backgroundColor = "#f8d7da";
          } else if (response && response.success) {
            actionStatus.textContent = "Successfully clocked in!";
            actionStatus.style.backgroundColor = "#d4edda";

            // Update last clock in date
            const today = new Date().toISOString().split("T")[0];
            chrome.storage.sync.set({ lastClockInDate: today });
          } else {
            actionStatus.textContent = "Failed to clock in. Try again.";
            actionStatus.style.backgroundColor = "#f8d7da";
          }
        }
      );
    }
  );
}

// Helper function to send clock out message to content script
function sendClockOutMessage(tabId, actionStatus) {
  // First inject the content script if it's not already there
  chrome.scripting.executeScript(
    {
      target: { tabId: tabId },
      files: ["content.js"],
    },
    function () {
      if (chrome.runtime.lastError) {
        actionStatus.textContent = "Error: " + chrome.runtime.lastError.message;
        actionStatus.style.backgroundColor = "#f8d7da";
        return;
      }

      // Now send the message to the content script
      chrome.tabs.sendMessage(
        tabId,
        { action: "clockOut" },
        function (response) {
          if (chrome.runtime.lastError) {
            actionStatus.textContent =
              "Error: " + chrome.runtime.lastError.message;
            actionStatus.style.backgroundColor = "#f8d7da";
          } else if (response && response.success) {
            actionStatus.textContent = "Successfully clocked out!";
            actionStatus.style.backgroundColor = "#d4edda";

            // Update last clock out date
            const today = new Date().toISOString().split("T")[0];
            chrome.storage.sync.set({ lastClockOutDate: today });
          } else {
            actionStatus.textContent = "Failed to clock out. Try again.";
            actionStatus.style.backgroundColor = "#f8d7da";
          }
        }
      );
    }
  );
}

// Function to check current clock status
function checkCurrentClockStatus() {
  chrome.tabs.query({ url: "https://newstreet.keka.com/*" }, function (tabs) {
    if (tabs.length > 0) {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          function: detectClockStatus,
        },
        function (results) {
          if (chrome.runtime.lastError || !results || !results[0]) {
            return;
          }

          const status = results[0].result;
          const actionStatus = document.getElementById("actionStatus");

          if (status === "in") {
            actionStatus.textContent = "Current status: Clocked in";
            actionStatus.style.backgroundColor = "#d4edda";
          } else if (status === "out") {
            actionStatus.textContent = "Current status: Clocked out";
            actionStatus.style.backgroundColor = "#f8d7da";
          }
        }
      );
    }
  });
}

// Function to detect clock status
function detectClockStatus() {
  try {
    // Check for clock in button (if present, we're clocked out)
    const clockInButton = document.querySelector(
      "button.btn.btn-x-sm.mx-4.btn-white"
    );
    if (
      clockInButton &&
      clockInButton.textContent.trim().toLowerCase().includes("clock in")
    ) {
      return "out"; // We're currently clocked out
    }

    // Check for clock out button (if present, we're clocked in)
    const clockOutButton = document.querySelector(
      "button.btn.btn-danger.btn-x-sm"
    );
    if (
      clockOutButton &&
      clockOutButton.textContent.trim().toLowerCase().includes("clock out")
    ) {
      return "in"; // We're currently clocked in
    }

    // If neither button is found or identifiable, try the full path selector
    const fullPathSelector =
      "#preload > xhr-app-root > div > xhr-home > div > home-dashboard > div > div > div > div > div.ng-star-inserted > div > div:nth-child(4) > div:nth-child(6) > home-attendance-clockin-widget > div > div.card-body.clear-padding.d-flex.flex-column.justify-content-between > div > div.h-100.d-flex.align-items-center.ng-star-inserted > div > div.d-flex.align-items-center.ng-star-inserted > div:nth-child(1) > div > button";
    const fullPathButton = document.querySelector(fullPathSelector);

    if (fullPathButton) {
      const buttonText = fullPathButton.textContent.trim().toLowerCase();
      if (buttonText.includes("clock in")) {
        return "out"; // We're currently clocked out
      } else if (buttonText.includes("clock out")) {
        return "in"; // We're currently clocked in
      }
    }

    return "unknown";
  } catch (error) {
    console.error("Error detecting clock status:", error);
    return "error";
  }
}

function updateStatusMessage(settings) {
  const statusMessage = document.getElementById("statusMessage");

  if (!settings) {
    chrome.storage.sync.get(null, function (items) {
      updateStatusMessageWithData(items, statusMessage);
    });
    return;
  }

  // If we only have partial settings (e.g., just the enabled state),
  // get the full settings
  if (settings.enabled !== undefined && settings.clockInTime === undefined) {
    chrome.storage.sync.get(null, function (items) {
      // Override with our new value
      items.enabled = settings.enabled;
      updateStatusMessageWithData(items, statusMessage);
    });
  } else {
    updateStatusMessageWithData(settings, statusMessage);
  }
}

function updateStatusMessageWithData(settings, statusMessage) {
  if (settings.enabled) {
    let activeDays = [];
    if (settings.monday) activeDays.push("Mon");
    if (settings.tuesday) activeDays.push("Tue");
    if (settings.wednesday) activeDays.push("Wed");
    if (settings.thursday) activeDays.push("Thu");
    if (settings.friday) activeDays.push("Fri");
    if (settings.saturday) activeDays.push("Sat");
    if (settings.sunday) activeDays.push("Sun");

    const daysText =
      activeDays.length > 0 ? activeDays.join(", ") : "No days selected";

    statusMessage.textContent = `Active: Clock in at ${settings.clockInTime}, clock out at ${settings.clockOutTime} on ${daysText}`;
    statusMessage.style.backgroundColor = "#d4edda";
  } else {
    statusMessage.textContent = "Auto clock in/out is disabled";
    statusMessage.style.backgroundColor = "#f8d7da";
  }
}
