# Polymarket short-horizon paper trader

Paper-only bot for binary crypto markets such as BTC Up/Down 5m. It uses public Polymarket Gamma/CLOB data and OKX spot prices, calculates a conservative directional probability, and records simulated fills and P&L locally. It cannot submit a real order.

Read [the research note](RESEARCH.md) before enabling any market mapping. It explains why the system evaluates net executable edge after fees and why paper results must be validated before considering live execution.

## Install as a package

Install directly from GitHub in the consuming application:

```sh
npm install github:nviber/polygon-bot
cp node_modules/@nviber/polygon-bot/.env.example .env
npx polygon-bot dashboard
```

The package builds its runnable output during GitHub dependency installation. The command reads `.env` from the consumer's current working directory, and the default paper state is `data/paper-state.json` in that same directory. With no mode, `polygon-bot` performs one tick, matching the original application. Supported modes are `dashboard`, `once` (one tick), and `watch`.

## Run

```powershell
Copy-Item .env.example .env
npm install
npm run dashboard
```

Open `http://127.0.0.1:3107`. The dashboard starts with the engine stopped; use **Start bot** for continuous polling or **Run one tick** for a single evaluation. Strategy changes made in the dashboard last for the current process. Edit `.env` to change the startup defaults.

CLI modes remain available with `npm run dev -- once` and `npm run dev -- watch`.

Run `npm test` for deterministic strategy and risk-control tests. Paper state is written to `data/paper-state.json`; delete that file only if you deliberately want a fresh simulation.

## Strategies

Strategies are individually toggleable with `ENABLED_STRATEGIES` in `.env`:

- `btc-5m-momentum` — follows a sustained 90-second BTC move for an eligible BTC Up/Down 5m market.
- `btc-paper-exploration` — a non-predictive paper baseline enabled by default; it opens a bounded paper position on an eligible BTC 5m market when momentum has no signal or a momentum trade is rejected.
- `weather-forecast-edge` — compares a mapped rain market with Open-Meteo's precipitation probability.
- `sports-odds-consensus` — automatically matches upcoming Polymarket moneylines to events from The Odds API, then compares them with no-vig consensus across sportsbooks. It requires `ODDS_API_KEY`.
- `macro-release-edge` — turns a reproducible consensus estimate and dispersion into a binary threshold probability.
- `binary-basket-arbitrage` — buys both outcomes of a manually reviewed binary market only when the live asks plus taker fees are below the $1 combined payoff. Its paper profit is tracked as **locked**, not realized, until redemption.

When `ENABLED_STRATEGIES` is omitted, the bot enables BTC momentum and paper exploration automatically, Sports when `ODDS_API_KEY` is present, and each mapping-based strategy only when it has configured instruments. Set `ENABLED_STRATEGIES` explicitly to override this behavior.

Research-only BTC candidates (disabled by default; select one at a time, separately from legacy BTC momentum/exploration):

- `btc-intraday-reversal` — fades a sufficiently large 90-second BTC move.
- `btc-5m-time-series-momentum` — follows a four-minute BTC return.
- `btc-range-breakout` — follows a break beyond the recent five-minute range.
- `btc-moving-average-crossover` — compares one-minute and five-minute BTC averages.
- `btc-volatility-scaled-momentum` — scales a 90-second move by five-minute realized volatility.

These are research-backed but unproven paper hypotheses. Signal scores are uncalibrated, and none is claimed to be profitable. See [RESEARCH.md](RESEARCH.md) for source studies, horizon caveats, and validation standards. The dashboard reports each strategy's resolved net P&L and open/unresolved counts from persisted position attribution.

The bot does not guess the meaning of a market question. Sports discovery requires an unambiguous participant and start-time match; weather and macro strategies require explicit source-specific mappings. If a match or mapping is absent or inconsistent, the strategy abstains. BTC exploration still depends on an eligible live market, fresh two-sided quotes, ask liquidity, and available paper cash, so external market-data outages can prevent a fill.

Examples:

```dotenv
# Explicitly enable selected models
ENABLED_STRATEGIES=btc-5m-momentum,weather-forecast-edge,sports-odds-consensus,macro-release-edge

# Isolate non-crypto weather research
ENABLED_STRATEGIES=weather-forecast-edge
```

### Non-crypto market mappings

Sports moneylines are discovered automatically when `SPORTS_INSTRUMENTS_JSON=[]`. Matching requires the same two participants and a start time within eight hours, and ambiguous matches are rejected. Sportsbook results are cached for 30 minutes by default to protect the API quota; adjust `SPORTS_ODDS_REFRESH_MS` if your plan permits more frequent requests.

Weather and macro markets still require exact mappings whose resolution wording you have checked manually. A manual sports mapping can also override discovery. These examples are placeholders, not real market slugs:

```dotenv
WEATHER_INSTRUMENTS_JSON='[{"id":"nyc-rain","slug":"example-rain-market","latitude":40.7128,"longitude":-74.006,"targetDate":"2026-09-20","yesOutcome":"Yes"}]'

SPORTS_INSTRUMENTS_JSON='[{"id":"example-nba","slug":"example-game-market","sportKey":"basketball_nba","homeTeam":"Boston Celtics","awayTeam":"New York Knicks","yesTeam":"Boston Celtics"}]'

MACRO_INSTRUMENTS_JSON='[{"id":"example-cpi","slug":"example-cpi-market","threshold":3.0,"consensus":3.2,"standardDeviation":0.2,"comparison":"above","yesOutcome":"Yes"}]'
```

For macro entries, update `consensus` and `standardDeviation` from a documented, timestamped source before each release. Do not treat the configuration as a forecast source.

### Arbitrage scanner

Add only reviewed, genuinely binary market slugs—both outcomes must be exhaustive and exactly one must pay $1 at resolution:

```dotenv
ARBITRAGE_MARKET_SLUGS=reviewed-market-slug-a,reviewed-market-slug-b
ARBITRAGE_MIN_PROFIT_USD=0.25
```

The scanner reads both live ask books, caps size at the smaller displayed ask depth and risk limit, adds the applicable taker fees, and opens a paper basket only if the remaining guaranteed payout exceeds cost by `ARBITRAGE_MIN_PROFIT_USD`. It is not a live execution strategy: real-world legging, partial fills, market-resolution, and protocol conversion risk must be validated separately.

## Safety model

- Predictive strategies default to **no trade** unless estimated edge exceeds the configured threshold. BTC paper exploration is the explicit exception: it does not claim predictive edge and is never live execution.
- Predictive strategies apply liquidity, spread, stale-data, market-time, position, exposure, and daily-loss gates before a fill. Exploration skips edge, spread, exposure, and daily-loss gates, but still requires an active market, a fresh valid executable ask, displayed size, sufficient paper cash, the per-trade cap, and no existing position in that market.
- Caps each paper order at the shares displayed at the best ask; if the fee-adjusted edge is too small, the trace reports that reason even when liquidity is also limited. The trace's `fee` is the total estimated fee for the proposed order, while `model` and `ask` are per-share probabilities/prices.
- Fills use the current best ask plus the category's published taker-fee formula, not an optimistic midpoint.
- Resolution is never guessed: a position is settled only from an explicit outcome supplied by a market provider or a manual settlement command.

## Live-trading seam

`src/execution/broker.ts` is the only order-execution boundary. A future `PolymarketLiveBroker` can implement the same `Broker` interface using `@polymarket/clob-client-v2`; no strategy, risk, market-discovery, or ledger code needs to change. That implementation remains intentionally absent until separately approved.
