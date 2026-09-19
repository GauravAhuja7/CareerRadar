// CareerRadar Content Script (LinkedIn, Indeed, Wellfound, YC, Greenhouse, Lever, Ashby)
// Powered by TypeSafe Jev System One
console.log('🎯 CareerRadar Active — Ambient Real-Time Job Decision Engine.');

const BACKEND_URL = 'http://localhost:3001';

// Internal State Machine
let activeJobId = null;
let isEvaluating = false;
let lastEvaluatedJobId = null;
let inflightController = null;
let scanDebounceTimer = null;
let lastKnownUrl = window.location.href;

// Platform Detection
const host = window.location.hostname;
const isLinkedIn = host.includes('linkedin.com');
const isIndeed = host.includes('indeed.com');
const isWellfound = host.includes('wellfound.com') || host.includes('angel.co');
const isYC = host.includes('workatastartup.com');

// ── Defensive Chrome Extensions API Guards ──
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
        if (chrome.runtime?.lastError) { /* swallow */ }
      });
    }
  } catch {
    // Context invalidated
  }
}

function safeSendMessage(message) {
  try {
    if (isExtensionContextValid()) {
      chrome.runtime.sendMessage(message, () => {
        if (chrome.runtime?.lastError) { /* swallow */ }
      });
    }
  } catch {
    // Context invalidated
  }
}

// ── Candidate Profile Access ──
async function getActiveCandidate() {
  try {
    if (isExtensionContextValid() && chrome.storage?.local) {
      const stored = await chrome.storage.local.get(['activePersona', 'customResume']);
      return {
        activePersona: stored.activePersona || 'custom',
        customResume: stored.customResume || null
      };
    }
  } catch {}
  return { activePersona: 'custom', customResume: null };
}

// ── Unique Job ID Extractor ──
function getActiveJobIdFromPage() {
  try {
    const url = window.location.href;
    if (isLinkedIn) {
      const matchParam = url.match(/[?&]currentJobId=(\d+)/);
      if (matchParam) return matchParam[1];
      const matchPath = url.match(/\/jobs\/view\/(\d+)/);
      if (matchPath) return matchPath[1];
      const activeCard = document.querySelector(
        '.jobs-search-results-list__list-item--active, [data-occludable-job-id].active, [data-job-id].active'
      );
      const cardId = activeCard?.getAttribute('data-job-id') ||
                     activeCard?.getAttribute('data-occludable-job-id');
      if (cardId) return cardId.replace(/[^0-9]/g, '') || cardId;
    } else if (isIndeed) {
      const matchJk = url.match(/[?&]vjk=([a-zA-Z0-9]+)/);
      if (matchJk) return matchJk[1];
    }
    return null;
  } catch {
    return null;
  }
}

// ── Robust Job Details Extractor ──
function extractActiveJobDetails() {
  let title = '';
  let company = '';
  let location = '';
  let description = '';

  const detailPane = document.querySelector(
    '.jobs-search__job-details, .scaffold-layout__detail, .job-view-layout, .jobs-details, [data-view-name="job-details-component"], .jobsearch-JobComponent, main, article'
  );

  // 1. LinkedIn Extraction
  if (isLinkedIn) {
    // Title from detail pane
    title = (detailPane || document).querySelector(
      '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1.job-details-jobs-unified-top-card__job-title, h2.job-details-jobs-unified-top-card__job-title, h1.t-24, h2.t-24, [data-view-name="job-details-top-card"] h1, [data-view-name="job-details-top-card"] h2, .jobs-details__top-card h1, .jobs-details__top-card h2, h1'
    )?.innerText?.trim() || '';

    // If detail pane title missing, check active card in list
    if (!title) {
      const activeCard = document.querySelector(
        '.jobs-search-results-list__list-item--active, [data-occludable-job-id].active'
      );
      title = activeCard?.querySelector(
        '.job-card-list__title--link, .job-card-list__title, .artdeco-entity-lockup__title, strong, h3'
      )?.innerText?.trim() || '';
    }

    // Fallback: document.title
    if (!title && document.title) {
      const cleanDocTitle = document.title.split(/ [|\-–—] /)[0]?.trim();
      if (cleanDocTitle && !cleanDocTitle.includes('Jobs') && !cleanDocTitle.includes('LinkedIn')) {
        title = cleanDocTitle;
      }
    }

    // Company from detail pane
    company = (detailPane || document).querySelector(
      '.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, [data-anonymize="company-name"], a.ember-view.t-black--light, .job-details-jobs-unified-top-card a[href*="/company/"]'
    )?.innerText?.trim() || '';

    if (!company) {
      const activeCard = document.querySelector(
        '.jobs-search-results-list__list-item--active, [data-occludable-job-id].active'
      );
      company = activeCard?.querySelector(
        '.job-card-container__primary-description, .artdeco-entity-lockup__subtitle'
      )?.innerText?.trim() || '';
    }

    location = (detailPane || document).querySelector(
      '.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet, .jobs-unified-top-card__workplace-type'
    )?.innerText?.trim() || 'Detected Listing';

    const descEl = (detailPane || document).querySelector(
      '#job-details, .jobs-description__content, .jobs-description-content__text, [data-view-name="job-details-component"], .jobs-box__html-content, article.jobs-description__container, article'
    );
    description = descEl?.innerText?.trim() || '';
  }
  // 2. Indeed Extraction
  else if (isIndeed) {
    title = document.querySelector('h2.jobTitle, .jobsearch-JobInfoHeader-title, h1')?.innerText?.trim() || '';
    company = document.querySelector('[data-testid="inlineHeader-companyName"], .companyName')?.innerText?.trim() || '';
    location = document.querySelector('[data-testid="inlineHeader-companyLocation"]')?.innerText?.trim() || '';
    const descEl = document.querySelector('#jobDescriptionText, .jobsearch-JobComponent-description');
    description = descEl?.innerText?.trim() || '';
  }
  // 3. Wellfound / AngelList
  else if (isWellfound) {
    title = document.querySelector('h1, h2, [data-test="JobTitle"]')?.innerText?.trim() || '';
    company = document.querySelector('[data-test="StartupName"], .styles_header__')?.innerText?.trim() || '';
    const descEl = document.querySelector('.styles_description__, [data-test="JobDescription"]');
    description = descEl?.innerText?.trim() || '';
  }
  // 4. Other Platforms
  else {
    title = document.querySelector('h1.app-title, .posting-headline h2, h1')?.innerText?.trim() || '';
    company = document.querySelector('.company-name, .posting-headline .company, meta[property="og:site_name"]')?.innerText?.trim() || '';
    const descEl = document.querySelector('#content, .section-wrapper, .job-description, [data-qa="job-description"], main, article');
    description = descEl?.innerText?.trim() || '';
  }

  // Fallbacks
  if (!title) {
    const raw = document.title || '';
    title = raw.split(/ [|\-–—] /)[0]?.trim() || 'Software Engineer';
  }
  if (!company) company = 'Detected Company';
  if (!location) location = 'Remote / Hybrid';
  if (!description || description.length < 50) {
    description = (detailPane || document.body)?.innerText?.slice(0, 5000) || 'Job description context.';
  }

  const jobId = getActiveJobIdFromPage() || `${title}::${company}`;
  return { jobId, title, company, location, description };
}

// ── Floating Corner HUD Pill ──
function renderFloatingPill(data, verdictTitle, verdictColor, reqExp, candExp) {
  let pill = document.getElementById('careerradar-floating-pill');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'careerradar-floating-pill';
    pill.title = 'Click to view CareerRadar breakdown';
    pill.addEventListener('click', () => {
      const banner = document.getElementById('careerradar-onscreen-banner');
      if (banner) {
        banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        const drawer = document.getElementById('careerradar-inpage-drawer');
        if (drawer) drawer.classList.add('open');
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

function renderFloatingPillLoading(title = '') {
  let pill = document.getElementById('careerradar-floating-pill');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'careerradar-floating-pill';
    document.body.appendChild(pill);
  }

  const display = title ? title.slice(0, 24) : 'Fit';
  pill.innerHTML = `
    <span class="careerradar-spin" style="font-size:12px; color:#a1a1aa;">⬡</span>
    <span style="font-weight:600; font-family:ui-monospace, monospace; font-size:11px; color:#d4d4d8;">
      Arbitrating ${display}...
    </span>
  `;
}

// ── Apollo / SignalHire Sticky Right Dock & Slide Drawer ──
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
    safeSendMessage({ type: 'OPEN_SIDE_PANEL' });
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
  chrome.storage?.local?.get(['customMetadata', 'customResume'], ({ customMetadata, customResume }) => {
    const nameEl = drawer.querySelector('#drawer-profile-name');
    const subEl = drawer.querySelector('#drawer-profile-sub');
    const yearsInput = drawer.querySelector('#drawer-years');
    if (customMetadata && customResume) {
      if (nameEl) nameEl.innerText = customResume.name || 'Candidate Profile';
      const expStr = customMetadata.calculatedYears ? `${customMetadata.calculatedYears} yrs` : '1.5 yrs';
      if (subEl) subEl.innerText = `${expStr} · ${customMetadata.roles?.[0] || 'Backend & Systems'}`;
      if (yearsInput) yearsInput.value = customMetadata.calculatedYears || 1.5;
    }
  });

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
        safeStorageSet({
          customResume: data.candidate,
          customResumeText: data.rawText || '',
          customMetadata: data.metadata || {},
          activePersona: 'custom'
        });
        toggleDrawerP(false);
        evaluateActiveJob(true);
      }
    } catch {}
  });

  drawer.querySelector('#drawer-btn-save-profile')?.addEventListener('click', async () => {
    const yearsInput = drawer.querySelector('#drawer-years');
    const years = yearsInput?.value ? Number(yearsInput.value) : undefined;
    chrome.storage?.local?.get('customResumeText', async ({ customResumeText }) => {
      if (customResumeText) {
        try {
          const res = await fetch(`${BACKEND_URL}/api/parse-resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: customResumeText, years })
          });
          const d = await res.json();
          if (d.candidate) {
            safeStorageSet({
              customResume: d.candidate,
              customMetadata: d.metadata || {},
              activePersona: 'custom'
            });
            toggleDrawerP(false);
            evaluateActiveJob(true);
          }
        } catch {}
      }
    });
  });
}

// ── Render Immediate Loading State ──
function showImmediateLoadingState(title = '', company = '', jobId = null) {
  injectApolloDockAndDrawer();

  // 1. On-Screen Banner Loading Skeleton
  const detailPane = document.querySelector(
    '.jobs-search__job-details, .scaffold-layout__detail, .job-view-layout, .jobs-details, [data-view-name="job-details-component"], .jobsearch-JobComponent, main, article'
  ) || document.body;

  let banner = document.getElementById('careerradar-onscreen-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'careerradar-onscreen-banner';
    const topTarget = (detailPane || document).querySelector(
      '.job-details-jobs-unified-top-card__content--two-pane, .jobs-unified-top-card__content--two-pane, .job-details-jobs-unified-top-card, .jobs-unified-top-card, .jobs-details__top-card, [data-view-name="job-details-top-card"], .jobsearch-JobInfoHeader-title, h1, h2'
    );
    if (topTarget && topTarget.parentNode) {
      topTarget.insertAdjacentElement('afterend', banner);
    } else if (detailPane) {
      detailPane.prepend(banner);
    }
  }

  banner.className = 'careerradar-banner-loading cr-card';
  banner.style.display = 'block';

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

  // 2. Floating Corner Pill
  renderFloatingPillLoading(title);

  // 3. In-Page Slide Drawer
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

  // 4. Notify Side Panel & Storage Defensively
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

// ── Render Evaluated Verdict ──
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

  // 2. Update Floating Corner Pill
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

// ── Render Error State ──
function renderErrorState(errorMessage = '') {
  safeStorageSet({ activeJobEvaluating: null });

  const banner = document.getElementById('careerradar-onscreen-banner');
  if (banner) {
    banner.className = 'cr-card';
    banner.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; color:#991b1b; font-size:12px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span>⚠</span>
          <strong>CareerRadar Notice:</strong> ${errorMessage || 'Ensure local server is running on http://localhost:3001'}
        </div>
        <button id="cr-retry-btn" class="cr-btn-ghost" style="font-size:11px; padding:2px 8px; border:1px solid #fca5a5;">
          Retry
        </button>
      </div>
    `;
    banner.querySelector('#cr-retry-btn')?.addEventListener('click', () => {
      evaluateActiveJob(true);
    });
  }

  const dSkel = document.getElementById('drawer-skeleton');
  const dCard = document.getElementById('drawer-verdict-card');
  if (dSkel) dSkel.style.display = 'none';
  if (dCard) {
    dCard.style.display = 'block';
    const dSumm = document.getElementById('drawer-summary-text');
    if (dSumm) dSumm.innerText = errorMessage || 'Could not connect to local arbitrator server at http://localhost:3001.';
  }

  const pill = document.getElementById('careerradar-floating-pill');
  if (pill) {
    pill.innerHTML = `
      <span style="color:#f87171;">⚠</span>
      <span style="font-size:11px; font-family:ui-monospace, monospace; color:#d4d4d8;">Server Offline</span>
    `;
  }
}

// ── Master Job Evaluation Core ──
async function evaluateActiveJob(force = false) {
  const details = extractActiveJobDetails();
  const jobId = details.jobId;

  // 1. Skip if already evaluated this exact job
  if (!force && jobId && jobId === lastEvaluatedJobId) {
    return;
  }

  // 2. Prevent self-aborting / overlapping loops for the same job!
  if (isEvaluating && jobId && jobId === activeJobId) {
    return;
  }

  // 3. If scanning an old job and user switched to a new job, abort the old request
  if (isEvaluating && inflightController) {
    inflightController.abort();
  }

  isEvaluating = true;
  activeJobId = jobId;

  // Render immediate loading state
  showImmediateLoadingState(details.title, details.company, jobId);

  inflightController = new AbortController();
  const currentSignal = inflightController.signal;

  // 14-second network timeout guard
  const timeoutId = setTimeout(() => {
    if (isEvaluating && activeJobId === jobId) {
      inflightController?.abort();
    }
  }, 14000);

  try {
    const { activePersona, customResume } = await getActiveCandidate();

    const res = await fetch(`${BACKEND_URL}/api/scan-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: currentSignal,
      body: JSON.stringify({
        job: {
          id: jobId,
          title: details.title,
          company: details.company,
          location: details.location,
          description: details.description,
          coreMission: details.description.slice(0, 500),
          engineeringDemands: details.description.slice(0, 500)
        },
        resume: activePersona,
        customResume
      })
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Server responded with status ${res.status}`);
    }

    const data = await res.json();

    // Discard if user already clicked another job while waiting
    if (activeJobId !== jobId) return;

    lastEvaluatedJobId = jobId;
    isEvaluating = false;

    renderVerdictBanner(data, details.title, details.company, details.location, details.description, jobId);
  } catch (err) {
    clearTimeout(timeoutId);

    // If aborted because a new job was clicked, let the new job run
    if (err.name === 'AbortError' && activeJobId !== jobId) {
      return;
    }

    isEvaluating = false;
    renderErrorState(err.message || 'Evaluation request failed.');
  }
}

// ── Debounced Trigger Helper ──
function triggerDebouncedScan(force = false, delayMs = 180) {
  if (scanDebounceTimer) clearTimeout(scanDebounceTimer);
  scanDebounceTimer = setTimeout(() => {
    evaluateActiveJob(force);
  }, delayMs);
}

// ── Watchdogs & Event System ──
function initWatchdogs() {
  injectApolloDockAndDrawer();

  // 1. Capture user clicks on job listings anywhere
  document.addEventListener('click', (e) => {
    const jobClick = e.target.closest(
      '.jobs-search-results__list-item, .job-card-container, .jobs-search-results-list__list-item, [data-occludable-job-id], [data-job-id], a[href*="/jobs/view/"], .scaffold-layout__list-item'
    );
    if (jobClick) {
      triggerDebouncedScan(false, 150);
    }
  }, true);

  // 2. Watch URL and Job ID changes every 400ms
  setInterval(() => {
    const currentUrl = window.location.href;
    const currentJobId = getActiveJobIdFromPage();

    if (currentJobId && currentJobId !== lastEvaluatedJobId && (!isEvaluating || currentJobId !== activeJobId)) {
      lastKnownUrl = currentUrl;
      triggerDebouncedScan(false, 100);
    } else if (currentUrl !== lastKnownUrl) {
      lastKnownUrl = currentUrl;
      triggerDebouncedScan(false, 100);
    }
  }, 400);

  // 3. Service worker & side panel message listener
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'URL_NAVIGATED' || msg.type === 'FORCE_SCAN_JOB') {
      triggerDebouncedScan(true, 50);
    }
  });

  // 4. Initial trigger after page load
  setTimeout(() => {
    evaluateActiveJob(true);
  }, 350);
}

// Start immediately
initWatchdogs();
