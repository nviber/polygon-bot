# Research note: pursuing repeatable edge without pretending it is certain

Researched 2026-09-17. This is a decision framework for paper trading, not investment advice and not evidence that any strategy will be profitable.

## Bottom line

There is no credible way to turn binary prediction markets into a dependable “not 50/50” machine by simply choosing a direction. Prices already aggregate public information, and the relevant comparison is **model probability minus executable cost**, not whether a prediction sounds convincing.

The closest thing to a repeatable edge is an **executable payoff inconsistency**: a complete outcome basket or linked-market conversion whose worst-case payoff exceeds its fully executable purchase cost. It is only an arbitrage if all legs fill at verified depth, fees are included, the conversion/redeem path is available, and the market's resolution terms have been checked. Otherwise it is still a trade with fill, inventory, or settlement risk.

The best directional candidates for this project are weather and sports, but only as narrowly configured, audited models. They are not defaults to bet on.

## What the evidence says

- Prediction-market prices can be reasonably calibrated near resolution, but calibration changes with time horizon and probability level. A large historical study found short-horizon markets more calibrated and documented a favourite–longshot bias farther from expiration. [Page & Clemen, 2013](https://people.duke.edu/~clemen/bio/Published%20Papers/45.PredictionMarkets-Page%26Clemen-EJ-2013.pdf)
- A forecast’s apparent hit rate is inadequate. Calibration and sharpness should be measured with proper scores such as Brier score and log loss, on data withheld from model fitting. [Gneiting, Balabdaoui & Raftery, 2007](https://agupubs.onlinelibrary.wiley.com/doi/10.1111/J.1467-9868.2007.00587.X)
- Sports odds are useful benchmarks, but they are already strong forecasts: a large study of English football found online-bookmaker odds generally unbiased. Treat consensus odds as a benchmark that the Polymarket quote must beat after cost—not as an automatic signal. [Buhagiar, Cortis & Newall, 2020](https://www.sciencedirect.com/science/article/pii/S1544612319306440)
- Weather probability forecasts have a mature verification culture. NOAA evaluates probability forecasts with skill and calibration measures, so weather is suitable only when the market’s exact location, window, threshold, and official resolution source match the model input. [NOAA forecast verification](https://vlab.noaa.gov/web/mdl/fv)
- The distinction between a theoretical payoff mismatch and an executable arbitrage matters. Recent work on prediction markets finds that protocol conversion constraints and depth determine whether apparent violations can be captured. [Gebele, Mutzel & Matthes, 2026 preprint](https://arxiv.org/abs/2608.00666)

## Costs change the answer

As of the research date, Polymarket charges taker fees in specified categories. The published formula is:

`fee = shares × feeRate × price × (1 - price)`

The stated taker fee rates are 7% for crypto and 5% for sports, economics, and weather; maker orders are not charged and eligible makers may receive rebates. The fee is largest around a 50¢ contract—exactly where a casual “coin-flip” trade is most tempting. [Polymarket fee schedule](https://help.polymarket.com/en/articles/13364478-trading-fees)

This project applies that formula to paper fills. Predictive strategies require the estimated edge to exceed ask price **plus** fee. The BTC paper-exploration baseline is deliberately non-predictive and bypasses edge, spread, open-exposure, and daily-loss gates for paper-only activity; it must never be interpreted as evidence of profitability or enabled for live execution. The simulator remains conservative only if it also models full depth, missed/partial fills, and stale quotes.

## Recommended order of work

1. **Build an arbitrage scanner first.** Scan only binary or explicitly linked markets. For every candidate, use live bid/ask depth, category fee, minimum order size, and the verified split/merge or redemption path. Reject it unless worst-case net profit remains positive after all costs and a conservative depth haircut. Do not call it arbitrage when legs cannot be filled atomically or inventory cannot be converted.
2. **Run weather paper research second.** Use only short-dated, clearly resolved precipitation markets. Register each market manually with its exact slug, outcome wording, coordinates, target date, and official resolution source. Compare model probability with the executable ask; do not trade merely because forecast probability exceeds 50%.
3. **Run sports paper research third.** Use a multi-book, vig-removed consensus as the baseline. Trade only a material discrepancy that persists after stale-price checks, the Polymarket fee, spread, and a matching-risk review. A paid odds feed is required for dependable coverage.
4. **Keep macro as research-only until a timestamped consensus feed is connected.** Official releases tell us the result after release; they do not provide a pre-release forecast edge. Any manually entered consensus must carry source and timestamp metadata before it is permitted to drive a paper signal.
5. **Do not make BTC 5-minute direction the core strategy.** Its prediction window is very short, prices react quickly, and the 7% fee-rate curve penalizes trades near 50¢. Keep it as a small, isolated benchmark only.

## Promotion gate: paper to live

Do not enable live execution until one strategy, one market class, and one fixed execution rule jointly meet all of these:

- At least 250 resolved, out-of-sample paper positions after the configuration was frozen.
- Positive mean **net** P&L after live-recorded bid/ask depth, fees, partial/missed fills, and cancellations—not midpoint fills.
- A 95% bootstrap confidence interval for mean net trade P&L whose lower bound is above zero.
- Better Brier score and log loss than the contemporaneous Polymarket midpoint on the same locked sample.
- No single event, day, or market supplies more than 20% of apparent P&L.
- Manual review of every resolution mismatch and every position whose actual fill differed from the simulator.

If a strategy misses a gate, disable it. Increasing stake, adding more markets, or lowering the edge threshold does not fix an unproven model.

### BTC paper research candidates

Researched 2026-10-24. These are five separately selectable paper hypotheses, not findings that the project or any candidate is profitable. They run one at a time, remain disabled by default, use only the existing BTC spot ticker and Polymarket 5-minute market, and retain the existing fee-inclusive edge, quote-quality, exposure, daily-loss, and cash gates. The strategy scores are explicitly uncalibrated heuristics; they are not probability forecasts merely because the current trading interface represents them on a 0–1 scale. A candidate abstains until it has enough recent ticks for its feature.

| Candidate | Research rationale | Main limitation |
| --- | --- | --- |
| 90-second overreaction reversal | Wen et al. report both intraday momentum and reversal in cryptocurrency prices, with results varying around jumps, liquidity, and event conditions. This candidate fades a sufficiently large recent BTC move. [Wen et al. (2022)](https://doi.org/10.1016/j.najef.2022.101733) | Their evidence does not validate this 90-second rule or Polymarket execution; this bot lacks their richer liquidity and event controls. |
| 4-minute time-series momentum | Shen, Urquhart, and Wang report Bitcoin intraday time-series momentum using first-half-hour returns to predict the last half-hour. This candidate follows a short trailing BTC return. [Shen et al. (2022)](https://doi.org/10.1111/fire.12290) | Their horizon and volume-based session definition differ materially from this fixed 4-minute feature; this implementation has no volume input. |
| 5-minute trading-range breakout | A Bitcoin technical-rule study reports forecasting value for trading-range breakouts in daily BTC data, especially in trending periods. This candidate follows a fresh break above/below the recent observed range. [Gerritsen et al. (2020)](https://doi.org/10.1016/j.frl.2019.08.011) | The cited study uses daily price data from 2010–2019, not 5-minute binary markets; the horizon transfer is untested. |
| 1m/5m moving-average crossover | Moving-average rules are among the technical trading rule families studied in Bitcoin. One study testing BTC at both 5-minute and daily frequencies found daily data generally more profitable and buy-and-hold beat its alternatives intraday—important contrary evidence. [Resta, Pagnottoni & De Giuli (2020)](https://doi.org/10.3390/risks8040044) | This simple fast/slow crossover is not the paper's exact specification; its signal can lag and incur frequent fee-heavy flips. |
| Volatility-scaled momentum | Risk-managed momentum and volatility-managed portfolios are studied by Barroso & Santa-Clara and Moreira & Muir. This candidate normalizes a 90-second return by trailing realized volatility, testing whether a risk-scaled score is more useful. [Barroso & Santa-Clara (2015)](https://doi.org/10.1016/j.jfineco.2014.11.010), [Moreira & Muir (2017)](https://doi.org/10.1111/jofi.12513) | Those studies do not show that this minute-scale BTC score forecasts 5-minute resolution; volatility scaling is not itself a directional edge. |

These studies motivate hypotheses only. Their assets, sampling intervals, execution assumptions, and evaluation samples differ from this bot. The display therefore reports each strategy's own resolved net paper P&L and settled/open position counts, but no result should be interpreted as validated profitability. Unresolved/open positions are not realized observations. Promotion still requires frozen, out-of-sample rules, at least 250 resolved positions, realistic fills and costs, positive net P&L with a 95% bootstrap interval above zero, and proper-score improvement over the market benchmark as set out above.
