// Keep service worker alive with periodic pings
const KEEP_ALIVE_INTERVAL_MINUTES = 5;

// Initialize alarms when extension is installed or updated
chrome.runtime.onInstalled.addListener(function () {
  console.log("Keka Auto Clock extension installed/updated");
  setupAlarms();
  
  // Create a keep-alive alarm
  chrome.alarms.create("keepServiceWorkerAlive", {
    periodInMinutes: KEEP_ALIVE_INTERVAL_MINUTES
  });
  console.log(`Keep-alive alarm set for every ${KEEP_ALIVE_INTERVAL_MINUTES} minutes`);
});

// Listen for setting changes
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === "settingsUpdated") {
    console.log("Settings updated, reconfiguring alarms");
    setupAlarms();
  }
  if (message.action === "checkStatus") {
    // For debugging - triggers a manual check
    console.log("Manual check requested");
    if (message.isTest) {
      chrome.storage.local.set({testSchedulingRun: true}, function() {
        checkAndPerformAction();
        if (sendResponse) sendResponse({status: "Test check started"});
      });
    } else {
      checkAndPerformAction();
      if (sendResponse) sendResponse({status: "Checking now"});
    }
  }
  if (message.action === "contentScriptLoaded") {
    console.log("Content script loaded confirmation received from:", sender.tab ? sender.tab.url : "unknown source");
    if (sendResponse) sendResponse({status: "Background worker acknowledged"});
  }
  return true; // Keep the message channel open for async responses
});

// Listen for alarm triggers
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === "checkClockStatus") {
    checkAndPerformAction();
  } else if (alarm.name === "keepServiceWorkerAlive") {
    console.log(`Service worker keep-alive ping at ${new Date().toLocaleTimeString()}`);
    // You can add additional code here to perform any lightweight activity
    // that will keep the service worker active
  }
});

// Setup alarms based on current settings
function setupAlarms() {
  // Clear any existing alarms
  chrome.alarms.clearAll();

  // Get current settings
  chrome.storage.sync.get(
    {
      enabled: false,
    },
    function (items) {
      if (items.enabled) {
        // Create an alarm that checks every minute if we need to clock in/out
        chrome.alarms.create("checkClockStatus", {
          periodInMinutes: 1,
        });
        console.log("Alarm set to check clock status every minute");
        
        // Trigger an immediate check after settings are updated
        setTimeout(checkAndPerformAction, 1000);
      } else {
        console.log("Auto clock is disabled, no alarms set");
      }
    }
  );
}

// Check if we need to clock in or out based on current time and settings
function checkAndPerformAction() {
  // Get current time in IST
  const now = new Date();
  
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeString = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
  
  // Calculate current time in minutes for easier comparison
  const currentTotalMinutes = currentHour * 60 + currentMinute;

  console.log(`Checking schedule at ${currentTimeString} (IST)`);

  // Map day of week to settings property
  const dayMap = {
    0: "sunday",
    1: "monday",
    2: "tuesday",
    3: "wednesday",
    4: "thursday",
    5: "friday",
    6: "saturday",
  };

  chrome.storage.sync.get(
    {
      enabled: false,
      clockInTime: "09:30",
      clockOutTime: "19:00",
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false,
      lastClockInDate: "",
      lastClockOutDate: "",
      lastActionType: "", // Track the most recent action ("in" or "out")
      bufferMinutes: 5, // Default buffer time of 5 minutes
    },
    function (settings) {
      if (!settings.enabled) {
        console.log("Auto clock is disabled");
        return;
      }

      // Check if today is an active day
      const todayActive = settings[dayMap[dayOfWeek]];
      if (!todayActive) {
        console.log("Today is not an active day");
        return;
      }

      // Format today's date as YYYY-MM-DD for comparison
      const today = now.toISOString().split("T")[0];
      
      // Convert scheduled times to minutes for comparison
      const [inHour, inMinute] = settings.clockInTime.split(':').map(Number);
      const [outHour, outMinute] = settings.clockOutTime.split(':').map(Number);
      
      const clockInMinutes = inHour * 60 + inMinute;
      const clockOutMinutes = outHour * 60 + outMinute;
      
      // Get buffer time from settings (default: 5 minutes)
      const bufferMinutes = parseInt(settings.bufferMinutes) || 5;
      
      console.log(`Current time: ${currentTimeString} (${currentTotalMinutes} mins)`);
      console.log(`Clock in time: ${settings.clockInTime} (${clockInMinutes} mins)`);
      console.log(`Clock out time: ${settings.clockOutTime} (${clockOutMinutes} mins)`);
      console.log(`Buffer minutes: ${bufferMinutes}`);
      console.log(`Last clock in: ${settings.lastClockInDate}, Last clock out: ${settings.lastClockOutDate}`);

      // Get the test flag from chrome.storage
      chrome.storage.local.get(['testSchedulingRun'], function(result) {
        if (result.testSchedulingRun === true) {
          // Clear the test flag
          chrome.storage.local.remove('testSchedulingRun');
          
          // Determine which action to take based on last action
          // If last action was 'out' or empty, we should clock in, otherwise clock out
          const shouldClockIn = settings.lastActionType !== "in";
          
          if (shouldClockIn) {
            console.log(`[TEST] Triggering clock in action`);
            performClockAction("in", today);
            return;
          } else {
            console.log(`[TEST] Triggering clock out action`);
            performClockAction("out", today);
            return;
          }
        }
      });
      
      // First check if we're near a scheduled time to take action
      const nearClockInTime = Math.abs(currentTotalMinutes - clockInMinutes) <= bufferMinutes || 
          (currentTotalMinutes > clockInMinutes && currentTotalMinutes < clockInMinutes + 120);
      
      const nearClockOutTime = Math.abs(currentTotalMinutes - clockOutMinutes) <= bufferMinutes || 
          (currentTotalMinutes > clockOutMinutes && currentTotalMinutes < clockOutMinutes + 120);
          
      if (!nearClockInTime && !nearClockOutTime) {
        console.log(`Not near any scheduled time. No action needed at current time: ${currentTimeString}`);
        return;
      }
      
      // We're near a scheduled time, so first check the actual UI state by opening the page
      console.log("Near a scheduled time. Checking the actual clock state on Keka's website...");
      
      // First open the Keka page and check the current state
      function checkClockState(callback) {
        // Find the Keka tab or open it if not exists
        chrome.tabs.query({ url: "https://newstreet.keka.com/*" }, function (tabs) {
          if (tabs.length > 0) {
            // Keka is already open, navigate to dashboard if needed
            chrome.tabs.update(
              tabs[0].id,
              {
                active: true,
                url: "https://newstreet.keka.com/#/home/dashboard",
              },
              function (tab) {
                // Wait for page to load before checking the state
                setTimeout(() => {
                  chrome.scripting.executeScript(
                    {
                      target: { tabId: tab.id },
                      function: detectClockState
                    },
                    callback
                  );
                }, 10000); // Give the page time to load
              }
            );
          } else {
            // Open Keka in a new tab
            chrome.tabs.create(
              {
                url: "https://newstreet.keka.com/#/home/dashboard",
              },
              function (tab) {
                // Wait for page to load before checking the state
                setTimeout(() => {
                  chrome.scripting.executeScript(
                    {
                      target: { tabId: tab.id },
                      function: detectClockState
                    },
                    callback
                  );
                }, 15000); // Give the page more time to load for a new tab
              }
            );
          }
        });
      }
      
      // Function to inject into page to detect current state
      function detectClockState() {
        const allButtons = document.querySelectorAll('button');
        let clockInButtonPresent = false;
        let clockOutButtonPresent = false;
        let allButtonTexts = [];
        
        for (const btn of allButtons) {
          const buttonText = btn.textContent.toLowerCase().trim();
          allButtonTexts.push(buttonText);
          
          // Check for different variations of clock in buttons (with or without hyphen)
          if (buttonText.includes('clock in') || buttonText.includes('web clock in') || 
              buttonText.includes('clock-in') || buttonText.includes('web clock-in')) {
            clockInButtonPresent = true;
            console.log(`Found CLOCK IN button with text: "${buttonText}"`);
          }
          
          // Check for different variations of clock out buttons (with or without hyphen)
          if (buttonText.includes('clock out') || buttonText.includes('web clock out') || 
              buttonText.includes('clock-out') || buttonText.includes('web clock-out')) {
            clockOutButtonPresent = true;
            console.log(`Found CLOCK OUT button with text: "${buttonText}"`);
          }
        }
        
        // Determine actual state based on available buttons
        let actualState = "unknown";
        if (clockInButtonPresent && !clockOutButtonPresent) {
          actualState = "out"; // User is currently clocked OUT (in button is showing)
        } else if (!clockInButtonPresent && clockOutButtonPresent) {
          actualState = "in"; // User is currently clocked IN (out button is showing)
        }
        
        // Special case for Keka's new UI: if we see 'web clock-in' button, user is clocked out
        for (const text of allButtonTexts) {
          if (text === 'web clock-in') {
            console.log("Found exact 'web clock-in' button - user is definitely clocked out");
            actualState = "out";
            clockInButtonPresent = true;
            break;
          }
          if (text === 'web clock-out') {
            console.log("Found exact 'web clock-out' button - user is definitely clocked in");
            actualState = "in";
            clockOutButtonPresent = true;
            break;
          }
        }
        
        return { 
          actualState, 
          clockInButtonPresent, 
          clockOutButtonPresent, 
          buttonTexts: allButtonTexts 
        };
      }
      
      // Check the UI state and then decide what action to take
      checkClockState(function(results) {
        if (chrome.runtime.lastError) {
          console.error("Error while detecting clock state:", chrome.runtime.lastError.message);
          // Fall back to using the stored state
          fallbackToStoredState();
          return;
        }
        
        if (results && results[0] && results[0].result) {
          const uiState = results[0].result;
          console.log("Detected UI state:", uiState);
          
          // Now decide what action to take based on the UI state and schedule
          if (uiState.actualState === "out") { // Currently clocked out
            if (nearClockInTime) {
              console.log(`UI shows clocked out and it's time to clock in! Current time: ${currentTimeString}, Scheduled: ${settings.clockInTime}`);
              performClockAction("in", today);
            } else {
              console.log(`UI shows clocked out but it's not time to clock in. No action needed.`);
            }
          } else if (uiState.actualState === "in") { // Currently clocked in
            if (nearClockOutTime) {
              console.log(`UI shows clocked in and it's time to clock out! Current time: ${currentTimeString}, Scheduled: ${settings.clockOutTime}`);
              performClockAction("out", today);
            } else {
              console.log(`UI shows clocked in but it's not time to clock out. No action needed.`);
            }
          } else {
            console.log(`Could not reliably detect current clock state from UI: ${uiState.actualState}`);
            console.log(`Found buttons:`, uiState.buttonTexts);
            // Fall back to using stored state
            fallbackToStoredState();
          }
        } else {
          console.error("No results returned from detectClockState");
          // Fall back to using stored state
          fallbackToStoredState();
        }
      });
      
      // Fallback function when we can't determine UI state
      function fallbackToStoredState() {
        console.log("Falling back to using stored state for decision making");
        
        // Use lastActionType as before
        const shouldClockIn = settings.lastActionType !== "in";
        
        if (shouldClockIn && nearClockInTime) {
          console.log(`Fallback: Time to clock in! Current time: ${currentTimeString}, Scheduled: ${settings.clockInTime}`);
          performClockAction("in", today);
        } else if (!shouldClockIn && nearClockOutTime) {
          console.log(`Fallback: Time to clock out! Current time: ${currentTimeString}, Scheduled: ${settings.clockOutTime}`);
          performClockAction("out", today);
        } else {
          console.log(`Fallback: No action needed based on stored state and current time.`);
        }
      }
      
      console.log(`No action needed at current time: ${currentTimeString}`);
    }
  );
}

// Function to manually check and perform clock actions (for testing)
function manualCheckAndPerform() {
  console.log("Manual check triggered");
  checkAndPerformAction();
}

// Check current status on Keka and toggle accordingly
function checkCurrentStatusAndToggle(today) {
  // Find the Keka tab or open it if not exists
  chrome.tabs.query({ url: "https://newstreet.keka.com/*" }, function (tabs) {
    if (tabs.length > 0) {
      // Keka is already open, navigate to dashboard if needed
      chrome.tabs.update(
        tabs[0].id,
        {
          active: true,
          url: "https://newstreet.keka.com/#/home/dashboard",
        },
        function (tab) {
          // Wait for page to load, then check status and toggle
          setTimeout(() => checkStatusAndPerformAction(tab.id, today), 5000);
        }
      );
    } else {
      // Open Keka in a new tab
      chrome.tabs.create(
        {
          url: "https://newstreet.keka.com/#/home/dashboard",
        },
        function (tab) {
          // Wait for page to load, then check status and toggle
          setTimeout(() => checkStatusAndPerformAction(tab.id, today), 10000);
        }
      );
    }
  });
}

// Check the current status and perform the appropriate action
function checkStatusAndPerformAction(tabId, today) {
  chrome.scripting.executeScript(
    {
      target: { tabId: tabId },
      function: detectClockStatus,
    },
    function (results) {
      if (chrome.runtime.lastError) {
        console.error(
          "Error executing script:",
          chrome.runtime.lastError.message
        );
        return;
      }

      if (results && results[0]) {
        const status = results[0].result;
        console.log("Current clock status:", status);

        // Determine which action to take based on current status
        if (status === "in") {
          // Already clocked in, so we should clock out
          console.log("Already clocked in, will clock out");
          performClockAction("out", today);
        } else if (status === "out") {
          // Already clocked out, so we should clock in
          console.log("Already clocked out, will clock in");
          performClockAction("in", today);
        } else {
          // Status unknown, check the time to decide
          const now = new Date();
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();

          chrome.storage.sync.get(
            {
              clockInTime: "09:30",
              clockOutTime: "19:00",
            },
            function (settings) {
              const [inHour, inMinute] = settings.clockInTime
                .split(":")
                .map(Number);
              const [outHour, outMinute] = settings.clockOutTime
                .split(":")
                .map(Number);

              // If it's closer to clock in time, clock in; otherwise clock out
              const isClockInTime =
                currentHour === inHour && currentMinute === inMinute;
              const isClockOutTime =
                currentHour === outHour && currentMinute === outMinute;

              if (isClockInTime) {
                console.log("It's clock in time, will clock in");
                performClockAction("in", today);
              } else if (isClockOutTime) {
                console.log("It's clock out time, will clock out");
                performClockAction("out", today);
              }
            }
          );
        }
      }
    }
  );
}

// This function will be injected into the page to detect the current clock status
function detectClockStatus() {
  try {
    // Multiple selectors for better reliability
    // 1. Class-based selectors
    const inClassSelector = "button.btn.btn-x-sm.mx-4.btn-white";
    const outClassSelector = "button.btn.btn-danger.btn-x-sm";

    // 2. Full CSS path selector
    const fullPathSelector =
      "#preload > xhr-app-root > div > xhr-home > div > home-dashboard > div > div > div > div > div.ng-star-inserted > div > div:nth-child(4) > div:nth-child(6) > home-attendance-clockin-widget > div > div.card-body.clear-padding.d-flex.flex-column.justify-content-between > div > div.h-100.d-flex.align-items-center.ng-star-inserted > div > div.d-flex.align-items-center.ng-star-inserted > div:nth-child(1) > div > button";

    // Check for clock in button using class selector (if present, we're clocked out)
    const clockInButton = document.querySelector(inClassSelector);
    if (
      clockInButton &&
      clockInButton.textContent.trim().toLowerCase().includes("clock in")
    ) {
      console.log("Detected clocked out status using class selector");
      return "out"; // We're currently clocked out
    }

    // Check for clock out button using class selector (if present, we're clocked in)
    const clockOutButton = document.querySelector(outClassSelector);
    if (
      clockOutButton &&
      clockOutButton.textContent.trim().toLowerCase().includes("clock out")
    ) {
      console.log("Detected clocked in status using class selector");
      return "in"; // We're currently clocked in
    }

    // If class selectors fail, try the full path selector
    const fullPathButton = document.querySelector(fullPathSelector);
    if (fullPathButton) {
      const buttonText = fullPathButton.textContent.trim().toLowerCase();
      if (buttonText.includes("clock in")) {
        console.log("Detected clocked out status using full path selector");
        return "out"; // We're currently clocked out
      } else if (buttonText.includes("clock out")) {
        console.log("Detected clocked in status using full path selector");
        return "in"; // We're currently clocked in
      }
    }

    // If neither button is found or identifiable
    console.log("Could not detect clock status with any selector");
    return "unknown";
  } catch (error) {
    console.error("Error detecting clock status:", error);
    return "error";
  }
}

// Perform the actual clock in/out action
function performClockAction(action, today) {
  console.log(`Performing ${action} action for date: ${today}`);
  
  // First verify if we're already logged in, and if not, need to handle login
  function openAndPrepareKeka(callback) {
    // Find the Keka tab or open it if not exists
    chrome.tabs.query({ url: "https://newstreet.keka.com/*" }, function (tabs) {
      if (tabs.length > 0) {
        // Keka is already open, navigate to dashboard if needed
        console.log('Keka tab found, navigating to dashboard...');
        chrome.tabs.update(
          tabs[0].id,
          {
            active: true,
            url: "https://newstreet.keka.com/#/home/dashboard",
          },
          function (tab) {
            // Use webNavigation to detect when page has truly finished loading
            console.log(`Tab navigating to dashboard, will wait for complete load...`);
            // Wait longer for the page to completely load (Single Page Apps need more time)
            setTimeout(() => {
              console.log(`Page should be loaded now, executing ${action} action`);
              callback(tab.id);
            }, 15000); // Wait 15 seconds for page to fully load and render
          }
        );
      } else {
        // Open Keka in a new tab
        console.log(`No Keka tab found, opening a new tab...`);
        chrome.tabs.create(
          {
            url: "https://newstreet.keka.com/#/home/dashboard",
          },
          function (tab) {
            // Wait even longer for login and initial page load
            console.log(`New tab opened, waiting for login and page load...`);
            setTimeout(() => {
              console.log(`New tab should be loaded now, executing ${action} action`);
              callback(tab.id);
            }, 20000); // Wait 20 seconds for page to fully load, login process to complete
          }
        );
      }
    });
  }
  
  // Start the process
  openAndPrepareKeka(function(tabId) {
    executeClockAction(tabId, action, today);
  });
}

// Execute the clock action via content script with retry logic
function executeClockAction(tabId, action, today) {
  console.log(`Preparing to execute ${action} action with multiple attempts...`);
  
  // Make multiple attempts with increasing delays
  let attempts = 0;
  const maxAttempts = 3;
  
  function attemptClick() {
    attempts++;
    console.log(`Attempt ${attempts} of ${maxAttempts} to clock ${action}...`);
    
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        function: clickClockButton,
        args: [action],
      },
      function (results) {
        if (chrome.runtime.lastError) {
          console.error(
            `Error executing script on attempt ${attempts}:`,
            chrome.runtime.lastError.message
          );
          
          if (attempts < maxAttempts) {
            // Try again after a longer delay
            setTimeout(attemptClick, attempts * 3000); // Increase delay with each attempt
            return;
          } else {
            console.error(`Failed to clock ${action} after ${maxAttempts} attempts`);
            return;
          }
        }

        if (results && results[0] && results[0].result) {
          // The script ran successfully
          const result = results[0].result;
          
          // With our new clickClockButton function, result is an object with success and actualState
          if (result.success === true) {
            // Success! Update the storage with detected state and action taken
            const updateObj = {
              lastActionType: action // Track the last action type we took
            };
            
            // Also store the actual detected state
            console.log(`UI detected state: ${result.actualState}`);
            updateObj.detectedState = result.actualState;
            
            // Update the appropriate date based on the action we took
            if (action === "in") {
              updateObj.lastClockInDate = today;
            } else {
              updateObj.lastClockOutDate = today;
            }

            chrome.storage.sync.set(updateObj, function () {
              console.log(`Successfully clocked ${action} and updated storage with detected state: ${result.actualState}`);
            });
          } else {
            // The script ran but couldn't find or click the button
            console.log(`Button not found on attempt ${attempts}, detected state: ${result.actualState}`);
            if (attempts < maxAttempts) {
              console.log(`Trying again...`);
              setTimeout(attemptClick, attempts * 3000);
            } else {
              console.error(`Failed to find ${action} button after ${maxAttempts} attempts`);
            }
          }
        } else {
          // Script returned no results
          console.error(`No results from script execution on attempt ${attempts}`);
          if (attempts < maxAttempts) {
            setTimeout(attemptClick, attempts * 3000);
          } else {
            console.error(`Failed to execute script after ${maxAttempts} attempts`);
          }
        }
      }
    );
  }
  
  // Start the first attempt after a longer initial wait
  // This gives the page more time to fully load first
  setTimeout(attemptClick, 5000);
}

// This function will be injected into the page to click the clock button and detect actual state
function clickClockButton(action) {
  try {
    console.log(`Looking for ${action === 'in' ? 'Clock In' : 'Clock Out'} button and detecting actual clock state...`);
    
    // First scan for all buttons to determine current state
    const allButtons = document.querySelectorAll('button');
    let clockInButtonPresent = false;
    let clockOutButtonPresent = false;
    let allButtonTexts = [];
    
    for (const btn of allButtons) {
      const buttonText = btn.textContent.toLowerCase().trim();
      allButtonTexts.push(buttonText);
      
      // Check for different variations of clock in/out buttons (with or without hyphen)
      if (buttonText.includes('clock in') || buttonText.includes('web clock in') ||
          buttonText.includes('clock-in') || buttonText.includes('web clock-in')) {
        clockInButtonPresent = true;
      }
      if (buttonText.includes('clock out') || buttonText.includes('web clock out') ||
          buttonText.includes('clock-out') || buttonText.includes('web clock-out')) {
        clockOutButtonPresent = true;
      }
    }
    
    console.log(`Button detection: Clock In button present: ${clockInButtonPresent}, Clock Out button present: ${clockOutButtonPresent}`);
    console.log(`All buttons found: ${JSON.stringify(allButtonTexts)}`);
    
    // Determine actual state based on available buttons
    let actualState = "unknown";
    if (clockInButtonPresent && !clockOutButtonPresent) {
      actualState = "out"; // User is currently clocked OUT (in button is showing)
      console.log("Detected actual state: User is CLOCKED OUT");
    } else if (!clockInButtonPresent && clockOutButtonPresent) {
      actualState = "in"; // User is currently clocked IN (out button is showing)
      console.log("Detected actual state: User is CLOCKED IN");
    } else if (clockInButtonPresent && clockOutButtonPresent) {
      console.log("Both clock in and clock out buttons detected - ambiguous state");
      // Could be that multiple buttons are present, use requested action
      actualState = action === "in" ? "out" : "in";
    } else {
      console.log("No standard clock buttons detected. Checking for exact matches in UI...");
      
      // Special case for Keka's new UI which uses web clock-in/out format
      for (const text of allButtonTexts) {
        if (text === 'web clock-in') {
          console.log("Found exact 'web clock-in' button - user is definitely clocked out");
          actualState = "out";
          clockInButtonPresent = true;
          break;
        }
        if (text === 'web clock-out') {
          console.log("Found exact 'web clock-out' button - user is definitely clocked in");
          actualState = "in";
          clockOutButtonPresent = true;
          break;
        }
      }
      
      if (actualState === "unknown") {
        console.log("All button texts found:", JSON.stringify(allButtonTexts));
      }
    }
    
    // Use the action that was requested
    const actionToTake = action;
    console.log(`Taking requested action: ${actionToTake}`);
    
    // Look for the appropriate button based on our action
    let button = null;
    
    // First look for EXACT matches to web clock-in/out
    let exactMatch = false;
    for (const btn of allButtons) {
      const buttonText = btn.textContent.toLowerCase().trim();
      
      // Check for exact matches first
      if ((actionToTake === 'in' && buttonText === 'web clock-in') ||
          (actionToTake === 'out' && buttonText === 'web clock-out')) {
        button = btn;
        exactMatch = true;
        console.log(`Found EXACT match for ${actionToTake} button with text: "${buttonText}"`);
        break;
      }
    }
    
    // If no exact match, try partial matches
    if (!exactMatch) {
      for (const btn of allButtons) {
        const buttonText = btn.textContent.toLowerCase().trim();
        
        // Updated to handle hyphenated variations
        const matchesIn = actionToTake === 'in' && (
          buttonText.includes('clock in') || 
          buttonText.includes('web clock in') ||
          buttonText.includes('clock-in') || 
          buttonText.includes('web clock-in')
        );
        
        const matchesOut = actionToTake === 'out' && (
          buttonText.includes('clock out') || 
          buttonText.includes('web clock out') ||
          buttonText.includes('clock-out') || 
          buttonText.includes('web clock-out')
        );
        
        if (matchesIn || matchesOut) {
          button = btn;
          console.log(`Found partial match for ${actionToTake} button with text: "${buttonText}"`);
          break;
        }
      }
    }
    
    // If we found a button, click it
    if (button) {
      console.log(`Button found! Text: "${button.textContent.trim()}". Clicking now...`);
      button.click();
      
      // Also attempt to dispatch a click event in case the regular click doesn't work
      try {
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        button.dispatchEvent(clickEvent);
      } catch (e) {
        console.log('Error dispatching click event, but continuing anyway', e);
      }
      
      // Special handling for clock out - it definitely needs two clicks in Keka's UI
      if (actionToTake === "out") {
        console.log("Clock out requires confirmation - will perform double-click sequence...");
        
        // First, try the standard confirmation approach
        setTimeout(() => {
          console.log("Making first attempt at confirmation...");
          
          // Look for confirmation buttons or a second clock out button
          const confirmButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
            const text = btn.textContent.toLowerCase().trim();
            return text.includes('yes') || 
                   text.includes('confirm') || 
                   text.includes('continue') || 
                   text.includes('proceed') || 
                   text.includes('ok') || 
                   text.includes('clock out') || 
                   text.includes('clock-out') ||
                   text === 'clock out';
          });
          
          if (confirmButtons.length > 0) {
            console.log(`Found confirmation button: "${confirmButtons[0].textContent.trim()}". Clicking it...`);
            confirmButtons[0].click();
            
            try {
              const confirmClickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              confirmButtons[0].dispatchEvent(confirmClickEvent);
              console.log("Dispatched click event to confirmation button");
            } catch (e) {
              console.log('Error dispatching click event to confirmation, continuing anyway', e);
            }
          } else {
            // If no confirmation button found, click the original button again
            console.log("No specific confirmation button found. Clicking the original button again...");
            button.click();
            try {
              const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              button.dispatchEvent(clickEvent);
            } catch (e) {
              console.log('Error dispatching second click event, continuing anyway', e);
            }
          }
          
          // Make a second attempt after a longer delay (in case first attempt didn't work)
          setTimeout(() => {
            console.log("Making second attempt at confirmation...");
            // Try again to find any clock-out related buttons and click them
            const finalAttemptButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
              const text = btn.textContent.toLowerCase().trim();
              // More aggressive matching for any button that might be related to confirmation
              return text.includes('yes') || 
                     text.includes('confirm') || 
                     text.includes('ok') || 
                     text.includes('continue') || 
                     text.includes('clock out') || 
                     text.includes('clock-out') || 
                     text.includes('submit') || 
                     text.includes('save') || 
                     text === 'ok';
            });
            
            if (finalAttemptButtons.length > 0) {
              console.log(`Final attempt: clicking button with text: "${finalAttemptButtons[0].textContent.trim()}"`); 
              finalAttemptButtons[0].click();
            } else {
              console.log("No confirmation buttons found in second attempt. Process may be complete.");
            }
          }, 2000); // Wait 2 seconds for any secondary confirmation
        }, 1500); // Wait 1.5 seconds for initial confirmation dialog
      }
      
      console.log(`Successfully clicked the ${actionToTake === "in" ? "Clock In" : "Clock Out"} button`);
      return { success: true, actualState: actualState };
    } else {
      console.error(`ERROR: Could not find any ${actionToTake === "in" ? "Clock In" : "Clock Out"} button!`);
      console.log('Available buttons on page:');
      allButtons.forEach(b => {
        console.log(`Button text: "${b.textContent.trim()}", class: "${b.className}"`);
      });
      return { success: false, actualState: actualState };
    }
  } catch (error) {
    console.error("Error in clickClockButton:", error);
    return { success: false, actualState: "error" };
  }
}
