import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { buildDefaultCase, buildDefaultSuite, stringifyYaml } from "@tlog/shared";

// Bundles and fixtures remain in a uniquely named temporary directory for inspection.
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseline = process.argv[2] ?? "2efda5a";
const concurrencyOnly = process.argv[3] === "concurrency";
const trials = Number(process.env.TLOG_BENCH_TRIALS ?? 20);
if (!Number.isInteger(trials) || trials < 1) throw new Error("Invalid trial count");
const output = await mkdtemp(join(tmpdir(), "tlog-loading-benchmark-"));
const sourcePath = "packages/vscode-extension/src/tlog-workspace.ts";
await build({
  stdin: {
    contents: execFileSync("git", ["show", `${baseline}:${sourcePath}`], {
      cwd: repository,
      encoding: "utf8"
    }),
    resolveDir: join(repository, dirname(sourcePath)),
    sourcefile: sourcePath,
    loader: "ts"
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: join(output, "baseline.cjs")
});
await build({
  entryPoints: [join(repository, sourcePath)],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: join(output, "current.cjs")
});

if (concurrencyOnly) {
  const source = await readFile(join(repository, sourcePath), "utf8");
  for (const limit of [4, 16]) {
    await build({
      stdin: {
        contents: source.replace("new IoLimiter(8)", `new IoLimiter(${limit})`),
        resolveDir: join(repository, dirname(sourcePath)),
        sourcefile: sourcePath,
        loader: "ts"
      },
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile: join(output, `current-${limit}.cjs`)
    });
  }
}

for (const shape of concurrencyOnly ? ["flat"] : ["flat", "deep", "wide", "noise", "large"]) {
  const root = join(output, shape);
  await mkdir(root);
  const directories = [root];
  if (shape === "deep") {
    let cursor = root;
    for (let level = 1; level < 20; level++) {
      cursor = join(cursor, `level-${level}`);
      await mkdir(cursor);
      directories.push(cursor);
    }
  } else if (shape === "wide") {
    for (let index = 0; index < 200; index++) {
      const directory = join(root, `suite-${index}`);
      await mkdir(directory);
      directories.push(directory);
    }
  }
  for (let index = 0; index < directories.length; index++) {
    await writeFile(
      join(directories[index], "index.yaml"),
      stringifyYaml(
        buildDefaultSuite({
          id: `suite-${index}`,
          title: "Benchmark",
          tags: ["inherited"]
        })
      )
    );
  }
  let yamlBytes = 0;
  for (let index = 0; index < 2000; index++) {
    const source = stringifyYaml(
      buildDefaultCase({
        id: `case-${index}`,
        title: "Benchmark",
        status: index % 2 ? "done" : "todo",
        remarks: shape === "large" ? ["x".repeat(4096)] : []
      })
    );
    yamlBytes += Buffer.byteLength(source);
    await writeFile(join(directories[index % directories.length], `case-${index}.yaml`), source);
  }
  if (shape === "noise") {
    for (let index = 0; index < 1000; index++) {
      const directory = join(root, `unrelated-${index}`);
      await mkdir(directory);
      for (let file = 0; file < 10; file++)
        await writeFile(join(directory, `file-${file}.txt`), "unrelated");
    }
  }
  for (const version of concurrencyOnly
    ? ["current-4", "current", "current-16"]
    : ["baseline", "current"]) {
    const result = execFileSync(
      process.execPath,
      [
        "--expose-gc",
        join(repository, "scripts/benchmark-vscode-loading-worker.cjs"),
        join(output, `${version}.cjs`),
        root,
        String(trials),
        version
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 }
    );
    console.log(
      JSON.stringify({
        shape,
        caseCount: 2000,
        suiteCount: directories.length,
        yamlBytes,
        ...JSON.parse(result)
      })
    );
  }
}

// Low-FD check is isolated from fixture setup and the parent process.
const lowFd = execFileSync(
  "bash",
  [
    "-c",
    'ulimit -n 128 && exec "$@"',
    "tlog-fd-check",
    process.execPath,
    "--expose-gc",
    join(repository, "scripts/benchmark-vscode-loading-worker.cjs"),
    join(output, "current.cjs"),
    join(output, "flat"),
    "1",
    "current"
  ],
  { encoding: "utf8" }
);
console.log(JSON.stringify({ lowFdLimit: 128, ...JSON.parse(lowFd) }));
console.log(
  JSON.stringify({ baseline, output, runtime: process.version, platform: process.platform, trials })
);
