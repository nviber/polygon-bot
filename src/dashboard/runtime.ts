import { config, type StrategyId } from "../config.js";
import type { PaperState } from "../domain.js";
import { PaperTradingEngine } from "../engine.js";
import { PaperStore } from "../store.js";

export interface RuntimeStatus {
  running: boolean;
  busy: boolean;
  tickCount: number;
  lastDecision: string;
  lastTickStartedAt?: string;
  lastTickAt?: string;
  nextTickAt?: string;
  lastError?: string;
  enabledStrategies: string[];
  strategyStatus: string;
  trace: RuntimeTrace[];
}

export interface RuntimeTrace {
  at: string;
  level: "INFO" | "SUCCESS" | "ERROR";
  message: string;
}

type TickTrigger = "startup" | "scheduled" | "manual";

export class BotRuntime {
  private timer?: NodeJS.Timeout;
  private busy = false;
  private tickCount = 0;
  private lastDecision = "Bot is stopped. Start it or run one tick.";
  private lastTickStartedAt?: string;
  private lastTickAt?: string;
  private nextTickAt?: string;
  private lastError?: string;
  private readonly trace: RuntimeTrace[] = [];

  constructor(
    private readonly engine: PaperTradingEngine,
    private readonly store: PaperStore,
  ) {
    this.addTrace("INFO", "Dashboard runtime ready. Bot is stopped.");
  }

  start(): void {
    if (this.timer) {
      this.addTrace("INFO", "Start ignored because the bot is already running.");
      return;
    }

    this.lastDecision = "Bot started. Running the first tick…";
    this.addTrace("INFO", `Bot started; polling every ${config.pollIntervalMs / 1_000}s.`);
    this.nextTickAt = new Date(Date.now() + config.pollIntervalMs).toISOString();
    void this.tick("startup");
    this.timer = setInterval(() => {
      this.nextTickAt = new Date(Date.now() + config.pollIntervalMs).toISOString();
      void this.tick("scheduled");
    }, config.pollIntervalMs);
  }

  stop(): void {
    if (!this.timer) {
      this.addTrace("INFO", "Stop ignored because the bot is already stopped.");
      return;
    }

    clearInterval(this.timer);
    this.timer = undefined;
    this.nextTickAt = undefined;
    this.lastDecision = "Bot stopped. No more ticks are scheduled.";
    this.addTrace("INFO", "Bot stopped.");
  }

  async tick(trigger: TickTrigger = "manual"): Promise<void> {
    if (this.busy) {
      this.addTrace("INFO", `${this.triggerLabel(trigger)} tick skipped because another tick is still running.`);
      return;
    }

    this.busy = true;
    this.tickCount += 1;
    const tickNumber = this.tickCount;
    const startedAt = Date.now();
    this.lastTickStartedAt = new Date(startedAt).toISOString();
    this.lastDecision = `Tick #${tickNumber} is checking ${this.engine.enabledStrategies().length} strategies…`;
    this.addTrace("INFO", `Tick #${tickNumber} started (${this.triggerLabel(trigger)}).`);
    let state: PaperState | undefined;

    try {
      state = await this.store.load();
      const previousEvent = state.events.at(-1);
      this.lastDecision = await this.engine.tick(state);
      this.lastError = undefined;

      if (previousEvent?.type === "ERROR") {
        state.events.push({
          at: new Date().toISOString(),
          type: "DATA_RECOVERED",
          message: "Public data sources are reachable again; paper engine resumed.",
        });
      }

      await this.store.save(state);
      this.addTrace(
        "SUCCESS",
        `Tick #${tickNumber} completed in ${Date.now() - startedAt}ms — ${this.lastDecision}`,
      );
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastDecision = `Tick failed: ${message}`;
      this.lastError = message;
      this.addTrace("ERROR", `Tick #${tickNumber} failed after ${Date.now() - startedAt}ms — ${message}`);

      if (state) {
        const lastEvent = state.events.at(-1);
        const lastErrorAt = lastEvent ? new Date(lastEvent.at).getTime() : 0;
        const repeatedNetworkFailure = lastEvent?.type === "ERROR"
          && lastEvent.message === message
          && Date.now() - lastErrorAt < 5 * 60_000;

        if (!repeatedNetworkFailure) {
          state.events.push({ at: new Date().toISOString(), type: "ERROR", message });
        }

        try {
          await this.store.save(state);
        }
        catch {
          // Keep the original failure visible; a later tick can retry persistence.
        }
      }
    }
    finally {
      this.lastTickAt = new Date().toISOString();
      this.busy = false;
    }
  }

  setStrategies(ids: readonly StrategyId[]): void {
    this.engine.setStrategies(ids);
    this.lastDecision = `Strategy selection updated: ${ids.join(", ")}`;
    this.addTrace("INFO", this.lastDecision);
  }

  async state(): Promise<PaperState> {
    return this.store.load();
  }

  status(): RuntimeStatus {
    return {
      running: this.timer !== undefined,
      busy: this.busy,
      tickCount: this.tickCount,
      lastDecision: this.lastDecision,
      lastTickStartedAt: this.lastTickStartedAt,
      lastTickAt: this.lastTickAt,
      nextTickAt: this.nextTickAt,
      lastError: this.lastError,
      enabledStrategies: this.engine.enabledStrategies(),
      strategyStatus: this.engine.strategyStatus(),
      trace: [...this.trace].reverse(),
    };
  }

  private addTrace(level: RuntimeTrace["level"], message: string): void {
    this.trace.push({ at: new Date().toISOString(), level, message });

    if (this.trace.length > 100) {
      this.trace.splice(0, this.trace.length - 100);
    }
  }

  private triggerLabel(trigger: TickTrigger): string {
    return trigger === "startup" ? "initial" : trigger;
  }
}
