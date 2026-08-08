;;; kusto-ts-mode.el --- Kusto mode using Tree-sitter -*- lexical-binding: t; -*-

;; Copyright (c) 2026 Kien Nguyen
;; SPDX-License-Identifier: MIT
;; Package-Requires: ((emacs "31.1"))

;;; Commentary:
;; Tree-sitter major mode for Kusto Query Language.

;;; Code:

(require 'prog-mode)
(require 'subr-x)
(require 'treesit)

(defgroup kusto-ts-mode nil
  "Tree-sitter support for Kusto Query Language."
  :group 'languages)

(defcustom kusto-ts-mode-indent-offset 2
  "Number of spaces for each Kusto indentation step."
  :type 'integer
  :safe 'integerp
  :group 'kusto-ts-mode)

(defvar kusto-ts-mode-syntax-table
  (let ((table (make-syntax-table prog-mode-syntax-table)))
    (modify-syntax-entry ?/ ". 12b" table)
    (modify-syntax-entry ?' "\"" table)
    (modify-syntax-entry ?\n "> b" table)
    table)
  "Syntax table for `kusto-ts-mode'.")

(defun kusto-ts-mode--command-brace-body-range (node offset)
  "Return the interior range of command brace body NODE."
  (let* ((node-beg (treesit-node-start node))
         (node-end (treesit-node-end node))
         (beg (+ node-beg (or (car offset) 0)))
         (end (+ node-end (or (cdr offset) 0))))
    (if (<= beg end)
        (list (cons beg end))
      (let ((point (max node-beg (min node-end (min beg end)))))
        (list (cons point point))))))

(defun kusto-ts-mode--indent (node parent bol)
  "Indent using the primary parser when a local command parser is active."
  (let ((primary-node
         (and (boundp 'treesit-primary-parser)
              treesit-primary-parser
              (treesit-node-at bol treesit-primary-parser t))))
    (if (and primary-node
             (equal (treesit-node-type primary-node) "command_brace_body"))
        (cons (save-excursion
                (goto-char (treesit-node-start primary-node))
                (line-beginning-position))
              (if (eq (char-after bol) ?})
                  0
                kusto-ts-mode-indent-offset))
      (treesit-simple-indent node parent bol))))

(defun kusto-ts-mode--node-name (node)
  "Return NODE's Kusto name field."
  (when-let* ((name (treesit-node-child-by-field-name node "name")))
    (treesit-node-text name t)))

(defun kusto-ts-mode--command-name (node)
  "Return a distinct first-line name for management command NODE."
  (string-remove-prefix
   "."
   (string-trim (car (split-string (treesit-node-text node t) "\n")))))

(defun kusto-ts-mode--imenu ()
  "Return the Kusto Tree-sitter Imenu index without a language wrapper."
  (let ((index (treesit-simple-imenu)))
    (or (cdr (assoc (treesit-language-display-name 'kusto) index))
        index)))

(defvar kusto-ts-mode--font-lock-settings
  (treesit-font-lock-rules
   :language 'kusto :feature 'comment
   '((comment) @font-lock-comment-face)

   :language 'kusto :feature 'string
   '([(string_literal) (command_string)] @font-lock-string-face
     (date_time_literal_expression) @font-lock-constant-face)

   :language 'kusto :feature 'literal
   '([(integer_literal)
      (long_literal_expression)
      (int_literal_expression)
      (real_number)
      (real_literal_expression)
      (decimal_literal_expression)
      (time_span_literal_expression)] @font-lock-number-face
     [(boolean_literal_expression)
      (json_null)
      (guid_literal_expression)
      (raw_guid_literal_expression)
      (raw_guid)] @font-lock-constant-face
     [(type_literal_expression) (scalar_type)] @font-lock-type-face)

   :language 'kusto :feature 'definition
   '((let_function_declaration
      name: (identifier_or_keyword_or_escaped_name)
      @font-lock-function-name-face)
     (let_view_declaration
      name: (identifier_or_keyword_or_escaped_name)
      @font-lock-function-name-face)
     (let_variable_declaration
      name: (identifier_or_keyword_or_escaped_name)
      @font-lock-variable-name-face)
     (parameter_name) @font-lock-variable-name-face
     (management_command
      name: (command_word) @font-lock-preprocessor-face))

   :language 'kusto :feature 'function
   '((named_function_call_expression
      name: (simple_name_reference
              (identifier_or_keyword_or_escaped_name)
              @font-lock-function-call-face))
     (count_expression "count" @font-lock-function-call-face))

   :language 'kusto :feature 'keyword
   '(["alias" "database" "declare" "pattern" "query_parameters"
      "let" "view" "materialize" "set" "restrict" "access"
      "print" "macro-expand" "range" "datatable" "externaldata"
      "external_data" "materialized-view-combine" "to" "from"
      "where" "filter" "as" "assert-schema" "consume" "count"
      "distinct" "extend" "facet" "by" "find" "fork"
      "graph-mark-components" "graph-match" "graph-shortest-paths"
      "graph-to-table" "nodes" "edges" "invoke" "join" "lookup"
      "make-graph" "make-series" "mv-expand" "mv-apply" "evaluate"
      "parse" "parse-kv" "parse-where" "partition" "project"
      "project-away" "project-keep" "project-rename" "project-reorder"
      "reduce" "render" "sample" "sample-distinct" "scan" "search"
      "serialize" "sort" "summarize" "take" "top" "top-hitters"
      "top-nested" "union" "execute" "on" "in" "kind" "with"
      "optional" "output" "order" "asc" "desc" "of" "step"]
     @font-lock-keyword-face)

   :language 'kusto :feature 'operator
   '(["|" "=" "==" "!=" "<" ">" "<=" ">=" "=~" "!~" "has" "!has"
      "has_cs" "!has_cs" "hasprefix" "!hasprefix" "hassuffix"
      "!hassuffix" "like" "likecs" "contains" "containscs" "!contains"
      "!contains_cs" "startswith" "startswith_cs" "endswith" "endswith_cs"
      "matches regex" "+" "-" "*" "/" "%" "and" "or"]
     @font-lock-operator-face)

   :language 'kusto :feature 'name
   '((entity_name_reference) @font-lock-type-face
     (named_expression_name_clause
      (identifier_or_extended_keyword_or_escaped_name)
      @font-lock-property-name-face)
     (simple_name_reference) @font-lock-variable-use-face)

   :language 'kusto :feature 'bracket
   '(["(" ")" "[" "]" "{" "}"] @font-lock-bracket-face
     ["," ";" ":"] @font-lock-delimiter-face
     (command_bracket) @font-lock-bracket-face
     (command_punct) @font-lock-delimiter-face))
  "Font-lock settings for Kusto.")

(defvar kusto-ts-mode--indent-rules
  `((kusto
     ((node-is "}") parent-bol 0)
     ((node-is "]") parent-bol 0)
     ((node-is ")") parent-bol 0)
     ((parent-is "let_function_body") parent-bol
      kusto-ts-mode-indent-offset)
     ((parent-is "command_brace_body") parent-bol
      kusto-ts-mode-indent-offset)
     ((node-is "let_function_parameter_list") parent-bol
      kusto-ts-mode-indent-offset)
     ((node-is "let_view_parameter_list") parent-bol
      kusto-ts-mode-indent-offset)
     ((node-is "argument_expression") parent-bol
      kusto-ts-mode-indent-offset)
     ((parent-is ,(rx (or "parenthesized_expression"
                          "named_function_call_expression"
                          "row_schema")))
      parent-bol kusto-ts-mode-indent-offset)
     ((parent-is ,(rx (or "let_function_parameter_list"
                          "let_view_parameter_list")))
      grand-parent
      kusto-ts-mode-indent-offset)
     ((node-is "piped_operator") parent-bol 0)
     (no-node parent-bol 0)))
  "Indentation rules for Kusto.")

(defun kusto-ts-mode--setup ()
  "Configure Tree-sitter support for the current Kusto buffer."
  (setq-local treesit-primary-parser (treesit-parser-create 'kusto))
  (setq-local treesit-range-settings
              (treesit-range-rules
               :embed 'kusto :host 'kusto :local t
               '((script_query_prefix) @content)
               :embed 'kusto :host 'kusto :local t :offset '(1 . -1)
               :range-fn #'kusto-ts-mode--command-brace-body-range
               "((command_brace_body) @content)"))
  (setq-local treesit-language-at-point-function (lambda (_pos) 'kusto))
  (setq-local treesit-font-lock-settings kusto-ts-mode--font-lock-settings)
  (setq-local treesit-font-lock-feature-list
              '((comment string)
                (literal keyword)
                (definition function operator)
                (name bracket)))
  (setq-local treesit-simple-indent-rules kusto-ts-mode--indent-rules)
  (setq-local treesit-indent-function #'kusto-ts-mode--indent)
  (setq-local comment-start "// ")
  (setq-local comment-end "")
  (setq-local comment-start-skip "//+\\s-*")
  (setq-local treesit-thing-settings
              '((kusto
                 (defun (or "let_function_declaration"
                            "let_view_declaration"))
                 (sentence "statement")
                 (sexp (or "expression"
                           "pipe_expression"
                           "parenthesized_expression")))))
  (setq-local treesit-defun-name-function #'kusto-ts-mode--node-name)
  (setq-local treesit-simple-imenu-settings
              '(("Function" "\\`let_function_declaration\\'" nil
                 kusto-ts-mode--node-name)
                ("View" "\\`let_view_declaration\\'" nil
                 kusto-ts-mode--node-name)
                ("Command" "\\`management_command\\'" nil
                   kusto-ts-mode--command-name)))
  (setq-local treesit-aggregated-simple-imenu-settings
              `((kusto . ,treesit-simple-imenu-settings)))
  (treesit-major-mode-setup)
  (treesit-update-ranges)
  (setq-local imenu-create-index-function #'kusto-ts-mode--imenu))

;;;###autoload
(define-derived-mode kusto-ts-mode prog-mode "Kusto[TS]"
  "Major mode for editing Kusto Query Language with Tree-sitter."
  :syntax-table kusto-ts-mode-syntax-table
  (unless (treesit-ready-p 'kusto)
    (error "Tree-sitter grammar for Kusto is unavailable"))
  (kusto-ts-mode--setup))

;;;###autoload
(add-to-list 'auto-mode-alist
             '("\\.\\(?:csl\\|kql\\|kusto\\)\\'" . kusto-ts-mode))

(provide 'kusto-ts-mode)
;;; kusto-ts-mode.el ends here
