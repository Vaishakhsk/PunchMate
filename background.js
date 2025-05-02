// Initialize alarms when extension is installed or updated
chrome.runtime.onInstalled.addListener(function() {
  console.log('Keka Auto Clock extension installed/updated');
  setupAlarms();
});

// Listen for setting changes
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'settingsUpdated') {
    console.log('Settings updated, reconfiguring alarms');
    setupAlarms();
  }
});

// Listen for alarm triggers
chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === 'checkClockStatus') {
    checkAndPerformAction();
  }
});

// Setup alarms based on current settings
function setupAlarms() {
  // Clear any existing alarms
  chrome.alarms.clearAll();
  
  // Get current settings
  chrome.storage.sync.get({
    enabled: false
  }, function(items) {
    if (items.enabled) {
      // Create an alarm that checks every minute if we need to clock in/out
      chrome.alarms.create('checkClockStatus', {
        periodInMinutes: 1
      });
      console.log('Alarm set to check clock status every minute');
    } else {
      console.log('Auto clock is disabled, no alarms set');
    }
  });
}

// Check if we need to clock in or out based on current time and settings
function checkAndPerformAction() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  console.log(`Checking schedule at ${currentHour}:${currentMinute}`);
  
  // Map day of week to settings property
  const dayMap = {
    0: 'sunday',
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday'
  };
  
  chrome.storage.sync.get({
    enabled: false,
    clockInTime: '09:30',
    clockOutTime: '19:00',
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: false,
    sunday: false,
    lastClockInDate: '',
    lastClockOutDate: ''
  }, function(settings) {
    if (!settings.enabled) {
      console.log('Auto clock is disabled');
      return;
    }
    
    // Check if today is an active day
    const todayActive = settings[dayMap[dayOfWeek]];
    if (!todayActive) {
      console.log('Today is not an active day');
      return;
    }
    
    // Parse clock in/out times
    const [inHour, inMinute] = settings.clockInTime.split(':').map(Number);
    const [outHour, outMinute] = settings.clockOutTime.split(':').map(Number);
    
    console.log(`Scheduled times - In: ${inHour}:${inMinute}, Out: ${outHour}:${outMinute}`);
    
    // Format today's date as YYYY-MM-DD for comparison
    const today = now.toISOString().split('T')[0];
    
    // Check if we need to clock in
    if (currentHour === inHour && currentMinute === inMinute && settings.lastClockInDate !== today) {
      console.log('Time to clock in!');
      performClockAction('in', today);
    }
    
    // Check if we need to clock out
    if (currentHour === outHour && currentMinute === outMinute && settings.lastClockOutDate !== today) {
      console.log('Time to clock out!');
      performClockAction('out', today);
    }
  });
}

// Check current status on Keka and toggle accordingly
function checkCurrentStatusAndToggle(today) {
  // Find the Keka tab or open it if not exists
  chrome.tabs.query({url: 'https://newstreet.keka.com/*'}, function(tabs) {
    if (tabs.length > 0) {
      // Keka is already open, navigate to dashboard if needed
      chrome.tabs.update(tabs[0].id, {
        active: true,
        url: 'https://newstreet.keka.com/#/home/dashboard'
      }, function(tab) {
        // Wait for page to load, then check status and toggle
        setTimeout(() => checkStatusAndPerformAction(tab.id, today), 5000);
      });
    } else {
      // Open Keka in a new tab
      chrome.tabs.create({
        url: 'https://newstreet.keka.com/#/home/dashboard'
      }, function(tab) {
        // Wait for page to load, then check status and toggle
        setTimeout(() => checkStatusAndPerformAction(tab.id, today), 10000);
      });
    }
  });
}

// Check the current status and perform the appropriate action
function checkStatusAndPerformAction(tabId, today) {
  chrome.scripting.executeScript({
    target: {tabId: tabId},
    function: detectClockStatus
  }, function(results) {
    if (chrome.runtime.lastError) {
      console.error('Error executing script:', chrome.runtime.lastError.message);
      return;
    }
    
    if (results && results[0]) {
      const status = results[0].result;
      console.log('Current clock status:', status);
      
      // Determine which action to take based on current status
      if (status === 'in') {
        // Already clocked in, so we should clock out
        console.log('Already clocked in, will clock out');
        performClockAction('out', today);
      } else if (status === 'out') {
        // Already clocked out, so we should clock in
        console.log('Already clocked out, will clock in');
        performClockAction('in', today);
      } else {
        // Status unknown, check the time to decide
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        chrome.storage.sync.get({
          clockInTime: '09:30',
          clockOutTime: '19:00'
        }, function(settings) {
          const [inHour, inMinute] = settings.clockInTime.split(':').map(Number);
          const [outHour, outMinute] = settings.clockOutTime.split(':').map(Number);
          
          // If it's closer to clock in time, clock in; otherwise clock out
          const isClockInTime = (currentHour === inHour && currentMinute === inMinute);
          const isClockOutTime = (currentHour === outHour && currentMinute === outMinute);
          
          if (isClockInTime) {
            console.log('It\'s clock in time, will clock in');
            performClockAction('in', today);
          } else if (isClockOutTime) {
            console.log('It\'s clock out time, will clock out');
            performClockAction('out', today);
          }
        });
      }
    }
  });
}

// This function will be injected into the page to detect the current clock status
function detectClockStatus() {
  try {
    // Multiple selectors for better reliability
    // 1. Class-based selectors
    const inClassSelector = 'button.btn.btn-x-sm.mx-4.btn-white';
    const outClassSelector = 'button.btn.btn-danger.btn-x-sm';
    
    // 2. Full CSS path selector
    const fullPathSelector = '#preload > xhr-app-root > div > xhr-home > div > home-dashboard > div > div > div > div > div.ng-star-inserted > div > div:nth-child(4) > div:nth-child(6) > home-attendance-clockin-widget > div > div.card-body.clear-padding.d-flex.flex-column.justify-content-between > div > div.h-100.d-flex.align-items-center.ng-star-inserted > div > div.d-flex.align-items-center.ng-star-inserted > div:nth-child(1) > div > button';
    
    // Check for clock in button using class selector (if present, we're clocked out)
    const clockInButton = document.querySelector(inClassSelector);
    if (clockInButton && clockInButton.textContent.trim().toLowerCase().includes('clock in')) {
      console.log('Detected clocked out status using class selector');
      return 'out'; // We're currently clocked out
    }
    
    // Check for clock out button using class selector (if present, we're clocked in)
    const clockOutButton = document.querySelector(outClassSelector);
    if (clockOutButton && clockOutButton.textContent.trim().toLowerCase().includes('clock out')) {
      console.log('Detected clocked in status using class selector');
      return 'in'; // We're currently clocked in
    }
    
    // If class selectors fail, try the full path selector
    const fullPathButton = document.querySelector(fullPathSelector);
    if (fullPathButton) {
      const buttonText = fullPathButton.textContent.trim().toLowerCase();
      if (buttonText.includes('clock in')) {
        console.log('Detected clocked out status using full path selector');
        return 'out'; // We're currently clocked out
      } else if (buttonText.includes('clock out')) {
        console.log('Detected clocked in status using full path selector');
        return 'in'; // We're currently clocked in
      }
    }
    
    // If neither button is found or identifiable
    console.log('Could not detect clock status with any selector');
    return 'unknown';
  } catch (error) {
    console.error('Error detecting clock status:', error);
    return 'error';
  }
}

// Perform the actual clock in/out action
function performClockAction(action, today) {
  // Find the Keka tab or open it if not exists
  chrome.tabs.query({url: 'https://newstreet.keka.com/*'}, function(tabs) {
    if (tabs.length > 0) {
      // Keka is already open, navigate to dashboard if needed
      chrome.tabs.update(tabs[0].id, {
        active: true,
        url: 'https://newstreet.keka.com/#/home/dashboard'
      }, function(tab) {
        // Wait for page to load, then inject the content script
        setTimeout(() => executeClockAction(tab.id, action, today), 5000);
      });
    } else {
      // Open Keka in a new tab
      chrome.tabs.create({
        url: 'https://newstreet.keka.com/#/home/dashboard'
      }, function(tab) {
        // Wait for page to load, then inject the content script
        setTimeout(() => executeClockAction(tab.id, action, today), 10000);
      });
    }
  });
}

// Execute the clock action via content script
function executeClockAction(tabId, action, today) {
  chrome.scripting.executeScript({
    target: {tabId: tabId},
    function: clickClockButton,
    args: [action]
  }, function(results) {
    if (chrome.runtime.lastError) {
      console.error('Error executing script:', chrome.runtime.lastError.message);
      return;
    }
    
    if (results && results[0] && results[0].result) {
      // Update the last clock in/out date
      const updateObj = {};
      if (action === 'in') {
        updateObj.lastClockInDate = today;
      } else {
        updateObj.lastClockOutDate = today;
      }
      
      chrome.storage.sync.set(updateObj, function() {
        console.log(`Successfully clocked ${action} and updated storage`);
      });
    }
  });
}

// This function will be injected into the page to click the clock button
function clickClockButton(action) {
  try {
    // Wait for the attendance widget to be fully loaded
    setTimeout(() => {
      // The selector for the clock in/out button based on action
      const inSelector = 'button.btn.btn-primary.btn-x-sm';
      const outSelector = 'button.btn.btn-danger.btn-x-sm';
      const selector = action === 'in' ? inSelector : outSelector;
      
      const button = document.querySelector(selector);
      
      if (button) {
        // Click the button
        button.click();
        console.log(`Clicked the ${action === 'in' ? 'Clock In' : 'Clock Out'} button`);
        return true;
      } else {
        console.log('Clock button not found');
        return false;
      }
    }, 2000);
  } catch (error) {
    console.error('Error in clickClockButton:', error);
    return false;
  }
  
  return true; // Return true to indicate the script executed
}
