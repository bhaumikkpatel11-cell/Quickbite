import React, { useState, useEffect } from 'react';
import './App.css';

export const App: React.FC = () => {
  const [liveness, setLiveness] = useState<'checking' | 'ok' | 'error'>('checking');
  const [uptime, setUptime] = useState<number | null>(null);

  const checkLiveness = async () => {
    try {
      setLiveness('checking');
      const res = await fetch('/livez');
      if (res.ok) {
        const data = await res.json();
        setLiveness('ok');
        setUptime(data.uptime ?? 0);
      } else {
        setLiveness('error');
      }
    } catch {
      setLiveness('error');
    }
  };

  useEffect(() => {
    checkLiveness();
  }, []);

  return (
    <div>
      <aside className="demo-banner" role="banner">
        <span>⚠️</span>
        <span>
          <strong>DEMO MODE:</strong> Solo M.Tech Project (Asia/Kolkata timezone). ₹0 free tier deployment. Mock payments only.
        </span>
      </aside>

      <main className="app-container">
        <header>
          <h1 className="brand-title">QuickBite</h1>
          <p className="brand-tagline">
            Headcount locking & meal credit ledger platform for tiffin services
          </p>
        </header>

        <section className="card-grid">
          <article className="card">
            <h2>Process Health (Liveness)</h2>
            <p>
              Status:{' '}
              {liveness === 'ok' && (
                <span className="badge">Service Online (Uptime: {uptime ? Math.round(uptime) : 0}s)</span>
              )}
              {liveness === 'checking' && <span>Checking /livez...</span>}
              {liveness === 'error' && <span style={{ color: '#dc2626' }}>Service Unreachable</span>}
            </p>
            <button className="btn" onClick={checkLiveness}>
              Refresh /livez
            </button>
            <div className="warning-callout">
              <strong>Architecture Note:</strong> The frontend checks <code>/livez</code> only. The database readiness endpoint (<code>/readyz</code>) is intentionally never polled by the client browser to allow Neon serverless compute to suspend during idle periods.
            </div>
          </article>

          <article className="card">
            <h2>Current Milestone: M1A</h2>
            <p>
              Local application skeleton, Express modular monolith, Cloudflare Worker scheduler spike, and PostgreSQL migrations.
            </p>
            <ul style={{ paddingLeft: '20px', color: '#475569', fontSize: '0.9rem' }}>
              <li>Process Liveness (<code>/livez</code>)</li>
              <li>Cached Database Readiness (<code>/readyz</code>)</li>
              <li>Authenticated Scheduler Webhook (<code>/internal/tick</code>)</li>
              <li>Cloudflare 5 UTC Cron Triggers</li>
            </ul>
          </article>

          <article className="card">
            <h2>System Constraints</h2>
            <p>
              Strict server-side deadline enforcement independent of background job timing:
            </p>
            <ul style={{ paddingLeft: '20px', color: '#475569', fontSize: '0.9rem' }}>
              <li>18:00 IST: Menu lock & subscription selection</li>
              <li>22:00 IST: Reminder notifications</li>
              <li>23:00 IST: Daily attendance & credit cutoff</li>
              <li>10:00 IST: Operational recovery deadline</li>
            </ul>
          </article>
        </section>

        <footer>
          <p>QuickBite Architecture v2.1 • Modular Monolith • Transactional Outbox</p>
        </footer>
      </main>
    </div>
  );
};

export default App;
