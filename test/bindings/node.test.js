import assert from 'node:assert/strict';
import test from 'node:test';
import Parser from 'tree-sitter';
import Kusto from '../../bindings/node/index.js';

test('loads the Kusto binding and parses management commands with the external scanner', () => {
  const parser = new Parser();
  parser.setLanguage(Kusto);

  const tree = parser.parse('.show queries | take 10');

  assert.equal(tree.rootNode.hasError, false);
});
