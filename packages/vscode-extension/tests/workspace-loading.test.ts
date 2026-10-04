import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDefaultCase, buildDefaultSuite, writeYamlFileAtomic } from "@tlog/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assignSuiteStatuses,
  getWorkspaceSnapshot,
  loadTree,
  snapshotFromWorkspaceModel,
  treeFromWorkspaceModel,
  withWorkspaceModel
} from "../src/tlog-workspace.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof fs>();
  return { ...original, readFile: vi.fn(original.readFile), readdir: vi.fn(original.readdir) };
});

async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), "tlog-load-once-"));
  await writeYamlFileAtomic(
    join(root, "index.yaml"),
    buildDefaultSuite({ id: "root", title: "Root" })
  );
  await writeYamlFileAtomic(
    join(root, "another.suite.yaml"),
    buildDefaultSuite({ id: "another", title: "Another", scoped: false })
  );
  const child = join(root, "child");
  await fs.mkdir(child);
  await writeYamlFileAtomic(
    join(child, "index.yaml"),
    buildDefaultSuite({ id: "child", title: "Child", tags: ["inherited"] })
  );
  await writeYamlFileAtomic(
    join(root, "a.yaml"),
    buildDefaultCase({ id: "duplicate", title: "A", status: "done" })
  );
  await writeYamlFileAtomic(
    join(child, "b.yaml"),
    buildDefaultCase({ id: "duplicate", title: "B", status: "todo" })
  );
  const gap = join(root, "gap", "nested");
  await fs.mkdir(gap, { recursive: true });
  await writeYamlFileAtomic(
    join(gap, "index.yaml"),
    buildDefaultSuite({ id: "gap", title: "Gap" })
  );
  await fs.writeFile(join(root, "ignored.txt"), "ignored");
  await fs.writeFile(join(root, "gap", "orphan.yaml"), "not: a case");
  await fs.symlink(child, join(root, "linked-child"), "dir");
  vi.mocked(fs.readFile).mockClear();
  vi.mocked(fs.readdir).mockClear();
  return root;
}

describe("workspace model ownership and discovery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enumerates each directory and reads each physical YAML exactly once for concurrent projections", async () => {
    const root = await fixture();
    const [tree, snapshot] = await Promise.all([loadTree(root), getWorkspaceSnapshot(root)]);
    const reads = vi.mocked(fs.readFile).mock.calls.map(([path]) => String(path));
    expect(reads).toHaveLength(6);
    expect(new Set(reads).size).toBe(6);
    const directories = vi.mocked(fs.readdir).mock.calls.map(([path]) => String(path));
    expect(directories).toHaveLength(4);
    expect(new Set(directories).size).toBe(4);
    expect(tree.filter((node) => node.type === "case")).toHaveLength(3);
    expect(snapshot.cases.filter((item) => item.path === join(root, "a.yaml"))).toHaveLength(2);
    expect(
      snapshot.cases
        .filter((item) => item.path === join(root, "a.yaml"))
        .map((item) => item.suiteId)
    ).toEqual(["another", "root"]);
    expect(tree.find((node) => node.id === "gap")?.parentPath).toBeUndefined();
    expect(snapshot.cases.find((item) => item.title === "B")?.suiteTags).toContain("inherited");
    expect(tree.some((node) => node.path.includes("linked-child"))).toBe(false);
  });

  it("keeps nested entity bodies immutable and status changes isolated to view-owned nodes", async () => {
    const root = await fixture();
    await withWorkspaceModel(root, (model) => {
      const entity = model.getCase(join(root, "a.yaml"))!;
      expect(Object.isFrozen(entity)).toBe(true);
      expect(Object.isFrozen(entity.tests)).toBe(true);
      expect(() => entity.tags.push("leaked edit")).toThrow();
      const all = treeFromWorkspaceModel(root, model);
      const filtered = treeFromWorkspaceModel(root, model).filter(
        (node) => node.type !== "case" || node.status === "done"
      );
      assignSuiteStatuses(filtered);
      expect(filtered.find((node) => node.id === "root")?.suiteStatus).toBe("done");
      expect(all.find((node) => node.id === "root")?.suiteStatus).toBe("doing");
      expect(model.nodes.find((node) => node.id === "root")?.suiteStatus).toBeUndefined();
      expect(snapshotFromWorkspaceModel(model, { tags: ["inherited"] }).cases).toHaveLength(1);
    });
    expect(vi.mocked(fs.readFile)).toHaveBeenCalledTimes(6);
  });

  it("reloads after completion instead of retaining a cache, including after a parse error", async () => {
    const root = await fixture();
    await loadTree(root);
    const casePath = join(root, "a.yaml");
    await fs.writeFile(casePath, "title: [invalid");
    await expect(loadTree(root)).rejects.toThrow();
    await writeYamlFileAtomic(casePath, buildDefaultCase({ id: "updated", title: "Updated" }));
    expect((await loadTree(root)).filter((node) => node.id === "updated")).toHaveLength(2);
  });

  it("preserves invalid labels without retaining normalized validation output", async () => {
    const root = await fixture();
    await fs.writeFile(join(root, "a.yaml"), "id: invalid\ntitle: Invalid\nstatus: todo\n");
    const tree = await loadTree(root);
    const invalid = tree.find((node) => node.id === "invalid")!;
    expect(invalid.label).toBe("invalid: Invalid (invalid)");
    expect(invalid.description).toBeTruthy();
  });
});
