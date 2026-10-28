import type { Signal, SignalSource, SpotTick } from "../domain.js";
import { clamp } from "./math.js";
import type { Strategy } from "./types.js";

export class StrategyEnsemble {
  private readonly history: SpotTick[] = [];
  private lastStatus = "waiting for price history";

  constructor(
    private strategies: readonly Strategy[],
    private readonly minimumAgreement: number,
  ) {}

  observe(tick: SpotTick): void {
    this.history.push(tick);
    const cutoff = tick.timestamp - 15 * 60_000;

    while (this.history.length > 0 && this.history[0].timestamp < cutoff) {
      this.history.shift();
    }
  }

  signal(): Signal | undefined {
    const votes = this.strategies
      .map((strategy) => strategy.evaluate(this.history))
      .filter((vote): vote is SignalSource => vote !== undefined);

    if (votes.length === 0) {
      this.lastStatus = `waiting for signals from: ${this.strategies.map((strategy) => strategy.id).join(", ")}`;
      return undefined;
    }

    const totalWeight = votes.reduce((sum, vote) => sum + vote.confidence, 0);
    const contributions = votes.map((vote) => {
      const sign = vote.direction === "UP" ? 1 : -1;
      return sign * (vote.probability - 0.5) * vote.confidence;
    });
    const netContribution = contributions.reduce((sum, contribution) => sum + contribution, 0);
    const grossContribution = contributions.reduce((sum, contribution) => sum + Math.abs(contribution), 0);
    const agreement = grossContribution === 0 ? 0 : Math.abs(netContribution) / grossContribution;

    if (agreement < this.minimumAgreement) {
      this.lastStatus = `strategy disagreement (${(agreement * 100).toFixed(0)}% agreement): ${this.describeVotes(votes)}`;
      return undefined;
    }

    const signedEdge = netContribution / totalWeight;
    const direction = signedEdge >= 0 ? "UP" : "DOWN";
    const probability = 0.5 + clamp(Math.abs(signedEdge) * agreement, 0, 0.12);
    const confidence = clamp(
      votes.reduce((sum, vote) => sum + vote.confidence, 0) / votes.length * agreement,
      0,
      0.75,
    );

    this.lastStatus = `${votes.length}/${this.strategies.length} strategies active, ${(agreement * 100).toFixed(0)}% agreement`;

    return {
      direction,
      probability,
      confidence,
      reasons: votes.map((vote) => `${vote.strategy}: ${vote.reason}`),
      sources: votes,
    };
  }

  status(): string {
    return this.lastStatus;
  }

  enabledIds(): string[] {
    return this.strategies.map((strategy) => strategy.id);
  }

  replaceStrategies(strategies: readonly Strategy[]): void {
    this.strategies = strategies;
    this.lastStatus = `strategies updated: ${this.enabledIds().join(", ")}`;
  }

  private describeVotes(votes: readonly SignalSource[]): string {
    return votes.map((vote) => `${vote.strategy}=${vote.direction}`).join(", ");
  }
}
