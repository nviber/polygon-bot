import { btcResearchStrategyIds, config, type StrategyId, validateStrategySelection } from "./config.js";
import { quoteBinaryBasket } from "./arbitrage.js";
import type { BinaryMarket, Outcome, PaperState, Signal, SpotTick, TradeIntent } from "./domain.js";
import { PaperBroker } from "./execution/broker.js";
import { estimatedTakerFee, type MarketCategory } from "./fees.js";
import { OkxSpotClient } from "./market/okx.js";
import { PolymarketPublicClient } from "./market/polymarket.js";
import { thresholdProbability } from "./noncrypto/macro.js";
import { SportsOddsClient } from "./noncrypto/sports.js";
import { WeatherForecastClient } from "./noncrypto/weather.js";
import { allowArbitrage, allowPaperExplorationTrade, allowTrade, sizeTradeAtBestAsk } from "./risk.js";
import { StrategyEnsemble } from "./strategy/ensemble.js";
import { PaperExplorationStrategy } from "./strategy/exploration.js";
import { createBtcResearchStrategy, createBtcStrategies } from "./strategy/registry.js";

export class PaperTradingEngine {
  private readonly markets: PolymarketPublicClient;
  private readonly spot: OkxSpotClient;
  private readonly weather = new WeatherForecastClient();
  private readonly sports = config.oddsApiKey
    ? new SportsOddsClient(config.oddsApiKey, config.sportsOddsRefreshMs)
    : undefined;
  private readonly broker = new PaperBroker();
  private enabled: StrategyId[] = [...config.enabledStrategies];
  private readonly btcStrategy = new StrategyEnsemble(
    createBtcStrategies(config.enabledStrategies),
    config.minStrategyAgreement,
  );
  private readonly explorationStrategy = new PaperExplorationStrategy();
  private readonly spotHistory: SpotTick[] = [];
  private lastStatus = "ready";

  constructor(
    markets = new PolymarketPublicClient(),
    spot = new OkxSpotClient(config.okxInstrument),
  ) {
    this.markets = markets;
    this.spot = spot;
  }

  setStrategies(ids: readonly StrategyId[]): void {
    validateStrategySelection(ids);
    this.enabled = [...ids];
    this.btcStrategy.replaceStrategies(createBtcStrategies(ids));
    this.lastStatus = `strategies updated: ${this.enabled.join(", ")}`;
  }

  enabledStrategies(): string[] {
    return [...this.enabled];
  }

  strategyStatus(): string {
    return this.lastStatus;
  }

  async tick(state: PaperState): Promise<string> {
    const outcomes: string[] = [];
    const settlement = await this.settleExpiredPositions(state);

    if (settlement) {
      outcomes.push(settlement);
    }

    if (
      this.enabled.includes("btc-5m-momentum")
      || this.enabled.includes("btc-paper-exploration")
      || this.enabled.some((id) => btcResearchStrategyIds.includes(id as typeof btcResearchStrategyIds[number]))
    ) {
      outcomes.push(await this.runBtc(state));
    }

    if (this.enabled.includes("weather-forecast-edge")) {
      outcomes.push(await this.runWeather(state));
    }

    if (this.enabled.includes("sports-odds-consensus")) {
      outcomes.push(await this.runSports(state));
    }

    if (this.enabled.includes("macro-release-edge")) {
      outcomes.push(await this.runMacro(state));
    }

    if (this.enabled.includes("binary-basket-arbitrage")) {
      outcomes.push(await this.runArbitrage(state));
    }

    this.lastStatus = outcomes.join(" · ");
    return this.lastStatus;
  }

  private async settleExpiredPositions(state: PaperState): Promise<string | undefined> {
    const now = new Date();
    const expiredByMarket = new Map<string, typeof state.positions>();

    for (const position of state.positions) {
      const expiresAt = Date.parse(position.expiresAt);

      if (
        position.status !== "OPEN"
        || !Number.isFinite(expiresAt)
        || expiresAt > now.getTime()
      ) {
        continue;
      }

      const positions = expiredByMarket.get(position.marketId) ?? [];
      positions.push(position);
      expiredByMarket.set(position.marketId, positions);
    }

    if (expiredByMarket.size === 0) {
      return undefined;
    }

    let settledCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    for (const [marketId, positions] of expiredByMarket) {
      try {
        const winningOutcome = await this.markets.findResolvedOutcomeById(marketId);

        if (!winningOutcome) {
          pendingCount += positions.length;
          continue;
        }

        for (const position of positions) {
          this.broker.settle(position, winningOutcome, state, now);
          settledCount += 1;
        }
      }
      catch {
        failedCount += positions.length;
      }
    }

    const messages: string[] = [];

    if (settledCount > 0) {
      messages.push(`settled ${settledCount} expired position${settledCount === 1 ? "" : "s"}`);
    }

    if (pendingCount > 0) {
      messages.push(`${pendingCount} expired position${pendingCount === 1 ? "" : "s"} awaiting provider resolution`);
    }

    if (failedCount > 0) {
      messages.push(`resolution lookup failed for ${failedCount} expired position${failedCount === 1 ? "" : "s"}`);
    }

    return messages.join("; ");
  }

  private async runBtc(state: PaperState): Promise<string> {
    const researchStrategyId = this.enabled.find((id) => btcResearchStrategyIds.includes(id as typeof btcResearchStrategyIds[number]));

    if (researchStrategyId) {
      return this.runBtcResearch(state, researchStrategyId as typeof btcResearchStrategyIds[number]);
    }

    if (!this.enabled.includes("btc-5m-momentum")) {
      return this.runBtcExploration(state);
    }

    const explorationEnabled = this.enabled.includes("btc-paper-exploration");
    let momentumDecision: string;

    try {
      const spot = await this.spot.latest();
      this.observeSpot(spot);
      const signal = this.btcStrategy.signal();

      if (!signal) {
        momentumDecision = `BTC momentum: observing $${spot.price.toFixed(2)}; ${this.btcStrategy.status()}`;
      }
      else {
        const market = await this.markets.findActiveShortHorizon("BTC");

        if (!market) {
          momentumDecision = `BTC momentum: no eligible 5m market; ${this.btcStrategy.status()}`;
        }
        else {
          const outcome = findOutcome(market, signal.direction === "UP" ? "Up" : "Down");

          if (!outcome) {
            momentumDecision = "BTC momentum: market does not have the expected Up/Down outcomes";
          }
          else {
            momentumDecision = await this.consider(state, market, outcome, signal.probability, signal, "crypto");
          }
        }
      }
    }
    catch (error) {
      if (!explorationEnabled) {
        throw error;
      }

      const detail = error instanceof Error ? error.message : String(error);
      momentumDecision = `BTC momentum unavailable: ${detail}`;
    }

    if (!explorationEnabled || momentumDecision.includes(": PAPER BUY ")) {
      return momentumDecision;
    }

    return `${momentumDecision}; ${await this.runBtcExploration(state)}`;
  }

  private async runBtcResearch(
    state: PaperState,
    strategyId: (typeof btcResearchStrategyIds)[number],
  ): Promise<string> {
    const spot = await this.spot.latest();
    this.observeSpot(spot);
    const strategy = createBtcResearchStrategy(strategyId);
    const source = strategy.evaluate(this.spotHistory);

    if (!source) {
      return `${strategyId}: observing ${spot.price.toFixed(2)}; awaiting a distinct signal`;
    }

    const market = await this.markets.findActiveShortHorizon("BTC");

    if (!market) {
      return `${strategyId}: no eligible 5m market`;
    }

    const outcome = findOutcome(market, source.direction === "UP" ? "Up" : "Down");

    if (!outcome) {
      return `${strategyId}: market does not have the expected Up/Down outcomes`;
    }

    const signal: Signal = {
      direction: source.direction,
      probability: source.probability,
      confidence: source.confidence,
      reasons: [source.reason],
      sources: [source],
    };

    return this.consider(state, market, outcome, source.probability, signal, "crypto");
  }

  private observeSpot(tick: SpotTick): void {
    this.spotHistory.push(tick);
    const cutoff = tick.timestamp - 15 * 60_000;

    while (this.spotHistory.length > 0 && this.spotHistory[0].timestamp < cutoff) {
      this.spotHistory.shift();
    }

    this.btcStrategy.observe(tick);
  }

  private async runBtcExploration(state: PaperState): Promise<string> {
    const market = await this.markets.findActiveShortHorizon("BTC");

    if (!market) {
      return "btc-paper-exploration: no eligible 5m market";
    }

    const signal = this.explorationStrategy.evaluate(market);
    const outcome = findOutcome(market, signal.direction === "UP" ? "Up" : "Down");

    if (!outcome) {
      return "btc-paper-exploration: market does not have the expected Up/Down outcomes";
    }

    return this.consider(state, market, outcome, signal.probability, signal, "crypto", true);
  }

  private async runWeather(state: PaperState): Promise<string> {
    if (config.weatherInstruments.length === 0) {
      return "Weather: no mapped instruments configured";
    }

    const results = await Promise.all(config.weatherInstruments.map(async (instrument) => {
      const market = await this.markets.findBySlug(instrument.slug);

      if (!market || !market.active) {
        return `Weather ${instrument.id}: market is unavailable`;
      }

      const yesOutcome = findOutcome(market, instrument.yesOutcome ?? "Yes");

      if (!yesOutcome) {
        return `Weather ${instrument.id}: mapped Yes outcome is missing`;
      }

      const probabilityYes = await this.weather.precipitationProbability(
        instrument.latitude,
        instrument.longitude,
        instrument.targetDate,
      );
      const signal = probabilitySignal(
        "weather-forecast-edge",
        probabilityYes,
        `Open-Meteo precipitation probability for ${instrument.targetDate}`,
      );
      const selected = signal.direction === "UP" ? yesOutcome : findOtherOutcome(market, yesOutcome.outcome);

      if (!selected) {
        return `Weather ${instrument.id}: binary counterpart is missing`;
      }

      return this.consider(state, market, selected, signal.probability, signal, "weather");
    }));

    return results.join("; ");
  }

  private async runSports(state: PaperState): Promise<string> {
    if (!this.sports) {
      return "Sports: ODDS_API_KEY is not configured";
    }

    if (config.sportsInstruments.length === 0) {
      const candidates = await this.markets.findActiveSportsMoneylines();

      if (candidates.length === 0) {
        return "Sports: no eligible Polymarket moneylines in the next 3 days";
      }

      const match = await this.sports.findConsensus(candidates);

      if (!match) {
        return `Sports: scanned ${candidates.length} moneylines; no exact sportsbook event match`;
      }

      const referenceOutcome = findOutcome(match.candidate.market, match.referenceOutcome);

      if (!referenceOutcome) {
        return `Sports: matched ${match.eventLabel}, but its reference outcome is missing`;
      }

      const signal = probabilitySignal(
        "sports-odds-consensus",
        match.probability,
        `automatic ${match.sportKey} match using ${match.bookmakerCount} no-vig sportsbook prices`,
      );
      const selected = signal.direction === "UP"
        ? referenceOutcome
        : findOtherOutcome(match.candidate.market, referenceOutcome.outcome);

      if (!selected) {
        return `Sports: matched ${match.eventLabel}, but its binary counterpart is missing`;
      }

      const decision = await this.consider(
        state,
        match.candidate.market,
        selected,
        signal.probability,
        signal,
        "sports",
      );
      return `Sports ${match.eventLabel}: ${decision}`;
    }

    const results = await Promise.all(config.sportsInstruments.map(async (instrument) => {
      const market = await this.markets.findBySlug(instrument.slug);

      if (!market || !market.active) {
        return `Sports ${instrument.id}: market is unavailable`;
      }

      const yesOutcome = findOutcome(market, instrument.yesTeam);

      if (!yesOutcome) {
        return `Sports ${instrument.id}: mapped team outcome is missing`;
      }

      const probabilityYes = await this.sports!.consensusProbability(
        instrument.sportKey,
        instrument.homeTeam,
        instrument.awayTeam,
        instrument.yesTeam,
      );
      const signal = probabilitySignal(
        "sports-odds-consensus",
        probabilityYes,
        "no-vig consensus from available sportsbooks",
      );
      const selected = signal.direction === "UP" ? yesOutcome : findOtherOutcome(market, yesOutcome.outcome);

      if (!selected) {
        return `Sports ${instrument.id}: binary counterpart is missing`;
      }

      return this.consider(state, market, selected, signal.probability, signal, "sports");
    }));

    return results.join("; ");
  }

  private async runMacro(state: PaperState): Promise<string> {
    if (config.macroInstruments.length === 0) {
      return "Macro: no mapped instruments configured";
    }

    const results = await Promise.all(config.macroInstruments.map(async (instrument) => {
      const market = await this.markets.findBySlug(instrument.slug);

      if (!market || !market.active) {
        return `Macro ${instrument.id}: market is unavailable`;
      }

      const yesOutcome = findOutcome(market, instrument.yesOutcome ?? "Yes");

      if (!yesOutcome) {
        return `Macro ${instrument.id}: mapped Yes outcome is missing`;
      }

      const probabilityYes = thresholdProbability(instrument);
      const signal = probabilitySignal(
        "macro-release-edge",
        probabilityYes,
        `consensus ${instrument.consensus} vs ${instrument.comparison} ${instrument.threshold}`,
      );
      const selected = signal.direction === "UP" ? yesOutcome : findOtherOutcome(market, yesOutcome.outcome);

      if (!selected) {
        return `Macro ${instrument.id}: binary counterpart is missing`;
      }

      return this.consider(state, market, selected, signal.probability, signal, "economics");
    }));

    return results.join("; ");
  }

  private async runArbitrage(state: PaperState): Promise<string> {
    if (config.arbitrageMarketSlugs.length === 0) {
      return "Arbitrage: no reviewed market slugs configured";
    }

    const results = await Promise.all(config.arbitrageMarketSlugs.map(async (slug) => {
      const market = await this.markets.findBySlug(slug);

      if (!market || !market.active || market.outcomes.length !== 2) {
        return `Arbitrage ${slug}: binary market is unavailable`;
      }

      const [first, second] = market.outcomes;
      const [firstBook, secondBook] = await Promise.all([
        this.markets.getBook(first.tokenId),
        this.markets.getBook(second.tokenId),
      ]);

      if (!firstBook || !secondBook) {
        return `Arbitrage ${slug}: no basket; order book has no executable two-sided liquidity`;
      }

      const maximumCost = Math.min(config.maxTradeUsd, state.cash);
      const category: MarketCategory = market.asset === "BTC" ? "crypto" : "general";
      const quote = quoteBinaryBasket(firstBook, secondBook, category, maximumCost);

      if (!quote) {
        return `Arbitrage ${slug}: insufficient executable depth`;
      }

      const denied = allowArbitrage(
        market,
        firstBook,
        secondBook,
        quote.totalCostUsd,
        quote.lockedProfitUsd,
        state,
      );

      if (denied) {
        return `Arbitrage ${slug}: no basket; ${denied}`;
      }

      const basket = this.broker.buyBinaryBasket(
        market,
        { ...first, price: firstBook.bestAsk },
        { ...second, price: secondBook.bestAsk },
        quote.shares,
        quote.firstFeeUsd,
        quote.secondFeeUsd,
        state,
      );
      return `Arbitrage ${slug}: PAPER BASKET $${basket.totalCostUsd.toFixed(4)} → $${basket.guaranteedPayoutUsd.toFixed(4)}; locked $${basket.lockedProfitUsd.toFixed(4)}`;
    }));

    return results.join("; ");
  }

  private async consider(
    state: PaperState,
    market: BinaryMarket,
    outcome: { outcome: Outcome; tokenId: string; price: number },
    modelProbability: number,
    signal: Signal,
    category: MarketCategory,
    paperExploration = false,
  ): Promise<string> {
    const book = await this.markets.getBook(outcome.tokenId);

    if (!book) {
      return `${signal.sources[0].strategy}: no trade; order book has no executable two-sided liquidity`;
    }

    const maximumCost = Math.min(config.maxTradeUsd, state.cash);
    const shares = sizeTradeAtBestAsk(maximumCost, book.bestAsk, book.askSize, category);

    if (shares <= 0) {
      return `${signal.sources[0].strategy}: no trade; cash or displayed ask liquidity is below 0.01 share`;
    }

    const estimatedFeeUsd = estimatedTakerFee(category, shares, book.bestAsk);
    const intent: TradeIntent = {
      market,
      outcome: outcome.outcome,
      tokenId: outcome.tokenId,
      limitPrice: book.bestAsk,
      shares,
      estimatedEdge: modelProbability - book.bestAsk - estimatedFeeUsd / shares,
      estimatedFeeUsd,
      signal,
    };
    const denied = paperExploration
      ? allowPaperExplorationTrade(intent, book, state)
      : allowTrade(intent, book, state);

    if (denied) {
      const model = paperExploration ? "no predictive edge claimed" : `model=${modelProbability.toFixed(3)}`;
      return `${signal.sources[0].strategy}: no trade; ${denied}; ${model} ask=${book.bestAsk.toFixed(3)} fee=${estimatedFeeUsd.toFixed(4)}`;
    }

    const position = this.broker.buy(intent, state);
    const model = paperExploration ? "non-predictive paper exploration" : `model=${modelProbability.toFixed(3)}`;
    return `${signal.sources[0].strategy}: PAPER BUY ${position.outcome} ${position.shares} @ ${position.entryPrice.toFixed(3)}; ${model}`;
  }
}

const findOutcome = (
  market: BinaryMarket,
  expected: string,
): { outcome: Outcome; tokenId: string; price: number } | undefined =>
  market.outcomes.find((outcome) => outcome.outcome.trim().toLocaleLowerCase() === expected.trim().toLocaleLowerCase());

const findOtherOutcome = (
  market: BinaryMarket,
  knownOutcome: string,
): { outcome: Outcome; tokenId: string; price: number } | undefined =>
  market.outcomes.find((outcome) => outcome.outcome.trim().toLocaleLowerCase() !== knownOutcome.trim().toLocaleLowerCase());

const probabilitySignal = (strategy: StrategyId, probabilityYes: number, reason: string): Signal => {
  if (!Number.isFinite(probabilityYes) || probabilityYes < 0 || probabilityYes > 1) {
    throw new Error(`${strategy} produced an invalid probability`);
  }

  const direction = probabilityYes >= 0.5 ? "UP" : "DOWN";
  const probability = direction === "UP" ? probabilityYes : 1 - probabilityYes;

  return {
    direction,
    probability,
    confidence: Math.min(0.7, 0.2 + Math.abs(probabilityYes - 0.5)),
    reasons: [reason],
    sources: [{ strategy, direction, probability, confidence: 0.5, reason }],
  };
};
