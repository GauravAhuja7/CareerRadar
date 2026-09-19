import { useState, useEffect, useMemo } from 'react';
import {
  Home,
  BarChart2,
  Key,
  BookOpen,
  ChevronDown,
  Plus,
  RefreshCw,
  Search,
  X,
  FileText,
  ArrowUpRight
} from 'lucide-react';

interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  postedDaysAgo: number;
  repostCount: number;
  applicantCount: number;
  hiringManager: string | null;
  experienceScope: string;
  autonomyLevel: string;
  coreMission: string;
  engineeringDemands: string;
  cultureReality: string;
  archetype: 'high_signal' | 'ghost_job' | 'toxic_lowball' | 'skill_mismatch' | 'compliance_zombie';
}

interface CandidateResume {
  id: string;
  name: string;
  targetRole: string;
  experienceYears: number;
  seniorityTier: string;
  engineeringArchetype: string;
  demonstratedScaleAndScope: string;
  autonomyTrackRecord: string;
  primaryTechnicalDomains: string[];
  fullResumeText: string;
}

interface ScanResult {
  jobId: string;
  ms: number;
  viabilityIndex: number;
  ghostProb: number;
  suitabilityScore: number;
  autonomyScore: number;
  burnoutScore: number;
  verdict: 'priority_apply' | 'reach_apply' | 'skip_mismatch' | 'skip_ghost_job';
  verdictConfidence: number;
  verdictProbabilities: Record<string, number>;
  suitabilityProbabilities: Record<string, number>;
  model: string;
  tokens?: { input_tokens: number; output_tokens: number };
  subagentSignals: {
    candidateArchetype: string;
    roleDemandsSummary: string;
    flags: string[];
    candidateSeniority: string;
    jobAutonomyLevel: string;
  };
  rawAnswers: any;
}

export default function App() {
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [personas, setPersonas] = useState<Record<string, CandidateResume>>({});
  const [activePersonaKey, setActivePersonaKey] = useState<string>('alex');
  const [customResume, setCustomResume] = useState<CandidateResume | null>(null);

  // Scan state
  const [results, setResults] = useState<Record<string, ScanResult>>({});
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isAutoScanning, setIsAutoScanning] = useState<boolean>(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [verdictFilter, setVerdictFilter] = useState<string>('all');

  // Resume Modal
  const [isResumeModalOpen, setIsResumeModalOpen] = useState<boolean>(false);
  const [resumeTextInput, setResumeTextInput] = useState<string>('');
  const [customNameInput, setCustomNameInput] = useState<string>('Gaurav Ahuja');
  const [customYearsInput, setCustomYearsInput] = useState<string>('5.5');
  const [customRoleInput, setCustomRoleInput] = useState<string>('Senior Full-Stack Engineer');

  const activeCandidate = useMemo(() => {
    if (activePersonaKey === 'custom' && customResume) return customResume;
    return personas[activePersonaKey] || {
      id: 'alex',
      name: 'Alex Chen',
      targetRole: 'Senior Full-Stack Engineer',
      experienceYears: 5.5,
      seniorityTier: 'Senior',
      engineeringArchetype: 'Product-Focused Systems Engineer with proven scale track record',
      demonstratedScaleAndScope: 'Architected high-throughput trading dashboard (120k active users, 45k events/sec). Reduced p95 latency by 42%.',
      autonomyTrackRecord: 'Autonomous technical owner, authored architecture RFCs, mentored 3 engineers.',
      primaryTechnicalDomains: ['Modern Web Architecture', 'Distributed Caching', 'High-Throughput APIs'],
      fullResumeText: ''
    };
  }, [activePersonaKey, customResume, personas]);

  // Initial Data Fetch
  useEffect(() => {
    fetch('http://localhost:3001/api/jobs')
      .then(res => res.json())
      .then(data => {
        if (data.jobs) setJobs(data.jobs);
      })
      .catch(err => console.error('Error loading jobs:', err));

    fetch('http://localhost:3001/api/personas')
      .then(res => res.json())
      .then(data => {
        if (data.personas) setPersonas(data.personas);
      })
      .catch(err => console.error('Error loading personas:', err));
  }, []);

  // Trigger scan for a job
  const scanJob = async (job: JobListing, personaOverride?: CandidateResume) => {
    const candidate = personaOverride || activeCandidate;
    setScanningIds(prev => new Set(prev).add(job.id));

    try {
      const res = await fetch('http://localhost:3001/api/scan-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job,
          customResume: candidate
        })
      });
      const data = await res.json();
      if (res.ok) {
        setResults(prev => ({ ...prev, [job.id]: data }));
      }
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setScanningIds(prev => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  };

  // Scan all jobs
  const scanAllJobs = async (personaOverride?: CandidateResume) => {
    setIsAutoScanning(true);
    const candidate = personaOverride || activeCandidate;
    for (const job of jobs) {
      await scanJob(job, candidate);
      await new Promise(r => setTimeout(r, 90));
    }
    setIsAutoScanning(false);
  };

  // Switch persona & rescan
  const handlePersonaChange = (key: string) => {
    setActivePersonaKey(key);
    setResults({});
    const targetCandidate = key === 'custom' && customResume ? customResume : personas[key];
    if (targetCandidate && jobs.length > 0) {
      scanAllJobs(targetCandidate);
    }
  };

  // Auto scan on load
  useEffect(() => {
    if (jobs.length > 0 && Object.keys(results).length === 0) {
      scanAllJobs();
    }
  }, [jobs]);

  // Handle custom resume parsing
  const handleParseCustomResume = async () => {
    if (!resumeTextInput.trim()) return;
    try {
      const res = await fetch('http://localhost:3001/api/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: resumeTextInput,
          name: customNameInput || 'Custom Profile',
          years: customYearsInput || '5',
          targetRole: customRoleInput || 'Software Engineer'
        })
      });
      const data = await res.json();
      if (data.candidate) {
        setCustomResume(data.candidate);
        setActivePersonaKey('custom');
        setIsResumeModalOpen(false);
        setResults({});
        scanAllJobs(data.candidate);
      }
    } catch (err) {
      console.error('Failed to parse resume:', err);
    }
  };

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const matchesSearch =
        job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.coreMission.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      const res = results[job.id];
      if (verdictFilter === 'all') return true;
      if (!res) return true;

      if (verdictFilter === 'apply') return res.verdict === 'priority_apply';
      if (verdictFilter === 'ghost') return res.ghostProb >= 0.5 || res.verdict === 'skip_ghost_job';
      if (verdictFilter === 'mismatch') return res.verdict === 'skip_mismatch';
      if (verdictFilter === 'reach') return res.verdict === 'reach_apply';

      return true;
    });
  }, [jobs, results, searchQuery, verdictFilter]);

  const selectedJob = useMemo(() => {
    return jobs.find(j => j.id === selectedJobId) || null;
  }, [jobs, selectedJobId]);

  const selectedResult = useMemo(() => {
    return selectedJobId ? results[selectedJobId] : null;
  }, [results, selectedJobId]);

  return (
    <div className="min-h-screen bg-white text-zinc-950 flex font-sans antialiased selection:bg-zinc-200">
      
      {/* ── Left Sidebar (Clean TypeSafe Aesthetic) ── */}
      <aside className="w-64 border-r border-zinc-200 bg-[#fafafa] flex flex-col justify-between flex-shrink-0 min-h-screen">
        
        <div>
          {/* Brand Header */}
          <div className="p-4 flex items-center justify-between border-b border-zinc-200">
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 bg-black flex items-center justify-center rounded-xs">
                <div className="w-1.5 h-1.5 bg-white" />
              </div>
              <span className="font-extrabold text-sm tracking-tight uppercase">
                GHOSTHUNTER
              </span>
            </div>
            <span className="text-[10px] font-mono text-zinc-400">v1.2</span>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            <a
              href="#"
              className="flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-md bg-zinc-200/80 text-zinc-950"
            >
              <Home className="w-4 h-4 text-zinc-800" />
              <span>Live Job Radar</span>
            </a>

            <button
              onClick={() => setIsResumeModalOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-md text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 transition-colors text-left"
            >
              <FileText className="w-4 h-4 text-zinc-400" />
              <span>Resume Profile</span>
            </button>

            <a
              href="#telemetry"
              className="flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-md text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 transition-colors"
            >
              <BarChart2 className="w-4 h-4 text-zinc-400" />
              <span>Jev Telemetry</span>
            </a>

            <a
              href="#keys"
              className="flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-md text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 transition-colors"
            >
              <Key className="w-4 h-4 text-zinc-400" />
              <span>API Keys</span>
            </a>

            <a
              href="https://docs.typesafe.ai"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between px-3 py-2 text-xs font-medium rounded-md text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <BookOpen className="w-4 h-4 text-zinc-400" />
                <span>TypeSafe Docs</span>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" />
            </a>
          </nav>
        </div>

        {/* User Card */}
        <div className="p-3 border-t border-zinc-200">
          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-100 cursor-pointer transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-black text-white text-xs font-bold flex items-center justify-center font-mono">
                GA
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-zinc-900 leading-tight">Gaurav Ahuja</span>
                <span className="text-[11px] text-zinc-500">Gaurav's ORG</span>
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </div>
        </div>

      </aside>

      {/* ── Main Canvas ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        
        {/* Top Hero Banner */}
        <div className="border-b border-zinc-200 bg-white">
          <div className="max-w-6xl mx-auto p-8">
            
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-8 border-b border-zinc-200">
              
              {/* Headline */}
              <div className="space-y-4 max-w-xl">
                <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                  <span>VIEW LIVE RADAR</span>
                  <span>⊕</span>
                </div>

                <h1 className="text-4xl font-extrabold tracking-tight text-zinc-950">
                  GhostHunter
                </h1>

                <p className="text-sm text-zinc-600 leading-relaxed">
                  Real-time career decision engine powered by TypeSafe Jev System One.
                  Evaluates demonstrated engineering scale, project scope, and hiring legitimacy—not naive keyword filters.
                </p>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={() => scanAllJobs()}
                    disabled={isAutoScanning}
                    className="btn-black"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isAutoScanning ? 'animate-spin' : ''}`} />
                    {isAutoScanning ? 'Evaluating System One...' : 'Scan Live Feed →'}
                  </button>

                  <button
                    onClick={() => setIsResumeModalOpen(true)}
                    className="px-3.5 py-2 text-xs font-semibold rounded-md border border-zinc-200 hover:bg-zinc-50 text-zinc-800 transition-colors flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5 text-zinc-500" />
                    Configure Resume
                  </button>
                </div>
              </div>

              {/* Blueprint Primitive Card (Exact reproduction from user's image) */}
              <div className="border border-zinc-200 bg-[#fafafa] p-4 rounded-lg w-full md:w-80 font-mono text-[10px] space-y-3">
                <div className="flex items-center justify-between text-zinc-400 pb-2 border-b border-zinc-200">
                  <span>JEV V1.13 SYSTEM ONE</span>
                  <span>ALHF-RLCD ⊕</span>
                </div>

                {/* NOUL representation */}
                <div className="space-y-1">
                  <div className="flex justify-between text-zinc-600 font-bold">
                    <span>NOUL // PROBABILISTIC BOOLEAN</span>
                    <span className="text-zinc-950 bg-zinc-200 px-1 rounded">12% TRUE</span>
                  </div>
                  <div className="text-zinc-400 text-[9px]">IS THIS POSTING A GHOST JOB?</div>
                  <div className="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-black h-full w-[12%]" />
                  </div>
                </div>

                {/* CHOICE representation */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-zinc-600 font-bold">
                    <span>CHOICE // CATEGORICAL DECISION</span>
                    <span className="text-black font-bold">APPLY</span>
                  </div>
                  <div className="flex gap-1.5 text-[9px] text-zinc-500">
                    <span className="bg-black text-white px-1.5 py-0.5 rounded">PRIORITY (98%)</span>
                    <span className="border border-zinc-300 px-1.5 py-0.5 rounded">SKIP (2%)</span>
                  </div>
                </div>

                {/* SCORE representation */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-zinc-600 font-bold">
                    <span>SCORE // HOLISTIC FIT</span>
                    <span className="text-zinc-950 font-bold">3.8 / 4.0</span>
                  </div>
                  <div className="flex justify-between text-[8px] text-zinc-400">
                    <span>0: MISMATCH</span>
                    <span>2: MODERATE</span>
                    <span>4: BULLSEYE</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Candidate Persona Selector */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-6 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono uppercase text-[10px] text-zinc-500 tracking-wider">
                  Active Candidate Profile:
                </span>
                <span className="font-bold text-zinc-900">
                  {activeCandidate.name} ({activeCandidate.seniorityTier} • {activeCandidate.experienceYears}y exp)
                </span>
              </div>

              {/* Persona Buttons */}
              <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-md border border-zinc-200 text-xs">
                <button
                  onClick={() => handlePersonaChange('alex')}
                  className={`px-2.5 py-1 rounded font-medium transition-all ${
                    activePersonaKey === 'alex'
                      ? 'bg-white text-zinc-950 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-950'
                  }`}
                >
                  Alex (Full-Stack 5.5y)
                </button>

                <button
                  onClick={() => handlePersonaChange('maya')}
                  className={`px-2.5 py-1 rounded font-medium transition-all ${
                    activePersonaKey === 'maya'
                      ? 'bg-white text-zinc-950 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-950'
                  }`}
                >
                  Maya (Infra 8y)
                </button>

                <button
                  onClick={() => handlePersonaChange('jordan')}
                  className={`px-2.5 py-1 rounded font-medium transition-all ${
                    activePersonaKey === 'jordan'
                      ? 'bg-white text-zinc-950 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-950'
                  }`}
                >
                  Jordan (Junior 1.5y)
                </button>

                <button
                  onClick={() => setIsResumeModalOpen(true)}
                  className={`px-2.5 py-1 rounded font-medium transition-all flex items-center gap-1 ${
                    activePersonaKey === 'custom'
                      ? 'bg-white text-zinc-950 shadow-xs font-bold'
                      : 'text-zinc-600 hover:text-zinc-950'
                  }`}
                >
                  <Plus className="w-3 h-3" />
                  {customResume ? 'Custom Resume' : 'Custom'}
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* ── Main Feed & Inspection Grid ── */}
        <div className="max-w-6xl w-full mx-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Job Feed (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            
            {/* Filter Bar */}
            <div className="border border-zinc-200 rounded-lg p-3 bg-[#fafafa] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter jobs or engineering scope..."
                  className="w-full bg-white border border-zinc-200 rounded px-2.5 pl-8 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-zinc-500"
                />
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 text-[11px] overflow-x-auto w-full sm:w-auto">
                {[
                  { key: 'all', label: 'All Roles (8)' },
                  { key: 'apply', label: 'Priority Apply' },
                  { key: 'ghost', label: 'Ghost Jobs' },
                  { key: 'reach', label: 'Reach Roles' },
                  { key: 'mismatch', label: 'Mismatch' }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setVerdictFilter(tab.key)}
                    className={`px-2 py-1 rounded font-mono transition-colors ${
                      verdictFilter === tab.key
                        ? 'bg-black text-white'
                        : 'text-zinc-600 hover:bg-zinc-200/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Job Listings List */}
            <div className="space-y-3">
              {filteredJobs.map(job => {
                const res = results[job.id];
                const isScanning = scanningIds.has(job.id);
                const isSelected = selectedJobId === job.id;

                return (
                  <div
                    key={job.id}
                    id={`job-card-${job.id}`}
                    onClick={() => setSelectedJobId(job.id)}
                    className={`typesafe-card p-4.5 cursor-pointer transition-all ${
                      isSelected ? 'border-zinc-900 bg-zinc-50/50 ring-1 ring-zinc-900' : ''
                    }`}
                  >
                    {/* Header: Title, Company, Comp */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-zinc-950 tracking-tight hover:underline">
                            {job.title}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400 uppercase">
                            [{job.location}]
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-zinc-600 mt-1">
                          <span className="font-medium text-zinc-900">{job.company}</span>
                          <span className="text-zinc-300">•</span>
                          <span className="font-mono text-zinc-700">{job.salary}</span>
                        </div>

                        <p className="text-xs text-zinc-600 mt-2 line-clamp-2 leading-relaxed">
                          {job.coreMission}
                        </p>
                      </div>

                      {/* Viability Index */}
                      {res && (
                        <div className="text-right font-mono flex-shrink-0">
                          <div className="text-xs font-bold text-zinc-900">
                            {res.viabilityIndex}%
                          </div>
                          <div className="text-[9px] text-zinc-400 uppercase">
                            Viability
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Injected Badges (Holistic Jev Output) */}
                    <div className="mt-3.5 pt-3 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                      
                      {isScanning && (
                        <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Evaluating holistic scope with Jev System One...</span>
                        </div>
                      )}

                      {res && (
                        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                          
                          {/* Ghost Job Probe */}
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                            res.ghostProb >= 0.5
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            {res.ghostProb >= 0.5
                              ? `🔴 ${Math.round(res.ghostProb * 100)}% GHOST JOB`
                              : `🟢 ACTIVE (${Math.round(res.ghostProb * 100)}% GHOST P)`}
                          </span>

                          {/* Autonomy & Seniority Match */}
                          <span className="px-2 py-0.5 rounded border border-zinc-200 bg-zinc-50 text-zinc-700 text-[10px]">
                            SCOPE: {(job.autonomyLevel || 'AUTONOMOUS IC').toUpperCase()}
                          </span>

                          {/* Holistic Capability Fit Score */}
                          <span className="px-2 py-0.5 rounded border border-zinc-200 bg-zinc-50 text-zinc-800 text-[10px]">
                            ★ FIT: {res.suitabilityScore.toFixed(1)}/4.0
                          </span>

                          {/* Tactical Action Verdict */}
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase tracking-wider ${
                            res.verdict === 'priority_apply'
                              ? 'bg-black text-white'
                              : res.verdict === 'reach_apply'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : res.verdict === 'skip_ghost_job'
                              ? 'bg-rose-100 text-rose-900 border border-rose-300'
                              : 'bg-zinc-200 text-zinc-800'
                          }`}>
                            {res.verdict.replace('_', ' ')} →
                          </span>

                        </div>
                      )}

                      <div className="text-[10px] font-mono text-zinc-400 ml-auto">
                        Posted {job.postedDaysAgo}d ago {job.repostCount > 0 ? `(${job.repostCount}x repost)` : ''}
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>

          </div>

          {/* Deep Inspection Panel (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            
            {selectedJob && selectedResult ? (
              <div className="typesafe-card p-5 sticky top-6 space-y-4 bg-white">
                
                {/* Header */}
                <div className="flex items-start justify-between pb-3 border-b border-zinc-200">
                  <div>
                    <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
                      Jev System One Output // Telemetry
                    </div>
                    <h3 className="font-bold text-base text-zinc-950 mt-0.5">
                      {selectedJob.title}
                    </h3>
                    <div className="text-xs text-zinc-500 font-mono">
                      {selectedJob.company} • {selectedResult.ms}ms response ({Math.round(selectedResult.verdictConfidence * 100)}% confidence)
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedJobId(null)}
                    className="text-zinc-400 hover:text-zinc-900 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Holistic Fit Analysis (Why this is not just a keyword filter) */}
                <div className="space-y-2.5 font-mono text-xs">
                  
                  {/* Suitability Score */}
                  <div className="p-3 border border-zinc-200 rounded bg-[#fafafa] space-y-1.5">
                    <div className="flex justify-between text-zinc-600 text-[11px]">
                      <span>SCORE: CAPABILITY & SCOPE FIT</span>
                      <strong className="text-black">{selectedResult.suitabilityScore.toFixed(2)} / 4.0</strong>
                    </div>
                    <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-black h-full transition-all duration-300"
                        style={{ width: `${(selectedResult.suitabilityScore / 4) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-zinc-400">
                      <span>0: Mismatch</span>
                      <span>2: Moderate</span>
                      <span>4: Bullseye Match</span>
                    </div>
                  </div>

                  {/* Autonomy & Working Style Score */}
                  <div className="p-3 border border-zinc-200 rounded bg-[#fafafa] space-y-1.5">
                    <div className="flex justify-between text-zinc-600 text-[11px]">
                      <span>SCORE: AUTONOMY & OWNERSHIP FIT</span>
                      <strong className="text-black">{selectedResult.autonomyScore.toFixed(2)} / 4.0</strong>
                    </div>
                    <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-zinc-700 h-full transition-all duration-300"
                        style={{ width: `${(selectedResult.autonomyScore / 4) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Ghost Job Noul */}
                  <div className="p-3 border border-zinc-200 rounded bg-[#fafafa] space-y-1.5">
                    <div className="flex justify-between text-zinc-600 text-[11px]">
                      <span>NOUL: IS GHOST LISTING?</span>
                      <strong className={selectedResult.ghostProb >= 0.5 ? 'text-rose-600' : 'text-emerald-600'}>
                        {Math.round(selectedResult.ghostProb * 100)}% Probability
                      </strong>
                    </div>
                    <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          selectedResult.ghostProb >= 0.5 ? 'bg-rose-600' : 'bg-emerald-600'
                        }`}
                        style={{ width: `${selectedResult.ghostProb * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Qualitative Subagent Extraction */}
                  <div className="p-3 border border-zinc-200 rounded bg-white space-y-2 text-[11px]">
                    <div className="text-zinc-500 font-bold uppercase text-[10px]">
                      Context Subagent Qualitative Analysis
                    </div>

                    <div className="text-zinc-700 leading-relaxed font-sans text-xs">
                      <strong>Candidate Archetype:</strong> {selectedResult.subagentSignals.candidateArchetype}
                    </div>

                    <div className="text-zinc-700 leading-relaxed font-sans text-xs pt-1 border-t border-zinc-100">
                      <strong>Role Scope:</strong> {selectedJob.coreMission}
                    </div>

                    {selectedResult.subagentSignals.flags.length > 0 && (
                      <div className="pt-1.5 border-t border-zinc-100">
                        <span className="text-amber-700 font-semibold block text-[10px] font-mono">
                          ⚠️ Identified Legitimacy Flags:
                        </span>
                        <ul className="list-disc list-inside text-zinc-600 text-[10px] space-y-0.5 mt-0.5 font-sans">
                          {selectedResult.subagentSignals.flags.map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                </div>

                {/* Raw Jev Output */}
                <div className="p-3 border border-zinc-200 rounded bg-[#fafafa] font-mono text-[10px] space-y-1 text-zinc-600">
                  <div className="flex justify-between text-zinc-400 text-[9px] uppercase">
                    <span>Model: {selectedResult.model}</span>
                    <span>Tokens: {selectedResult.tokens?.input_tokens || 1100} in</span>
                  </div>
                  <div>Calibrated Certainty: <strong>{Math.round(selectedResult.verdictConfidence * 100)}%</strong></div>
                  <div>Tactical Decision: <strong>{selectedResult.verdict.toUpperCase()}</strong></div>
                </div>

              </div>
            ) : (
              <div className="typesafe-card p-8 text-center text-zinc-400 space-y-2 bg-[#fafafa] min-h-[350px] flex flex-col items-center justify-center">
                <div className="w-8 h-8 rounded border border-zinc-300 flex items-center justify-center text-zinc-700 font-mono text-xs mb-1">
                  ⊕
                </div>
                <div className="font-semibold text-zinc-800 text-xs">Select Any Job Card</div>
                <p className="text-[11px] text-zinc-500 max-w-xs leading-relaxed">
                  Click any listing in the feed to inspect the real-time Jev System One probability distribution, architectural fit score, and qualitative subagent analysis.
                </p>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* ── Qualitative Resume Parser Modal ── */}
      {isResumeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-lg max-w-lg w-full p-6 shadow-xl space-y-4 text-xs">
            
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-black" />
                <h3 className="font-bold text-sm text-zinc-950 uppercase font-mono">
                  Resume & Systems Track Record
                </h3>
              </div>
              <button onClick={() => setIsResumeModalOpen(false)} className="text-zinc-400 hover:text-black">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-zinc-600 text-xs leading-relaxed font-sans">
              GhostHunter's Context Subagent extracts your <strong>demonstrated scale, system complexity, and autonomy track record</strong>—so you are evaluated on your real engineering capabilities, not whether a recruiter's keyword matched a single bullet point.
            </p>

            <div className="grid grid-cols-2 gap-3 font-mono">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase block mb-1">Full Name</label>
                <input
                  type="text"
                  value={customNameInput}
                  onChange={e => setCustomNameInput(e.target.value)}
                  className="w-full border border-zinc-200 rounded p-2 text-xs text-zinc-900 focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 uppercase block mb-1">Years Experience</label>
                <input
                  type="number"
                  step="0.5"
                  value={customYearsInput}
                  onChange={e => setCustomYearsInput(e.target.value)}
                  className="w-full border border-zinc-200 rounded p-2 text-xs text-zinc-900 focus:outline-none focus:border-black"
                />
              </div>
            </div>

            <div className="font-mono">
              <label className="text-[10px] text-zinc-500 uppercase block mb-1">Target Engineering Role</label>
              <input
                type="text"
                value={customRoleInput}
                onChange={e => setCustomRoleInput(e.target.value)}
                className="w-full border border-zinc-200 rounded p-2 text-xs text-zinc-900 focus:outline-none focus:border-black"
              />
            </div>

            <div className="font-mono">
              <label className="text-[10px] text-zinc-500 uppercase block mb-1">Paste Full Work History & Accomplishments</label>
              <textarea
                rows={5}
                value={resumeTextInput}
                onChange={e => setResumeTextInput(e.target.value)}
                placeholder="Paste work experience, past systems built, scale handled, architectural challenges..."
                className="w-full border border-zinc-200 rounded p-2.5 text-xs text-zinc-900 font-mono focus:outline-none focus:border-black resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                onClick={() => setIsResumeModalOpen(false)}
                className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-950 font-mono"
              >
                Cancel
              </button>
              <button
                onClick={handleParseCustomResume}
                disabled={!resumeTextInput.trim()}
                className="btn-black font-mono text-xs"
              >
                Evaluate Holistic Fit →
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
