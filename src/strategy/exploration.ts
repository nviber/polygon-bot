import type { BinaryMarket, Direction, Signal } from "../domain.js";

export class PaperExplorationStrategy {
  readonly id = "btc-paper-exploration";

  evaluate(market: BinaryMarket): Signal {
    const slugHash = [...market.slug].reduce((hash, character) => hash + character.charCodeAt(0), 0);
    const direction: Direction = slugHash % 2 === 0 ? "UP" : "DOWN";
    const reason = "non-predictive paper exploration; no edge is claimed";
    const source = {
      strategy: this.id,
      direction,
      probability: 0.5,
      confidence: 0,
      reason,
    };

    return {
      direction,
      probability: 0.5,
      confidence: 0,
      reasons: [reason],
      sources: [source],
    };
  }
}
