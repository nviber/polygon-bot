import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PaperState } from "./domain.js";

export class PaperStore {
  constructor(private readonly path: string, private readonly startingCash: number) {}

  async resetSession(): Promise<PaperState> {
    const state: PaperState = {
      cash: this.startingCash,
      startingCash: this.startingCash,
      positions: [],
      arbitragePositions: [],
      dailyRealizedPnl: {},
      events: [],
    };
    await this.save(state);
    return state;
  }

  async load(): Promise<PaperState> {
    try {
      const state = JSON.parse(await readFile(this.path, "utf8")) as Partial<PaperState>;
      return {
        cash: state.cash ?? this.startingCash,
        startingCash: state.startingCash ?? this.startingCash,
        positions: state.positions ?? [],
        arbitragePositions: state.arbitragePositions ?? [],
        dailyRealizedPnl: state.dailyRealizedPnl ?? {},
        events: state.events ?? [],
      };
    }
    catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }

      return {
        cash: this.startingCash,
        startingCash: this.startingCash,
        positions: [],
        arbitragePositions: [],
        dailyRealizedPnl: {},
        events: [],
      };
    }
  }

  async save(state: PaperState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(state, null, 2), "utf8");
  }
}
