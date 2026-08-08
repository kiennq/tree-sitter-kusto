#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

enum TokenType {
  SCRIPT_QUERY_PREFIX,
  SCRIPT_PREAMBLE,
  COMMAND_START,
  COMMAND_WORD,
  COMMAND_NAME,
  COMMAND_STRING,
  COMMAND_PUNCT,
  COMMAND_BRACKET,
  COMMAND_BRACE_BODY,
  COMMAND_INLINE_DATA,
  COMMAND_END,
};

typedef struct {
  bool at_line_start;
  bool at_input_start;
  bool in_command;
  bool command_word_emitted;
  bool prefix_query_like;
} Scanner;

void *tree_sitter_kusto_external_scanner_create(void) {
  Scanner *scanner = calloc(1, sizeof(Scanner));
  scanner->at_line_start = true;
  scanner->at_input_start = true;
  return scanner;
}

void tree_sitter_kusto_external_scanner_destroy(void *payload) {
  free(payload);
}

unsigned tree_sitter_kusto_external_scanner_serialize(
  void *payload,
  char *buffer
) {
  Scanner *scanner = payload;
  buffer[0] = scanner->at_line_start;
  buffer[1] = scanner->at_input_start;
  buffer[2] = scanner->in_command;
  buffer[3] = scanner->command_word_emitted;
  buffer[4] = scanner->prefix_query_like;
  return 5;
}

void tree_sitter_kusto_external_scanner_deserialize(
  void *payload,
  const char *buffer,
  unsigned length
) {
  Scanner *scanner = payload;
  if (length == 0) {
    scanner->at_line_start = true;
    scanner->at_input_start = true;
    scanner->in_command = false;
    scanner->command_word_emitted = false;
    scanner->prefix_query_like = false;
    return;
  }
  scanner->at_line_start = length > 0 && buffer[0];
  scanner->at_input_start = length > 1 && buffer[1];
  scanner->in_command = length > 2 && buffer[2];
  scanner->command_word_emitted = length > 3 && buffer[3];
  scanner->prefix_query_like = length > 4 && buffer[4];
}

static bool is_horizontal_whitespace(int32_t character) {
  return character == ' ' || character == '\t' || character == 0xfeff;
}

static bool is_line_break(int32_t character) {
  return character == '\r' || character == '\n' || character == 0x2028 ||
         character == 0x2029;
}

static bool is_word_start(int32_t character) {
  return (character >= 'A' && character <= 'Z') ||
         (character >= 'a' && character <= 'z') || character == '_';
}

static bool is_digit(int32_t character) {
  return character >= '0' && character <= '9';
}

static bool is_word_char(int32_t character) {
  return is_word_start(character) ||
         is_digit(character) || character == '-';
}

static bool is_query_word(const char *word, unsigned length) {
  static const char *keywords[] = {
    "let", "where", "take", "project", "summarize", "join", "union",
    "datatable", "print", "extend", "count", "distinct", "sort", "top",
    "lookup", "parse", "range", "search",
  };
  for (unsigned i = 0; i < sizeof(keywords) / sizeof(keywords[0]); i++) {
    if (strlen(keywords[i]) == length &&
        strncmp(keywords[i], word, length) == 0) {
      return true;
    }
  }
  return false;
}

static void consume_line_break(TSLexer *lexer) {
  int32_t first = lexer->lookahead;
  lexer->advance(lexer, false);
  if (first == '\r' && lexer->lookahead == '\n') {
    lexer->advance(lexer, false);
  }
}

static bool scan_prefix(
  Scanner *scanner,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  if ((!valid_symbols[SCRIPT_QUERY_PREFIX] &&
       !valid_symbols[SCRIPT_PREAMBLE]) ||
      scanner->in_command) {
    return false;
  }

  bool initial_probe = scanner->at_input_start;
  lexer->mark_end(lexer);
  while (is_horizontal_whitespace(lexer->lookahead)) {
    lexer->advance(lexer, true);
  }
  if (initial_probe &&
      lexer->lookahead != '#' && lexer->lookahead != '/' &&
      !(lexer->lookahead >= 'a' && lexer->lookahead <= 'z')) {
    return false;
  }

  bool has_text = false;
  bool query_like = false;
  bool line_start = scanner->at_line_start;
  bool collecting_word = false;
  bool saw_identifier = false;
  char word[32];
  unsigned word_length = 0;

  while (!lexer->eof(lexer)) {
    if (line_start) {
      while (is_horizontal_whitespace(lexer->lookahead)) {
        lexer->advance(lexer, true);
      }
      if (lexer->lookahead == '.') {
        lexer->mark_end(lexer);
        if (!has_text) {
          scanner->at_line_start = true;
          return false;
        }
        scanner->at_input_start = false;
        scanner->at_line_start = true;
        scanner->in_command = false;
        scanner->command_word_emitted = false;
        scanner->prefix_query_like = query_like;
        return valid_symbols[query_like ? SCRIPT_QUERY_PREFIX : SCRIPT_PREAMBLE];
      }
      line_start = false;
      scanner->at_line_start = false;
      if (is_word_start(lexer->lookahead)) {
        collecting_word = true;
        word_length = 0;
      }
    }

    if (collecting_word) {
      if (is_word_char(lexer->lookahead)) {
        if (word_length < sizeof(word) - 1) {
          word[word_length++] = (char)lexer->lookahead;
        }
        lexer->advance(lexer, false);
        has_text = true;
        continue;
      }
      word[word_length] = '\0';
      collecting_word = false;
      if (word_length > 0) {
        saw_identifier = true;
        if (is_query_word(word, word_length)) {
          query_like = true;
        }
      }
    }

    if (lexer->lookahead == '|' && saw_identifier) {
      query_like = true;
    }

    if (is_line_break(lexer->lookahead)) {
      consume_line_break(lexer);
      has_text = true;
      line_start = true;
      scanner->at_line_start = true;
      continue;
    }

    if (!is_horizontal_whitespace(lexer->lookahead)) {
      has_text = true;
    }
    lexer->advance(lexer, false);
  }

  if (!has_text || initial_probe) {
    return false;
  }
  lexer->mark_end(lexer);
  scanner->at_input_start = false;
  scanner->at_line_start = line_start;
  scanner->in_command = false;
  scanner->command_word_emitted = false;
  scanner->prefix_query_like = query_like;
  return valid_symbols[query_like ? SCRIPT_QUERY_PREFIX : SCRIPT_PREAMBLE];
}

static bool scan_command_start(
  Scanner *scanner,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  if (!valid_symbols[COMMAND_START] || scanner->in_command) {
    return false;
  }

  bool at_line_start = lexer->get_column(lexer) == 0;
  bool saw_line_break = false;
  while (is_horizontal_whitespace(lexer->lookahead)) {
    lexer->advance(lexer, true);
  }
  while (is_line_break(lexer->lookahead)) {
    saw_line_break = true;
    consume_line_break(lexer);
    while (is_horizontal_whitespace(lexer->lookahead)) {
      lexer->advance(lexer, true);
    }
  }
  bool prefix_boundary = scanner->at_line_start && !scanner->at_input_start;
  if ((!at_line_start && !saw_line_break && !prefix_boundary) ||
      lexer->lookahead != '.') {
    return false;
  }
  if (lexer->lookahead != '.') {
    return false;
  }

  lexer->advance(lexer, false);
  lexer->mark_end(lexer);
  scanner->at_input_start = false;
  scanner->at_line_start = false;
  scanner->in_command = true;
  scanner->command_word_emitted = false;
  scanner->prefix_query_like = false;
  lexer->result_symbol = COMMAND_START;
  return true;
}

static bool scan_word(
  Scanner *scanner,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  uint16_t token = scanner->command_word_emitted ? COMMAND_NAME : COMMAND_WORD;
  if (!valid_symbols[token] || !scanner->in_command ||
      (token == COMMAND_WORD
        ? !is_word_start(lexer->lookahead)
        : (!is_word_start(lexer->lookahead) && !is_digit(lexer->lookahead)))) {
    return false;
  }

  do {
    lexer->advance(lexer, false);
  } while (is_word_char(lexer->lookahead));
  lexer->mark_end(lexer);
  scanner->command_word_emitted = true;
  lexer->result_symbol = token;
  return true;
}

static bool scan_string(
  Scanner *scanner,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  if (!valid_symbols[COMMAND_STRING] || !scanner->in_command) {
    return false;
  }

  if (lexer->lookahead == '`' || lexer->lookahead == '~') {
    int32_t delimiter = lexer->lookahead;
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    if (lexer->lookahead != delimiter) {
      if (!valid_symbols[COMMAND_PUNCT]) return false;
      lexer->result_symbol = COMMAND_PUNCT;
      return true;
    }
    lexer->advance(lexer, false);
    if (lexer->lookahead != delimiter) {
      if (!valid_symbols[COMMAND_PUNCT]) return false;
      lexer->result_symbol = COMMAND_PUNCT;
      return true;
    }
    lexer->advance(lexer, false);
    while (!lexer->eof(lexer)) {
      if (lexer->lookahead == delimiter) {
        lexer->advance(lexer, false);
        if (lexer->lookahead == delimiter) {
          lexer->advance(lexer, false);
          if (lexer->lookahead == delimiter) {
            lexer->advance(lexer, false);
            break;
          }
        }
      } else {
        lexer->advance(lexer, false);
      }
    }
    lexer->mark_end(lexer);
    scanner->at_line_start = false;
    lexer->result_symbol = COMMAND_STRING;
    return true;
  }

  if (lexer->lookahead == '@') {
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    if (lexer->lookahead != '\'' && lexer->lookahead != '"') {
      if (!valid_symbols[COMMAND_PUNCT]) return false;
      lexer->result_symbol = COMMAND_PUNCT;
      return true;
    }
  } else if (lexer->lookahead == 'h' || lexer->lookahead == 'H') {
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    if (lexer->lookahead != '@') {
      uint16_t token = scanner->command_word_emitted ? COMMAND_NAME : COMMAND_WORD;
      if (!valid_symbols[token]) return false;
      while (is_word_char(lexer->lookahead)) {
        lexer->advance(lexer, false);
      }
      lexer->mark_end(lexer);
      scanner->command_word_emitted = true;
      lexer->result_symbol = token;
      return true;
    }
    lexer->advance(lexer, false);
    if (lexer->lookahead != '\'' && lexer->lookahead != '"') {
      uint16_t token = scanner->command_word_emitted ? COMMAND_NAME : COMMAND_WORD;
      if (!valid_symbols[token]) return false;
      scanner->command_word_emitted = true;
      lexer->result_symbol = token;
      return true;
    }
  }

  if (lexer->lookahead != '\'' && lexer->lookahead != '"') {
    return false;
  }

  int32_t quote = lexer->lookahead;
  lexer->advance(lexer, false);
  while (!lexer->eof(lexer)) {
    if (lexer->lookahead == '\\') {
      lexer->advance(lexer, false);
      if (!lexer->eof(lexer)) {
        lexer->advance(lexer, false);
      }
      continue;
    }
    if (lexer->lookahead == quote) {
      lexer->advance(lexer, false);
      if (lexer->lookahead == quote) {
        lexer->advance(lexer, false);
        continue;
      }
      break;
    }
    lexer->advance(lexer, false);
  }
  lexer->mark_end(lexer);
  scanner->at_line_start = false;
  lexer->result_symbol = COMMAND_STRING;
  return true;
}

static bool scan_brace_body(
  Scanner *scanner,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  if (!valid_symbols[COMMAND_BRACE_BODY] || !scanner->in_command ||
      lexer->lookahead != '{') {
    return false;
  }

  unsigned depth = 0;
  while (!lexer->eof(lexer)) {
    int32_t character = lexer->lookahead;
    if (character == '\'' || character == '"') {
      int32_t quote = character;
      lexer->advance(lexer, false);
      while (!lexer->eof(lexer)) {
        if (lexer->lookahead == '\\') {
          lexer->advance(lexer, false);
          if (!lexer->eof(lexer)) lexer->advance(lexer, false);
        } else if (lexer->lookahead == quote) {
          lexer->advance(lexer, false);
          if (lexer->lookahead == quote) lexer->advance(lexer, false);
          else break;
        } else {
          lexer->advance(lexer, false);
        }
      }
      continue;
    }
    if (character == '{') {
      depth++;
    } else if (character == '}') {
      depth--;
      lexer->advance(lexer, false);
      if (depth == 0) break;
      continue;
    }
    lexer->advance(lexer, false);
  }
  lexer->mark_end(lexer);
  scanner->at_line_start = false;
  lexer->result_symbol = COMMAND_BRACE_BODY;
  return true;
}

static bool scan_inline_data(
  Scanner *scanner,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  if (!valid_symbols[COMMAND_INLINE_DATA] || !scanner->in_command ||
      lexer->lookahead != '<') {
    return false;
  }

  lexer->advance(lexer, false);
  lexer->mark_end(lexer);
  if (lexer->lookahead != '|') {
    if (!valid_symbols[COMMAND_PUNCT]) return false;
    lexer->result_symbol = COMMAND_PUNCT;
    return true;
  }
  lexer->advance(lexer, false);
  lexer->mark_end(lexer);

  bool line_start = false;
  while (!lexer->eof(lexer)) {
    if (line_start) {
      while (is_horizontal_whitespace(lexer->lookahead)) {
        lexer->advance(lexer, false);
      }
      if (lexer->lookahead == '.') {
        lexer->mark_end(lexer);
        scanner->at_line_start = true;
        lexer->result_symbol = COMMAND_INLINE_DATA;
        return true;
      }
      line_start = false;
    }

    if (is_line_break(lexer->lookahead)) {
      consume_line_break(lexer);
      lexer->mark_end(lexer);
      line_start = true;
    } else {
      lexer->advance(lexer, false);
      lexer->mark_end(lexer);
    }
  }
  scanner->at_line_start = line_start;
  lexer->result_symbol = COMMAND_INLINE_DATA;
  return true;
}

static bool scan_command_end(
  Scanner *scanner,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  if (!valid_symbols[COMMAND_END] || !scanner->in_command) {
    return false;
  }

  if (lexer->lookahead == ';') {
    lexer->advance(lexer, false);
    if (is_line_break(lexer->lookahead)) {
      consume_line_break(lexer);
      scanner->at_line_start = true;
    } else {
      scanner->at_line_start = false;
    }
    lexer->mark_end(lexer);
    scanner->in_command = false;
    lexer->result_symbol = COMMAND_END;
    return true;
  }

  if (is_line_break(lexer->lookahead)) {
    unsigned line_breaks = 1;
    consume_line_break(lexer);
    while (true) {
      while (is_horizontal_whitespace(lexer->lookahead)) {
        lexer->advance(lexer, true);
      }
      if (lexer->lookahead == '.' || lexer->eof(lexer)) {
        break;
      }
      if (!is_line_break(lexer->lookahead)) {
        if (line_breaks >= 2) {
          break;
        }
        return false;
      }
      consume_line_break(lexer);
      line_breaks++;
    }
    lexer->mark_end(lexer);
    scanner->in_command = false;
    scanner->at_line_start = true;
    lexer->result_symbol = COMMAND_END;
    return true;
  }

  if (scanner->at_line_start && lexer->lookahead == '.') {
    scanner->in_command = false;
    lexer->result_symbol = COMMAND_END;
    return true;
  }

  if (lexer->eof(lexer)) {
    scanner->in_command = false;
    lexer->result_symbol = COMMAND_END;
    return true;
  }

  return false;
}

static bool scan_punctuation(
  Scanner *scanner,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  if (!scanner->in_command || !valid_symbols[COMMAND_PUNCT]) {
    return false;
  }
  if (lexer->eof(lexer) || is_horizontal_whitespace(lexer->lookahead) ||
      is_line_break(lexer->lookahead) || lexer->lookahead == ';') {
    return false;
  }
  lexer->advance(lexer, false);
  lexer->mark_end(lexer);
  lexer->result_symbol = COMMAND_PUNCT;
  return true;
}

static bool scan_bracket(
  Scanner *scanner,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  if (!scanner->in_command || !valid_symbols[COMMAND_BRACKET]) {
    return false;
  }
  switch (lexer->lookahead) {
    case '(':
    case ')':
    case '[':
    case ']':
      lexer->advance(lexer, false);
      lexer->mark_end(lexer);
      lexer->result_symbol = COMMAND_BRACKET;
      return true;
    default:
      return false;
  }
}

bool tree_sitter_kusto_external_scanner_scan(
  void *payload,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  Scanner *scanner = payload;

  if (scanner->in_command) {
    while (is_horizontal_whitespace(lexer->lookahead)) {
      lexer->advance(lexer, true);
    }
  }

  if (valid_symbols[SCRIPT_QUERY_PREFIX] || valid_symbols[SCRIPT_PREAMBLE]) {
    if (scan_prefix(scanner, lexer, valid_symbols)) {
      lexer->result_symbol = scanner->prefix_query_like
        ? SCRIPT_QUERY_PREFIX
        : SCRIPT_PREAMBLE;
      return true;
    }
  }
  if (scan_command_start(scanner, lexer, valid_symbols)) return true;
  if (scan_command_end(scanner, lexer, valid_symbols)) return true;
  if (scan_inline_data(scanner, lexer, valid_symbols)) return true;
  if (scan_brace_body(scanner, lexer, valid_symbols)) return true;
  if (scan_string(scanner, lexer, valid_symbols)) return true;
  if (scan_word(scanner, lexer, valid_symbols)) return true;
  if (scan_bracket(scanner, lexer, valid_symbols)) return true;
  if (scan_punctuation(scanner, lexer, valid_symbols)) return true;
  return false;
}
