import { fetchPublic } from "../market/http.js";

export class WeatherForecastClient {
  async precipitationProbability(
    latitude: number,
    longitude: number,
    targetDate: string,
  ): Promise<number> {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      daily: "precipitation_probability_max",
      timezone: "UTC",
      forecast_days: "16",
    });
    const response = await fetchPublic(`https://api.open-meteo.com/v1/forecast?${params}`, "Open-Meteo forecast");

    if (!response.ok) {
      throw new Error(`Weather forecast request failed: ${response.status}`);
    }

    const payload = await response.json() as {
      daily?: { time?: string[]; precipitation_probability_max?: number[] };
    };
    const dates = payload.daily?.time ?? [];
    const probabilities = payload.daily?.precipitation_probability_max ?? [];
    const index = dates.indexOf(targetDate);

    if (index < 0 || !Number.isFinite(probabilities[index])) {
      throw new Error(`No forecast precipitation probability is available for ${targetDate}`);
    }

    return probabilities[index] / 100;
  }
}
