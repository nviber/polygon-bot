const retryDelaysMs = [200, 500];

export const describeNetworkError = (error: unknown): string => {
  const details: string[] = [];
  const visited = new Set<object>();

  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (value.trim()) {
        details.push(value.trim());
      }
      return;
    }

    if (!value || typeof value !== "object" || visited.has(value)) {
      return;
    }

    visited.add(value);
    const candidate = value as {
      message?: unknown;
      code?: unknown;
      cause?: unknown;
      errors?: unknown;
    };

    if (typeof candidate.message === "string" && candidate.message.trim()) {
      details.push(candidate.message.trim());
    }

    if (typeof candidate.code === "string" && candidate.code.trim()) {
      details.push(candidate.code.trim());
    }

    visit(candidate.cause);

    if (Array.isArray(candidate.errors)) {
      candidate.errors.forEach(visit);
    }
  };

  visit(error);
  return [...new Set(details)].join("; ") || "unknown network error";
};

export const fetchPublic = async (url: string, source: string, options?: RequestInit): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await fetch(url, options);
    }
    catch (error) {
      lastError = error;

      if (options?.signal?.aborted || attempt === retryDelaysMs.length) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
    }
  }

  throw new Error(
    `${source} network request failed after ${retryDelaysMs.length + 1} attempts (${describeNetworkError(lastError)}). `
    + "Check internet, firewall, proxy, or VPN access.",
    { cause: lastError },
  );
};
