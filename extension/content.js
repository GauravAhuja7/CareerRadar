// CareerRadar Ambient Content Script
// Pure headless context observer & job extractor for Chrome Side Panel
// ZERO DOM INJECTION: No floating tabs, no in-page drawers, no layout shift.
console.log('🎯 CareerRadar Active — Headless Job Context Observer.');

const BACKEND_URL = 'http://localhost:3001';

// Internal State Machine
let activeJobId = null;
let isEvaluating = false;
let lastEvaluatedJobId = null;
let inflightController = null;
let scanDebounceTimer = null;
let lastKnownUrl = window.location.href;

// Clean up any stale injected elements from previous versions
function purgeStaleInjectedElements() {
  try {
    const oldDock = document.getElementById('careerradar-dock-tab');
    if (oldDock) oldDock.remove();
    const oldDrawer = document.getElementById('careerradar-inpage-drawer');
    if (oldDrawer) oldDrawer.remove();
    const oldBackdrop = document.getElementById('careerradar-drawer-backdrop');
    if (oldBackdrop) oldBackdrop.remove();
    const oldBanner = document.getElementById('careerradar-onscreen-banner');
    if (oldBanner) oldBanner.remove();
  } catch {}
}

// ── Check if Page is a Job / Career Page ──
function isJobPage() {
  const url = window.location.href.toLowerCase();
  const host = window.location.hostname.toLowerCase();

  // Known job portals & paths
  if (
    host.includes('linkedin.com/jobs') ||
    url.includes('currentjobid=') ||
    url.includes('/jobs/view/') ||
    url.includes('google.com/about/careers') ||
    url.includes('careers.google.com') ||
    host.includes('indeed.com') ||
    host.includes('wellfound.com') ||
    host.includes('angel.co') ||
    host.includes('workatastartup.com') ||
    host.includes('greenhouse.io') ||
    host.includes('lever.co') ||
    host.includes('ashbyhq.com') ||
    host.includes('myworkdayjobs.com') ||
    host.includes('amazon.jobs') ||
    host.includes('smartrecruiters.com') ||
    host.includes('icims.com') ||
    host.includes('jobvite.com') ||
    url.includes('/careers/') ||
    url.includes('/jobs/') ||
    url.includes('/positions/')
  ) {
    return true;
  }

  // DOM heuristics for career pages
  if (
    document.querySelector(
      '.jobs-search__job-details, .scaffold-layout__detail, [data-view-name="job-details-component"], #job-details, .jobsearch-JobComponent, .gc-job-detail, [itemtype*="JobPosting"]'
    )
  ) {
    return true;
  }

  return false;
}

// ── Defensive Chrome API Guards ──
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
  } catch {}
}

function safeSendMessage(message) {
  try {
    if (isExtensionContextValid()) {
      chrome.runtime.sendMessage(message, () => {
        if (chrome.runtime?.lastError) { /* swallow */ }
      });
    }
  } catch {}
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

// ── Extract Unique Job ID ──
function getActiveJobIdFromPage() {
  try {
    const url = window.location.href;
    const host = window.location.hostname.toLowerCase();

    // 1. LinkedIn
    if (host.includes('linkedin.com')) {
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
    }
    // 2. Google Careers
    else if (host.includes('google.com') || host.includes('careers.google.com')) {
      const matchJob = url.match(/results\/(\d+)/) || url.match(/jobs\/(\d+)/);
      if (matchJob) return `google-${matchJob[1]}`;
    }
    // 3. Indeed
    else if (host.includes('indeed.com')) {
      const matchJk = url.match(/[?&]vjk=([a-zA-Z0-9]+)/);
      if (matchJk) return matchJk[1];
    }
    // 4. General path matching
    const matchGeneric = url.match(/\/(jobs|careers|positions)\/([a-zA-Z0-9\-_]+)/);
    if (matchGeneric) return matchGeneric[2];

    return null;
  } catch {
    return null;
  }
}

// ── Robust Job Details Extractor ──
function extractActiveJobDetails() {
  const host = window.location.hostname.toLowerCase();
  const url = window.location.href.toLowerCase();

  let title = '';
  let company = '';
  let location = '';
  let description = '';

  const detailPane = document.querySelector(
    '.jobs-search__job-details, .scaffold-layout__detail, .job-view-layout, .jobs-details, [data-view-name="job-details-component"], .jobsearch-JobComponent, .gc-job-detail, main, article'
  );

  // 1. LinkedIn
  if (host.includes('linkedin.com')) {
    title = (detailPane || document).querySelector(
      '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1.job-details-jobs-unified-top-card__job-title, h2.job-details-jobs-unified-top-card__job-title, h1.t-24, h2.t-24, [data-view-name="job-details-top-card"] h1, [data-view-name="job-details-top-card"] h2, .jobs-details__top-card h1, .jobs-details__top-card h2, h1'
    )?.innerText?.trim() || '';

    if (!title) {
      const activeCard = document.querySelector(
        '.jobs-search-results-list__list-item--active, [data-occludable-job-id].active'
      );
      title = activeCard?.querySelector(
        '.job-card-list__title--link, .job-card-list__title, .artdeco-entity-lockup__title, strong, h3'
      )?.innerText?.trim() || '';
    }

    company = (detailPane || document).querySelector(
      '.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, [data-anonymize="company-name"], a.ember-view.t-black--light, .job-details-jobs-unified-top-card a[href*="/company/"]'
    )?.innerText?.trim() || '';

    location = (detailPane || document).querySelector(
      '.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet, .jobs-unified-top-card__workplace-type'
    )?.innerText?.trim() || 'Detected Listing';

    const descEl = (detailPane || document).querySelector(
      '#job-details, .jobs-description__content, .jobs-description-content__text, [data-view-name="job-details-component"], .jobs-box__html-content, article.jobs-description__container, article'
    );
    description = descEl?.innerText?.trim() || '';
  }
  // 2. Google Careers
  else if (host.includes('google.com') && (url.includes('/careers') || url.includes('/jobs') || url.includes('google.com/about/careers'))) {
    title = document.querySelector('h1, h2.title, [role="heading"][aria-level="1"], .gc-job-detail__title, .headline-4')?.innerText?.trim() || '';
    company = 'Google';
    const locEl = document.querySelector('[aria-label*="Location"], .gc-job-detail__meta, .gc-job-location, [aria-label*="location"]');
    if (locEl) {
      location = locEl.innerText.replace(/corporate_fare|place|pin_drop/gi, '').replace(/\s+/g, ' ').trim();
    }
    if (!location) location = 'Hyderabad / Global';
    const descEl = document.querySelector('[aria-label="Job details"], .gc-job-detail, main, article');
    description = descEl?.innerText?.trim() || '';
  }
  // 3. Indeed
  else if (host.includes('indeed.com')) {
    title = document.querySelector('h2.jobTitle, .jobsearch-JobInfoHeader-title, h1')?.innerText?.trim() || '';
    company = document.querySelector('[data-testid="inlineHeader-companyName"], .companyName')?.innerText?.trim() || '';
    location = document.querySelector('[data-testid="inlineHeader-companyLocation"]')?.innerText?.trim() || '';
    const descEl = document.querySelector('#jobDescriptionText, .jobsearch-JobComponent-description');
    description = descEl?.innerText?.trim() || '';
  }
  // 4. Wellfound / AngelList
  else if (host.includes('wellfound.com') || host.includes('angel.co')) {
    title = document.querySelector('h1, h2, [data-test="JobTitle"]')?.innerText?.trim() || '';
    company = document.querySelector('[data-test="StartupName"], .styles_header__')?.innerText?.trim() || '';
    const descEl = document.querySelector('.styles_description__, [data-test="JobDescription"]');
    description = descEl?.innerText?.trim() || '';
  }
  // 5. General Career Pages
  else {
    title = document.querySelector('h1.app-title, .posting-headline h2, h1')?.innerText?.trim() || '';
    company = document.querySelector('.company-name, .posting-headline .company, meta[property="og:site_name"]')?.innerText?.trim() || '';
    const descEl = document.querySelector('#content, .section-wrapper, .job-description, [data-qa="job-description"], main, article');
    description = descEl?.innerText?.trim() || '';
  }

  // Guaranteed clean fallbacks
  if (!title && document.title) {
    const cleanDocTitle = document.title.split(/ [|\-–—] /)[0]?.trim();
    if (cleanDocTitle && !cleanDocTitle.includes('Jobs') && !cleanDocTitle.includes('Careers')) {
      title = cleanDocTitle;
    }
  }

  if (!title) title = 'Software Engineer Opportunity';
  if (!company) company = 'Detected Company';
  if (!location) location = 'Remote / Hybrid';
  if (!description || description.length < 40) {
    description = (detailPane || document.body)?.innerText?.slice(0, 5000) || 'Job description context.';
  }

  const jobId = getActiveJobIdFromPage() || `${title}::${company}`;
  return { jobId, title, company, location, description };
}

// ── Evaluation Core (Headless — Syncs with Side Panel) ──
async function evaluateActiveJob(force = false) {
  if (!isJobPage()) return;

  const details = extractActiveJobDetails();
  const jobId = details.jobId;

  // 1. Skip if already evaluated this exact job
  if (!force && jobId && jobId === lastEvaluatedJobId) {
    return;
  }

  // 2. Prevent self-aborting / overlapping loops for the same job
  if (isEvaluating && jobId && jobId === activeJobId) {
    return;
  }

  // 3. If scanning an old job and user switched to a new job, abort previous fetch
  if (isEvaluating && inflightController) {
    inflightController.abort();
  }

  isEvaluating = true;
  activeJobId = jobId;

  // Notify side panel of active evaluation
  safeSendMessage({
    type: 'JOB_EVALUATING',
    title: details.title,
    company: details.company,
    jobId
  });

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

    // Save to shared storage so Side Panel receives it reliably
    const evalPayload = {
      data,
      scraped: details,
      timestamp: Date.now()
    };

    safeStorageSet({
      activeJobEvaluation: evalPayload,
      activeJobEvaluating: null
    });

    // Broadcast to native Chrome Side Panel
    safeSendMessage({
      type: 'JOB_EVALUATED_AUTOMATICALLY',
      ...evalPayload
    });
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError' && activeJobId !== jobId) {
      return;
    }

    isEvaluating = false;
    safeStorageSet({ activeJobEvaluating: null });
  }
}

// ── Debounced Trigger Helper ──
function triggerDebouncedScan(force = false, delayMs = 150) {
  if (!isJobPage()) return;
  if (scanDebounceTimer) clearTimeout(scanDebounceTimer);
  scanDebounceTimer = setTimeout(() => {
    evaluateActiveJob(force);
  }, delayMs);
}

// ── Watchdogs & Event System ──
function initWatchdogs() {
  purgeStaleInjectedElements();

  if (!isJobPage()) return;

  // 1. Capture user clicks on job listings anywhere
  document.addEventListener('click', (e) => {
    const jobClick = e.target.closest(
      '.jobs-search-results__list-item, .job-card-container, .jobs-search-results-list__list-item, [data-occludable-job-id], [data-job-id], a[href*="/jobs/view/"], .scaffold-layout__list-item, [role="listitem"]'
    );
    if (jobClick) {
      triggerDebouncedScan(false, 150);
    }
  }, true);

  // 2. Watch URL and Job ID changes
  setInterval(() => {
    purgeStaleInjectedElements();

    if (!isJobPage()) return;
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
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'GET_ACTIVE_JOB_DETAILS') {
      sendResponse(extractActiveJobDetails());
      return true;
    }
    if (msg.type === 'URL_NAVIGATED' || msg.type === 'FORCE_SCAN_JOB') {
      triggerDebouncedScan(true, 50);
    }
  });

  // 4. Initial trigger after page load
  setTimeout(() => {
    evaluateActiveJob(true);
  }, 350);
}

// Start immediately if on job page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWatchdogs);
} else {
  initWatchdogs();
}
