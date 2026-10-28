export const dashboardPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>Northstar · Paper Trading Desk</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark">N</span>
          <div>
            <strong>Northstar</strong>
            <span>Paper Trading Desk</span>
          </div>
        </div>
        <div class="topbar-actions">
          <a class="nav-link" href="/history">History</a>
          <span class="mode-badge">PAPER MODE</span>
          <span id="connection" class="connection">Connecting…</span>
        </div>
      </header>

      <main>
        <section class="hero panel">
          <div>
            <p class="eyebrow">BTC · SHORT HORIZON</p>
            <h1>Strategy control room</h1>
            <p id="decision" class="decision">Loading the latest engine state…</p>
          </div>
          <div class="controls">
            <button id="start" class="button primary">Start bot</button>
            <button id="stop" class="button">Stop</button>
            <button id="tick" class="button">Run one tick</button>
          </div>
        </section>

        <section class="metrics" aria-label="Account metrics">
          <article class="metric panel">
            <span>Paper cash</span>
            <strong id="cash">—</strong>
            <small>Available balance</small>
          </article>
          <article class="metric panel">
            <span>Open exposure</span>
            <strong id="exposure">—</strong>
            <small id="position-count">—</small>
          </article>
          <article class="metric panel">
            <span>Net paper P&amp;L</span>
            <strong id="pnl">—</strong>
            <small id="pnl-detail">Realized — · Locked —</small>
          </article>
          <article class="metric panel">
            <span>Engine status</span>
            <strong id="engine-state" class="engine-status" data-state="stopped">—</strong>
            <small id="last-tick">—</small>
          </article>
        </section>

        <section class="panel trace-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">LIVE SESSION</p>
              <h2>Engine trace</h2>
            </div>
            <span id="trace-count" class="trace-count">—</span>
          </div>
          <p class="section-copy">Start, polling, strategy decisions, and errors appear here as they happen.</p>
          <div id="trace" class="trace" aria-live="polite"></div>
        </section>

        <section class="workspace">
          <article class="panel strategies-panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">MODEL SELECTION</p>
                <h2>Strategies</h2>
              </div>
              <button id="save-strategies" class="button compact">Apply selection</button>
            </div>
            <p class="section-copy">BTC research candidates run one at a time, separately from legacy BTC momentum/exploration. Candidate scores are unproven heuristics; every trade remains paper-only and passes the existing quote and risk checks.</p>
            <div id="strategies" class="strategy-grid"></div>
            <p id="strategy-status" class="status-copy"></p>
          </article>

          <aside class="panel risk-panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">GUARDRAILS</p>
                <h2>Risk limits</h2>
              </div>
            </div>
            <dl id="risk-limits" class="risk-list"></dl>
            <div class="safety-note">
              <span></span>
              No wallet is connected. Orders are simulated at the current ask.
            </div>
          </aside>
        </section>

        <section class="panel table-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">PAPER EXPERIMENTS</p>
              <h2>Results by strategy</h2>
            </div>
          </div>
          <p class="section-copy">Only resolved positions count toward net P&amp;L. Open positions awaiting resolution are shown separately. Legacy positions without stored attribution remain unattributed. Results are paper observations, not evidence of profitability.</p>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Strategy</th><th>Resolved positions</th><th>Realized net P&amp;L</th><th>Open / unresolved</th></tr></thead>
              <tbody id="strategy-performance"></tbody>
            </table>
          </div>
          <div id="strategy-performance-empty" class="empty">No attributed paper positions yet.</div>
        </section>

<section class="panel table-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">PORTFOLIO</p>
              <h2>Positions</h2>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Market</th><th>Strategy</th><th>Side</th><th>Shares</th><th>Entry</th><th>Cost</th><th>Status</th></tr></thead>
              <tbody id="positions"></tbody>
            </table>
          </div>
          <div id="positions-empty" class="empty">No positions yet. The engine will wait until both signal and risk requirements pass.</div>
        </section>

        <section class="panel table-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">PAYOFF INCONSISTENCIES</p>
              <h2>Binary basket arbitrage</h2>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Market</th><th>Basket</th><th>Cost</th><th>Guaranteed payout</th><th>Locked profit</th><th>Status</th></tr></thead>
              <tbody id="arbitrages"></tbody>
            </table>
          </div>
          <div id="arbitrages-empty" class="empty">No executable paper basket found. Add reviewed slugs and the scanner will reject any cost that is not positive after depth and fees.</div>
        </section>

      </main>
    </div>
    <div id="toast" class="toast" role="status"></div>
    <script type="module" src="/app.js"></script>
  </body>
</html>`;

export const dashboardStyles = `
:root {
  --bg: #080b10;
  --panel: #10151d;
  --panel-2: #141b25;
  --line: #232d3a;
  --text: #f4f7fb;
  --muted: #8591a3;
  --accent: #9ef01a;
  --accent-soft: rgba(158, 240, 26, 0.12);
  --danger: #ff6b72;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 85% -10%, #182312 0, transparent 28%), var(--bg); color: var(--text); }
button, input { font: inherit; }
.shell { width: min(1440px, calc(100% - 40px)); margin: 0 auto; padding-bottom: 64px; }
.topbar { height: 82px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: center; gap: 12px; }
.brand-mark { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 11px; color: #091000; background: var(--accent); font-weight: 900; }
.brand div { display: grid; gap: 2px; }
.brand strong { letter-spacing: .02em; }
.brand div span { color: var(--muted); font-size: 12px; }
.topbar-actions { display: flex; align-items: center; gap: 12px; }
.nav-link { color: var(--text); text-decoration: none; font-size: 13px; font-weight: 700; }
.nav-link:hover { color: var(--accent); }
.mode-badge { color: var(--accent); background: var(--accent-soft); border: 1px solid rgba(158,240,26,.24); border-radius: 999px; padding: 7px 10px; font-size: 11px; font-weight: 800; letter-spacing: .1em; }
.connection { color: var(--muted); font-size: 13px; }
main { display: grid; gap: 18px; padding-top: 24px; }
.panel { border: 1px solid var(--line); background: linear-gradient(145deg, rgba(20,27,37,.92), rgba(13,18,25,.96)); border-radius: 18px; box-shadow: 0 14px 42px rgba(0,0,0,.18); }
.hero { min-height: 190px; padding: 34px; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; overflow: hidden; position: relative; }
.hero::after { content: ""; position: absolute; width: 260px; height: 260px; right: 9%; top: -155px; border: 1px solid rgba(158,240,26,.2); border-radius: 50%; box-shadow: 0 0 80px rgba(158,240,26,.08); }
.eyebrow { margin: 0 0 9px; color: var(--accent); font-size: 11px; font-weight: 800; letter-spacing: .14em; }
h1, h2 { margin: 0; letter-spacing: -.035em; }
h1 { font-size: clamp(30px, 4vw, 50px); }
h2 { font-size: 22px; }
.decision { color: var(--muted); max-width: 760px; margin: 15px 0 0; line-height: 1.55; }
.controls { display: flex; gap: 9px; flex-wrap: wrap; z-index: 1; }
.button { border: 1px solid var(--line); background: #18212c; color: var(--text); border-radius: 10px; padding: 11px 15px; cursor: pointer; transition: transform .15s ease, border-color .15s ease, background .15s ease; }
.button:hover { transform: translateY(-1px); border-color: #3b4859; }
.button:disabled { opacity: .4; cursor: not-allowed; transform: none; }
.button.primary { background: var(--accent); color: #0a1002; border-color: var(--accent); font-weight: 800; }
.button.compact { padding: 8px 12px; font-size: 13px; }
.metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
.metric { padding: 21px; display: grid; gap: 7px; }
.metric > span { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
.metric strong { font-size: 26px; letter-spacing: -.03em; }
.metric small { color: var(--muted); }
.engine-status { display: flex; align-items: center; gap: 10px; }
.engine-status::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: var(--muted); }
.engine-status[data-state="running"]::before { background: var(--accent); box-shadow: 0 0 12px var(--accent); }
.engine-status[data-state="working"]::before { background: #ffd166; box-shadow: 0 0 12px #ffd166; animation: pulse 1s ease-in-out infinite; }
.positive { color: var(--accent) !important; }
.negative { color: var(--danger) !important; }
.workspace { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(300px, .75fr); gap: 18px; }
.strategies-panel, .risk-panel, .table-panel, .trace-panel { padding: 26px; }
.section-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.section-copy, .status-copy { color: var(--muted); font-size: 13px; line-height: 1.5; }
.trace-count { color: var(--muted); font-size: 12px; }
.trace { max-height: 310px; overflow-y: auto; margin-top: 16px; border: 1px solid var(--line); border-radius: 12px; background: #090d12; }
.trace-entry { display: grid; grid-template-columns: 90px 72px 1fr; gap: 14px; padding: 11px 14px; border-top: 1px solid rgba(35,45,58,.7); font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace; }
.trace-entry:first-child { border-top: 0; }
.trace-entry time { color: var(--muted); }
.trace-entry span { color: #8fb9ff; font-weight: 800; }
.trace-entry.success span { color: var(--accent); }
.trace-entry.error span { color: var(--danger); }
.trace-entry div { color: #c9d2df; overflow-wrap: anywhere; }
.strategy-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 20px; }
.strategy { display: flex; gap: 12px; padding: 15px; background: rgba(255,255,255,.018); border: 1px solid var(--line); border-radius: 12px; cursor: pointer; transition: border-color .15s ease, background .15s ease; }
.strategy:has(input:checked) { border-color: rgba(158,240,26,.52); background: var(--accent-soft); }
.strategy input { width: 17px; height: 17px; accent-color: var(--accent); margin-top: 2px; }
.strategy div { display: grid; gap: 5px; }
.strategy strong { font-size: 14px; }
.strategy-category { display: inline-block; margin-left: 5px; color: var(--accent); font-size: 9px; font-style: normal; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.strategy small { color: var(--muted); line-height: 1.35; }
.risk-list { display: grid; gap: 0; margin: 18px 0; }
.risk-list div { display: flex; justify-content: space-between; gap: 20px; padding: 13px 0; border-bottom: 1px solid var(--line); }
.risk-list dt { color: var(--muted); }
.risk-list dd { margin: 0; font-weight: 700; }
.safety-note { display: flex; align-items: flex-start; gap: 10px; color: var(--muted); line-height: 1.45; font-size: 12px; padding-top: 8px; }
.safety-note span { width: 8px; height: 8px; flex: none; margin-top: 4px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 12px var(--accent); }
.table-wrap { overflow-x: auto; margin-top: 20px; }
.history-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.period-select { border: 1px solid var(--line); background: #18212c; color: var(--text); border-radius: 10px; padding: 10px 12px; }
.history-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
.history-metric { padding: 21px; display: grid; gap: 7px; }
.history-metric span { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
.history-metric strong { font-size: 24px; }
table { width: 100%; border-collapse: collapse; min-width: 720px; }
th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; text-align: left; padding: 0 12px 12px; }
td { border-top: 1px solid var(--line); padding: 15px 12px; font-size: 13px; }
.side { font-weight: 800; color: var(--accent); }
.empty { text-align: center; color: var(--muted); padding: 30px 10px 12px; }
.timeline { display: grid; gap: 0; margin-top: 14px; }
.event { display: grid; grid-template-columns: 145px 100px 1fr; gap: 16px; border-top: 1px solid var(--line); padding: 14px 0; font-size: 13px; }
.event time, .event span { color: var(--muted); }
.toast { position: fixed; right: 22px; bottom: 22px; color: #071000; background: var(--accent); padding: 12px 16px; border-radius: 10px; font-weight: 800; transform: translateY(80px); opacity: 0; transition: .2s ease; }
.toast.show { transform: translateY(0); opacity: 1; }

@keyframes pulse {
  50% { opacity: .45; transform: scale(.8); }
}

@media (max-width: 900px) {
  .metrics { grid-template-columns: repeat(2, 1fr); }
  .workspace { grid-template-columns: 1fr; }
  .hero { align-items: flex-start; flex-direction: column; }
}

@media (max-width: 580px) {
  .shell { width: min(100% - 24px, 1440px); }
  .topbar { height: 72px; }
  .connection { display: none; }
  .hero, .strategies-panel, .risk-panel, .table-panel, .trace-panel, .history-metric { padding: 20px; }
  .metrics, .strategy-grid { grid-template-columns: 1fr; }
  .history-metrics { grid-template-columns: repeat(2, 1fr); }
  .history-heading { align-items: flex-start; flex-direction: column; }
  .event { grid-template-columns: 1fr; gap: 5px; }
  .trace-entry { grid-template-columns: 1fr; gap: 4px; }
}`;

export const historyPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>History · Northstar Paper Trading Desk</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark">N</span>
          <div><strong>Northstar</strong><span>Paper Trading Desk</span></div>
        </div>
        <div class="topbar-actions">
          <a class="nav-link" href="/">Dashboard</a>
          <span class="mode-badge">PAPER MODE</span>
          <span id="connection" class="connection">Connecting…</span>
        </div>
      </header>

      <main>
        <section class="hero panel">
          <div>
            <p class="eyebrow">SESSION RECORD</p>
            <h1>Trading history</h1>
            <p class="decision">Review paper-trading activity and profit for the selected period.</p>
          </div>
        </section>

        <section class="panel table-panel">
          <div class="history-heading">
            <div>
              <p class="eyebrow">PROFIT OVERVIEW</p>
              <h2 id="period-title">All time</h2>
            </div>
            <label for="period" class="period-label">Period
              <select id="period" class="period-select">
                <option value="all" selected>All time</option>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </label>
          </div>
          <p id="history-status" class="history-status" aria-live="polite"></p>
          <div class="history-metrics">
            <article class="panel history-metric"><span>Realized profit</span><strong id="realized-profit">—</strong></article>
            <article class="panel history-metric"><span>Locked profit</span><strong id="locked-profit">—</strong></article>
            <article class="panel history-metric"><span>Net paper profit</span><strong id="total-profit">—</strong></article>
            <article class="panel history-metric"><span>Trades</span><strong id="trade-count">—</strong></article>
          </div>
        </section>

        <section class="panel table-panel">
          <div class="section-heading">
            <div><p class="eyebrow">AUDIT LOG</p><h2>Activity</h2></div>
            <span id="activity-count" class="trace-count"></span>
          </div>
          <div id="events" class="timeline"></div>
        </section>
      </main>
    </div>
    <script type="module" src="/history.js"></script>
  </body>
</html>`;
