import { useState, useEffect } from 'react';
import { Compass, CheckCircle2, XCircle, ArrowRight, ShieldCheck, Terminal, Cpu } from 'lucide-react';

export function App() {
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('http://localhost:3001/api/health')
      .then(res => res.json())
      .then(data => setServerOnline(!!data.ok))
      .catch(() => setServerOnline(false));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 antialiased font-sans">
      <div className="max-w-2xl w-full space-y-8">
        
        {/* Header */}
        <div className="space-y-3 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-400 font-mono">
            <Compass className="w-3.5 h-3.5 text-emerald-400" />
            <span>CareerRadar Extension Hub</span>
            <span className="text-zinc-600">·</span>
            <span className="flex items-center gap-1.5">
              {serverOnline === null ? (
                <span className="text-zinc-500">Checking server...</span>
              ) : serverOnline ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Server Online (:3001)
                </span>
              ) : (
                <span className="text-rose-400 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Server Offline
                </span>
              )}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            CareerRadar
          </h1>
          <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
            Developer-grade Chrome Extension for real-time job calibration, ATS evaluation, and candidate alignment.
          </p>
        </div>

        {/* Installation Steps Card */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-6 space-y-5 backdrop-blur-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            Chrome Extension Setup
          </h2>

          <ol className="space-y-4 text-sm text-zinc-300">
            <li className="flex gap-3 items-start">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 font-mono text-xs font-semibold text-zinc-300">
                1
              </span>
              <div>
                <p className="font-medium text-white">Open Extensions in Chrome</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Navigate to <code className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-zinc-300">chrome://extensions</code> in your browser.
                </p>
              </div>
            </li>

            <li className="flex gap-3 items-start">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 font-mono text-xs font-semibold text-zinc-300">
                2
              </span>
              <div>
                <p className="font-medium text-white">Enable Developer Mode</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Toggle the <strong className="text-zinc-200">Developer mode</strong> switch in the top-right corner.
                </p>
              </div>
            </li>

            <li className="flex gap-3 items-start">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 font-mono text-xs font-semibold text-zinc-300">
                3
              </span>
              <div>
                <p className="font-medium text-white">Load Unpacked Extension</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Click <strong className="text-zinc-200">Load unpacked</strong> and select the local directory:
                </p>
                <div className="mt-1.5 p-2 rounded bg-zinc-950 border border-zinc-800 font-mono text-xs text-emerald-400 break-all">
                  extension/
                </div>
              </div>
            </li>

            <li className="flex gap-3 items-start">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 font-mono text-xs font-semibold text-zinc-300">
                4
              </span>
              <div>
                <p className="font-medium text-white">Browse Job Portals</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Open LinkedIn Jobs, Indeed, Wellfound, or Google Careers. Open the CareerRadar side panel to see real-time calibration.
                </p>
              </div>
            </li>
          </ol>
        </div>

        {/* System Architecture Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/20 p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>Arbitration Engine</span>
            </div>
            <p className="text-xs text-zinc-500">
              Deterministic scope analysis & holistic candidate calibration via Jev System One.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/20 p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Zero DOM Shift</span>
            </div>
            <p className="text-xs text-zinc-500">
              Headless context observer with zero in-page layout shift; side panel UI containment.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/20 p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
              <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
              <span>Supported Boards</span>
            </div>
            <p className="text-xs text-zinc-500">
              LinkedIn, Indeed, Google Careers, Wellfound, Greenhouse, Lever, Ashby & Workday.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-2 text-xs text-zinc-600 font-mono">
          CareerRadar · Local Dev Architecture · Port 3001 (API) & 5173 (Web)
        </div>

      </div>
    </div>
  );
}

export default App;
