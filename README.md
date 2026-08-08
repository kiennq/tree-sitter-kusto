# tree-sitter-kusto

A Tree-sitter grammar for Kusto Query Language (KQL), including Kusto
management scripts and syntax highlighting.

The grammar is translated from Microsoft's
[Kusto Query Language grammar](https://github.com/microsoft/Kusto-Query-Language/tree/master/grammar).

## Development

```sh
npm install
npm test
```

Build the optimized Windows parser DLL with:

```sh
npm run build:dll
```
