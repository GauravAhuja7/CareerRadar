// CareerRadar Side Panel Script (Manifest V3) — Developer-Grade Decision Engine
const BACKEND_URL = 'http://localhost:3001';

let currentSidepanelAbortController = null;
let lastEvaluatedTabUrl = '';
let activeJobData = null;
let lastGeneratedPitch = '';

function showLoadingSkeleton(title = '', company = '') {
  const verdictContainer = document.getElementById('verdict-container');
  const skeletonContainer = document.getElementById('loading-skeleton-container');
  const titleEl = document.getElementById('active-tab-title');
  const companyEl = document.getElementById('active-tab-url');
  const skeletonTitleEl = document.getElementById('skeleton-status-title');

  if (verdictContainer) verdictContainer.style.display = 'none';
  if (skeletonContainer) skeletonContainer.style.display = 'block';

  if (title && titleEl) titleEl.innerText = title;
  if (company && companyEl) companyEl.innerText = company;
  if (skeletonTitleEl) {
    skeletonTitleEl.innerText = title ? `Arbitrating Fit · ${title.slice(0, 20)}...` : 'Arbitrating Fit...';
  }
}

function hideLoadingSkeleton() {
  const skeletonContainer = document.getElementById('loading-skeleton-container');
  if (skeletonContainer) skeletonContainer.style.display = 'none';
}

function showToast(message = 'Copied') {
  const toast = document.getElementById('cr-toast');
  const toastMsg = document.getElementById('toast-message');
  if (!toast) return;
  if (toastMsg) toastMsg.innerText = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
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
    const viewJobLink = document.getElementById('btn-view-job-link');

    if (!tab) {
      if (titleEl) titleEl.innerText = 'DevOps Engineer';
      if (urlEl) urlEl.innerText = 'Detected Company';
      return;
    }

    if (viewJobLink && tab.url) {
      viewJobLink.href = tab.url;
    }

    const cleanTitle = tab.title ? tab.title.split(/ [|\-–—] /)[0].trim() : 'Detected Listing';
    if (titleEl && (!activeJobData || !activeJobData.scraped?.title)) {
      titleEl.innerText = cleanTitle;
    }
    if (urlEl && (!activeJobData || !activeJobData.scraped?.company)) {
      try {
        const u = new URL(tab.url);
        urlEl.innerText = u.hostname.replace('www.', '');
      } catch {
        urlEl.innerText = 'Detected Company';
      }
    }
  } catch (err) {
    console.error('Error updating tab context:', err);
  }
}

// ── Update Candidate Profile Header Chip & Info ──
function updateProfileBarUI(metadata, candidate) {
  const avatar = document.getElementById('profile-avatar');
  const nameLine = document.getElementById('profile-name-line');
  const subLine = document.getElementById('profile-sub-line');

  let fullName = candidate?.name || 'Candidate';
  if (!fullName || /indian|institute|college|university|custom profile/i.test(fullName)) {
    fullName = 'Candidate';
  }

  const firstName = fullName.split(' ')[0] || 'You';
  const initials = fullName !== 'Candidate'
    ? fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'CR';
  const expYears = metadata?.calculatedYears ?? candidate?.experienceYears ?? 0;
  const targetRole = candidate?.targetRole || 'Software Systems Engineer';
  const college = metadata?.college ? metadata.college.replace('Indian Institute of Technology, ', 'IIT ') : '';

  if (avatar) avatar.childNodes[0].nodeValue = initials + ' ';
  if (nameLine) nameLine.innerText = `${firstName} · ${expYears} yrs · ${targetRole}`;
  if (subLine) subLine.innerText = college ? `${college} · Open to opportunities` : 'Calibrated Profile · Ready to evaluate';
}

// ── Render Error/Offline State in Side Panel ──
function renderErrorState(errorMessage = 'Backend server is unreachable') {
  hideLoadingSkeleton();

  const verdictContainer = document.getElementById('verdict-container');
  if (verdictContainer) {
    verdictContainer.style.display = 'block';
    verdictContainer.className = 'cr-verdict-box verdict-error';
  }

  const headlineEl = document.getElementById('verdict-headline');
  const subtextEl = document.getElementById('verdict-subtext');
  const statusBadgeEl = document.getElementById('verdict-status-badge');
  const gaugePercent = document.getElementById('gauge-percent-text');
  const gaugeCircle = document.getElementById('gauge-bar-circle');

  if (headlineEl) headlineEl.innerText = 'OFFLINE';
  if (subtextEl) subtextEl.innerText = errorMessage + '. Click refresh (⌘R) to retry.';
  if (statusBadgeEl) statusBadgeEl.innerText = 'UNAVAILABLE';
  if (gaugePercent) gaugePercent.innerText = '—';
  if (gaugeCircle) {
    gaugeCircle.style.strokeDashoffset = '201.06'; // fully empty
  }

  // Clear metrics
  const fitMetricVal = document.getElementById('metric-fit-score');
  const fitMetricBar = document.getElementById('metric-fit-bar');
  const sysMetricVal = document.getElementById('metric-systems-score');
  const sysMetricBar = document.getElementById('metric-systems-bar');
  const oddsMetricVal = document.getElementById('metric-screen-odds');
  const oddsMetricBar = document.getElementById('metric-odds-bar');

  if (fitMetricVal) fitMetricVal.innerText = '—';
  if (fitMetricBar) fitMetricBar.style.width = '0%';
  if (sysMetricVal) sysMetricVal.innerText = '—';
  if (sysMetricBar) sysMetricBar.style.width = '0%';
  if (oddsMetricVal) oddsMetricVal.innerText = '—';
  if (oddsMetricBar) oddsMetricBar.style.width = '0%';

  // Clear evidence and tech alignment
  const evidenceList = document.getElementById('evidence-list');
  if (evidenceList) {
    evidenceList.innerHTML = `
      <div class="cr-evidence-item">
        <div class="cr-evidence-left">
          <svg class="cr-evidence-icon icon-mismatch" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span class="cr-evidence-text">Could not connect to evaluation server</span>
        </div>
        <span class="cr-evidence-tag tag-mismatch">Offline</span>
      </div>
    `;
  }

  const techList = document.getElementById('technical-alignment-list');
  if (techList) techList.innerHTML = '';

  lastGeneratedPitch = '';
}

// ── Build Dynamic Rationale from Actual API Data ──
function buildDynamicRationale(data, scraped, headline, expComp) {
  const evidence = data.evidence || [];
  const strongSkills = evidence.filter(e => e.status === 'strong').map(e => e.text);
  const goodSkills = evidence.filter(e => e.status === 'good').map(e => e.text);
  const stretches = evidence.filter(e => e.status === 'stretch' || e.status === 'mismatch').map(e => e.text);

  let rationale = '';
  if (strongSkills.length > 0) {
    rationale += `Candidate demonstrates strong alignment in ${strongSkills.slice(0, 3).join(', ')}. `;
  }
  if (goodSkills.length > 0) {
    rationale += `Good coverage in ${goodSkills.slice(0, 2).join(' and ')}. `;
  }
  if (expComp && expComp.required) {
    rationale += `Experience requirement: ${expComp.required} (candidate: ${expComp.candidate || 'N/A'}). `;
  }
  if (stretches.length > 0) {
    rationale += `Areas to address: ${stretches.slice(0, 2).join('; ')}. `;
  }
  rationale += `Verdict: ${headline}.`;

  return rationale || `Evaluation completed for ${scraped?.title || 'this role'} at ${scraped?.company || 'this company'}. Verdict: ${headline}.`;
}

// ── Build Dynamic Interview Pitch from Actual Match Data ──
function buildDynamicPitch(data, scraped) {
  const evidence = data.evidence || [];
  const strongSkills = evidence.filter(e => e.status === 'strong' || e.status === 'good').map(e => e.text);

  if (strongSkills.length === 0) {
    return `"My engineering background aligns with the ${scraped?.title || 'role'} requirements at ${scraped?.company || 'your company'}, and I'm eager to contribute production value from day one."`;
  }

  const topSkills = strongSkills.slice(0, 3).join(', ');
  return `"I've built and delivered production systems in ${topSkills}, which directly maps to the ${scraped?.title || 'role'} requirements. I'm positioned to contribute immediate value to ${scraped?.company || 'the team'}."`;
}

// ── Render Verdict in Side Panel ──
function renderVerdict(data, scraped) {
  hideLoadingSkeleton();

  activeJobData = { data, scraped };

  const verdictContainer = document.getElementById('verdict-container');
  if (verdictContainer) verdictContainer.style.display = 'block';

  const titleEl = document.getElementById('active-tab-title');
  const companyEl = document.getElementById('active-tab-url');
  const viewJobLink = document.getElementById('btn-view-job-link');

  if (titleEl && scraped?.title) titleEl.innerText = scraped.title;
  if (companyEl && scraped?.company) companyEl.innerText = scraped.company;
  if (viewJobLink && scraped?.url) viewJobLink.href = scraped.url;

  // 1. Primary Verdict Headline & Theme
  const headlineEl = document.getElementById('verdict-headline');
  const subtextEl = document.getElementById('verdict-subtext');
  const statusBadgeEl = document.getElementById('verdict-status-badge');

  const verdict = data.verdict || 'reach_apply';
  const headline = data.verdictHeadline || (verdict === 'can_apply' ? 'STRONG FIT' : (verdict === 'reach_apply' ? 'REACH APPLY' : 'EXP MISMATCH'));
  const subtext = data.verdictSubtext || 'Technical match is strong; experience is the main stretch.';
  const badgeLabel = data.badgeLabel || (verdict === 'can_apply' ? 'Direct Fit' : (verdict === 'reach_apply' ? 'Competitive Contender' : 'Tenure Filter'));

  if (headlineEl) headlineEl.innerText = headline;
  if (subtextEl) subtextEl.innerText = subtext;
  if (statusBadgeEl) statusBadgeEl.innerText = badgeLabel;

  if (verdictContainer) {
    verdictContainer.className = 'cr-verdict-box';
    if (verdict === 'can_apply') {
      verdictContainer.classList.add('verdict-can-apply');
    } else if (verdict === 'reach_apply') {
      // default amber styling
    } else {
      verdictContainer.classList.add('verdict-mismatch');
    }
  }

  // 2. Circular Gauge
  const fitScore = data.matchPercentage ?? 0;
  const gaugePercent = document.getElementById('gauge-percent-text');
  const gaugeCircle = document.getElementById('gauge-bar-circle');
  if (gaugePercent) gaugePercent.innerText = `${fitScore}%`;
  if (gaugeCircle) {
    const circumference = 201.06; // 2 * PI * 32
    const offset = circumference * (1 - fitScore / 100);
    gaugeCircle.style.strokeDashoffset = offset;
  }

  // 3. Core Metrics
  const fitMetricVal = document.getElementById('metric-fit-score');
  const fitMetricBar = document.getElementById('metric-fit-bar');
  const sysMetricVal = document.getElementById('metric-systems-score');
  const sysMetricBar = document.getElementById('metric-systems-bar');
  const oddsMetricVal = document.getElementById('metric-screen-odds');
  const oddsMetricBar = document.getElementById('metric-odds-bar');

  if (fitMetricVal) fitMetricVal.innerText = `${fitScore}%`;
  if (fitMetricBar) fitMetricBar.style.width = `${fitScore}%`;

  const techScore = data.techScore !== undefined ? data.techScore : 0;
  if (sysMetricVal) sysMetricVal.innerText = techScore.toFixed(1);
  if (sysMetricBar) sysMetricBar.style.width = `${Math.min(100, (techScore / 4) * 100)}%`;

  const screenOdds = data.interviewOdds !== undefined ? Math.round(data.interviewOdds * 100) : 0;
  if (oddsMetricVal) oddsMetricVal.innerText = `${screenOdds}%`;
  if (oddsMetricBar) oddsMetricBar.style.width = `${screenOdds}%`;

  // 4. Evidence Rows ("Why this verdict")
  const evidenceList = document.getElementById('evidence-list');
  if (evidenceList && data.evidence && data.evidence.length) {
    evidenceList.innerHTML = data.evidence.map(item => {
      const isCheck = item.status === 'strong' || item.status === 'good';
      const iconSvg = isCheck
        ? `<svg class="cr-evidence-icon icon-${item.status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>`
        : `<svg class="cr-evidence-icon icon-${item.status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>`;

      return `
        <div class="cr-evidence-item">
          <div class="cr-evidence-left">
            ${iconSvg}
            <span class="cr-evidence-text">${item.text}</span>
          </div>
          <span class="cr-evidence-tag tag-${item.status}">${item.tag}</span>
        </div>
      `;
    }).join('');
  }

  // 5. Experience Comparison
  const expReqDisplay = document.getElementById('exp-req-display');
  const expCandDisplay = document.getElementById('exp-cand-display');
  const expTypeBadge = document.getElementById('exp-eval-type-badge');
  const expNoteDisplay = document.getElementById('exp-note-display');

  const expComp = data.experienceComparison || {};

  if (expReqDisplay) expReqDisplay.innerText = expComp.required || '—';
  if (expCandDisplay) expCandDisplay.innerText = expComp.candidate || '—';
  if (expTypeBadge) expTypeBadge.innerText = expComp.evaluationType || 'Scope-Based';
  if (expNoteDisplay) {
    // L6 fix: use expScore as a subtle calibration indicator
    const scoreText = data.expScore !== undefined ? ` · Alignment: ${data.expScore}/4` : '';
    expNoteDisplay.innerText = (expComp.note || '') + scoreText;
  }

  // 6. Technical Alignment Bars
  const techList = document.getElementById('technical-alignment-list');
  if (techList && data.technicalAlignment && data.technicalAlignment.length) {
    techList.innerHTML = data.technicalAlignment.map(t => `
      <div class="cr-tech-row">
        <span class="cr-tech-skill">${t.skill}</span>
        <div class="cr-tech-bar-track">
          <div class="cr-tech-bar-fill" style="width: ${t.percentage}%;"></div>
        </div>
        <span class="cr-tech-percent">${t.percentage}%</span>
      </div>
    `).join('');
  }

  // 7. Dynamic Reasoning Drawer Content (C3 fix — no more hardcoded text)
  const deepRationale = document.getElementById('drawer-deep-rationale');
  const interviewPitch = document.getElementById('drawer-interview-pitch');
  const probsList = document.getElementById('drawer-probabilities-list');
  const footerTelemetry = document.getElementById('footer-telemetry');

  if (footerTelemetry) {
    footerTelemetry.innerText = `Analyzed in ${data.ms || '—'}ms`;
  }

  if (deepRationale) {
    deepRationale.innerText = buildDynamicRationale(data, scraped, headline, expComp);
  }

  // Generate dynamic pitch from actual match data
  lastGeneratedPitch = buildDynamicPitch(data, scraped);
  if (interviewPitch) {
    interviewPitch.innerText = lastGeneratedPitch;
  }

  if (probsList && data.verdictProbabilities) {
    const probs = data.verdictProbabilities;
    probsList.innerHTML = Object.entries(probs).map(([k, v]) => `
      <div style="display:flex; justify-content:space-between;">
        <span style="color:var(--cr-text-secondary);">${k}:</span>
        <strong>${Math.round((Number(v) || 0) * 100)}%</strong>
      </div>
    `).join('');
  }
}

// ── Sole Evaluation Engine (H2/H3 fix) ──
let currentEvaluatedJobId = null;

async function evaluateJobDetails(scraped, fallbackTab = null) {
  if (!scraped || (!scraped.title && !scraped.description)) return;

  const jobId = scraped.jobId || scraped.url || (fallbackTab ? `tab-${fallbackTab.id}` : 'current-job');
  if (currentEvaluatedJobId === jobId && activeJobData) return;
  currentEvaluatedJobId = jobId;

  if (currentSidepanelAbortController) {
    currentSidepanelAbortController.abort();
  }
  currentSidepanelAbortController = new AbortController();

  showLoadingSkeleton(scraped.title || 'Scanning Job...', scraped.company || 'Local Arbitrator');

  try {
    const { activePersona = 'custom', customResume = null } = await chrome.storage.local.get([
      'activePersona',
      'customResume'
    ]);

    const res = await fetch(`${BACKEND_URL}/api/scan-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: currentSidepanelAbortController.signal,
      body: JSON.stringify({
        job: {
          id: jobId,
          title: scraped.title,
          company: scraped.company,
          location: scraped.location,
          description: scraped.description,
          coreMission: scraped.description?.slice(0, 500) || '',
          engineeringDemands: scraped.description?.slice(0, 500) || '',
          url: scraped.url || ''
        },
        resume: activePersona,
        customResume
      })
    });

    if (!res.ok) {
      throw new Error(`Server status ${res.status}`);
    }

    const data = await res.json();
    renderVerdict(data, scraped);
    chrome.storage.local.set({ activeJobEvaluation: { data, scraped } }).catch(() => {});
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('Scan error:', err);
    // C2 fix: Show explicit error state instead of fake hardcoded verdict
    const errorMsg = err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')
      ? 'Backend server is unreachable. Start the server with npm run server'
      : `Evaluation failed: ${err.message || 'Unknown error'}`;
    renderErrorState(errorMsg);
  }
}

// ── Tab Evaluation Execution ──
async function evaluateCurrentTab(force = false) {
  const tab = await getActiveTab();
  if (!tab || !tab.id || tab.url?.startsWith('chrome://')) return;

  if (force) {
    currentEvaluatedJobId = null;
    activeJobData = null;
  }

  // Request scraped details from the canonical content script
  let scraped = null;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_ACTIVE_JOB_DETAILS' });
    if (response && (response.title || response.description)) {
      scraped = { ...response, url: tab.url || '' };
    }
  } catch {
    // Content script may not be loaded yet on this tab; inject it dynamically
    try {
      if (chrome.scripting && tab.id) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        const retry = await chrome.tabs.sendMessage(tab.id, { type: 'GET_ACTIVE_JOB_DETAILS' });
        if (retry && (retry.title || retry.description)) {
          scraped = { ...retry, url: tab.url || '' };
        }
      }
    } catch (injErr) {
      console.warn('Dynamic script injection failed:', injErr);
    }
  }

  // Fallback: extract page body text directly if content script extraction was insufficient
  if (!scraped || !scraped.description || scraped.description.length < 50) {
    try {
      if (chrome.scripting && tab.id) {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            title: document.querySelector('h1, h2, [data-qa="job-title"]')?.innerText?.trim() || document.title,
            bodyText: document.body?.innerText?.slice(0, 10000) || ''
          })
        });

        if (result?.result?.bodyText && result.result.bodyText.length > 50) {
          const rawTitle = result.result.title || tab.title || 'Job Opportunity';
          const cleanTitle = rawTitle.split(/ [|\-–—] /)[0].trim() || 'Software Engineer';
          let derivedCompany = 'Detected Company';
          try {
            const hostParts = new URL(tab.url).hostname.replace(/^www\./, '').split('.');
            if (hostParts[0] && hostParts[0] !== 'localhost') {
              derivedCompany = hostParts[0].charAt(0).toUpperCase() + hostParts[0].slice(1);
            }
          } catch {}

          scraped = {
            jobId: `${cleanTitle}::${derivedCompany}::${tab.id}`,
            title: cleanTitle,
            company: derivedCompany,
            location: 'Remote / Hybrid',
            description: result.result.bodyText,
            url: tab.url || ''
          };
        }
      }
    } catch (e) {
      console.warn('Direct DOM extraction fallback failed:', e);
    }
  }

  if (!scraped) {
    const cleanTitle = tab.title ? tab.title.split(/ [|\-–—] /)[0].trim() : 'Detected Listing';
    scraped = {
      jobId: `tab-${tab.id}`,
      title: cleanTitle,
      company: 'Detected Company',
      location: 'Current Tab',
      description: `Job posting: ${tab.title || tab.url || ''}`,
      url: tab.url || ''
    };
  }

  await evaluateJobDetails(scraped, tab);
}

// ── Canonical Check if URL is a Job Page (M12 fix) ──
const JOB_BOARD_DOMAINS = [
  'linkedin.com',
  'indeed.com',
  'google.com/about/careers',
  'careers.google.com',
  'wellfound.com',
  'angel.co',
  'workatastartup.com',
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'myworkdayjobs.com',
  'amazon.jobs',
  'smartrecruiters.com',
  'icims.com',
  'jobvite.com'
];

function isJobUrl(url = '') {
  const u = url.toLowerCase();
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (host.includes('linkedin.com') && (path.includes('/jobs') || u.includes('currentjobid='))) return true;
    if (host.includes('google.com') && (path.includes('/careers') || path.includes('/jobs'))) return true;
    if (JOB_BOARD_DOMAINS.some(d => host.includes(d) || u.includes(d))) return true;
    if (/(^|\/)(?:jobs|careers|positions)(\/|$)/.test(path)) return true;
  } catch {
    if (JOB_BOARD_DOMAINS.some(d => u.includes(d))) return true;
  }
  return false;
}

function checkAndAutoScanTab(tab) {
  if (!tab || !tab.url) return;
  if (isJobUrl(tab.url)) {
    if (tab.url !== lastEvaluatedTabUrl) {
      lastEvaluatedTabUrl = tab.url;
      evaluateCurrentTab();
    }
  }
}

// ── Initialization & Event Listeners ──
async function init() {
  await updateTabContext();

  const profileEditorCard = document.getElementById('profile-container-card');
  const btnToggleProfile = document.getElementById('btn-toggle-profile-editor');
  const btnHeaderEdit = document.getElementById('btn-header-edit-profile');
  const btnHideProfile = document.getElementById('btn-hide-profile-card');
  const btnDoneHide = document.getElementById('btn-done-hide-profile');
  const refreshBtn = document.getElementById('btn-quick-refresh');

  function toggleProfileCard(forceOpen = null) {
    if (!profileEditorCard) return;
    const isCurrentlyOpen = profileEditorCard.style.display !== 'none';
    const nextState = forceOpen !== null ? forceOpen : !isCurrentlyOpen;
    profileEditorCard.style.display = nextState ? 'block' : 'none';
  }

  btnToggleProfile?.addEventListener('click', () => toggleProfileCard());
  btnHeaderEdit?.addEventListener('click', () => toggleProfileCard());
  btnHideProfile?.addEventListener('click', () => toggleProfileCard(false));
  btnDoneHide?.addEventListener('click', () => toggleProfileCard(false));

  refreshBtn?.addEventListener('click', () => {
    evaluateCurrentTab(true);
  });

  // Reasoning Drawer Controls
  const reasoningDrawer = document.getElementById('reasoning-drawer');
  const reasoningBackdrop = document.getElementById('reasoning-backdrop');
  const btnViewReasoning = document.getElementById('btn-view-reasoning');
  const btnCloseReasoning = document.getElementById('btn-close-reasoning');
  const btnCopyPitch = document.getElementById('btn-copy-pitch');

  function toggleReasoningDrawer(open = null) {
    if (!reasoningDrawer || !reasoningBackdrop) return;
    const shouldOpen = open !== null ? open : !reasoningDrawer.classList.contains('open');
    if (shouldOpen) {
      reasoningDrawer.classList.add('open');
      reasoningBackdrop.classList.add('visible');
    } else {
      reasoningDrawer.classList.remove('open');
      reasoningBackdrop.classList.remove('visible');
    }
  }

  btnViewReasoning?.addEventListener('click', () => toggleReasoningDrawer(true));
  btnCloseReasoning?.addEventListener('click', () => toggleReasoningDrawer(false));
  reasoningBackdrop?.addEventListener('click', () => toggleReasoningDrawer(false));

  btnCopyPitch?.addEventListener('click', () => {
    if (lastGeneratedPitch) {
      navigator.clipboard.writeText(lastGeneratedPitch).then(() => {
        showToast('✓ Dynamic pitch copied to clipboard');
      }).catch(() => {
        showToast('Failed to copy pitch');
      });
    }
  });

  // Apply Anyway Button Handler
  const btnApplyAnyway = document.getElementById('btn-apply-anyway');
  btnApplyAnyway?.addEventListener('click', () => {
    showToast('🚀 Navigating to job application...');
    getActiveTab().then(tab => {
      if (tab?.id) chrome.tabs.update(tab.id, { active: true });
    });
  });

  // Keyboard Shortcuts (⌘R / Ctrl+R to rescan, ⌘↵ / Ctrl+Enter to apply, Esc to close drawer)
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
      e.preventDefault();
      evaluateCurrentTab(true);
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      btnApplyAnyway?.click();
    } else if (e.key === 'Escape') {
      toggleReasoningDrawer(false);
      toggleProfileCard(false);
    }
  });

  // Restore saved resume profile
  const {
    customMetadata,
    customResume,
    customResumeText = ''
  } = await chrome.storage.local.get(['customMetadata', 'customResume', 'customResumeText']);

  const customInput = document.getElementById('custom-resume-input');
  if (customInput && customResumeText) {
    customInput.value = customResumeText;
  }

  if (customMetadata || customResume) {
    updateProfileBarUI(customMetadata, customResume);
  }

  // Resume File Upload Handler
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
        if (customInput && data.rawText) customInput.value = data.rawText;
        updateProfileBarUI(data.metadata, data.candidate);
        await chrome.storage.local.set({
          customResume: data.candidate,
          customResumeText: data.rawText || '',
          customMetadata: data.metadata || {},
          activePersona: 'custom'
        });
        showToast('✓ Profile updated from resume');
        toggleProfileCard(false);
        evaluateCurrentTab();
      }
    } catch (err) {
      console.error('File parse error:', err);
    } finally {
      if (btnSave) {
        btnSave.innerText = 'Save Profile';
        btnSave.disabled = false;
      }
    }
  });

  // Save Raw Text Profile Button
  const btnSaveResume = document.getElementById('btn-save-resume');
  btnSaveResume?.addEventListener('click', async () => {
    const text = customInput?.value?.trim() || '';
    const yearsVal = document.getElementById('override-years')?.value;
    const seniorityVal = document.getElementById('override-seniority')?.value;

    if (!text || text.length < 20) {
      showToast('Please paste valid resume text (min 20 chars)');
      return;
    }

    btnSaveResume.innerText = 'Syncing...';
    btnSaveResume.disabled = true;

    try {
      const res = await fetch(`${BACKEND_URL}/api/parse-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          years: yearsVal,
          seniorityTier: seniorityVal
        })
      });

      const data = await res.json();
      if (data.candidate) {
        updateProfileBarUI(data.metadata, data.candidate);
        await chrome.storage.local.set({
          customResume: data.candidate,
          customResumeText: text,
          customMetadata: data.metadata || {},
          activePersona: 'custom'
        });
        showToast('✓ Profile saved & calibrated');
        toggleProfileCard(false);
        evaluateCurrentTab();
      }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      btnSaveResume.innerText = 'Save Profile';
      btnSaveResume.disabled = false;
    }
  });

  // Check Storage on Boot
  try {
    const { activeJobEvaluation } = await chrome.storage.local.get(['activeJobEvaluation']);
    if (activeJobEvaluation?.data && activeJobEvaluation?.scraped) {
      renderVerdict(activeJobEvaluation.data, activeJobEvaluation.scraped);
    } else {
      setTimeout(evaluateCurrentTab, 200);
    }
  } catch {
    setTimeout(evaluateCurrentTab, 200);
  }

  // Automatic Scanning on Tab Switch or Navigation
  chrome.tabs.onActivated?.addListener(async () => {
    await updateTabContext();
    const tab = await getActiveTab();
    checkAndAutoScanTab(tab);
  });

  chrome.tabs.onUpdated?.addListener(async (_tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
      await updateTabContext();
      if (tab?.active) {
        checkAndAutoScanTab(tab);
      }
    }
  });

  // Listen for evaluations broadcast from content script (H2/H3 fix)
  chrome.runtime.onMessage?.addListener((message) => {
    if (message.type === 'JOB_CONTEXT_UPDATED' && message.details) {
      evaluateJobDetails(message.details);
    }
  });

  // Handle View Job external tab link safely without sidepanel navigation
  const viewJobLink = document.getElementById('btn-view-job-link');
  viewJobLink?.addEventListener('click', (e) => {
    e.preventDefault();
    const targetUrl = viewJobLink.getAttribute('data-url') || viewJobLink.href;
    if (targetUrl && targetUrl !== '#' && !targetUrl.startsWith('javascript:')) {
      chrome.tabs.create({ url: targetUrl });
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
