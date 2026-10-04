import { describe, expect, it, vi } from "vitest";
import { forEachBounded, IoLimiter, LoadCoordinator } from "../src/load-control.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("bounded workspace loads", () => {
  it("bounds I/O across multiple callers and releases slots after failure", async () => {
    const limiter = new IoLimiter(4);
    let active = 0;
    let maximum = 0;
    const operation = async (item: number) =>
      limiter.run(async () => {
        maximum = Math.max(maximum, ++active);
        try {
          await new Promise((resolve) => setTimeout(resolve, 1));
          if (item === 5) throw new Error("read failure");
        } finally {
          active--;
        }
      });
    const results = await Promise.allSettled([
      forEachBounded(
        Array.from({ length: 100 }, (_, i) => i),
        8,
        operation
      ),
      forEachBounded(
        Array.from({ length: 100 }, (_, i) => i + 100),
        8,
        operation
      )
    ]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "fulfilled"]);
    expect(maximum).toBe(4);
    expect(active).toBe(0);
    await expect(limiter.run(async () => "recovered")).resolves.toBe("recovered");
  });

  it("shares in-flight work, serializes different roots, and does not cache completed models", async () => {
    const first = deferred<string>();
    const load = vi.fn(async (root: string) => (root === "a" ? first.promise : root));
    const coordinator = new LoadCoordinator(load);
    const a = coordinator.run("a", (model) => model);
    const shared = coordinator.run("a", (model) => model + " shared");
    const b = coordinator.run("b", (model) => model);
    expect(load).toHaveBeenCalledTimes(1);
    first.resolve("a");
    expect(await Promise.all([a, shared, b])).toEqual(["a", "a shared", "b"]);
    expect(load.mock.calls.map(([root]) => root)).toEqual(["a", "b"]);
    await coordinator.run("a", (model) => model);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("coalesces 1000 invalidations and discards stale success and failure", async () => {
    for (const fail of [false, true]) {
      const first = deferred<number>();
      const load = vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockResolvedValue(2);
      const coordinator = new LoadCoordinator<number>(load);
      const consume = vi.fn((model: number) => model);
      const result = coordinator.run("root", consume);
      for (let i = 0; i < 1000; i++) coordinator.invalidate("root");
      if (fail) first.reject(new Error("stale error"));
      else first.resolve(1);
      await expect(result).resolves.toBe(2);
      expect(load).toHaveBeenCalledTimes(2);
      expect(consume).toHaveBeenCalledTimes(1);
      expect(consume.mock.calls[0][0]).toBe(2);
    }
  });

  it("rechecks generation while a consumer is projecting", async () => {
    const gate = deferred<void>();
    const coordinator = new LoadCoordinator(vi.fn().mockResolvedValueOnce(1).mockResolvedValue(2));
    const started = deferred<void>();
    const published: number[] = [];
    const result = coordinator.run("root", async (model, current) => {
      if (model === 1) {
        started.resolve();
        await gate.promise;
      }
      if (current()) published.push(model);
      return model;
    });
    await started.promise;
    coordinator.invalidate("root");
    gate.resolve();
    await expect(result).resolves.toBe(2);
    expect(published).toEqual([2]);
  });

  it.each(["success", "failure", "projection"] as const)(
    "puts an invalidated %s attempt behind other waiting roots",
    async (outcome) => {
      const gate = deferred<void>();
      const started = deferred<void>();
      let first = true;
      const load = vi.fn(async (root: string) => {
        if (root === "busy" && first) {
          first = false;
          if (outcome !== "projection") {
            started.resolve();
            await gate.promise;
            if (outcome === "failure") throw new Error("stale failure");
          }
        }
        return root;
      });
      const coordinator = new LoadCoordinator(load);
      let projectFirst = true;
      const busy = coordinator.run("busy", async (model, current) => {
        if (outcome === "projection" && projectFirst) {
          projectFirst = false;
          started.resolve();
          await gate.promise;
          expect(current()).toBe(false);
        }
        return model;
      });
      await started.promise;
      const other = coordinator.run("other", (model) => model);
      coordinator.invalidate("busy");
      gate.resolve();
      await expect(other).resolves.toBe("other");
      await expect(busy).resolves.toBe("busy");
      expect(load.mock.calls.map(([root]) => root)).toEqual(["busy", "other", "busy"]);
    }
  );

  it("one consumer cancelling does not cancel another; all cancelling drains before the next load", async () => {
    const gate = deferred<number>();
    let loadSignal!: AbortSignal;
    const coordinator = new LoadCoordinator(async (_root, signal) => {
      loadSignal = signal;
      return gate.promise;
    });
    const cancel = new AbortController();
    const a = coordinator.run("root", (model) => model, cancel.signal);
    const rejection = expect(a).rejects.toMatchObject({ name: "AbortError" });
    const b = coordinator.run("root", (model) => model);
    cancel.abort();
    expect(loadSignal.aborted).toBe(false);
    gate.resolve(7);
    await rejection;
    await expect(b).resolves.toBe(7);

    const blocked = deferred<number>();
    const load = vi
      .fn()
      .mockImplementationOnce((_root, signal: AbortSignal) => {
        loadSignal = signal;
        return blocked.promise;
      })
      .mockResolvedValue(9);
    const second = new LoadCoordinator<number>(load);
    const lifetime = new AbortController();
    const abandoned = second.run("root", (model) => model, lifetime.signal);
    const aborted = expect(abandoned).rejects.toMatchObject({ name: "AbortError" });
    lifetime.abort();
    const next = second.run("other", (model) => model);
    expect(loadSignal.aborted).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    blocked.reject(new Error("aborted I/O completed"));
    await aborted;
    await expect(next).resolves.toBe(9);
  });

  it("recovers after loading or consumer failure", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("missing file")).mockResolvedValue(1);
    const coordinator = new LoadCoordinator<number>(load);
    await expect(coordinator.run("root", (value) => value)).rejects.toThrow("missing file");
    await expect(
      coordinator.run("root", () => {
        throw new Error("invalid projection");
      })
    ).rejects.toThrow("invalid projection");
    await expect(coordinator.run("root", (value) => value)).resolves.toBe(1);
  });

  it("does not lose immediate sequential requests while completed jobs leave the queue", async () => {
    const load = vi.fn(async () => 1);
    const coordinator = new LoadCoordinator(load);
    for (let index = 0; index < 20; index++) {
      expect(await coordinator.run("root", (model) => model)).toBe(1);
    }
    expect(load).toHaveBeenCalledTimes(20);
  });
});
