// CareerRadar Background Service Worker (Manifest V3)
// Powered by TypeSafe Jev System One

// Allow users to open the side panel directly by clicking on the action toolbar icon
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.error('Failed to set side panel behavior:', err);
  });
}

// Fallback action click listener to guarantee opening the side panel immediately
chrome.action?.onClicked?.addListener(async (tab) => {
  if (chrome.sidePanel?.open && tab?.windowId) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (err) {
      console.error('Failed to open side panel on click:', err);
    }
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  console.log('🎯 CareerRadar Service Worker installed.');
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
  // H8 fix: cleaned up dead autoScanEnabled and backendUrl storage keys
  await chrome.storage.local.set({
    activePersona: 'custom'
  });
});

// Relay URL changes to content script (catches SPA navigation on LinkedIn, Google Careers, Indeed, etc.)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) {
    const url = (tab.url || changeInfo.url || '').toLowerCase();
    if (
      url.includes('linkedin.com/jobs') ||
      url.includes('google.com/about/careers') ||
      url.includes('careers.google.com') ||
      url.includes('/careers') ||
      url.includes('/jobs') ||
      url.includes('currentjobid=') ||
      url.includes('indeed.com') ||
      url.includes('wellfound.com') ||
      url.includes('greenhouse.io') ||
      url.includes('lever.co') ||
      url.includes('ashbyhq.com') ||
      url.includes('workatastartup.com') ||
      url.includes('myworkdayjobs.com') ||
      url.includes('amazon.jobs') ||
      url.includes('smartrecruiters.com')
    ) {
      chrome.tabs.sendMessage(tabId, { type: 'URL_NAVIGATED', url }).catch(() => {});
    }
  }
});

// Message listener from content script or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'OPEN_SIDE_PANEL') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.windowId) {
          await chrome.sidePanel.open({ windowId: tab.windowId });
          sendResponse({ success: true });
        }
      } catch (err) {
        console.error('Failed to open side panel:', err);
        sendResponse({ success: false, error: String(err) });
      }
    })();
    return true;
  }
});
