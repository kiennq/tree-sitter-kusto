import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rootUrl = new URL("../..", import.meta.url);
const root = fileURLToPath(rootUrl);

const binding = typeof process.versions.bun === "string"
  // Support `bun build --compile` by being statically analyzable enough to find the .node file at build-time
  ? await import(new URL(`prebuilds/${process.platform}-${process.arch}/tree-sitter-kusto.node`, rootUrl))
  : (await import("node-gyp-build")).default(root);

binding.nodeTypeInfo = JSON.parse(readFileSync(new URL("src/node-types.json", rootUrl), "utf8"));

const queries = [
  ["HIGHLIGHTS_QUERY", new URL("queries/highlights.scm", rootUrl)],
  ["INJECTIONS_QUERY", new URL("queries/injections.scm", rootUrl)],
  ["LOCALS_QUERY", new URL("queries/locals.scm", rootUrl)],
  ["TAGS_QUERY", new URL("queries/tags.scm", rootUrl)],
];

for (const [prop, path] of queries) {
  Object.defineProperty(binding, prop, {
    configurable: true,
    enumerable: true,
    get() {
      delete binding[prop];
      try {
        binding[prop] = readFileSync(path, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      return binding[prop];
    }
  });
}

export default binding;
