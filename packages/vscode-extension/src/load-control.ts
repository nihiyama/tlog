/** Bounds active I/O without allocating a promise for every file up front. */
export class IoLimiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(readonly limit = 8) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid I/O limit");
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await operation();
    } finally {
      const next = this.waiting.shift();
      if (next)
        next(); // Transfer the occupied slot to the next waiter.
      else this.active--;
    }
  }
}

export async function forEachBounded<T>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  let cursor = 0;
  let failed = false;
  let failure: unknown;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failed && cursor < items.length) {
      const index = cursor++;
      try {
        signal?.throwIfAborted();
        await operation(items[index], index);
      } catch (error) {
        failed = true;
        failure = error;
      }
    }
  });
  // Drain all running I/O before rejecting/releasing a full-load slot.
  await Promise.all(workers);
  if (failed) throw failure;
  signal?.throwIfAborted();
}

export function abortError(): Error {
  const error = new Error("Load cancelled");
  error.name = "AbortError";
  return error;
}

interface Consumer<M> {
  consume: (model: M, current: () => boolean) => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  abort?: () => void;
}

interface LoadJob<M> {
  root: string;
  generation: number;
  phase: "loading" | "consuming" | "done";
  controller: AbortController;
  consumers: Set<Consumer<M>>;
}

/** One full model at a time; no completed-result cache or root history. */
export class LoadCoordinator<M> {
  private readonly jobs: LoadJob<M>[] = [];
  private running = false;

  constructor(private readonly load: (root: string, signal: AbortSignal) => Promise<M>) {}

  invalidate(root: string): void {
    for (const job of this.jobs) {
      if (job.root === root) job.generation++;
    }
  }

  run<T>(
    root: string,
    consume: (model: M, current: () => boolean) => T | Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());
    let job = this.jobs.find(
      (item) => item.root === root && item.phase === "loading" && !item.controller.signal.aborted
    );
    if (!job) {
      job = {
        root,
        generation: 0,
        phase: "loading",
        controller: new AbortController(),
        consumers: new Set()
      };
      this.jobs.push(job);
    }
    const target = job;
    const result = new Promise<T>((resolve, reject) => {
      const consumer: Consumer<M> = {
        consume: async (model, current) => consume(model, current),
        resolve: (value) => resolve(value as T),
        reject,
        signal
      };
      consumer.abort = () => {
        target.consumers.delete(consumer);
        signal?.removeEventListener("abort", consumer.abort!);
        reject(abortError());
        if (target.consumers.size === 0) target.controller.abort();
      };
      target.consumers.add(consumer);
      signal?.addEventListener("abort", consumer.abort, { once: true });
    });
    if (!this.running) void this.drain();
    return result;
  }

  private finish(job: LoadJob<M>, consumer: Consumer<M>): void {
    consumer.signal?.removeEventListener("abort", consumer.abort!);
    job.consumers.delete(consumer);
  }

  private async process(job: LoadJob<M>): Promise<void> {
    if (job.consumers.size > 0) {
      const generation = job.generation;
      let model: M;
      try {
        model = await this.load(job.root, job.controller.signal);
      } catch (error) {
        if (generation !== job.generation && !job.controller.signal.aborted) return;
        job.phase = "done";
        for (const consumer of job.consumers) {
          consumer.reject(error);
          this.finish(job, consumer);
        }
        return;
      }
      if (generation !== job.generation) return;
      job.phase = "consuming";
      for (const consumer of job.consumers) {
        const current = () => generation === job.generation && !consumer.signal?.aborted;
        if (!current()) continue;
        try {
          const value = await consumer.consume(model, current);
          if (current()) {
            consumer.resolve(value);
            this.finish(job, consumer);
          }
        } catch (error) {
          if (current()) {
            consumer.reject(error);
            this.finish(job, consumer);
          }
        }
      }
      // Resolved consumers may immediately request another load before drain() shifts this job.
      // A completed job must never accept such requests.
      job.phase = job.consumers.size > 0 ? "loading" : "done";
      // Invalidated consumers retry after already waiting roots have had a turn.
    }
  }

  private async drain(): Promise<void> {
    this.running = true;
    try {
      while (this.jobs.length > 0) {
        const job = this.jobs[0];
        await this.process(job);
        this.jobs.shift();
        // Release this attempt's model before retrying. A busy root cannot monopolize the slot.
        if (job.consumers.size > 0) this.jobs.push(job);
      }
    } finally {
      this.running = false;
    }
  }
}
