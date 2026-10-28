interface StrategyOption {
  id: string;
  label: string;
  category: string;
  description: string;
  enabled: boolean;
}

interface DashboardData {
  runtime: {
    running: boolean;
    busy: boolean;
    tickCount: number;
    lastDecision: string;
    lastTickStartedAt?: string;
    lastTickAt?: string;
    nextTickAt?: string;
    lastError?: string;
    strategyStatus: string;
    trace: { at: string; level: "INFO" | "SUCCESS" | "ERROR"; message: string }[];
  };
  account: {
    cash: number;
    openExposure: number;
    realizedPnl: number;
    lockedArbitrageProfit: number;
    openPositions: number;
    openArbitrages: number;
  };
  strategyPerformance: {
    strategyId: string | null;
    label: string;
    resolvedPositionCount: number;
    realizedNetPnl: number;
    openPositionCount: number;
  }[];
  positions: {
    id: string;
    question: string;
    outcome: string;
    strategyId?: string;
    shares: number;
    entryPrice: number;
    entryFeeUsd?: number;
    status: string;
  }[];
  arbitrages: {
    id: string;
    question: string;
    firstOutcome: string;
    secondOutcome: string;
    totalCostUsd: number;
    guaranteedPayoutUsd: number;
    lockedProfitUsd: number;
    status: string;
  }[];
  strategies: StrategyOption[];
  risk: {
    maxTradeUsd: number;
    maxDailyLossUsd: number;
    maxOpenExposureUsd: number;
    maxSpread: number;
    minExpectedEdge: number;
    minStrategyAgreement: number;
  };
}

const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);

  if (!found) {
    throw new Error(`Missing dashboard element: ${id}`);
  }

  return found as T;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
let strategiesRendered = false;

const escapeHtml = (value: unknown): string => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
    throw new Error(error.error ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const showToast = (message: string): void => {
  const toast = element<HTMLDivElement>("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
};

const renderStrategies = (strategies: readonly StrategyOption[]): void => {
  if (strategiesRendered) {
    return;
  }

  element("strategies").innerHTML = strategies.map((strategy) => `
    <label class="strategy">
      <input type="checkbox" name="strategy" value="${escapeHtml(strategy.id)}" ${strategy.enabled ? "checked" : ""} />
      <div>
        <strong>${escapeHtml(strategy.label)} <em class="strategy-category">${escapeHtml(strategy.category)}</em></strong>
        <small>${escapeHtml(strategy.description)}</small>
      </div>
    </label>
  `).join("");
  element("strategies").querySelectorAll<HTMLInputElement>('input[name="strategy"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) {
        return;
      }

      const researchIds = [
        "btc-intraday-reversal",
        "btc-5m-time-series-momentum",
        "btc-range-breakout",
        "btc-moving-average-crossover",
        "btc-volatility-scaled-momentum",
      ];
      const legacyBtcIds = ["btc-5m-momentum", "btc-paper-exploration"];

      if (researchIds.includes(input.value)) {
        element("strategies").querySelectorAll<HTMLInputElement>('input[name="strategy"]').forEach((candidate) => {
          if (candidate !== input && (researchIds.includes(candidate.value) || legacyBtcIds.includes(candidate.value))) {
            candidate.checked = false;
          }
        });
      }
      else if (legacyBtcIds.includes(input.value)) {
        element("strategies").querySelectorAll<HTMLInputElement>('input[name="strategy"]').forEach((candidate) => {
          if (researchIds.includes(candidate.value)) {
            candidate.checked = false;
          }
        });
      }
    });
  });
  strategiesRendered = true;
};

const render = (data: DashboardData): void => {
  element("connection").textContent = "Live · localhost";
  element("decision").textContent = data.runtime.lastDecision;
  element("cash").textContent = money.format(data.account.cash);
  element("exposure").textContent = money.format(data.account.openExposure);
  element("position-count").textContent = `${data.account.openPositions} open position${data.account.openPositions === 1 ? "" : "s"}`;

  const pnl = element("pnl");
  const totalPnl = data.account.realizedPnl + data.account.lockedArbitrageProfit;
  pnl.textContent = money.format(totalPnl);
  pnl.className = totalPnl > 0 ? "positive" : totalPnl < 0 ? "negative" : "";
  element("pnl-detail").textContent = `Realized ${money.format(data.account.realizedPnl)} · Locked ${money.format(data.account.lockedArbitrageProfit)}`;

  const engineState = element("engine-state");
  const engineMode = data.runtime.busy ? "working" : data.runtime.running ? "running" : "stopped";
  engineState.textContent = data.runtime.busy ? "Working" : data.runtime.running ? "Running" : "Stopped";
  engineState.dataset.state = engineMode;

  const lastTick = data.runtime.lastTickAt
    ? `last ${new Date(data.runtime.lastTickAt).toLocaleTimeString()}`
    : data.runtime.lastTickStartedAt
      ? `started ${new Date(data.runtime.lastTickStartedAt).toLocaleTimeString()}`
      : "no ticks yet";
  const nextTick = data.runtime.running && data.runtime.nextTickAt
    ? ` · next ${new Date(data.runtime.nextTickAt).toLocaleTimeString()}`
    : "";
  element("last-tick").textContent = `Tick #${data.runtime.tickCount} · ${lastTick}${nextTick}`;
  element("strategy-status").textContent = data.runtime.strategyStatus;

  element<HTMLButtonElement>("start").disabled = data.runtime.running;
  element<HTMLButtonElement>("stop").disabled = !data.runtime.running;
  element<HTMLButtonElement>("tick").disabled = data.runtime.busy;

  renderStrategies(data.strategies);

  element("trace-count").textContent = `${data.runtime.trace.length} session entr${data.runtime.trace.length === 1 ? "y" : "ies"}`;
  element("trace").innerHTML = data.runtime.trace.map((entry) => `
    <div class="trace-entry ${entry.level.toLocaleLowerCase()}">
      <time>${escapeHtml(new Date(entry.at).toLocaleTimeString())}</time>
      <span>${escapeHtml(entry.level)}</span>
      <div>${escapeHtml(entry.message)}</div>
    </div>
  `).join("");

  element("risk-limits").innerHTML = [
    ["Per trade", money.format(data.risk.maxTradeUsd)],
    ["Daily loss", money.format(data.risk.maxDailyLossUsd)],
    ["Open exposure", money.format(data.risk.maxOpenExposureUsd)],
    ["Maximum spread", `${number.format(data.risk.maxSpread * 100)}%`],
    ["Minimum edge", `${number.format(data.risk.minExpectedEdge * 100)}%`],
    ["Agreement floor", `${number.format(data.risk.minStrategyAgreement * 100)}%`],
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");

  element("strategy-performance").innerHTML = data.strategyPerformance.map((strategy) => `
    <tr>
      <td>${escapeHtml(strategy.label)}</td>
      <td>${strategy.resolvedPositionCount}</td>
      <td class="${strategy.realizedNetPnl > 0 ? "positive" : strategy.realizedNetPnl < 0 ? "negative" : ""}">${money.format(strategy.realizedNetPnl)}</td>
      <td>${strategy.openPositionCount}</td>
    </tr>
  `).join("");
  element("strategy-performance-empty").hidden = data.strategyPerformance.length > 0;

  const positions = element("positions");
  positions.innerHTML = data.positions.map((position) => `
    <tr>
      <td>${escapeHtml(position.question)}</td>
      <td>${escapeHtml(position.strategyId ?? "Unattributed / legacy")}</td>
      <td class="side">${escapeHtml(position.outcome)}</td>
      <td>${number.format(position.shares)}</td>
      <td>${money.format(position.entryPrice)}</td>
      <td>${money.format(position.entryPrice * position.shares + (position.entryFeeUsd ?? 0))}</td>
      <td>${escapeHtml(position.status)}</td>
    </tr>
  `).join("");
  element("positions-empty").hidden = data.positions.length > 0;

  const arbitrages = element("arbitrages");
  arbitrages.innerHTML = data.arbitrages.map((arbitrage) => `
    <tr>
      <td>${escapeHtml(arbitrage.question)}</td>
      <td>${escapeHtml(arbitrage.firstOutcome)} + ${escapeHtml(arbitrage.secondOutcome)}</td>
      <td>${money.format(arbitrage.totalCostUsd)}</td>
      <td>${money.format(arbitrage.guaranteedPayoutUsd)}</td>
      <td class="positive">${money.format(arbitrage.lockedProfitUsd)}</td>
      <td>${escapeHtml(arbitrage.status)}</td>
    </tr>
  `).join("");
  element("arbitrages-empty").hidden = data.arbitrages.length > 0;

};

const refresh = async (): Promise<void> => {
  try {
    render(await request<DashboardData>("/api/status"));
  }
  catch (error) {
    element("connection").textContent = "Disconnected";
    console.error(error);
  }
};

const action = async (path: string, message: string): Promise<void> => {
  try {
    await request(path, { method: "POST", body: "{}" });
    showToast(message);
    await refresh();
  }
  catch (error) {
    showToast(error instanceof Error ? error.message : String(error));
  }
};

element("start").addEventListener("click", () => void action("/api/runtime/start", "Bot started"));
element("stop").addEventListener("click", () => void action("/api/runtime/stop", "Bot stopped"));
element("tick").addEventListener("click", () => void action("/api/runtime/tick", "Tick complete"));
element("save-strategies").addEventListener("click", async () => {
  const ids = [...document.querySelectorAll<HTMLInputElement>('input[name="strategy"]:checked')]
    .map((input) => input.value);

  if (ids.length === 0) {
    showToast("Select at least one strategy");
    return;
  }

  try {
    await request("/api/strategies", { method: "POST", body: JSON.stringify({ ids }) });
    showToast("Strategies updated");
    await refresh();
  }
  catch (error) {
    showToast(error instanceof Error ? error.message : String(error));
  }
});

void refresh();
window.setInterval(() => void refresh(), 3_000);
