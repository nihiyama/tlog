export type Translate = (message: string, ...args: Array<string | number | boolean>) => string;

export const identityTranslate: Translate = (message, ...args) =>
  args.reduce<string>(
    (text, value, index) => text.replaceAll(`{${index}}`, String(value)),
    message
  );

export const webviewMessages = [
  "Root directory",
  "tlog root directory",
  "Set Root",
  "Browse",
  "Search",
  "Quick filters",
  "scoped only",
  "Scoped only",
  "Tags",
  "search tags",
  "Owners",
  "search owners",
  "Advanced filters",
  "Case status",
  "Select status",
  "Issues presence",
  "Select issue presence",
  "Issue presence",
  "Issue status",
  "Select issue status",
  "todo",
  "doing",
  "done",
  "has",
  "none",
  "open",
  "resolved",
  "pending",
  "Active filters",
  "Apply",
  "Clear all filters",
  "No active filters",
  "Remove filter",
  "scopedOnly",
  "scoped",
  "tag",
  "owner",
  "status",
  "issueHas",
  "issueStatus",
  "Remove",
  "Use IDs like suite.case. Press Enter or comma to add.",
  "type related id",
  "Save",
  "Open YAML",
  "Root",
  "id",
  "title",
  "tags",
  "owners",
  "related",
  "scheduled",
  "actual",
  "description",
  "remarks",
  "comma or enter",
  "Add Remark",
  "Burndown: set valid duration.scheduled.start/end to render chart.",
  "Suite Burndown",
  "No scoped cases match the active search filters.",
  "Suite burndown chart",
  "Cases",
  "Scoped cases",
  "Remaining cases",
  "Completed cases",
  "Progress rate",
  "Ideal Remaining",
  "Ideal remaining",
  "Actual Remaining",
  "Detected Issues cumulative (bar)",
  "Detected issues (cumulative)",
  "Remaining Issues/day",
  "Remaining issues",
  "Scope rule: active search filters and scoped Suite/Case ancestry are applied once before aggregation. Detected issues bars are cumulative by detectedDay. Remaining issues uses cumulative detected minus cumulative completedDay.",
  "Drag to reorder operation",
  "name",
  "expected",
  "actual",
  "trails",
  "null",
  "pass",
  "fail",
  "skip",
  "block",
  "Remove Test",
  "Add Trail",
  "incident",
  "causes",
  "solutions",
  "detectedDay",
  "completedDay",
  "Remove Issue",
  "Add Cause",
  "Add Solution",
  "operations",
  "Add Step",
  "tests",
  "Add Test",
  "issues",
  "Add Issue",
  "Suite Editor",
  "Cases in Suite",
  "all status",
  "search case title",
  "Search case title",
  "Case Editor",
  "Select a suite or case from the tree to edit.",
  "Unsaved",
  "Saving...",
  "Saved",
  "Save failed"
] as const;

export const webviewPrefixes = [
  "Root /",
  "Suite:",
  "Case:",
  "Error:",
  "Ideal remaining on",
  "Actual remaining on",
  "Detected issues cumulative on",
  "Remaining issues on",
  "[suite]",
  "[case]"
] as const;

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");
}

export function webviewLocalizationScript(
  t: Translate = identityTranslate,
  language = "en"
): string {
  const translations = Object.fromEntries(
    webviewMessages
      .map((message) => [message, t(message)] as const)
      .filter(([message, translated]) => message !== translated)
  );
  const prefixes = Object.fromEntries(
    webviewPrefixes
      .map((message) => [message, t(message)] as const)
      .filter(([message, translated]) => message !== translated)
  );

  // English and unsupported locales need no DOM translation. Keeping this path minimal avoids
  // walking and observing the entire Webview document during its initial render.
  if (Object.keys(translations).length === 0 && Object.keys(prefixes).length === 0) {
    return `<script>document.documentElement.lang = ${safeJson(language)};</script>`;
  }

  return `<script>
    (() => {
      const translations = ${safeJson(translations)};
      const prefixes = ${safeJson(prefixes)};
      const translatableAttributes = ["aria-label", "placeholder", "title", "data-tip"];
      document.documentElement.lang = ${safeJson(language)};

      const translateCore = (value) => {
        if (translations[value]) return translations[value];
        if (value.includes(":")) {
          const parts = value.split(":");
          if (parts.length === 2) {
            const left = translations[parts[0]] || parts[0];
            const right = translations[parts[1]] || parts[1];
            if (left !== parts[0] || right !== parts[1]) return left + ":" + right;
          }
        }
        for (const [prefix, translated] of Object.entries(prefixes)) {
          if (value.startsWith(prefix)) return translated + value.slice(prefix.length);
        }
        return value;
      };

      const translateLine = (value) => {
        const leading = value.match(/^\\s*/)?.[0] || "";
        const trailing = value.match(/\\s*$/)?.[0] || "";
        const core = value.slice(leading.length, value.length - trailing.length);
        return leading + translateCore(core) + trailing;
      };
      const translateValue = (value) => value.split("\\n").map(translateLine).join("\\n");
      const selfMutatedText = new WeakSet();
      let trackSelfMutations = false;

      const localizeNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const next = translateValue(node.nodeValue || "");
          if (next !== node.nodeValue) {
            if (trackSelfMutations) selfMutatedText.add(node);
            node.nodeValue = next;
          }
          return;
        }
        if (!(node instanceof Element)) return;
        for (const attribute of translatableAttributes) {
          if (node.hasAttribute(attribute)) {
            const current = node.getAttribute(attribute) || "";
            const next = translateValue(current);
            if (next !== current) node.setAttribute(attribute, next);
          }
        }
        for (const child of node.childNodes) localizeNode(child);
      };

      localizeNode(document.body);
      const observer = new MutationObserver((mutations) => {
        const addedNodes = new Set();
        const changedTextNodes = [];

        for (const mutation of mutations) {
          if (mutation.type === "characterData") {
            if (!selfMutatedText.delete(mutation.target)) changedTextNodes.push(mutation.target);
            continue;
          }
          for (const node of mutation.addedNodes) addedNodes.add(node);
        }

        const isNestedInAddedNode = (node) => {
          let parent = node.parentNode;
          while (parent) {
            if (addedNodes.has(parent)) return true;
            parent = parent.parentNode;
          }
          return false;
        };

        // A render can report both a new container and all of its descendants. Translating only
        // the outermost nodes ensures that each new subtree is traversed once.
        for (const node of addedNodes) {
          if (!isNestedInAddedNode(node)) localizeNode(node);
        }
        for (const node of changedTextNodes) {
          if (!isNestedInAddedNode(node)) localizeNode(node);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      trackSelfMutations = true;
    })();
  </script>`;
}
