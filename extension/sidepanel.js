// CareerRadar Side Panel Script (Manifest V3) — Modern Developer-Grade Decision Engine
const BACKEND_URL = 'http://localhost:3001';

let currentSidepanelAbortController = null;
let lastEvaluatedTabUrl = '';

function showLoadingSkeleton(title = '', company = '') {
  const verdictContainer = document.getElementById('verdict-container');
  const skeletonContainer = document.getElementById('loading-skeleton-container');
  const errorBox = document.getElementById('error-box');
  const titleEl = document.getElementById('active-tab-title');
  const skeletonTitleEl = document.getElementById('skeleton-status-title');

  if (verdictContainer) verdictContainer.style.display = 'none';
  if (errorBox) errorBox.style.display = 'none';
  if (skeletonContainer) skeletonContainer.style.display = 'block';

  if (title && titleEl) {
    titleEl.innerText = `${title}${company ? ' — ' + company : ''}`;
  }
  if (skeletonTitleEl) {
    skeletonTitleEl.innerText = title ? `Arbitrating Fit · ${title.slice(0, 24)}...` : 'Arbitrating Fit...';
  }
}

function hideLoadingSkeleton() {
  const skeletonContainer = document.getElementById('loading-skeleton-container');
  if (skeletonContainer) skeletonContainer.style.display = 'none';
}

// ── Tab Tracking & Context ──
async function getActiveTab() {
  try {
    let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    }
    if (!tab) {
      const allTabs = await chrome.tabs.query({ active: true });
      tab = allTabs?.find(t => t.url && (t.url.startsWith('http://') || t.url.startsWith('https://')));
    }
    return tab || null;
  } catch {
    return null;
  }
}

async function updateTabContext() {
  try {
    const tab = await getActiveTab();
    const titleEl = document.getElementById('active-tab-title');
    const urlEl = document.getElementById('active-tab-url');
    if (!tab) {
      if (titleEl) titleEl.innerText = 'No active job tab detected';
      return;
    }
    if (titleEl) titleEl.innerText = tab.title ? tab.title.split(/ [|\-–—] /)[0].trim() : 'Active Page';
    if (urlEl) {
      try {
        const u = new URL(tab.url);
        urlEl.innerText = u.hostname + u.pathname;
      } catch {
        urlEl.innerText = tab.url || '';
      }
    }
  } catch (err) {
    console.error('Error updating tab context:', err);
  }
}

// ── Update Candidate Profile Header Chip & Info ──
function updateProfileBarUI(metadata, candidate) {
  const chipText = document.getElementById('header-profile-text');
  const nameEl = document.getElementById('display-profile-name');

  const name = candidate?.name && candidate.name !== 'Candidate' && candidate.name !== 'Custom Profile'
    ? candidate.name.split(' ')[0]
    : (metadata?.college ? metadata.college.replace('Indian Institute of Technology, ', 'IIT ') : 'My Profile');

  const expStr = metadata?.calculatedYears ? `${metadata.calculatedYears} yrs` : '1.5 yrs';
  const roleStr = metadata?.roles?.length ? metadata.roles[0] : 'Backend & Systems';

  if (chipText) {
    chipText.innerText = `👤 ${name} (${expStr})`;
  }
  if (nameEl) {
    nameEl.innerText = `${candidate?.name || name} · ${expStr} · ${roleStr}`;
  }
}

// ── In-Page Scraper Function (Injected into active tab) ──
function scrapeJobDetailsFromPage() {
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

  return { title, company, location, description };
}

// ── Run Direct Evaluation on Active Tab ──
async function evaluateCurrentTab() {
  const errorBox = document.getElementById('error-box');
  if (errorBox) errorBox.style.display = 'none';

  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    hideLoadingSkeleton();
    return;
  }

  if (currentSidepanelAbortController) {
    currentSidepanelAbortController.abort();
  }
  currentSidepanelAbortController = new AbortController();
  const currentSignal = currentSidepanelAbortController.signal;

  showLoadingSkeleton(tab.title ? tab.title.split(/ [|\-–—] /)[0].trim() : 'Active Job');

  // 14s timeout guard
  const timeoutId = setTimeout(() => {
    currentSidepanelAbortController?.abort();
  }, 14000);

  try {
    let scraped = null;
    try {
      const [execution] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeJobDetailsFromPage
      });
      scraped = execution?.result;
    } catch {
      // Scripting fallback (e.g., if page restricts injection)
    }

    if (!scraped || !scraped.title) {
      scraped = {
        title: tab.title ? tab.title.split(/ [|\-–—] /)[0].trim() : 'Job Opening',
        company: 'Detected Company',
        location: 'Detected Location',
        description: 'Job description'
      };
    }

    showLoadingSkeleton(scraped.title, scraped.company);

    const { customResume, activePersona } = await chrome.storage.local.get(['customResume', 'activePersona']);

    const res = await fetch(`${BACKEND_URL}/api/scan-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: currentSignal,
      body: JSON.stringify({
        job: {
          id: 'tab-' + Math.random().toString(36).slice(2, 8),
          title: scraped.title,
          company: scraped.company,
          location: scraped.location,
          description: scraped.description,
          coreMission: scraped.description.slice(0, 500),
          engineeringDemands: scraped.description.slice(0, 500)
        },
        resume: activePersona || 'custom',
        customResume
      })
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Server responded with status ${res.status}`);
    }

    const data = await res.json();
    if (data.verdict) {
      renderVerdict(data, scraped);
      chrome.storage.local.set({
        activeJobEvaluation: { data, scraped, timestamp: Date.now() },
        activeJobEvaluating: null
      }).catch(() => {});
    } else {
      throw new Error('Unexpected response format from Jev server');
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') return;
    console.error('Sidepanel scan error:', err);
    hideLoadingSkeleton();
    showError(err.message || 'Failed to scan job. Make sure backend is running on http://localhost:3001.');
  }
}

function showError(msg) {
  const errorBox = document.getElementById('error-box');
  const errorMsg = document.getElementById('error-message');
  if (errorBox && errorMsg) {
    errorMsg.innerText = msg;
    errorBox.style.display = 'block';
  }
}

// ── Render TypeSafe Verdict & Metrics ──
function renderVerdict(data, scraped) {
  hideLoadingSkeleton();
  const errorBox = document.getElementById('error-box');
  if (errorBox) errorBox.style.display = 'none';

  const container = document.getElementById('verdict-container');
  if (container) container.style.display = 'block';

  // Update header tab title & URL
  if (scraped?.title) {
    const titleEl = document.getElementById('active-tab-title');
    const urlEl = document.getElementById('active-tab-url');
    if (titleEl) titleEl.innerText = `${scraped.title} — ${scraped.company || ''}`;
    if (urlEl) urlEl.innerText = scraped.location || 'Detected Listing';
  }

  // Hero Recommendation Badge
  const heroBadge = document.getElementById('verdict-hero-badge');
  const heroDot = document.getElementById('verdict-dot');
  const pill = document.getElementById('verdict-pill');

  const isCanApply = data.verdict === 'can_apply';
  const isReach = data.verdict === 'reach_apply';

  heroBadge.className = 'cr-verdict-hero';
  heroDot.className = 'cr-verdict-dot';

  if (isCanApply) {
    heroBadge.classList.add('cr-verdict-hero-can-apply');
    heroDot.classList.add('cr-verdict-dot-can-apply');
    pill.innerText = 'HIGH FIT · CAN APPLY';
  } else if (isReach) {
    heroBadge.classList.add('cr-verdict-hero-reach-apply');
    heroDot.classList.add('cr-verdict-dot-reach-apply');
    pill.innerText = 'COMPETITIVE CONTENDER · REACH APPLY';
  } else {
    heroBadge.classList.add('cr-verdict-hero-mismatch');
    heroDot.classList.add('cr-verdict-dot-mismatch');
    pill.innerText = 'EXPERIENCE / TENURE GAP';
  }

  // Telemetry
  const latencyEl = document.getElementById('jev-latency');
  if (latencyEl) {
    latencyEl.innerText = `⚡ ${data.ms}ms · ${Math.round((data.verdictConfidence || 0.9) * 100)}% Conf`;
  }

  // Strategic Briefing
  const summaryTextEl = document.getElementById('subagent-summary-text');
  if (summaryTextEl) {
    summaryTextEl.innerText = data.subagentSignals?.summaryVerdict || 'Evaluation complete.';
  }

  // 1. Architecture Fit Tile
  const matchPct = data.matchPercentage || 75;
  const viabVal = document.getElementById('viability-val');
  const viabBar = document.getElementById('viability-bar');
  if (viabVal) viabVal.innerText = `${matchPct}%`;
  if (viabBar) {
    viabBar.style.width = `${matchPct}%`;
    viabBar.style.background = matchPct >= 70 ? '#10b981' : (matchPct >= 40 ? '#f59e0b' : '#f43f5e');
  }

  // 2. Systems Synergy Tile
  const techScore = Number(data.techScore || 3.0);
  const suitVal = document.getElementById('suitability-val');
  const suitBar = document.getElementById('suitability-bar');
  if (suitVal) suitVal.innerHTML = `${techScore.toFixed(1)}<span style="font-size:10px; font-weight:normal; color:#71717a;">/4</span>`;
  if (suitBar) {
    suitBar.style.width = `${Math.min(100, (techScore / 4) * 100)}%`;
    suitBar.style.background = techScore >= 2.5 ? '#10b981' : '#f59e0b';
  }

  // 3. Screen Odds Tile
  const interviewOdds = Number(data.interviewOdds || 0.7);
  const oddsPercent = Math.round(interviewOdds * 100);
  const oddsVal = document.getElementById('interview-odds-val');
  const oddsBar = document.getElementById('interview-odds-bar');
  if (oddsVal) oddsVal.innerText = `${oddsPercent}%`;
  if (oddsBar) {
    oddsBar.style.width = `${oddsPercent}%`;
    oddsBar.style.background = oddsPercent >= 50 ? '#10b981' : '#f43f5e';
  }

  // Experience Calibration Strip
  const reqExp = data.subagentSignals?.requiredExp || '2–4+ years';
  const candExp = data.subagentSignals?.candidateExp || '1.5 Years';
  const roleReqEl = document.getElementById('calib-role-req');
  const candExpEl = document.getElementById('calib-cand-exp');
  const noteEl = document.getElementById('calibration-note');

  if (roleReqEl) roleReqEl.innerText = reqExp;
  if (candExpEl) candExpEl.innerText = candExp;
  if (noteEl) {
    if (isReach) {
      noteEl.style.display = 'block';
      noteEl.innerText = '(Manageable stretch — tenure gap bridged by high-throughput Kafka & AWS infrastructure)';
    } else {
      noteEl.style.display = 'none';
    }
  }

  // Matched Deliverables Chips
  const matched = data.subagentSignals?.matchedDeliverables || [];
  const matchedContainer = document.getElementById('matched-chips');
  if (matchedContainer) {
    matchedContainer.innerHTML = matched.length
      ? matched.map(m => `<span class="cr-chip-green">✓ ${m}</span>`).join('')
      : '<span style="font-size:11px; color:#71717a;">General software engineering overlap</span>';
  }

  // Domain Nuance Chips
  const gaps = data.subagentSignals?.domainGaps || [];
  const nuanceSection = document.getElementById('domain-nuance-section');
  const nuanceContainer = document.getElementById('nuance-chips');
  if (nuanceSection && nuanceContainer) {
    if (gaps.length) {
      nuanceSection.style.display = 'block';
      nuanceContainer.innerHTML = gaps.map(g => `<span class="cr-chip-amber">⚠ ${g}</span>`).join('');
    } else {
      nuanceSection.style.display = 'none';
    }
  }
}

// ── Auto-Scan Detection for Any Career Page ──
function isCareerPageUrl(rawUrl = '') {
  const url = (rawUrl || '').toLowerCase();
  return (
    url.includes('google.com/about/careers') ||
    url.includes('careers.google.com') ||
    url.includes('linkedin.com/jobs') ||
    url.includes('currentjobid=') ||
    url.includes('/jobs/view/') ||
    url.includes('indeed.com') ||
    url.includes('wellfound.com') ||
    url.includes('workatastartup.com') ||
    url.includes('greenhouse.io') ||
    url.includes('lever.co') ||
    url.includes('ashbyhq.com') ||
    url.includes('myworkdayjobs.com') ||
    url.includes('amazon.jobs') ||
    url.includes('smartrecruiters.com') ||
    url.includes('/careers') ||
    url.includes('/jobs') ||
    url.includes('/positions')
  );
}

async function checkAndAutoScanTab(tab) {
  if (!tab || !tab.url) return;
  const url = tab.url;

  if (isCareerPageUrl(url) && url !== lastEvaluatedTabUrl) {
    lastEvaluatedTabUrl = url;
    evaluateCurrentTab();
  }
}

// ── Initialization ──
async function init() {
  await updateTabContext();

  const profileCard = document.getElementById('profile-container-card');
  const headerProfileChip = document.getElementById('header-profile-chip');
  const btnHideProfile = document.getElementById('btn-hide-profile-card');
  const btnDoneHide = document.getElementById('btn-done-hide-profile');
  const refreshBtn = document.getElementById('btn-quick-refresh');

  function toggleProfileCard(forceOpen = null) {
    if (!profileCard) return;
    const isCurrentlyOpen = profileCard.style.display !== 'none';
    const nextState = forceOpen !== null ? forceOpen : !isCurrentlyOpen;
    profileCard.style.display = nextState ? 'block' : 'none';
    chrome.storage.local.set({ profileHidden: !nextState }).catch(() => {});
  }

  headerProfileChip?.addEventListener('click', () => toggleProfileCard());
  btnHideProfile?.addEventListener('click', () => toggleProfileCard(false));
  btnDoneHide?.addEventListener('click', () => toggleProfileCard(false));

  // Quick scan button directly triggers evaluation
  refreshBtn?.addEventListener('click', () => {
    evaluateCurrentTab();
  });

  // Restore saved resume state
  const {
    customMetadata,
    customResume,
    customResumeText = '',
    profileHidden = true
  } = await chrome.storage.local.get(['customMetadata', 'customResume', 'customResumeText', 'profileHidden']);

  const customInput = document.getElementById('custom-resume-input');
  if (customInput && customResumeText) {
    customInput.value = customResumeText;
  }

  if (customMetadata && customResume) {
    renderParsedMetadata(customMetadata, customResume);
    updateProfileBarUI(customMetadata, customResume);
    if (profileCard) profileCard.style.display = profileHidden ? 'none' : 'block';
  } else {
    if (profileCard) profileCard.style.display = 'block';
  }

  function renderParsedMetadata(metadata, candidate) {
    const panel = document.getElementById('parsed-metadata-panel');
    if (!panel) return;
    panel.style.display = 'block';

    const eduEl = document.getElementById('meta-education');
    const expEl = document.getElementById('meta-experience');
    const sysEl = document.getElementById('meta-systems');
    const achEl = document.getElementById('meta-achievements');
    const yearsInput = document.getElementById('override-years');
    const senioritySelect = document.getElementById('override-seniority');

    if (eduEl && metadata?.college) {
      eduEl.innerHTML = `<strong>🎓 Education:</strong> ${metadata.college} ${metadata.degree ? '— ' + metadata.degree : ''} ${metadata.cgpa ? '(' + metadata.cgpa + ')' : ''}`;
    }
    if (expEl && metadata?.roles) {
      expEl.innerHTML = `<strong>💼 Roles:</strong> ${metadata.roles.join(', ')} <span style="color:#059669; font-family:ui-monospace, monospace;">(~${metadata.calculatedYears || 1.5} yrs)</span>`;
    }
    if (sysEl && metadata?.systemsHighlights?.length) {
      sysEl.innerHTML = `<strong>⚙️ Scale:</strong> ${metadata.systemsHighlights.slice(0, 2).join('; ')}`;
    }
    if (achEl && metadata?.achievements?.length) {
      achEl.innerHTML = `<strong>🏆 Caliber:</strong> ${metadata.achievements.join(' | ')}`;
    }

    if (yearsInput && metadata?.calculatedYears !== undefined) {
      yearsInput.value = metadata.calculatedYears;
    }
    if (senioritySelect && candidate?.seniorityTier) {
      senioritySelect.value = candidate.seniorityTier;
    }
  }

  // File Upload Handler (PDF / TXT)
  const fileInput = document.getElementById('resume-file-input');
  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const btnSave = document.getElementById('btn-save-resume');
    if (btnSave) {
      btnSave.innerText = 'Extracting Resume...';
      btnSave.disabled = true;
    }

    try {
      const formData = new FormData();
      formData.append('resume', file);

      const res = await fetch(`${BACKEND_URL}/api/upload-resume`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (data.candidate) {
        if (customInput && data.rawText) {
          customInput.value = data.rawText;
        }
        renderParsedMetadata(data.metadata, data.candidate);
        updateProfileBarUI(data.metadata, data.candidate);
        await chrome.storage.local.set({
          customResume: data.candidate,
          customResumeText: data.rawText || '',
          customMetadata: data.metadata || {},
          activePersona: 'custom',
          profileHidden: true
        });
        const statusEl = document.getElementById('resume-saved-status');
        if (statusEl) {
          statusEl.style.display = 'block';
          setTimeout(() => {
            statusEl.style.display = 'none';
            toggleProfileCard(false);
          }, 1200);
        }
        evaluateCurrentTab();
      } else {
        throw new Error(data.error || 'Failed to parse file');
      }
    } catch (err) {
      console.error('File upload error:', err);
      showError('Failed to parse uploaded resume: ' + err.message);
    } finally {
      if (btnSave) {
        btnSave.innerText = 'Save & Sync Profile';
        btnSave.disabled = false;
      }
    }
  });

  // Save / Calibrate custom resume handler
  document.getElementById('btn-save-resume')?.addEventListener('click', async () => {
    const text = customInput?.value || '';
    if (!text.trim()) {
      showError('Please paste your resume text or upload a resume file first.');
      return;
    }

    const btn = document.getElementById('btn-save-resume');
    btn.innerText = 'Syncing Profile with Jev...';
    btn.disabled = true;

    const yearsInput = document.getElementById('override-years');
    const senioritySelect = document.getElementById('override-seniority');
    const manualYears = yearsInput?.value ? Number(yearsInput.value) : undefined;
    const manualTier = senioritySelect?.value || undefined;

    try {
      const res = await fetch(`${BACKEND_URL}/api/parse-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          years: manualYears,
          seniorityTier: manualTier
        })
      });
      const data = await res.json();
      if (data.candidate) {
        renderParsedMetadata(data.metadata, data.candidate);
        updateProfileBarUI(data.metadata, data.candidate);
        await chrome.storage.local.set({
          customResume: data.candidate,
          customResumeText: text,
          customMetadata: data.metadata || {},
          activePersona: 'custom',
          profileHidden: true
        });
        const statusEl = document.getElementById('resume-saved-status');
        if (statusEl) {
          statusEl.style.display = 'block';
          setTimeout(() => {
            statusEl.style.display = 'none';
            toggleProfileCard(false);
          }, 1200);
        }
        evaluateCurrentTab();
      }
    } catch (err) {
      console.error('Failed to parse resume:', err);
      showError('Failed to parse resume profile. Ensure backend server is running on http://localhost:3001.');
    } finally {
      btn.innerText = 'Save & Sync Profile';
      btn.disabled = false;
    }
  });

  // Check storage on boot
  try {
    const { activeJobEvaluation, activeJobEvaluating } = await chrome.storage.local.get(['activeJobEvaluation', 'activeJobEvaluating']);

    if (activeJobEvaluation?.data && activeJobEvaluation?.scraped) {
      renderVerdict(activeJobEvaluation.data, activeJobEvaluation.scraped);
    } else if (activeJobEvaluating && (Date.now() - activeJobEvaluating.timestamp < 3500)) {
      showLoadingSkeleton(activeJobEvaluating.title, activeJobEvaluating.company);
      setTimeout(() => {
        const container = document.getElementById('verdict-container');
        if (!container || container.style.display === 'none') {
          evaluateCurrentTab();
        }
      }, 3500);
    } else {
      setTimeout(evaluateCurrentTab, 200);
    }
  } catch {
    setTimeout(evaluateCurrentTab, 200);
  }

  // ── Automatic Scanning on Tab Switch or Navigation ──
  chrome.tabs.onActivated.addListener(async () => {
    await updateTabContext();
    const tab = await getActiveTab();
    checkAndAutoScanTab(tab);
  });

  chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
      await updateTabContext();
      if (tab?.active) {
        checkAndAutoScanTab(tab);
      }
    }
  });

  // Listen for evaluations broadcast from content script
  chrome.runtime.onMessage?.addListener((message) => {
    if (message.type === 'JOB_EVALUATING') {
      showLoadingSkeleton(message.title, message.company);
    } else if (message.type === 'JOB_EVALUATED_AUTOMATICALLY' || message.type === 'ACTIVE_JOB_EVALUATED') {
      if (message.data && message.scraped) {
        renderVerdict(message.data, message.scraped);
      }
    }
  });

  // Real-time Storage Sync
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.activeJobEvaluating?.newValue) {
        const { title, company } = changes.activeJobEvaluating.newValue;
        showLoadingSkeleton(title, company);
      }
      if (changes.activeJobEvaluation?.newValue) {
        const { data, scraped } = changes.activeJobEvaluation.newValue;
        renderVerdict(data, scraped);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
