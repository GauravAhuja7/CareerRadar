// CareerRadar Ambient Content Script
// Pure headless context observer & job extractor for Chrome Side Panel
// ZERO DOM INJECTION: No floating tabs, no in-page drawers, no layout shift.
// ZERO API CALLS: Content script only scrapes and broadcasts. Sidepanel evaluates.
console.log('🎯 CareerRadar Active — Headless Job Context Observer.');

// Internal State Machine
let activeJobId = null;
let lastBroadcastedJobId = null;
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
  const path = window.location.pathname.toLowerCase();

  // Known job portals (H6 fix: hostname checked separately from path)
  if (
    (host.includes('linkedin.com') && (path.includes('/jobs') || url.includes('currentjobid='))) ||
    (host.includes('google.com') && (path.includes('/careers') || path.includes('/jobs'))) ||
    host.includes('careers.google.com') ||
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
    host.includes('rippling.com') ||
    host.includes('bamboohr.com') ||
    host.includes('pinpointhq.com')
  ) {
    return true;
  }

  // URL path indicators for job postings
  if (/(^|\/)(?:jobs?|careers?|positions?|roles?|apply|openings?)(\/|$)/.test(path)) {
    return true;
  }

  // DOM heuristics for career pages
  if (
    document.querySelector(
      '.jobs-search__job-details, .scaffold-layout__detail, [data-view-name="job-details-component"], #job-details, .jobsearch-JobComponent, .gc-job-detail, [itemtype*="JobPosting"], [data-qa="job-description"], .job-description'
    )
  ) {
    return true;
  }

  // Deep content text heuristics (catches custom career pages like Dynabase)
  try {
    const bodySample = (document.body?.innerText || '').slice(0, 4000).toLowerCase();
    if (
      bodySample.includes('about the job') ||
      bodySample.includes('about the role') ||
      bodySample.includes('apply for this role') ||
      bodySample.includes('send us your details') ||
      (bodySample.includes('responsibilities') && (bodySample.includes('requirements') || bodySample.includes('qualifications')))
    ) {
      return true;
    }
  } catch {}

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

function safeSendMessage(message) {
  try {
    if (isExtensionContextValid()) {
      chrome.runtime.sendMessage(message, () => {
        if (chrome.runtime?.lastError) { /* swallow */ }
      });
    }
  } catch {}
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

// ── Robust Job Details Extractor (Canonical — sidepanel delegates to this) ──
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
    title = document.querySelector('h1.app-title, .posting-headline h2, [data-qa="job-title"], h1, h2')?.innerText?.trim() || '';
    company = document.querySelector('.company-name, .posting-headline .company, meta[property="og:site_name"]')?.innerText?.trim() || '';
    const descEl = document.querySelector('#content, .section-wrapper, .job-description, [data-qa="job-description"], [class*="job-description"], [class*="jobDescription"], main, article');
    description = descEl?.innerText?.trim() || '';
  }

  // Guaranteed clean fallbacks
  if (!title && document.title) {
    const cleanDocTitle = document.title.split(/ [|\-–—] /)[0]?.trim();
    if (cleanDocTitle && !cleanDocTitle.includes('Jobs') && !cleanDocTitle.includes('Careers')) {
      title = cleanDocTitle;
    }
  }

  if (!company || company === 'Detected Company') {
    const metaCompany = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
    if (metaCompany) {
      company = metaCompany;
    } else {
      const parts = window.location.hostname.replace(/^www\./, '').split('.');
      if (parts[0] && parts[0] !== 'localhost') {
        company = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      }
    }
  }

  if (!title) title = 'Software Engineer Opportunity';
  if (!company) company = 'Detected Company';
  if (!location) location = 'Remote / Hybrid';
  if (!description || description.length < 60) {
    description = (detailPane || document.body)?.innerText?.slice(0, 10000) || 'Job description context.';
  }

  const jobId = getActiveJobIdFromPage() || `${title}::${company}::${window.location.pathname}`;
  return { jobId, title, company, location, description };
}

// ── Broadcast Job Context to Side Panel (H2/H3 fix: no more direct API calls) ──
function broadcastJobContext() {
  if (!isJobPage()) return;

  const details = extractActiveJobDetails();
  const jobId = details.jobId;

  // Skip if already broadcasted this exact job
  if (jobId && jobId === lastBroadcastedJobId) return;

  activeJobId = jobId;
  lastBroadcastedJobId = jobId;

  // Notify side panel with scraped data — sidepanel handles the API call
  safeSendMessage({
    type: 'JOB_CONTEXT_UPDATED',
    details,
    jobId
  });
}

// ── Debounced Trigger Helper ──
function triggerDebouncedBroadcast(delayMs = 150) {
  if (!isJobPage()) return;
  if (scanDebounceTimer) clearTimeout(scanDebounceTimer);
  scanDebounceTimer = setTimeout(() => {
    broadcastJobContext();
  }, delayMs);
}

// ── Watchdogs & Event System (M3 fix: smarter observation) ──
function initWatchdogs() {
  purgeStaleInjectedElements();

  if (!isJobPage()) return;

  // 1. Capture user clicks on job listings anywhere
  document.addEventListener('click', (e) => {
    const jobClick = e.target.closest(
      '.jobs-search-results__list-item, .job-card-container, .jobs-search-results-list__list-item, [data-occludable-job-id], [data-job-id], a[href*="/jobs/view/"], .scaffold-layout__list-item, [role="listitem"]'
    );
    if (jobClick) {
      // Reset last broadcasted so we re-broadcast after click
      lastBroadcastedJobId = null;
      triggerDebouncedBroadcast(150);
    }
  }, true);

  // 2. Watch URL changes via popstate/hashchange for SPA navigation
  window.addEventListener('popstate', () => {
    lastBroadcastedJobId = null;
    triggerDebouncedBroadcast(100);
  });
  window.addEventListener('hashchange', () => {
    lastBroadcastedJobId = null;
    triggerDebouncedBroadcast(100);
  });

  // 3. MutationObserver for LinkedIn's job detail pane changes
  const detailPane = document.querySelector('.scaffold-layout__detail, .jobs-search__job-details, main');
  if (detailPane) {
    const observer = new MutationObserver(() => {
      const currentJobId = getActiveJobIdFromPage();
      if (currentJobId && currentJobId !== lastBroadcastedJobId) {
        triggerDebouncedBroadcast(200);
      }
    });
    observer.observe(detailPane, { childList: true, subtree: true });
  }

  // 4. Fallback interval at 2s (5x slower than before) for SPA edge cases only
  let fallbackInterval = setInterval(() => {
    if (!isJobPage()) {
      clearInterval(fallbackInterval);
      return;
    }
    const currentUrl = window.location.href;
    const currentJobId = getActiveJobIdFromPage();

    if (currentJobId && currentJobId !== lastBroadcastedJobId) {
      lastKnownUrl = currentUrl;
      triggerDebouncedBroadcast(100);
    } else if (currentUrl !== lastKnownUrl) {
      lastKnownUrl = currentUrl;
      lastBroadcastedJobId = null;
      triggerDebouncedBroadcast(100);
    }
  }, 2000);

  // 5. Service worker & side panel message listener
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'GET_ACTIVE_JOB_DETAILS') {
      sendResponse(extractActiveJobDetails());
      return true;
    }
    if (msg.type === 'URL_NAVIGATED' || msg.type === 'FORCE_SCAN_JOB') {
      lastBroadcastedJobId = null;
      triggerDebouncedBroadcast(50);
    }
  });

  // 6. Initial broadcast after page load
  setTimeout(() => {
    broadcastJobContext();
  }, 350);
}

// Start immediately if on job page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWatchdogs);
} else {
  initWatchdogs();
}
