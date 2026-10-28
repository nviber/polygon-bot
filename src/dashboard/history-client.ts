import type { HistoryPeriod, HistorySummary } from "./history.js";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const escapeHtml = (value: unknown): string => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing history element: ${id}`);
  }
  return found as T;
};

const periodTitles: Record<HistoryPeriod, string> = {
  all: "All time",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const colorProfit = (target: HTMLElement, value: number): void => {
  target.textContent = money.format(value);
  target.classList.toggle("positive", value > 0);
  target.classList.toggle("negative", value < 0);
};

const render = (summary: HistorySummary): void => {
  element("connection").textContent = "Live · localhost";
  element("period-title").textContent = periodTitles[summary.period];
  colorProfit(element("realized-profit"), summary.realizedProfit);
  colorProfit(element("locked-profit"), summary.lockedProfit);
  colorProfit(element("total-profit"), summary.totalProfit);
  element("trade-count").textContent = String(summary.tradeCount);
  element("activity-count").textContent = `${summary.events.length} entr${summary.events.length === 1 ? "y" : "ies"}`;
  element("events").innerHTML = summary.events.length > 0
    ? summary.events.map((event) => `
      <div class="event">
        <time>${escapeHtml(new Date(event.at).toLocaleString())}</time>
        <span>${escapeHtml(event.type)}</span>
        <div>${escapeHtml(event.message)}</div>
      </div>
    `).join("")
    : '<div class="empty">No activity recorded in this period.</div>';
};

const refresh = async (): Promise<void> => {
  const status = element("history-status");
  const period = element<HTMLSelectElement>("period").value as HistoryPeriod;
  status.textContent = "Loading history…";

  try {
    const response = await fetch(`/api/history?period=${encodeURIComponent(period)}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`History request failed: ${response.status}`);
    }
    render(await response.json() as HistorySummary);
    status.textContent = "";
  }
  catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  }
};

element<HTMLSelectElement>("period").addEventListener("change", () => void refresh());
void refresh();
