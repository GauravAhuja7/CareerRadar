// GhostHunter Popup Script (Manifest V3)

document.addEventListener('DOMContentLoaded', async () => {
  const { activePersona = 'alex' } = await chrome.storage.local.get('activePersona');
  const personaNameEl = document.getElementById('persona-name');
  if (personaNameEl) {
    const names = {
      alex: 'Alex Chen (5.5y)',
      maya: 'Maya Patel (8y)',
      jordan: 'Jordan Lee (1.5y)',
      custom: 'Custom Resume'
    };
    personaNameEl.innerText = names[activePersona] || 'Alex Chen (5.5y)';
  }

  const btnSidepanel = document.getElementById('btn-open-sidepanel');
  btnSidepanel?.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        window.close(); // close popup after opening sidepanel
      }
    } catch (err) {
      console.error('Failed to open sidepanel:', err);
    }
  });
});
