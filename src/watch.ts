const waitForNextTick = (intervalMs: number, signal: AbortSignal): Promise<void> => new Promise((resolve) => {
  if (signal.aborted) {
    resolve();
    return;
  }

  let timer: NodeJS.Timeout;
  const finish = (): void => {
    clearTimeout(timer);
    signal.removeEventListener("abort", finish);
    resolve();
  };

  timer = setTimeout(finish, intervalMs);
  signal.addEventListener("abort", finish, { once: true });
});

export const runWatchLoop = async (
  runOnce: () => Promise<void>,
  intervalMs: number,
  signal: AbortSignal,
): Promise<void> => {
  while (!signal.aborted) {
    await runOnce();

    if (!signal.aborted) {
      await waitForNextTick(intervalMs, signal);
    }
  }
};
