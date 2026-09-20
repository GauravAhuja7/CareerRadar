// CareerRadar Popup Script (Manifest V3)

document.addEventListener('DOMContentLoaded', async () => {
  // Health check to update status badge
  const statusBadge = document.querySelector('.status-badge');
  if (statusBadge) {
    try {
      const res = await fetch('http://localhost:3001/api/health', { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        statusBadge.textContent = 'Online';
        statusBadge.style.background = '#ecfdf5';
        statusBadge.style.color = '#059669';
        statusBadge.style.borderColor = '#a7f3d0';
      } else {
        throw new Error('not ok');
      }
    } catch {
      statusBadge.textContent = 'Offline';
      statusBadge.style.background = '#fef2f2';
      statusBadge.style.color = '#991b1b';
      statusBadge.style.borderColor = '#fecaca';
    }
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
