import type { SpotTick } from "../domain.js";

export const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

export const tickAtLeastAgo = (
  history: readonly SpotTick[],
  ageMs: number,
): SpotTick | undefined => {
  const latest = history.at(-1);

  if (!latest) {
    return undefined;
  }

  return [...history]
    .reverse()
    .find((tick) => latest.timestamp - tick.timestamp >= ageMs);
};

export const ticksWithin = (
  history: readonly SpotTick[],
  durationMs: number,
): SpotTick[] => {
  const latest = history.at(-1);

  if (!latest) {
    return [];
  }

  const cutoff = latest.timestamp - durationMs;
  return history.filter((tick) => tick.timestamp >= cutoff);
};

export const average = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

export const timeWeightedAverage = (
  history: readonly SpotTick[],
  durationMs: number,
): number | undefined => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return undefined;
  }

  const ticksByTimestamp = new Map<number, SpotTick>();

  for (const tick of history) {
    if (Number.isFinite(tick.timestamp) && Number.isFinite(tick.price) && tick.price > 0) {
      ticksByTimestamp.set(tick.timestamp, tick);
    }
  }

  const ticks = [...ticksByTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp);
  const latest = ticks.at(-1);

  if (!latest) {
    return undefined;
  }

  const cutoff = latest.timestamp - durationMs;
  let startIndex = -1;

  for (let index = 0; index < ticks.length; index += 1) {
    if (ticks[index].timestamp <= cutoff) {
      startIndex = index;
    } else {
      break;
    }
  }

  if (startIndex < 0) {
    return undefined;
  }

  const startTick = ticks[startIndex];
  let startPrice = startTick.price;

  if (startTick.timestamp < cutoff) {
    const nextTick = ticks[startIndex + 1];

    if (!nextTick) {
      return undefined;
    }

    const elapsedFraction = (cutoff - startTick.timestamp) / (nextTick.timestamp - startTick.timestamp);
    startPrice += (nextTick.price - startTick.price) * elapsedFraction;
  }

  const points = [
    { timestamp: cutoff, price: startPrice },
    ...ticks.filter((tick) => tick.timestamp > cutoff && tick.timestamp < latest.timestamp),
    latest,
  ];
  let area = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const elapsed = current.timestamp - previous.timestamp;
    area += ((previous.price + current.price) / 2) * elapsed;
  }

  const result = area / durationMs;
  return Number.isFinite(result) ? result : undefined;
};

export const standardDeviation = (values: readonly number[]): number => {
  if (values.length < 2) {
    return 0;
  }

  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
};

export const returns = (ticks: readonly SpotTick[]): number[] => {
  const values: number[] = [];

  for (let index = 1; index < ticks.length; index += 1) {
    values.push((ticks[index].price - ticks[index - 1].price) / ticks[index - 1].price);
  }

  return values;
};
