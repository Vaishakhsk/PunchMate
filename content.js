// This script is injected into the Keka website
console.log("Keka Auto Clock content script loaded");

// Set up global error handler to catch and log any errors
window.addEventListener('error', function(event) {
  console.error('Content script error caught:', event.error || event.message);
  return false;
});

// Report that content script is healthy
chrome.runtime.sendMessage({ action: "contentScriptLoaded" }, function(response) {
  console.log("Content script reported as loaded");
});

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === "clockIn") {
    performClockAction("in");
    sendResponse({ success: true });
    return true;
  } else if (message.action === "clockOut") {
    performClockAction("out");
    sendResponse({ success: true });
    return true;
  }
});

// Function to perform clock in/out action
function performClockAction(action) {
  try {
    // Multiple selectors for better reliability
    // 1. Class-based selectors
    const inClassSelector = "button.btn.btn-x-sm.mx-4.btn-white";
    const outClassSelector = "button.btn.btn-danger.btn-x-sm";
    // 2. Full CSS path selector
    const fullPathSelector =
      "#preload > xhr-app-root > div > xhr-home > div > home-dashboard > div > div > div > div > div.ng-star-inserted > div > div:nth-child(4) > div:nth-child(6) > home-attendance-clockin-widget > div > div.card-body.clear-padding.d-flex.flex-column.justify-content-between > div > div.h-100.d-flex.align-items-center.ng-star-inserted > div > div.d-flex.align-items-center.ng-star-inserted > div:nth-child(1) > div > button";

    // First try the class-based selector
    const classSelector = action === "in" ? inClassSelector : outClassSelector;

    console.log(`Trying to find button using class selector: ${classSelector}`);
    waitForElement(classSelector, 15)
      .then((button) => {
        if (button) {
          // Click the button
          button.click();
          console.log(
            `Clicked the ${
              action === "in" ? "Clock In" : "Clock Out"
            } button using class selector`
          );

          // For clock out, we need to click twice to confirm
          if (action === "out") {
            // Wait for the confirmation button to appear
            setTimeout(() => {
              // Try to find the confirmation button (usually the same button or a confirmation dialog button)
              const confirmSelector = "button.btn.btn-danger";
              waitForElement(confirmSelector, 5)
                .then((confirmButton) => {
                  if (confirmButton) {
                    confirmButton.click();
                    console.log(
                      "Clicked the confirmation button for Clock Out"
                    );
                  } else {
                    // If we can't find a specific confirmation button, try clicking the original button again
                    button.click();
                    console.log(
                      "Clicked the Clock Out button again for confirmation"
                    );
                  }
                })
                .catch((error) => {
                  console.error(
                    "Error waiting for confirmation button:",
                    error
                  );
                  // Fallback: just click the original button again
                  button.click();
                  console.log(
                    "Fallback: Clicked the Clock Out button again for confirmation"
                  );
                });
            }, 1000); // Wait 1 second for the confirmation dialog to appear
          }
        } else {
          // If class selector fails, try the full path selector
          console.log("Class selector failed, trying full path selector");
          waitForElement(fullPathSelector, 15)
            .then((pathButton) => {
              if (pathButton) {
                // Check if the button text matches the desired action
                const buttonText = pathButton.textContent.trim().toLowerCase();
                if (
                  (action === "in" && buttonText.includes("clock in")) ||
                  (action === "out" && buttonText.includes("clock out"))
                ) {
                  pathButton.click();
                  console.log(
                    `Clicked the ${
                      action === "in" ? "Clock In" : "Clock Out"
                    } button using full path selector`
                  );

                  // For clock out, we need to click twice to confirm
                  if (action === "out") {
                    // Wait for the confirmation button to appear
                    setTimeout(() => {
                      // Try to find the confirmation button
                      const confirmSelector = "button.btn.btn-danger";
                      waitForElement(confirmSelector, 5)
                        .then((confirmButton) => {
                          if (confirmButton) {
                            confirmButton.click();
                            console.log(
                              "Clicked the confirmation button for Clock Out"
                            );
                          } else {
                            // If we can't find a specific confirmation button, try clicking the original button again
                            pathButton.click();
                            console.log(
                              "Clicked the Clock Out button again for confirmation"
                            );
                          }
                        })
                        .catch((error) => {
                          console.error(
                            "Error waiting for confirmation button:",
                            error
                          );
                          // Fallback: just click the original button again
                          pathButton.click();
                          console.log(
                            "Fallback: Clicked the Clock Out button again for confirmation"
                          );
                        });
                    }, 1000); // Wait 1 second for the confirmation dialog to appear
                  }
                } else {
                  console.log(
                    `Button found but text doesn't match expected action: ${buttonText}`
                  );
                }
              } else {
                console.log(
                  "Clock button not found with any selector after waiting"
                );
              }
            })
            .catch((error) => {
              console.error(
                "Error waiting for button with full path selector:",
                error
              );
            });
        }
      })
      .catch((error) => {
        console.error("Error waiting for button with class selector:", error);
      });
  } catch (error) {
    console.error("Error in performClockAction:", error);
  }
}

// Helper function to wait for an element to be available
function waitForElement(selector, timeoutInSeconds = 10) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Set timeout
    setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector)); // Resolve with null if not found
    }, timeoutInSeconds * 1000);
  });
}

// Check if we're on the dashboard page
if (
  window.location.href.includes("newstreet.keka.com") &&
  window.location.href.includes("/home/dashboard")
) {
  console.log("On Keka dashboard, ready to interact with clock buttons");
}
