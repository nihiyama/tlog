import { normalize, sep } from "node:path";

export function slugifyTitle(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "untitled";
}

export function ensureUniqueSlug(baseSlug: string, usedSlugs: Set<string>): string {
  if (!usedSlugs.has(baseSlug)) {
    usedSlugs.add(baseSlug);
    return baseSlug;
  }

  let suffix = 2;
  while (usedSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  const slug = `${baseSlug}-${suffix}`;
  usedSlugs.add(slug);
  return slug;
}

export function buildSuiteFileName(id: string, title: string): string {
  return `${id}-${slugifyTitle(title)}.suite.yaml`;
}

export function buildCaseFileName(id: string, title: string): string {
  return `${id}-${slugifyTitle(title)}.testcase.yaml`;
}

export function normalizeTlogPath(input: string): string {
  return normalize(input).split(sep).join("/");
}
