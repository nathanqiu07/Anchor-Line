export type AdmissionResult =
  | { allowed: true; release: () => void }
  | { allowed: false; reason: "rate_limit" | "concurrency" };

interface ExtractionGateOptions {
  maxRequestsPerWindow: number;
  windowMs: number;
  maxConcurrent: number;
  now?: () => number;
}

/** Best-effort, per-process admission control for paid extraction calls. */
export class InMemoryExtractionGate {
  private readonly requestsByIp = new Map<string, number[]>();
  private activeRequests = 0;
  private readonly now: () => number;

  constructor(private readonly options: ExtractionGateOptions) {
    this.now = options.now ?? Date.now;
  }

  enter(ip: string): AdmissionResult {
    const now = this.now();
    const cutoff = now - this.options.windowMs;
    for (const [address, requests] of this.requestsByIp) {
      const current = requests.filter((timestamp) => timestamp > cutoff);
      if (current.length === 0) this.requestsByIp.delete(address);
      else this.requestsByIp.set(address, current);
    }

    const recent = this.requestsByIp.get(ip) ?? [];
    if (recent.length >= this.options.maxRequestsPerWindow) {
      return { allowed: false, reason: "rate_limit" };
    }
    if (this.activeRequests >= this.options.maxConcurrent) {
      return { allowed: false, reason: "concurrency" };
    }

    recent.push(now);
    this.requestsByIp.set(ip, recent);
    this.activeRequests += 1;
    let released = false;

    return {
      allowed: true,
      release: () => {
        if (released) return;
        released = true;
        this.activeRequests -= 1;
      },
    };
  }
}

export const extractionGate = new InMemoryExtractionGate({
  maxRequestsPerWindow: 5,
  windowMs: 60_000,
  maxConcurrent: 2,
});
