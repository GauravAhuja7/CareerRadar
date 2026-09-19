// CareerRadar Content Script (LinkedIn, Indeed, Wellfound, YC, Greenhouse, Lever, Ashby)
// Powered by TypeSafe Jev System One
console.log('🎯 CareerRadar Active — Ambient Real-Time Job Decision Engine.');

const BACKEND_URL = 'http://localhost:3001';
const scannedCards = new WeakSet();
let lastScannedJobId = null;
let scanDebounceTimer = null;
let lastKnownUrl = window.location.href;
let currentInflightController = null;
let currentEvaluationTimer = null;

// Platform Detection
const host = window.location.hostname;
const isLinkedIn = host.includes('linkedin.com');
const isIndeed = host.includes('indeed.com');
const isWellfound = host.includes('wellfound.com') || host.includes('angel.co');
const isYC = host.includes('workatastartup.com');

// Helper: Extract unique Job ID from URL or DOM
function getActiveJobIdFromPage() {
  try {
    const url = window.location.href;
    if (isLinkedIn) {
      const matchParam = url.match(/[?&]currentJobId=(\d+)/);
      if (matchParam) return matchParam[1];
      const matchPath = url.match(/\/jobs\/view\/(\d+)/);
      if (matchPath) return matchPath[1];
      const activeCard = document.querySelector('.jobs-search-results-list__list-item--active, .job-card-container--clickable');
      const cardId = activeCard?.getAttribute('data-job-id') || activeCard?.getAttribute('data-occludable-job-id');
      if (cardId) return cardId;
    } else if (isIndeed) {
      const matchJk = url.match(/[?&]vjk=([a-zA-Z0-9]+)/);
      if (matchJk) return matchJk[1];
    }
    return null;
  } catch {
    return null;
  }
}

// Safe Chrome Extensions API wrappers to prevent "Extension context invalidated" errors
function isExtensionContextValid() {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  } catch {
    return false;
  }
}

function safeStorageSet(data) {
  try {
    if (isExtensionContextValid() && chrome.storage?.local) {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime?.lastError) { /* ignore */ }
      });
    }
  } catch {
    // Ignore context error
  }
}

function safeSendMessage(message) {
  try {
    if (isExtensionContextValid()) {
      chrome.runtime.sendMessage(message, () => {
        if (chrome.runtime?.lastError) { /* ignore */ }
      });
    }
  } catch {
    // Ignore context error
  }
}

// Retrieve Active Persona & Custom Resume from Storage
async function getActiveCandidate() {
  try {
    if (isExtensionContextValid() && chrome.storage?.local) {
      const stored = await chrome.storage.local.get(['activePersona', 'customResume']);
      return {
        activePersona: stored.activePersona || 'custom',
        customResume: stored.customResume || null
      };
    }
  } catch {
    // Ignore error
  }
  return { activePersona: 'custom', customResume: null };
}

// ── Smart Job Description Extractor ──
function extractFullJobDescription() {
  const detailPane = document.querySelector(
    '.jobs-search__job-details, .scaffold-layout__detail, .job-view-layout, .jobs-details, [data-view-name="job-details-component"], .jobsearch-JobComponent, main, article'
  );

  const descEl = (detailPane || document).querySelector(
    '#job-details, .jobs-description__content, .jobs-description-content__text, [data-view-name="job-details-component"], .jobs-box__html-content, article.jobs-description__container, article, #jobDescriptionText, .styles_description__, [data-qa="job-description"], .job-description'
  );

  const directText = descEl?.innerText?.trim();
  if (directText && directText.length > 80) {
    return directText;
  }

  // Look ONLY within detailPane for "About the job" headers to avoid scraping the top search bar or left rail
  const containerText = detailPane?.innerText || '';
  const markerHeaders = [
    'About the job',
    'About the role',
    'Job description',
    'Role Overview',
    'What you\'ll do',
    'What You\'ll Do',
    'Responsibilities',
    'Our Ideal Candidate',
    'What we\'re looking for',
    'Qualifications',
    'Requirements'
  ];

  for (const h of markerHeaders) {
    const idx = containerText.indexOf(h);
    if (idx !== -1) {
      return containerText.slice(idx, idx + 6000);
    }
  }

  if (containerText && containerText.length > 100) {
    return containerText.slice(0, 6000);
  }

  return document.body?.innerText?.slice(1000, 7000) || '';
}

// ── In-Feed Card Extractor ──
function extractJobInfo(card) {
  let title = '';
  let company = '';
  let location = '';

  if (isLinkedIn) {
    const titleEl = card.querySelector(
      '.job-card-list__title--link, .job-card-list__title, .artdeco-entity-lockup__title, a.job-card-container__link, strong, h3, a[href*="/jobs/view/"]'
    );
    const compEl = card.querySelector(
      '.job-card-container__primary-description, .artdeco-entity-lockup__subtitle, .job-card-container__company-name'
    );
    const locEl = card.querySelector(
      '.job-card-container__metadata-item, .artdeco-entity-lockup__caption'
    );
    title = titleEl?.innerText?.trim() || '';
    company = compEl?.innerText?.trim() || '';
    location = locEl?.innerText?.trim() || '';
  } else if (isIndeed) {
    const titleEl = card.querySelector('h2.jobTitle, a[data-jk]');
    const compEl = card.querySelector('[data-testid="company-name"], .companyName');
    const locEl = card.querySelector('[data-testid="text-location"], .companyLocation');
    title = titleEl?.innerText?.trim() || '';
    company = compEl?.innerText?.trim() || '';
    location = locEl?.innerText?.trim() || '';
  } else if (isWellfound) {
    const titleEl = card.querySelector('h2, [data-test="JobTitle"], .styles_title__');
    const compEl = card.querySelector('h1, [data-test="StartupName"], .styles_header__');
    title = titleEl?.innerText?.trim() || '';
    company = compEl?.innerText?.trim() || '';
  } else if (isYC) {
    const titleEl = card.querySelector('.job-name, .role-title');
    const compEl = card.querySelector('.company-name, h2');
    title = titleEl?.innerText?.trim() || '';
    company = compEl?.innerText?.trim() || '';
  }

  return { title, company, location };
}



// ── Floating Corner Pill for Continuous Visibility ──
function renderFloatingPill(data, verdictTitle, verdictColor, reqExp, candExp) {
  let pill = document.getElementById('careerradar-floating-pill');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'careerradar-floating-pill';
    pill.style.cssText = `
      position: fixed;
      top: 64px;
      right: 20px;
      z-index: 99999999;
      background: #09090b;
      color: #fafafa;
      border: 1px solid #27272a;
      border-radius: 9999px;
      padding: 6px 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      cursor: pointer;
      transition: transform 0.15s ease, opacity 0.15s ease;
    `;
    pill.title = 'Click to view CareerRadar breakdown';
    pill.addEventListener('click', () => {
      const banner = document.getElementById('careerradar-onscreen-banner');
      if (banner) {
        banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    document.body.appendChild(pill);
  }

  pill.innerHTML = `
    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${verdictColor};"></span>
    <span style="font-weight:700; font-family:ui-monospace, monospace; letter-spacing:0.02em;">${verdictTitle}</span>
    <span style="color:#a1a1aa;">|</span>
    <span style="color:#d4d4d8;">${data.matchPercentage || 80}% Fit</span>
    <span style="color:#71717a; font-family:ui-monospace, monospace; font-size:10px;">(${reqExp} req vs ${candExp})</span>
  `;
}

// ── Floating Pill Loading State ──
function renderFloatingPillLoading(title = '') {
  let pill = document.getElementById('careerradar-floating-pill');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'careerradar-floating-pill';
    pill.style.cssText = `
      position: fixed;
      top: 64px;
      right: 20px;
      z-index: 99999999;
      background: #09090b;
      color: #fafafa;
      border: 1px solid #27272a;
      border-radius: 9999px;
      padding: 6px 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      cursor: pointer;
      transition: transform 0.15s ease, opacity 0.15s ease;
    `;
    document.body.appendChild(pill);
  }

  pill.innerHTML = `
    <span class="careerradar-spin" style="font-size:12px; color:#a1a1aa;">⬡</span>
    <span style="font-weight:600; font-family:ui-monospace, monospace; font-size:11px; color:#d4d4d8;">
      Arbitrating ${title ? title.slice(0, 22) : 'Fit'}...
    </span>
  `;
}

// ── Apollo / SignalHire Sticky Edge Dock & In-Page Drawer ──
function injectApolloDockAndDrawer() {
  if (document.getElementById('careerradar-dock-tab')) return;

  // 1. Sticky Edge Dock Tab
  const dock = document.createElement('div');
  dock.id = 'careerradar-dock-tab';
  dock.title = 'Click to open CareerRadar Analysis';
  dock.innerHTML = `
    <span class="dock-icon">⬡</span>
    <span class="dock-label">CareerRadar</span>
    <span id="dock-status-badge" class="dock-badge">Live</span>
  `;
  document.body.appendChild(dock);

  // 2. In-Page Slide-Out Drawer
  const drawer = document.createElement('div');
  drawer.id = 'careerradar-inpage-drawer';
  drawer.innerHTML = `
    <div class="cr-header">
      <div class="cr-brand">
        <span class="cr-brand-logo">⬡</span>
        <span class="cr-brand-title">CareerRadar</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <button id="drawer-btn-chrome-sp" class="cr-btn-ghost" style="font-size:10px; padding:3px 6px;" title="Open in native Chrome Side Panel">
          Dock ↗
        </button>
        <button id="drawer-btn-close" class="cr-close-btn" title="Close Panel">✕</button>
      </div>
    </div>

    <!-- Active Job Detected Bar -->
    <div class="cr-card cr-card-compact">
      <div class="cr-job-active-bar">
        <div>
          <div id="drawer-job-title" class="cr-job-title">Detecting active job page...</div>
          <div id="drawer-job-company" class="cr-job-meta">Reading browser context...</div>
        </div>
      </div>
    </div>

    <!-- Candidate Profile Collapsible Bar -->
    <div class="cr-card cr-card-compact" style="margin-bottom:12px;">
      <div id="drawer-profile-header" class="cr-profile-bar">
        <div class="cr-profile-info">
          <div class="cr-profile-avatar">👨‍💻</div>
          <div>
            <div id="drawer-profile-name" class="cr-profile-name">My Resume Profile</div>
            <div id="drawer-profile-sub" class="cr-profile-meta">Click to calibrate profile</div>
          </div>
        </div>
        <button id="drawer-btn-toggle-profile" class="cr-btn-ghost" style="padding:3px 8px; font-size:11px;">
          <span id="drawer-profile-chevron">Edit ▾</span>
        </button>
      </div>

      <div id="drawer-profile-content" style="display:none; margin-top:10px; padding-top:10px; border-top:1px solid #f4f4f5;">
        <div style="margin-bottom:8px;">
          <label for="drawer-resume-input" class="cr-btn-ghost" style="display:block; text-align:center; padding:7px 10px; cursor:pointer; border:1px dashed #d4d4d8; border-radius:6px;">
            📁 Upload Resume (PDF / TXT)
          </label>
          <input type="file" id="drawer-resume-input" accept=".pdf,.txt,.md" style="display:none;" />
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
          <label style="font-size:11px; color:#52525b;">Exp Years:</label>
          <input type="number" id="drawer-years" step="0.5" min="0" max="20" style="width:50px; padding:2px 4px; font-size:11px; border:1px solid #d4d4d8; border-radius:4px; font-family:ui-monospace, monospace;" />
        </div>
        <div style="display:flex; gap:6px; margin-top:8px;">
          <button id="drawer-btn-save-profile" class="btn btn-primary" style="flex:1; padding:6px 10px; font-size:11px; background:#09090b; color:#fff; border-radius:6px; border:none; cursor:pointer;">Save Profile</button>
          <button id="drawer-btn-hide-profile" class="cr-btn-ghost" style="padding:6px 10px; font-size:11px;">Done ▴</button>
        </div>
      </div>
    </div>

    <!-- Live Drawer Verdict Container -->
    <div id="drawer-verdict-container">
      <div id="drawer-skeleton" style="display:none;" class="cr-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="careerradar-spin">⬡</span>
            <strong style="font-size:11px; font-family:ui-monospace, monospace; text-transform:uppercase;">Arbitrating Fit...</strong>
          </div>
        </div>
        <div class="careerradar-skeleton-shimmer" style="width:100%; height:32px; border-radius:6px; margin-bottom:10px;"></div>
        <div class="careerradar-skeleton-shimmer" style="width:100%; height:48px; border-radius:6px; margin-bottom:10px;"></div>
        <div class="cr-metrics-grid">
          <div class="cr-metric-tile"><div class="careerradar-skeleton-shimmer" style="width:70%; height:14px; margin:0 auto;"></div></div>
          <div class="cr-metric-tile"><div class="careerradar-skeleton-shimmer" style="width:70%; height:14px; margin:0 auto;"></div></div>
          <div class="cr-metric-tile"><div class="careerradar-skeleton-shimmer" style="width:70%; height:14px; margin:0 auto;"></div></div>
        </div>
      </div>

      <div id="drawer-verdict-card" class="cr-card" style="display:none;">
        <div id="drawer-hero-badge" class="cr-verdict-hero cr-verdict-hero-reach-apply">
          <div style="display:flex; align-items:center;">
            <span id="drawer-hero-dot" class="cr-verdict-dot cr-verdict-dot-reach-apply"></span>
            <span id="drawer-hero-title">REACH APPLY · COMPETITIVE CONTENDER</span>
          </div>
          <div id="drawer-hero-telemetry" class="cr-verdict-telemetry">⚡ 320ms</div>
        </div>

        <div class="cr-summary-box">
          <div id="drawer-summary-text">Analyzing job context...</div>
        </div>

        <div class="cr-metrics-grid">
          <div class="cr-metric-tile">
            <div class="cr-metric-label">Fit Score</div>
            <div id="drawer-viability-val" class="cr-metric-val">--</div>
            <div class="cr-metric-track">
              <div id="drawer-viability-bar" class="cr-metric-fill" style="width:0%; background:#09090b;"></div>
            </div>
          </div>
          <div class="cr-metric-tile">
            <div class="cr-metric-label">Systems Synergy</div>
            <div id="drawer-suitability-val" class="cr-metric-val">--</div>
            <div class="cr-metric-track">
              <div id="drawer-suitability-bar" class="cr-metric-fill" style="width:0%; background:#10b981;"></div>
            </div>
          </div>
          <div class="cr-metric-tile">
            <div class="cr-metric-label">Screen Odds</div>
            <div id="drawer-odds-val" class="cr-metric-val">--</div>
            <div class="cr-metric-track">
              <div id="drawer-odds-bar" class="cr-metric-fill" style="width:0%; background:#10b981;"></div>
            </div>
          </div>
        </div>

        <div class="cr-calib-strip">
          <div class="cr-calib-side">
            <span class="cr-calib-lbl">Role Requirement</span>
            <strong id="drawer-calib-role" class="cr-calib-val">--</strong>
          </div>
          <div class="cr-calib-divider">vs</div>
          <div class="cr-calib-side" style="text-align:right;">
            <span class="cr-calib-lbl">Your Profile</span>
            <strong id="drawer-calib-cand" class="cr-calib-val">--</strong>
          </div>
        </div>
        <div id="drawer-calib-note" class="cr-calib-note" style="display:none;"></div>

        <div style="margin-top:10px;">
          <div style="font-size:11px; font-weight:600; color:#15803d; margin-bottom:4px;">
            ✓ Matched Systems Deliverables:
          </div>
          <div id="drawer-matched-chips" class="cr-chips-container"></div>
        </div>

        <div id="drawer-nuance-section" style="margin-top:10px; display:none;">
          <div style="font-size:11px; font-weight:600; color:#b45309; margin-bottom:4px;">
            ⚠ Domain Focus & Nuance:
          </div>
          <div id="drawer-nuance-chips" class="cr-chips-container"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(drawer);

  // Event handlers
  dock.addEventListener('click', () => {
    drawer.classList.toggle('open');
  });

  drawer.querySelector('#drawer-btn-close')?.addEventListener('click', () => {
    drawer.classList.remove('open');
  });

  drawer.querySelector('#drawer-btn-chrome-sp')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }).catch(() => {});
  });

  const pContent = drawer.querySelector('#drawer-profile-content');
  const pChevron = drawer.querySelector('#drawer-profile-chevron');
  const toggleDrawerP = (open = null) => {
    const isO = pContent.style.display !== 'none';
    const next = open !== null ? open : !isO;
    pContent.style.display = next ? 'block' : 'none';
    if (pChevron) pChevron.innerText = next ? 'Done ▴' : 'Edit ▾';
  };

  drawer.querySelector('#drawer-profile-header')?.addEventListener('click', () => toggleDrawerP());
  drawer.querySelector('#drawer-btn-toggle-profile')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDrawerP();
  });
  drawer.querySelector('#drawer-btn-hide-profile')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDrawerP(false);
  });

  // Populate candidate profile info in drawer
  chrome.storage.local.get(['customMetadata', 'customResume']).then(({ customMetadata, customResume }) => {
    const nameEl = drawer.querySelector('#drawer-profile-name');
    const subEl = drawer.querySelector('#drawer-profile-sub');
    const yearsInput = drawer.querySelector('#drawer-years');
    if (customMetadata && customResume) {
      if (nameEl) nameEl.innerText = customResume.name || 'Gaurav · IIT Mandi';
      const expStr = customMetadata.calculatedYears ? `${customMetadata.calculatedYears} yrs` : '1.5 yrs';
      if (subEl) subEl.innerText = `${expStr} · ${customMetadata.roles?.[0] || 'Backend & Systems'}`;
      if (yearsInput) yearsInput.value = customMetadata.calculatedYears || 1.5;
    }
  }).catch(() => {});

  // Drawer file upload handler
  drawer.querySelector('#drawer-resume-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('resume', file);
    try {
      const res = await fetch(`${BACKEND_URL}/api/upload-resume`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.candidate) {
        await chrome.storage.local.set({
          customResume: data.candidate,
          customResumeText: data.rawText || '',
          customMetadata: data.metadata || {},
          activePersona: 'custom'
        });
        toggleDrawerP(false);
        triggerAutoEvaluation(true);
      }
    } catch {}
  });

  drawer.querySelector('#drawer-btn-save-profile')?.addEventListener('click', async () => {
    const yearsInput = drawer.querySelector('#drawer-years');
    const years = yearsInput?.value ? Number(yearsInput.value) : undefined;
    const { customResumeText } = await chrome.storage.local.get('customResumeText');
    if (customResumeText) {
      const res = await fetch(`${BACKEND_URL}/api/parse-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: customResumeText, years })
      });
      const d = await res.json();
      if (d.candidate) {
        await chrome.storage.local.set({
          customResume: d.candidate,
          customMetadata: d.metadata || {},
          activePersona: 'custom'
        });
        toggleDrawerP(false);
        triggerAutoEvaluation(true);
      }
    }
  });
}

// ── Instant Loading State (Zero False Screens) ──
function showImmediateLoadingState(title = '', company = '', jobId = null) {
  // Ensure Apollo dock exists
  injectApolloDockAndDrawer();

  const detailPane = document.querySelector(
    '.jobs-search__job-details, .scaffold-layout__detail, .job-view-layout, .jobs-details, [data-view-name="job-details-component"], .jobsearch-JobComponent, main, article'
  ) || document.body;

  let banner = document.getElementById('careerradar-onscreen-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'careerradar-onscreen-banner';
    const topTarget = detailPane.querySelector(
      '.job-details-jobs-unified-top-card__content--two-pane, .jobs-unified-top-card__content--two-pane, .job-details-jobs-unified-top-card, .jobs-unified-top-card, .jobs-details__top-card, .jobsearch-JobInfoHeader-title, h1'
    ) || detailPane.firstElementChild;
    if (topTarget) {
      topTarget.insertAdjacentElement('afterend', banner);
    } else {
      detailPane.prepend(banner);
    }
  }

  banner.className = 'careerradar-banner-loading cr-card';
  banner.style.cssText = `
    margin: 12px 0 16px 0;
    padding: 14px 16px;
    background: #ffffff;
    border: 1px solid #e4e4e7;
    border-radius: 10px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.05);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #09090b;
    z-index: 999999;
  `;

  const displayTitle = title ? title.slice(0, 36) : 'Job Opening';
  banner.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #f4f4f5;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="careerradar-spin" style="font-size:14px; color:#09090b;">⬡</span>
        <strong style="font-size:11px; font-family:ui-monospace, monospace; text-transform:uppercase; letter-spacing:0.04em; color:#09090b;">
          Arbitrating Fit (${displayTitle})...
        </strong>
      </div>
      <span class="cr-badge-live">⚡ Jev System One</span>
    </div>
    <div style="display:flex; gap:10px; margin-bottom:12px;">
      <div class="careerradar-skeleton-shimmer" style="width:140px; height:24px;"></div>
      <div class="careerradar-skeleton-shimmer" style="width:90px; height:24px;"></div>
    </div>
    <div class="cr-metrics-grid" style="margin-bottom:12px;">
      <div class="cr-metric-tile"><div class="careerradar-skeleton-shimmer" style="width:60%; height:12px; margin:0 auto;"></div></div>
      <div class="cr-metric-tile"><div class="careerradar-skeleton-shimmer" style="width:60%; height:12px; margin:0 auto;"></div></div>
      <div class="cr-metric-tile"><div class="careerradar-skeleton-shimmer" style="width:60%; height:12px; margin:0 auto;"></div></div>
    </div>
    <div class="careerradar-skeleton-shimmer" style="width:80%; height:12px; margin-bottom:6px;"></div>
    <div class="careerradar-skeleton-shimmer" style="width:60%; height:12px;"></div>
  `;

  // Update floating corner pill
  renderFloatingPillLoading(title);

  // Update in-page drawer
  const dSkel = document.getElementById('drawer-skeleton');
  const dCard = document.getElementById('drawer-verdict-card');
  const dTitle = document.getElementById('drawer-job-title');
  const dComp = document.getElementById('drawer-job-company');
  const dockBadge = document.getElementById('dock-status-badge');
  if (dSkel) dSkel.style.display = 'block';
  if (dCard) dCard.style.display = 'none';
  if (dTitle) dTitle.innerText = title || 'Job Opening';
  if (dComp) dComp.innerText = company || 'Evaluating fit...';
  if (dockBadge) dockBadge.innerText = '...';

  // Notify side panel & storage defensively
  safeStorageSet({
    activeJobEvaluating: { title, company, jobId, timestamp: Date.now() }
  });
  safeSendMessage({
    type: 'JOB_EVALUATING',
    title,
    company,
    jobId
  });
}

// ── Smart Detail Pane Watcher ──
function waitForDetailPaneAndEvaluate(targetJobId, targetTitle, targetCompany) {
  if (currentEvaluationTimer) clearInterval(currentEvaluationTimer);
  lastScannedJobId = targetJobId; // Lock immediately to prevent re-triggering loop!

  let attempts = 0;
  const maxAttempts = 10; // 10 * 100ms = 1s max wait

  currentEvaluationTimer = setInterval(() => {
    attempts++;
    const currentJobId = getActiveJobIdFromPage();
    const detailPane = document.querySelector(
      '.jobs-search__job-details, .scaffold-layout__detail, .job-view-layout, .jobs-details, [data-view-name="job-details-component"], .jobsearch-JobComponent, main, article'
    );
    const paneTitle = detailPane?.querySelector(
      '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1.t-24, .jobs-details__top-card h1, h1'
    )?.innerText?.trim() || '';
    const desc = extractFullJobDescription();

    const titleMatches = targetTitle && paneTitle && (
      paneTitle.toLowerCase().includes(targetTitle.toLowerCase().slice(0, 10)) ||
      targetTitle.toLowerCase().includes(paneTitle.toLowerCase().slice(0, 10))
    );
    const idMatches = targetJobId && currentJobId === targetJobId;
    const hasSubstantialContent = desc && desc.length > 80;

    if ((idMatches || titleMatches || attempts >= 3) && hasSubstantialContent) {
      clearInterval(currentEvaluationTimer);
      currentEvaluationTimer = null;
      updateActiveJobBanner(true, targetJobId || currentJobId, paneTitle || targetTitle, targetCompany);
    } else if (attempts >= maxAttempts) {
      clearInterval(currentEvaluationTimer);
      currentEvaluationTimer = null;
      updateActiveJobBanner(true, targetJobId || currentJobId, paneTitle || targetTitle, targetCompany);
    }
  }, 100);
}

// ── Render Evaluated Verdict Banner ──
function renderVerdictBanner(data, title, company, location, description, jobId) {
  const isCanApply = data.verdict === 'can_apply';
  const isReach = data.verdict === 'reach_apply';

  let heroClass = 'cr-verdict-hero-mismatch';
  let dotClass = 'cr-verdict-dot-mismatch';
  let verdictTitle = 'EXPERIENCE / TENURE GAP';
  let dockLabel = 'Mismatch';

  if (isCanApply) {
    heroClass = 'cr-verdict-hero-can-apply';
    dotClass = 'cr-verdict-dot-can-apply';
    verdictTitle = 'HIGH FIT · CAN APPLY';
    dockLabel = `${data.matchPercentage || 85}% Fit`;
  } else if (isReach) {
    heroClass = 'cr-verdict-hero-reach-apply';
    dotClass = 'cr-verdict-dot-reach-apply';
    verdictTitle = 'COMPETITIVE CONTENDER · REACH APPLY';
    dockLabel = `Reach (${data.matchPercentage || 75}%)`;
  }

  const matched = data.subagentSignals?.matchedDeliverables || [];
  const gaps = data.subagentSignals?.domainGaps || [];
  const reqExp = data.subagentSignals?.requiredExp || '1–3 years';
  const candExp = data.subagentSignals?.candidateExp || '1.5 Years';
  const summaryVerdict = data.subagentSignals?.summaryVerdict || '';

  // 1. Update On-Screen Banner
  const banner = document.getElementById('careerradar-onscreen-banner');
  if (banner) {
    banner.className = 'careerradar-banner-verdict cr-card';
    banner.innerHTML = `
      <!-- Hero Recommendation Banner -->
      <div class="cr-verdict-hero ${heroClass}">
        <div style="display:flex; align-items:center;">
          <span class="cr-verdict-dot ${dotClass}"></span>
          <span>${verdictTitle}</span>
        </div>
        <div class="cr-verdict-telemetry">⚡ ${data.ms}ms · ${Math.round((data.verdictConfidence || 0.9) * 100)}% Conf</div>
      </div>

      <!-- Executive Summary Box -->
      <div class="cr-summary-box">
        <div>${summaryVerdict}</div>
      </div>

      <!-- 3-Tile Metrics Dashboard -->
      <div class="cr-metrics-grid">
        <div class="cr-metric-tile">
          <div class="cr-metric-label">Architecture Fit</div>
          <div class="cr-metric-val">${data.matchPercentage || 75}%</div>
          <div class="cr-metric-track">
            <div class="cr-metric-fill" style="width:${data.matchPercentage || 75}%; background:${(data.matchPercentage || 75) >= 70 ? '#10b981' : ((data.matchPercentage || 75) >= 40 ? '#f59e0b' : '#f43f5e')};"></div>
          </div>
        </div>
        <div class="cr-metric-tile">
          <div class="cr-metric-label">Systems Synergy</div>
          <div class="cr-metric-val">${(data.techScore || 3.0).toFixed(1)}<span style="font-size:11px; font-weight:normal; color:#71717a;">/4</span></div>
          <div class="cr-metric-track">
            <div class="cr-metric-fill" style="width:${Math.min(100, ((data.techScore || 3.0) / 4) * 100)}%; background:#10b981;"></div>
          </div>
        </div>
        <div class="cr-metric-tile">
          <div class="cr-metric-label">Screen Odds</div>
          <div class="cr-metric-val">${Math.round((data.interviewOdds || 0.7) * 100)}%</div>
          <div class="cr-metric-track">
            <div class="cr-metric-fill" style="width:${Math.round((data.interviewOdds || 0.7) * 100)}%; background:#10b981;"></div>
          </div>
        </div>
      </div>

      <!-- Experience Calibration Strip -->
      <div class="cr-calib-strip">
        <div class="cr-calib-side">
          <span class="cr-calib-lbl">Role Requirement</span>
          <strong class="cr-calib-val">${reqExp}</strong>
        </div>
        <div class="cr-calib-divider">vs</div>
        <div class="cr-calib-side" style="text-align:right;">
          <span class="cr-calib-lbl">Your Profile</span>
          <strong class="cr-calib-val">${candExp}</strong>
        </div>
      </div>
      ${isReach ? '<div class="cr-calib-note">(Manageable stretch — tenure gap bridged by high-throughput Kafka & AWS infrastructure)</div>' : ''}

      <!-- Matched Deliverables Chips -->
      <div style="margin-top:10px;">
        <div style="font-size:11px; font-weight:600; color:#15803d; margin-bottom:4px;">
          ✓ Matched Systems Deliverables:
        </div>
        <div class="cr-chips-container">
          ${matched.length ? matched.map(m => `<span class="cr-chip-green">✓ ${m}</span>`).join('') : '<span style="font-size:11px; color:#71717a;">General software overlap</span>'}
        </div>
      </div>

      <!-- Domain Nuances -->
      ${gaps.length ? `
        <div style="margin-top:10px;">
          <div style="font-size:11px; font-weight:600; color:#b45309; margin-bottom:4px;">
            ⚠ Domain Focus & Nuance:
          </div>
          <div class="cr-chips-container">
            ${gaps.map(g => `<span class="cr-chip-amber">⚠ ${g}</span>`).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  // 2. Update Floating HUD Pill
  const verdictPillColor = isCanApply ? '#10b981' : (isReach ? '#f59e0b' : '#f43f5e');
  renderFloatingPill(data, verdictTitle, verdictPillColor, reqExp, candExp);

  // 3. Update In-Page Slide Drawer
  const dSkel = document.getElementById('drawer-skeleton');
  const dCard = document.getElementById('drawer-verdict-card');
  const dTitle = document.getElementById('drawer-job-title');
  const dComp = document.getElementById('drawer-job-company');
  const dBadge = document.getElementById('drawer-hero-badge');
  const dDot = document.getElementById('drawer-hero-dot');
  const dHdr = document.getElementById('drawer-hero-title');
  const dTelem = document.getElementById('drawer-hero-telemetry');
  const dSumm = document.getElementById('drawer-summary-text');
  const dockBadge = document.getElementById('dock-status-badge');

  if (dSkel) dSkel.style.display = 'none';
  if (dCard) dCard.style.display = 'block';
  if (dTitle) dTitle.innerText = title || 'Job Opening';
  if (dComp) dComp.innerText = company || 'Evaluated Job';
  if (dockBadge) dockBadge.innerText = dockLabel;

  if (dBadge) dBadge.className = `cr-verdict-hero ${heroClass}`;
  if (dDot) dDot.className = `cr-verdict-dot ${dotClass}`;
  if (dHdr) dHdr.innerText = verdictTitle;
  if (dTelem) dTelem.innerText = `⚡ ${data.ms}ms · ${Math.round((data.verdictConfidence || 0.9) * 100)}% Conf`;
  if (dSumm) dSumm.innerText = summaryVerdict;

  const dViabVal = document.getElementById('drawer-viability-val');
  const dViabBar = document.getElementById('drawer-viability-bar');
  const dSuitVal = document.getElementById('drawer-suitability-val');
  const dSuitBar = document.getElementById('drawer-suitability-bar');
  const dOddsVal = document.getElementById('drawer-odds-val');
  const dOddsBar = document.getElementById('drawer-odds-bar');

  if (dViabVal) dViabVal.innerText = `${data.matchPercentage || 75}%`;
  if (dViabBar) dViabBar.style.width = `${data.matchPercentage || 75}%`;
  if (dSuitVal) dSuitVal.innerHTML = `${(data.techScore || 3.0).toFixed(1)}<span style="font-size:11px; font-weight:normal; color:#71717a;">/4</span>`;
  if (dSuitBar) dSuitBar.style.width = `${Math.min(100, ((data.techScore || 3.0) / 4) * 100)}%`;
  if (dOddsVal) dOddsVal.innerText = `${Math.round((data.interviewOdds || 0.7) * 100)}%`;
  if (dOddsBar) dOddsBar.style.width = `${Math.round((data.interviewOdds || 0.7) * 100)}%`;

  const dRoleReq = document.getElementById('drawer-calib-role');
  const dCandExp = document.getElementById('drawer-calib-cand');
  const dCalibNote = document.getElementById('drawer-calib-note');
  if (dRoleReq) dRoleReq.innerText = reqExp;
  if (dCandExp) dCandExp.innerText = candExp;
  if (dCalibNote) {
    if (isReach) {
      dCalibNote.style.display = 'block';
      dCalibNote.innerText = '(Manageable stretch — tenure gap bridged by high-throughput Kafka & AWS infrastructure)';
    } else {
      dCalibNote.style.display = 'none';
    }
  }

  const dMatched = document.getElementById('drawer-matched-chips');
  if (dMatched) {
    dMatched.innerHTML = matched.length
      ? matched.map(m => `<span class="cr-chip-green">✓ ${m}</span>`).join('')
      : '<span style="font-size:11px; color:#71717a;">General software engineering overlap</span>';
  }

  const dNuanceSec = document.getElementById('drawer-nuance-section');
  const dNuanceChips = document.getElementById('drawer-nuance-chips');
  if (dNuanceSec && dNuanceChips) {
    if (gaps.length) {
      dNuanceSec.style.display = 'block';
      dNuanceChips.innerHTML = gaps.map(g => `<span class="cr-chip-amber">⚠ ${g}</span>`).join('');
    } else {
      dNuanceSec.style.display = 'none';
    }
  }

  // 4. Save to shared storage so Side Panel receives it 100% reliably
  const evalPayload = {
    data,
    scraped: { title, company, location, description, jobId },
    timestamp: Date.now()
  };
  safeStorageSet({
    activeJobEvaluation: evalPayload,
    activeJobEvaluating: null
  });

  // Broadcast to side panel
  safeSendMessage({
    type: 'JOB_EVALUATED_AUTOMATICALLY',
    ...evalPayload
  });
}

// ── Prominent TypeSafe On-Screen Banner on Active Job View ──
async function updateActiveJobBanner(force = false, hintJobId = null, hintTitle = null, hintCompany = null) {
  let title = hintTitle || '';
  let company = hintCompany || '';
  let location = '';

  if (!title || !company) {
    if (isLinkedIn) {
      title = title || document.querySelector(
        '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1.t-24, .jobs-details__top-card h1, h1'
      )?.innerText?.trim() || '';

      company = company || document.querySelector(
        '.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, a.ember-view.t-black--light, .job-card-container__primary-description, .job-details-jobs-unified-top-card a[href*="/company/"]'
      )?.innerText?.trim() || '';

      location = document.querySelector(
        '.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet, .jobs-unified-top-card__workplace-type'
      )?.innerText?.trim() || '';
    } else if (isIndeed) {
      title = title || document.querySelector('h2.jobTitle, .jobsearch-JobInfoHeader-title, h1')?.innerText?.trim() || '';
      company = company || document.querySelector('[data-testid="inlineHeader-companyName"], .companyName')?.innerText?.trim() || '';
      location = document.querySelector('[data-testid="inlineHeader-companyLocation"]')?.innerText?.trim() || '';
    } else if (isWellfound) {
      title = title || document.querySelector('h1, h2, [data-test="JobTitle"]')?.innerText?.trim() || '';
      company = company || document.querySelector('[data-test="StartupName"], .styles_header__')?.innerText?.trim() || '';
    } else {
      title = title || document.querySelector('h1.app-title, .posting-headline h2, h1')?.innerText?.trim() || document.title;
      company = company || document.querySelector('.company-name, .posting-headline .company, meta[property="og:site_name"]')?.innerText?.trim() || window.location.hostname.replace('www.', '');
    }
  }

  if (!title || title.length < 3) return;

  const jobId = hintJobId || getActiveJobIdFromPage() || `${title}::${company}`;
  if (!force && lastScannedJobId === jobId) return;
  lastScannedJobId = jobId;

  // Make sure loading state is rendered immediately on screen
  showImmediateLoadingState(title, company, jobId);

  const description = extractFullJobDescription();
  const { activePersona, customResume } = await getActiveCandidate();

  if (currentInflightController) {
    currentInflightController.abort();
  }
  currentInflightController = new AbortController();

  try {
    const res = await fetch(`${BACKEND_URL}/api/scan-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: currentInflightController.signal,
      body: JSON.stringify({
        job: {
          id: jobId,
          title,
          company,
          location,
          description,
          coreMission: description.slice(0, 500),
          engineeringDemands: description.slice(0, 500)
        },
        resume: activePersona,
        customResume
      })
    });

    if (!res.ok) throw new Error('Evaluation failed');
    const data = await res.json();

    renderVerdictBanner(data, title, company, location, description, jobId);
  } catch (err) {
    if (err.name === 'AbortError') return;
    const banner = document.getElementById('careerradar-onscreen-banner');
    if (banner) {
      banner.innerHTML = `
        <div style="font-size:11px; color:#71717a; font-family:ui-monospace, monospace;">
          CareerRadar: Ensure local server is active at http://localhost:3001
        </div>
      `;
    }
  }
}



function triggerAutoEvaluation(force = false) {
  if (scanDebounceTimer) clearTimeout(scanDebounceTimer);
  scanDebounceTimer = setTimeout(() => {
    updateActiveJobBanner(force);
  }, 150);
}

function initWatchdogs() {
  // 1. Ensure Apollo sticky dock and drawer are always present
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectApolloDockAndDrawer);
  } else {
    injectApolloDockAndDrawer();
  }

  // 2. Capture user clicks on job items anywhere in the document
  document.addEventListener('click', (e) => {
    const jobClick = e.target.closest(
      '.jobs-search-results__list-item, .job-card-container, .jobs-search-results-list__list-item, [data-occludable-job-id], [data-job-id], a[href*="/jobs/view/"], .scaffold-layout__list-item'
    );
    if (jobClick) {
      const cardInfo = extractJobInfo(jobClick);
      const clickedJobId = jobClick.getAttribute('data-job-id') ||
                           jobClick.getAttribute('data-occludable-job-id') ||
                           jobClick.querySelector('a[href*="/jobs/view/"]')?.href?.match(/\/jobs\/view\/(\d+)/)?.[1] ||
                           jobClick.querySelector('a[href*="currentJobId="]')?.href?.match(/currentJobId=(\d+)/)?.[1];

      if (clickedJobId && clickedJobId === lastScannedJobId) {
        return; // Already actively evaluating or evaluated
      }

      if (currentInflightController) {
        currentInflightController.abort();
      }

      lastScannedJobId = clickedJobId || cardInfo.title;
      showImmediateLoadingState(cardInfo.title, cardInfo.company, clickedJobId);
      waitForDetailPaneAndEvaluate(clickedJobId, cardInfo.title, cardInfo.company);
    }
  }, true);

  // 3. Watch URL and Job ID changes every 400ms
  setInterval(() => {
    const currentUrl = window.location.href;
    const currentJobId = getActiveJobIdFromPage();
    if (currentJobId && currentJobId !== lastScannedJobId) {
      lastScannedJobId = currentJobId;
      lastKnownUrl = currentUrl;
      const detailPane = document.querySelector(
        '.jobs-search__job-details, .scaffold-layout__detail, .job-view-layout, .jobs-details, [data-view-name="job-details-component"], .jobsearch-JobComponent, main, article'
      );
      const title = detailPane?.querySelector('h1, h2.jobTitle, .job-details-jobs-unified-top-card__job-title')?.innerText?.trim() || '';
      showImmediateLoadingState(title, '', currentJobId);
      waitForDetailPaneAndEvaluate(currentJobId, title, '');
    } else if (currentUrl !== lastKnownUrl) {
      lastKnownUrl = currentUrl;
    }
  }, 400);

  // 4. Listen to service worker navigation relay or side panel trigger
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'URL_NAVIGATED' || msg.type === 'FORCE_SCAN_JOB') {
      updateActiveJobBanner(true);
    }
  });

  // Initial trigger
  setTimeout(() => {
    updateActiveJobBanner(true);
  }, 400);
}

// Start immediately
initWatchdogs();
