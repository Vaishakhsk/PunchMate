# PunchMate: Keka Attendance Automation

This Chrome extension automatically handles clock in and clock out actions on the Keka dashboard (newstreet.keka.com) based on your schedule.

## Features

- Schedule automatic clock in and clock out times
- Configure which days of the week to activate
- Simple toggle to enable/disable the automation
- Default schedule: Monday-Friday, 9:30 AM to 7:00 PM

## Installation Instructions

1. Download or clone this repository to your computer
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" using the toggle in the top-right corner
4. Click "Load unpacked" and select the folder containing this extension
5. The extension icon should appear in your Chrome toolbar

## Usage

1. Click the extension icon in your Chrome toolbar to open the settings popup
2. Set your desired clock in and clock out times
3. Select which days of the week you want the automation to run
4. Toggle the switch at the top to enable/disable the automation
5. Click "Save Settings" to apply your changes

## How It Works

The extension runs in the background and checks every minute if it's time to clock in or clock out based on your schedule. When it's time, it will:

1. Open the Keka dashboard (if not already open)
2. Find and click the appropriate clock in/out button
3. Record the action to prevent duplicate clock ins/outs on the same day

## Notes

- You must be logged into your Keka account for the extension to work
- The extension requires permission to access the Keka website
- If you're already clocked in/out for the day, the extension won't perform duplicate actions

## Troubleshooting

If the extension isn't working as expected:

1. Make sure you're logged into your Keka account
2. Check that the extension is enabled in the Chrome extensions page
3. Verify your schedule settings in the extension popup
4. If the clock in/out button selector has changed on the Keka website, the extension may need to be updated
