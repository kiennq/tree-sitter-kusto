import assert from "node:assert";
import { test } from "node:test";
import Parser from "tree-sitter";

test("can load grammar", async () => {
  const parser = new Parser();
  const { default: language } = await import("./index.js");
  parser.setLanguage(language);
  const tree = parser.parse(".show queries | take 10");
  assert.equal(tree.rootNode.hasError, false);
  assert.ok(Array.isArray(language.nodeTypeInfo));
  assert.ok(language.nodeTypeInfo.some(({ type }) => type === "management_command"));
});
