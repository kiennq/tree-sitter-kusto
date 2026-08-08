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

## Emacs

Build or install the Kusto grammar, then load `lisp/kusto-ts-mode.el`.

```elisp
(use-package kusto-ts-mode
  :load-path "/path/to/tree-sitter-kusto/lisp"
  :mode (("\\.\\(csl\\|kql\\|kusto\\)\\'" . kusto-ts-mode)))
```

`kusto-ts-mode` requires Emacs 31.1 or newer.
