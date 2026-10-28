import type { SpotTick } from "../domain.js";
import { fetchPublic } from "./http.js";

interface OkxTickerResponse {
  code?: string;
  msg?: string;
  data?: { last?: string; ts?: string }[];
}

export class OkxSpotClient {
  constructor(private readonly instrument: string) {}

  async latest(): Promise<SpotTick> {
    const response = await fetchPublic(
      `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(this.instrument)}`,
      "OKX ticker",
      { headers: { "User-Agent": "polymarket-paper-bot/0.1" } },
    );

    if (!response.ok) {
      throw new Error(`OKX ticker request failed: ${response.status}`);
    }

    const body = await response.json() as OkxTickerResponse;

    if (body.code !== "0") {
      throw new Error(`OKX ticker returned code ${body.code ?? "unknown"}: ${body.msg || "unknown error"}`);
    }

    const ticker = body.data?.[0];
    const price = Number(ticker?.last);
    const timestamp = Number(ticker?.ts);

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error("OKX returned an invalid ticker price");
    }

    return {
      price,
      timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now(),
    };
  }
}
