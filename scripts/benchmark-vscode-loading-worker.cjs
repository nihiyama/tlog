/* global require */
/* eslint-disable @typescript-eslint/no-require-imports -- Instrument CommonJS fs before loading the bundled extension. */
const fs = require("node:fs/promises");
const { join, relative, isAbsolute } = require("node:path");
const { performance } = require("node:perf_hooks");
const { setImmediate } = require("node:timers");
const { calculateBurndown } = require("../packages/shared/dist/index.js");

const [bundle, root, trialText, version] = process.argv.slice(2);
let reads = 0;
let enumerations = 0;
let active = 0;
let maximum = 0;
let peak = process.memoryUsage();
const sample = () => {
  const usage = process.memoryUsage();
  for (const key of ["heapUsed", "external", "rss"]) peak[key] = Math.max(peak[key], usage[key]);
};
for (const method of ["readFile", "readdir"]) {
  const original = fs[method];
  fs[method] = async (...args) => {
    if (method === "readFile") reads++;
    else enumerations++;
    maximum = Math.max(maximum, ++active);
    try {
      return await original(...args);
    } finally {
      active--;
      if ((reads + enumerations) % 64 === 0) sample();
    }
  };
}
const workspace = require(bundle);
const selectedSource = awaitSource();
function awaitSource() {
  return fs.readFile(join(root, "index.yaml"), "utf8");
}
function inside(path) {
  const pathRelative = relative(root, path);
  return pathRelative.length > 0 && !pathRelative.startsWith("..") && !isAbsolute(pathRelative);
}
async function prepare() {
  const source = await selectedSource;
  if (version === "baseline") {
    await workspace.getWorkspaceSnapshot(root); // Related options before ready.
    const snapshot = await workspace.getWorkspaceSnapshot(root, { tags: ["inherited"] });
    const all = await workspace.getWorkspaceSnapshot(root);
    const paths = new Set(snapshot.cases.map((item) => item.path));
    const cases = await Promise.all(
      all.cases
        .filter(
          (item) =>
            inside(item.path) &&
            paths.has(item.path) &&
            item.scoped !== false &&
            item.suiteScoped !== false
        )
        .map(async (item) => workspace.parseYamlDocument(await fs.readFile(item.path, "utf8")))
    );
    sample();
    const suite = workspace.parseYamlDocument(source);
    return calculateBurndown(cases, suite.duration.scheduled.start, suite.duration.scheduled.end)
      .summary;
  }
  return workspace.withWorkspaceModel(root, (model) => {
    const all = workspace.snapshotFromWorkspaceModel(model);
    const snapshot = workspace.filterWorkspaceSnapshot(all, { tags: ["inherited"] });
    const cases = snapshot.cases
      .filter((item) => inside(item.path) && item.scoped !== false && item.suiteScoped !== false)
      .map((item) => model.getCase(item.path));
    sample();
    const suite = workspace.parseYamlDocument(source);
    return calculateBurndown(cases, suite.duration.scheduled.start, suite.duration.scheduled.end)
      .summary;
  });
}
(async () => {
  await prepare(); // Warmup; fixture creation and selected-document read are excluded.
  const elapsed = [];
  const after = [];
  let summary;
  globalThis.gc?.();
  const initial = process.memoryUsage();
  peak = { ...initial };
  reads = enumerations = maximum = 0;
  for (let trial = 0; trial < Number(trialText); trial++) {
    const start = performance.now();
    summary = await prepare();
    elapsed.push(performance.now() - start);
    sample();
    // Allow the scoped consumer and coordinator cleanup to settle before retention measurement.
    await new Promise(setImmediate);
    globalThis.gc?.();
    after.push(process.memoryUsage().heapUsed);
  }
  elapsed.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      version,
      medianMs: elapsed[Math.floor(elapsed.length / 2)],
      p95Ms: elapsed[Math.ceil(elapsed.length * 0.95) - 1],
      readsPerTrial: reads / elapsed.length,
      enumerationsPerTrial: enumerations / elapsed.length,
      maxConcurrentIo: maximum,
      initial,
      sampledPeak: peak,
      afterGcHeapUsed: after,
      summary,
      interval: "Manager data preparation only; excludes Webview rendering; OS cache warmed"
    })
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
