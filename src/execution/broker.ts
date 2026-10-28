import type { ArbitragePosition, BinaryMarket, PaperState, Position, TradeIntent } from "../domain.js";
import { roundUsd } from "../fees.js";

export interface Broker {
  buy(intent: TradeIntent, state: PaperState): Position;
  settle(position: Position, winningOutcome: string, state: PaperState, settledAt?: Date): void;
}

/** Records a conservative immediate simulated fill. This adapter has no credentials or network order capability. */
export class PaperBroker implements Broker {
  buy(intent: TradeIntent, state: PaperState): Position {
    const cost = intent.limitPrice * intent.shares + intent.estimatedFeeUsd;

    if (state.cash < cost) {
      throw new Error("Paper account cash invariant violated");
    }

    const position: Position = {
      id: crypto.randomUUID(),
      marketId: intent.market.id,
      question: intent.market.question,
      outcome: intent.outcome,
      tokenId: intent.tokenId,
      strategyId: intent.signal.sources[0]?.strategy,
      shares: intent.shares,
      entryPrice: intent.limitPrice,
      entryFeeUsd: intent.estimatedFeeUsd,
      openedAt: new Date().toISOString(),
      expiresAt: intent.market.closesAt,
      status: "OPEN",
    };

    state.cash -= cost;
    state.positions.push(position);
    const strategies = intent.signal.sources.map((source) => source.strategy).join(", ");
    state.events.push({
      at: new Date().toISOString(),
      type: "PAPER_FILL",
      message: `${strategies ? `${strategies}: ` : ""}bought ${position.shares.toFixed(2)} ${position.outcome} at ${position.entryPrice.toFixed(3)} + $${position.entryFeeUsd.toFixed(4)} fee for ${position.question}`,
    });

    return position;
  }

  settle(position: Position, winningOutcome: string, state: PaperState, settledAt = new Date()): void {
    if (position.status !== "OPEN") {
      throw new Error("Only open paper positions can be settled");
    }

    const won = position.outcome.trim().toLocaleLowerCase() === winningOutcome.trim().toLocaleLowerCase();
    const payoutUsd = won ? position.shares : 0;
    const costUsd = position.entryPrice * position.shares + (position.entryFeeUsd ?? 0);
    const realizedPnl = roundUsd(payoutUsd - costUsd);
    const day = settledAt.toISOString().slice(0, 10);

    position.status = "SETTLED";
    position.realizedPnl = realizedPnl;
    position.settledAt = settledAt.toISOString();
    state.cash = roundUsd(state.cash + payoutUsd);
    state.dailyRealizedPnl[day] = roundUsd((state.dailyRealizedPnl[day] ?? 0) + realizedPnl);
    state.events.push({
      at: settledAt.toISOString(),
      type: "PAPER_SETTLEMENT",
      message: `${position.outcome} ${won ? "won" : "lost"} ${position.shares.toFixed(2)} shares in ${position.question}; payout $${payoutUsd.toFixed(4)}, realized P&L $${realizedPnl.toFixed(4)}`,
    });
  }

  buyBinaryBasket(
    market: BinaryMarket,
    first: { outcome: string; tokenId: string; price: number },
    second: { outcome: string; tokenId: string; price: number },
    shares: number,
    firstFeeUsd: number,
    secondFeeUsd: number,
    state: PaperState,
  ): ArbitragePosition {
    const totalCostUsd = roundUsd(shares * (first.price + second.price) + firstFeeUsd + secondFeeUsd);

    if (state.cash < totalCostUsd) {
      throw new Error("Paper account cash invariant violated");
    }

    const openedAt = new Date().toISOString();
    const firstPosition: Position = {
      id: crypto.randomUUID(),
      marketId: market.id,
      question: market.question,
      outcome: first.outcome,
      tokenId: first.tokenId,
      strategyId: "binary-basket-arbitrage",
      shares,
      entryPrice: first.price,
      entryFeeUsd: firstFeeUsd,
      openedAt,
      expiresAt: market.closesAt,
      status: "OPEN",
    };
    const secondPosition: Position = {
      id: crypto.randomUUID(),
      marketId: market.id,
      question: market.question,
      outcome: second.outcome,
      tokenId: second.tokenId,
      strategyId: "binary-basket-arbitrage",
      shares,
      entryPrice: second.price,
      entryFeeUsd: secondFeeUsd,
      openedAt,
      expiresAt: market.closesAt,
      status: "OPEN",
    };
    const arbitrage: ArbitragePosition = {
      id: crypto.randomUUID(),
      marketId: market.id,
      question: market.question,
      firstOutcome: first.outcome,
      secondOutcome: second.outcome,
      sharesPerOutcome: shares,
      totalCostUsd,
      totalFeeUsd: firstFeeUsd + secondFeeUsd,
      guaranteedPayoutUsd: shares,
      lockedProfitUsd: roundUsd(shares - totalCostUsd),
      openedAt,
      status: "OPEN",
    };

    state.cash = roundUsd(state.cash - totalCostUsd);
    state.positions.push(firstPosition, secondPosition);
    state.arbitragePositions.push(arbitrage);
    state.events.push({
      at: openedAt,
      type: "PAPER_ARBITRAGE",
      message: `Basketed ${shares.toFixed(2)} ${first.outcome}/${second.outcome}; locked paper profit $${arbitrage.lockedProfitUsd.toFixed(4)}`,
    });

    return arbitrage;
  }
}
