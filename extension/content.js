// CareerRadar Ambient Content Script
// Works on LinkedIn, Google Careers, Indeed, Wellfound, YC, Greenhouse, Lever, Ashby, and company career pages
console.log('🎯 CareerRadar Active — Ambient Job Decision Copilot.');

const BACKEND_URL = 'http://localhost:3001';

// Internal State Machine
let activeJobId = null;
let isEvaluating = false;
let lastEvaluatedJobId = null;
let inflightController = null;
let scanDebounceTimer = null;
let lastKnownUrl = window.location.href;

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
  else if (host.includes('google.com') && (url.includes('/careers') || url.includes('/jobs'))) {
    title = document.querySelector('h1, h2.title, [role="heading"][aria-level="1"], .gc-job-detail__title, .headline-4')?.innerText?.trim() || '';
    company = 'Google';
    location = document.querySelector('[aria-label*="Location"], .gc-job-detail__meta, .gc-job-location, [aria-label*="location"]')?.innerText?.trim() || 'Mountain View, CA';
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

// ── Apollo / SignalHire Compact Floating Dock & Slide Drawer ──
function injectApolloDockAndDrawer() {
  if (document.getElementById('careerradar-dock-tab')) return;

  // 1. Compact 36x36px Edge Dock Tab
  const dock = document.createElement('div');
  dock.id = 'careerradar-dock-tab';
  dock.title = 'CareerRadar Analysis';
  dock.innerHTML = `
    <svg class="dock-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
    <span id="dock-fit-dot" class="dock-fit-dot"></span>
    <div id="dock-tooltip-label" class="dock-tooltip">CareerRadar</div>
  `;
  document.body.appendChild(dock);

  // 2. In-Page Slide-Out Drawer
  const drawer = document.createElement('div');
  drawer.id = 'careerradar-inpage-drawer';
  drawer.innerHTML = `
    <div class="cr-header">
      <div class="cr-brand">
        <svg class="cr-brand-logo" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <span class="cr-brand-title">CareerRadar</span>
        <span class="cr-badge-live">Live</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <button id="drawer-btn-chrome-sp" class="cr-btn-ghost" style="font-size:10px; padding:3px 6px;" title="Open in native Chrome Side Panel">
          Dock ↗
        </button>
        <button id="drawer-btn-close" class="cr-close-btn" title="Close Panel">✕</button>
      </div>
    </div>

    <!-- Active Job Detected Bar -->
    <div class="cr-card cr-card-compact" style="margin-bottom:10px;">
      <div class="cr-job-active-bar">
        <div style="flex:1; min-width:0;">
          <div id="drawer-job-title" class="cr-job-title">Detecting active job page...</div>
          <div id="drawer-job-company" class="cr-job-meta">Reading browser context...</div>
        </div>
      </div>
    </div>

    <!-- Live Drawer Verdict Container -->
    <div id="drawer-verdict-container">
      <div id="drawer-skeleton" style="display:none;" class="cr-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="careerradar-spin">⬡</span>
            <strong style="font-size:10.5px; font-family:ui-monospace, monospace; text-transform:uppercase;">Arbitrating Fit...</strong>
          </div>
          <span class="cr-badge-live">Jev System One</span>
        </div>
        <div class="careerradar-skeleton-shimmer" style="width:100%; height:28px; border-radius:6px; margin-bottom:8px;"></div>
        <div class="careerradar-skeleton-shimmer" style="width:100%; height:40px; border-radius:6px; margin-bottom:8px;"></div>
        <div class="cr-metrics-grid">
          <div class="cr-metric-tile"><div class="careerradar-skeleton-shimmer" style="width:70%; height:12px; margin:0 auto;"></div></div>
          <div class="cr-metric-tile"><div class="careerradar-skeleton-shimmer" style="width:70%; height:12px; margin:0 auto;"></div></div>
          <div class="cr-metric-tile"><div class="careerradar-skeleton-shimmer" style="width:70%; height:12px; margin:0 auto;"></div></div>
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

        <div style="margin-top:9px;">
          <div style="font-size:10.5px; font-weight:600; color:#15803d; margin-bottom:3px; text-transform:uppercase; letter-spacing:0.03em;">
            ✓ Matched Deliverables:
          </div>
          <div id="drawer-matched-chips" class="cr-chips-container"></div>
        </div>

        <div id="drawer-nuance-section" style="margin-top:9px; display:none;">
          <div style="font-size:10.5px; font-weight:600; color:#b45309; margin-bottom:3px; text-transform:uppercase; letter-spacing:0.03em;">
            ⚠ Domain Nuance:
          </div>
          <div id="drawer-nuance-chips" class="cr-chips-container"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(drawer);

  // Event Handlers
  dock.addEventListener('click', () => {
    drawer.classList.toggle('open');
  });

  drawer.querySelector('#drawer-btn-close')?.addEventListener('click', () => {
    drawer.classList.remove('open');
  });

  drawer.querySelector('#drawer-btn-chrome-sp')?.addEventListener('click', () => {
    safeSendMessage({ type: 'OPEN_SIDE_PANEL' });
  });
}

// ── Show Loading in Drawer & Dock ──
function showImmediateLoadingState(title = '', company = '', jobId = null) {
  injectApolloDockAndDrawer();

  // Update In-Page Drawer
  const dSkel = document.getElementById('drawer-skeleton');
  const dCard = document.getElementById('drawer-verdict-card');
  const dTitle = document.getElementById('drawer-job-title');
  const dComp = document.getElementById('drawer-job-company');
  const tooltip = document.getElementById('dock-tooltip-label');
  const fitDot = document.getElementById('dock-fit-dot');

  if (dSkel) dSkel.style.display = 'block';
  if (dCard) dCard.style.display = 'none';
  if (dTitle) dTitle.innerText = title || 'Job Opening';
  if (dComp) dComp.innerText = company || 'Evaluating fit...';
  if (tooltip) tooltip.innerText = 'Arbitrating Fit...';
  if (fitDot) fitDot.style.display = 'none';

  // Notify Side Panel & Storage Defensively
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

// ── Render Evaluated Verdict in Drawer & Dock ──
function renderVerdict(data, title, company, location, description, jobId) {
  const isCanApply = data.verdict === 'can_apply';
  const isReach = data.verdict === 'reach_apply';

  let heroClass = 'cr-verdict-hero-mismatch';
  let dotClass = 'cr-verdict-dot-mismatch';
  let verdictTitle = 'EXPERIENCE / TENURE GAP';
  let dotColor = '#f43f5e';

  if (isCanApply) {
    heroClass = 'cr-verdict-hero-can-apply';
    dotClass = 'cr-verdict-dot-can-apply';
    verdictTitle = 'HIGH FIT · CAN APPLY';
    dotColor = '#10b981';
  } else if (isReach) {
    heroClass = 'cr-verdict-hero-reach-apply';
    dotClass = 'cr-verdict-dot-reach-apply';
    verdictTitle = 'COMPETITIVE CONTENDER · REACH APPLY';
    dotColor = '#f59e0b';
  }

  const matched = data.subagentSignals?.matchedDeliverables || [];
  const gaps = data.subagentSignals?.domainGaps || [];
  const reqExp = data.subagentSignals?.requiredExp || '1–3 years';
  const candExp = data.subagentSignals?.candidateExp || '1.5 Years';
  const summaryVerdict = data.subagentSignals?.summaryVerdict || '';

  // Update Dock Status
  const fitDot = document.getElementById('dock-fit-dot');
  const tooltip = document.getElementById('dock-tooltip-label');
  if (fitDot) {
    fitDot.style.background = dotColor;
    fitDot.style.boxShadow = `0 0 6px ${dotColor}`;
    fitDot.style.display = 'block';
  }
  if (tooltip) {
    tooltip.innerText = `CareerRadar · ${data.matchPercentage || 80}% Fit`;
  }

  // Update In-Page Slide Drawer
  const dSkel = document.getElementById('drawer-skeleton');
  const dCard = document.getElementById('drawer-verdict-card');
  const dTitle = document.getElementById('drawer-job-title');
  const dComp = document.getElementById('drawer-job-company');
  const dBadge = document.getElementById('drawer-hero-badge');
  const dDot = document.getElementById('drawer-hero-dot');
  const dHdr = document.getElementById('drawer-hero-title');
  const dTelem = document.getElementById('drawer-hero-telemetry');
  const dSumm = document.getElementById('drawer-summary-text');

  if (dSkel) dSkel.style.display = 'none';
  if (dCard) dCard.style.display = 'block';
  if (dTitle) dTitle.innerText = title || 'Job Opening';
  if (dComp) dComp.innerText = company || 'Evaluated Job';

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
  if (dSuitVal) dSuitVal.innerHTML = `${(data.techScore || 3.0).toFixed(1)}<span style="font-size:10px; font-weight:normal; color:#71717a;">/4</span>`;
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
      : '<span style="font-size:11px; color:#71717a;">General software overlap</span>';
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

  // Save to shared storage so Side Panel receives it 100% reliably
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

  const dSkel = document.getElementById('drawer-skeleton');
  const dCard = document.getElementById('drawer-verdict-card');
  if (dSkel) dSkel.style.display = 'none';
  if (dCard) {
    dCard.style.display = 'block';
    const dSumm = document.getElementById('drawer-summary-text');
    if (dSumm) dSumm.innerText = errorMessage || 'Could not connect to local arbitrator server at http://localhost:3001.';
  }

  const tooltip = document.getElementById('dock-tooltip-label');
  if (tooltip) tooltip.innerText = 'Server Offline';
}

// ── Evaluation Core ──
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

    renderVerdict(data, details.title, details.company, details.location, details.description, jobId);
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError' && activeJobId !== jobId) {
      return;
    }

    isEvaluating = false;
    renderErrorState(err.message || 'Evaluation request failed.');
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
  if (!isJobPage()) return;

  injectApolloDockAndDrawer();

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

// Start immediately if on job page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWatchdogs);
} else {
  initWatchdogs();
}
