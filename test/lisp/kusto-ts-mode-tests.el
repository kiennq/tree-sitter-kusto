;;; kusto-ts-mode-tests.el --- Tests for kusto-ts-mode -*- lexical-binding: t; -*-

(require 'ert)
(require 'imenu)
(require 'treesit)

(defconst kusto-ts-test-root
  (file-name-directory
   (directory-file-name
    (file-name-directory
     (directory-file-name
      (file-name-directory (or load-file-name buffer-file-name)))))))

(setq treesit-extra-load-path
      (list (expand-file-name "build" kusto-ts-test-root)))

(add-to-list 'load-path (expand-file-name "lisp" kusto-ts-test-root))
(require 'kusto-ts-mode)

(defmacro kusto-ts-test-with-buffer (text &rest body)
  `(with-temp-buffer
     (insert ,text)
     (kusto-ts-mode)
     (goto-char (point-min))
     ,@body))

(ert-deftest kusto-ts-mode-registers-kusto-extensions ()
  (dolist (name '("query.csl" "query.kql" "query.kusto"))
    (with-temp-buffer
      (setq buffer-file-name name)
      (set-auto-mode)
      (should (eq major-mode 'kusto-ts-mode)))))

(ert-deftest kusto-ts-mode-configures-line-comments ()
  (kusto-ts-test-with-buffer "// comment\nprint 1"
    (goto-char 4)
    (should (nth 4 (syntax-ppss)))
    (should (equal comment-start "// "))
    (should (equal comment-end ""))))

(ert-deftest kusto-ts-mode-does-not-comment-in-single-quoted-strings ()
  (kusto-ts-test-with-buffer "'http://a.com'"
    (search-forward "//")
    (should (nth 3 (syntax-ppss)))
    (should-not (nth 4 (syntax-ppss)))))

(ert-deftest kusto-ts-mode-incomplete-command-brace-body-does-not-signal ()
  (kusto-ts-test-with-buffer ".create function F = {"
    (treesit-update-ranges)))

(ert-deftest kusto-ts-mode-empty-command-brace-body-does-not-signal ()
  (kusto-ts-test-with-buffer ".create function F = {}"
    (treesit-update-ranges)))

(ert-deftest kusto-ts-mode-creates-local-parser-for-unicode-body ()
  (kusto-ts-test-with-buffer
      "// Query examples\nT | take 1\n\n.create function F = {\nlet s = 'café';\n}\n"
    (treesit-update-ranges)
    (should (= 2 (length (treesit-local-parsers-on
                          (point-min) (point-max) 'kusto))))))

(ert-deftest kusto-ts-mode-normal-body-range-excludes-braces ()
  (kusto-ts-test-with-buffer
      "// Query examples\nT | take 1\n\n.create function F = {\nT | project X\n}\n"
    (let ((body-beg (save-excursion
                      (search-forward "{")
                      (point)))
          (body-end (save-excursion
                      (search-forward "}")
                      (1- (point))))
          ranges)
      (treesit-update-ranges)
      (dolist (parser (treesit-local-parsers-on
                       (point-min) (point-max) 'kusto))
        (setq ranges
              (append (treesit-parser-included-ranges parser) ranges)))
      (should (member (cons body-beg body-end) ranges)))))

(defun kusto-ts-test-face-at (text)
  (let ((face (get-text-property (point) 'face)))
    (if (listp face) (memq text face) (eq text face))))

(ert-deftest kusto-ts-mode-fontifies-semantic-kusto ()
  (kusto-ts-test-with-buffer
      "let F = (p:string) { T | project Name = tostring(p) };\n.show queries"
    (font-lock-ensure)
    (search-forward "let")
    (backward-char 1)
    (should (kusto-ts-test-face-at 'font-lock-keyword-face))
    (search-forward "F")
    (backward-char 1)
    (should (kusto-ts-test-face-at 'font-lock-function-name-face))
    (search-forward "string")
    (backward-char 1)
    (should (kusto-ts-test-face-at 'font-lock-type-face))
    (search-forward "tostring")
    (backward-char 1)
    (should (kusto-ts-test-face-at 'font-lock-function-call-face))
    (search-forward "show")
    (backward-char 1)
    (should (kusto-ts-test-face-at 'font-lock-preprocessor-face))))

(ert-deftest kusto-ts-mode-indents-query-and-function-body ()
  (kusto-ts-test-with-buffer
      "let F = () {\nT\n| where X\n| project X\n};"
    (indent-region (point-min) (point-max))
    (should
     (equal (buffer-string)
            "let F = () {\n  T\n  | where X\n  | project X\n};"))))

(ert-deftest kusto-ts-mode-indents-command-brace-body ()
  (kusto-ts-test-with-buffer
      "T | take 1\n\n.create function F = {\nT\n| where X\n}\n"
    (indent-region (point-min) (point-max))
    (should
     (equal (buffer-string)
            "T | take 1\n\n.create function F = {\n  T\n  | where X\n}\n"))))

(ert-deftest kusto-ts-mode-indents-multiline-function-call-arguments ()
  (kusto-ts-test-with-buffer
      "strcat(\n'a',\n'b'\n)"
    (indent-region (point-min) (point-max))
    (should
     (equal (buffer-string)
            "strcat(\n  'a',\n  'b'\n)"))))

(ert-deftest kusto-ts-mode-indents-all-multiline-function-parameters ()
  (kusto-ts-test-with-buffer
      "let F = (\na:string,\nb:int,\nc:long\n) { T };"
    (indent-region (point-min) (point-max))
    (should
     (equal (buffer-string)
            "let F = (\n  a:string,\n  b:int,\n  c:long\n) { T };"))))

(ert-deftest kusto-ts-mode-builds-imenu ()
  (kusto-ts-test-with-buffer
      "let F = () { T };\nlet V = view () { T };\n.show queries"
    (let ((index (imenu--make-index-alist t)))
      (should (assoc "Function" index))
      (should (assoc "View" index))
      (should (assoc "Command" index)))))

(ert-deftest kusto-ts-mode-builds-distinct-command-imenu-entries ()
  (kusto-ts-test-with-buffer
      ".show queries\n.show tables\n.show database schema"
    (let* ((index (imenu--make-index-alist t))
           (commands (cdr (assoc "Command" index))))
      (should (assoc "show queries" commands))
      (should (assoc "show tables" commands))
      (should (assoc "show database schema" commands)))))

(ert-deftest kusto-ts-mode-enables-tree-sitter-navigation ()
  (kusto-ts-test-with-buffer "let F = () { T };"
    (should (eq beginning-of-defun-function #'treesit-beginning-of-defun))
    (should (eq end-of-defun-function #'treesit-end-of-defun))
    (should (assq 'kusto treesit-thing-settings))))

(provide 'kusto-ts-mode-tests)
