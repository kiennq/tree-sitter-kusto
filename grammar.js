const KUSTO_WHITESPACE = /[\t \r\n\f\u00a0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u200b\u202f\u205f\u3000\ufeff]+/;

export default grammar({
  name: "kusto",

  word: ($) => $.identifier,
  extras: ($) => [KUSTO_WHITESPACE, /[\u2028\u2029]/, $.comment],
  externals: ($) => [
    $.script_query_prefix,
    $.script_preamble,
    $.command_start,
    $.command_word,
    $.command_name,
    $.command_string,
    $.command_punct,
    $.command_bracket,
    $.command_brace_body,
    $.command_inline_data,
    $.command_end,
  ],
  conflicts: ($) => [
    [$.range_expression, $.keyword_name],
    [$.keyword_name, $.boolean_literal_expression],
    [$.keyword_name, $.guid_literal_expression],
    [$.keyword_name, $.type_literal_expression],
    [
      $.identifier_or_keyword_or_escaped_name,
      $.identifier_or_extended_keyword_or_escaped_name,
    ],
    [$.let_view_declaration, $.keyword_name],
    [$.identifier_or_keyword_name, $.identifier_or_extended_keyword_or_escaped_name],
    [$.escaped_name, $.unsigned_literal_expression],
    [$.identifier_name, $.wildcarded_name],
    [$.name_reference_with_data_scope, $.simple_or_wildcarded_name_reference],
    [$.identifier_or_keyword_or_escaped_name, $.wildcarded_name],
    [$.scoped_function_call_expression, $.name_reference_with_data_scope],
    [$.string_binary_operator, $.extended_keyword_name],
    [$.evaluate_operator, $.keyword_name],
    [$.named_function_call_expression, $.name_reference_with_data_scope],
    [$.let_entity_group_declaration, $.before_pipe_expression],
    [$.equality_expression, $.equality_expression],
    [$.external_data_expression, $.external_data_expression],
    [$.render_property_name_list, $.render_property_name_list],
  ],

  rules: {
    source_file: ($) =>
      choice(
        prec(2, $._script_file),
        alias($.query_block, $.query),
        $._query_then_command_file,
      ),
    _script_file: ($) =>
      seq(
        optional(choice($.script_query_prefix, $.script_preamble)),
        repeat($.script_annotation),
        $.management_command,
        repeat(
          choice(
            $.script_annotation,
            $.script_query_prefix,
            $.script_preamble,
            alias($.management_command_continuation, $.management_command),
          ),
        ),
      ),
    _query_then_command_file: ($) =>
      seq(
        alias($.query_block, $.query),
        $.management_command,
        repeat(alias($.management_command_continuation, $.management_command)),
      ),
    query_block: ($) =>
      seq(
        $.statement,
        repeat(seq(";", $.statement)),
        optional(";"),
      ),
    query: ($) => $.query_block,
    script_annotation: ($) =>
      token(
        prec(
          10,
          choice(
            /(?:(?:Initial|General|Usefull|Useful|ChangeDate|Change|Update|Updated|Created)[ \t][^|=()\[\]{};<>\r\n]*|To[ \t][^|=()\[\]{};<>\r\n]*|---+|===+)[\r\n]/,
          ),
        ),
      ),

    management_command: ($) =>
      prec.right(
        10,
        seq(
          $.command_start,
          field("name", $.command_word),
          field("body", $.command_body),
          $.command_end,
        ),
      ),
    management_command_continuation: ($) =>
      seq(
        $.command_start,
        field("name", $.command_word),
        field("body", $.command_body),
        $.command_end,
      ),
    command_body: ($) => prec.left(100, repeat1($.command_element)),
    command_element: ($) =>
      choice(
        $.command_atom,
        $.command_literal,
        $.command_punctuation,
        $.command_group,
        $.command_inline_data,
      ),
    command_atom: ($) => $.command_name,
    command_group: ($) =>
      choice(
        $.command_bracket,
        $.command_brace_body,
      ),
    command_literal: ($) => $.command_string,
    command_punctuation: ($) => $.command_punct,

    statement: ($) =>
      choice(
        $.alias_database_statement,
        $.declare_pattern_statement,
        $.declare_query_parameters_statement,
        $.let_statement,
        $.query_statement,
        $.restrict_access_statement,
        $.set_statement,
      ),

    alias_database_statement: ($) =>
      seq(
        "alias",
        "database",
        field("name", $.identifier_or_keyword_or_escaped_name),
        "=",
        field("expression", $.unnamed_expression),
      ),

    let_statement: ($) =>
      choice(
        $.let_function_declaration,
        $.let_view_declaration,
        $.let_variable_declaration,
        $.let_materialize_declaration,
        $.let_entity_group_declaration,
      ),

    let_variable_declaration: ($) =>
      prec(
        2,
        seq(
          "let",
          field("name", $.identifier_or_keyword_or_escaped_name),
          "=",
          field("expression", $.expression),
        ),
      ),

    let_function_declaration: ($) =>
      seq(
        "let",
        field("name", $.identifier_or_keyword_or_escaped_name),
        "=",
        "(",
        optional($.let_function_parameter_list),
        ")",
        field("body", $.let_function_body),
      ),

    let_view_declaration: ($) =>
      seq(
        "let",
        field("name", $.identifier_or_keyword_or_escaped_name),
        "=",
        "view",
        "(",
        optional($.let_view_parameter_list),
        ")",
        field("body", $.let_function_body),
      ),

    let_view_parameter_list: ($) =>
      seq($.scalar_parameter, repeat(seq(",", $.scalar_parameter))),

    let_materialize_declaration: ($) =>
      seq(
        "let",
        field("name", $.identifier_or_keyword_or_escaped_name),
        "=",
        "materialize",
        "(",
        field("expression", $.pipe_expression),
        ")",
      ),

    let_entity_group_declaration: ($) =>
      seq(
        "let",
        field("name", $.identifier_or_keyword_or_escaped_name),
        "=",
        $.entity_group_expression,
      ),

    let_function_parameter_list: ($) =>
      choice(
        seq(
          $.tabular_parameter,
          repeat(seq(",", $.tabular_parameter)),
          repeat(seq(",", $.scalar_parameter)),
        ),
        seq($.scalar_parameter, repeat(seq(",", $.scalar_parameter))),
      ),

    scalar_parameter: ($) =>
      seq(
        field("name", $.parameter_name),
        ":",
        field("type", $.scalar_type),
        optional($.scalar_parameter_default),
      ),

    scalar_parameter_default: ($) =>
      seq("=", field("value", $.literal_expression)),

    tabular_parameter: ($) =>
      seq(
        field("name", $.parameter_name),
        ":",
        choice($.tabular_parameter_open_schema, $.tabular_parameter_row_schema),
      ),

    tabular_parameter_open_schema: ($) => seq("(", "*", ")"),
    tabular_parameter_row_schema: ($) =>
      seq(
        "(",
        $.tabular_parameter_row_schema_column_declaration,
        repeat(seq(",", $.tabular_parameter_row_schema_column_declaration)),
        ")",
      ),
    tabular_parameter_row_schema_column_declaration: ($) =>
      seq($.parameter_name, ":", $.scalar_type),

    let_function_body: ($) =>
      seq(
        "{",
        repeat(seq($.let_function_body_statement, ";")),
        optional(field("expression", $.expression)),
        optional(";"),
        "}",
      ),
    let_function_body_statement: ($) =>
      choice($.let_statement, $.declare_query_parameters_statement),

    declare_pattern_statement: ($) =>
      seq(
        "declare",
        "pattern",
        field("name", $.simple_name_reference),
        optional($.declare_pattern_definition),
      ),
    declare_pattern_definition: ($) =>
      seq(
        "=",
        $.declare_pattern_parameter_list,
        optional(seq("[", $.declare_pattern_parameter, "]")),
        "{",
        repeat1($.declare_pattern_rule),
        "}",
      ),
    declare_pattern_parameter_list: ($) =>
      seq(
        "(",
        $.declare_pattern_parameter,
        repeat(seq(",", $.declare_pattern_parameter)),
        ")",
      ),
    declare_pattern_parameter: ($) =>
      seq($.parameter_name, ":", $.scalar_type),
    declare_pattern_rule: ($) =>
      seq(
        $.declare_pattern_rule_argument_list,
        optional(seq(".", "[", $.declare_pattern_rule_argument, "]")),
        "=",
        $.declare_pattern_body,
        optional(";"),
      ),
    declare_pattern_rule_argument_list: ($) =>
      seq(
        "(",
        $.declare_pattern_rule_argument,
        repeat(seq(",", $.declare_pattern_rule_argument)),
        ")",
      ),
    declare_pattern_rule_argument: ($) => $.string_literal_expression,
    declare_pattern_body: ($) =>
      seq(
        "{",
        repeat(seq($.let_function_body_statement, ";")),
        $.expression,
        "}",
      ),

    restrict_access_statement: ($) =>
      seq(
        "restrict",
        "access",
        "to",
        "(",
        $.restrict_access_statement_entity,
        repeat(seq(",", $.restrict_access_statement_entity)),
        ")",
      ),
    restrict_access_statement_entity: ($) =>
      choice($.simple_name_reference, $.wildcarded_entity_expression),

    set_statement: ($) =>
      seq(
        "set",
        field("name", $.identifier_or_keyword_name),
        optional(seq("=", $.set_statement_option_value)),
      ),
    set_statement_option_value: ($) =>
      choice($.identifier_or_keyword_name, $.literal_expression),

    declare_query_parameters_statement: ($) =>
      seq(
        "declare",
        "query_parameters",
        "(",
        $.declare_query_parameters_statement_parameter,
        repeat(seq(",", $.declare_query_parameters_statement_parameter)),
        ")",
      ),
    declare_query_parameters_statement_parameter: ($) =>
      seq(
        field("name", $.parameter_name),
        ":",
        field("type", $.scalar_type),
        optional($.scalar_parameter_default),
      ),

    query_statement: ($) => prec(-1, field("expression", $.expression)),

    expression: ($) => $.pipe_expression,
    pipe_expression: ($) =>
      seq(
        field("expression", $.before_pipe_expression),
        repeat($.piped_operator),
      ),
    piped_operator: ($) =>
      seq("|", field("operator", $.after_pipe_operator)),
    pipe_sub_expression: ($) =>
      seq(
        field("expression", $.after_pipe_operator),
        repeat($.piped_operator),
      ),

    before_pipe_expression: ($) =>
      choice(
        $.before_or_after_pipe_operator,
        $.print_operator,
        $.macro_expand_operator,
        $.range_expression,
        $.entity_group_expression,
        $.scoped_function_call_expression,
        $.unnamed_expression,
      ),
    after_pipe_operator: ($) =>
      choice(
        $.as_operator,
        $.assert_schema_operator,
        $.consume_operator,
        $.count_operator,
        $.distinct_operator,
        $.execute_and_cache_operator,
        $.extend_operator,
        $.facet_by_operator,
        $.find_operator,
        $.fork_operator,
        $.get_schema_operator,
        $.graph_mark_components_operator,
        $.graph_match_operator,
        $.graph_shortest_paths_operator,
        $.graph_to_table_operator,
        $.invoke_operator,
        $.join_operator,
        $.lookup_operator,
        $.make_graph_operator,
        $.make_series_operator,
        $.mvexpand_operator,
        $.mvapply_operator,
        $.evaluate_operator,
        $.parse_operator,
        $.parse_kv_operator,
        $.parse_where_operator,
        $.partition_operator,
        $.partition_by_operator,
        $.project_operator,
        $.project_away_operator,
        $.project_rename_operator,
        $.project_reorder_operator,
        $.project_keep_operator,
        $.reduce_by_operator,
        $.render_operator,
        $.sample_operator,
        $.sample_distinct_operator,
        $.scan_operator,
        $.search_operator,
        $.serialize_operator,
        $.sort_operator,
        $.summarize_operator,
        $.take_operator,
        $.top_hitters_operator,
        $.top_operator,
        $.top_nested_operator,
        $.union_operator,
        $.where_operator,
      ),
    before_or_after_pipe_operator: ($) =>
      choice(
        $.find_operator,
        $.search_operator,
        $.union_operator,
        $.evaluate_operator,
      ),
    fork_pipe_operator: ($) =>
      choice(
        $.count_operator,
        $.extend_operator,
        $.where_operator,
        $.parse_operator,
        $.parse_where_operator,
        $.take_operator,
        $.top_nested_operator,
        $.project_operator,
        $.project_away_operator,
        $.project_rename_operator,
        $.project_reorder_operator,
        $.project_keep_operator,
        $.summarize_operator,
        $.distinct_operator,
        $.top_hitters_operator,
        $.top_operator,
        $.sort_operator,
        $.mvexpand_operator,
        $.reduce_by_operator,
        $.sample_operator,
        $.sample_distinct_operator,
        $.as_operator,
        $.invoke_operator,
        $.execute_and_cache_operator,
        $.scan_operator,
      ),
    scoped_function_call_expression: ($) =>
      seq(
        field("scope", $.simple_name_reference),
        ".",
        field("function_call", $.function_call_expression),
      ),
    as_operator: ($) =>
      seq(
        "as",
        repeat($.relaxed_query_operator_parameter),
        $.identifier_or_keyword_or_escaped_name,
      ),
    assert_schema_operator: ($) => seq("assert-schema", $.row_schema),
    consume_operator: ($) =>
      seq("consume", repeat($.relaxed_query_operator_parameter)),
    count_operator: ($) =>
      seq("count", repeat($.relaxed_query_operator_parameter)),
    distinct_operator: ($) =>
      seq(
        "distinct",
        repeat($.relaxed_query_operator_parameter),
        choice(
          "*",
          seq(
            $.named_expression,
            repeat(seq(",", $.named_expression)),
          ),
        ),
      ),
    execute_and_cache_operator: ($) => "__executeAndCache",
    extend_operator: ($) =>
      seq(
        "extend",
        $.named_expression,
        repeat(seq(",", $.named_expression)),
      ),
    facet_by_operator: ($) =>
      seq(
        "facet",
        "by",
        $.entity_expression,
        repeat(seq(",", $.entity_expression)),
        optional(
          choice(
            seq("with", $.fork_pipe_operator),
            seq("with", "(", $.fork_operator_expression, ")"),
          ),
        ),
      ),
    find_operator: ($) =>
      seq(
        "find",
        optional($.data_scope_clause),
        optional($.find_operator_parameters_where_clause),
        $.unnamed_expression,
        optional(
          choice(
            $.find_operator_project_clause,
            $.find_operator_project_smart_clause,
          ),
        ),
        optional($.find_operator_project_away_clause),
      ),
    find_operator_parameters_where_clause: ($) =>
      seq(
        repeat($.relaxed_query_operator_parameter),
        optional($.find_operator_in_clause),
        "where",
      ),
    find_operator_in_clause: ($) =>
      seq(
        "in",
        "(",
        $.find_operator_source,
        repeat(seq(",", $.find_operator_source)),
        ")",
      ),
    find_operator_project_clause: ($) =>
      seq(
        "project",
        $.find_operator_project_expression,
        repeat(seq(",", $.find_operator_project_expression)),
      ),
    find_operator_project_expression: ($) =>
      choice(
        $.find_operator_column_expression,
        $.find_operator_pack_expression,
      ),
    find_operator_column_expression: ($) =>
      seq($.parameter_name, optional(seq(":", $.extended_scalar_type))),
    find_operator_pack_expression: ($) => seq("pack", "(", "*", ")"),
    find_operator_project_smart_clause: ($) => "project-smart",
    find_operator_project_away_clause: ($) =>
      seq(
        "__projectAway",
        choice(
          "*",
          seq(
            $.find_operator_column_expression,
            repeat(seq(",", $.find_operator_column_expression)),
          ),
        ),
      ),
    find_operator_source: ($) =>
      choice($.find_operator_source_entity_expression, $.wildcarded_entity_expression),
    find_operator_source_entity_expression: ($) =>
      seq($.entity_name_reference, repeat(seq("|", $.as_operator))),
    fork_operator: ($) =>
      seq("fork", repeat1($.fork_operator_fork)),
    fork_operator_fork: ($) =>
      seq(
        optional($.fork_operator_expression_name),
        "(",
        $.fork_operator_expression,
        ")",
      ),
    fork_operator_expression_name: ($) =>
      seq($.identifier_or_keyword_or_escaped_name, "="),
    fork_operator_expression: ($) =>
      seq($.fork_pipe_operator, repeat($.fork_operator_piped_operator)),
    fork_operator_piped_operator: ($) =>
      seq("|", $.fork_pipe_operator),
    get_schema_operator: ($) => "getschema",
    graph_mark_components_operator: ($) =>
      seq("graph-mark-components", repeat($.relaxed_query_operator_parameter)),
    graph_match_operator: ($) =>
      seq(
        "graph-match",
        repeat($.relaxed_query_operator_parameter),
        $.graph_match_pattern_path,
        repeat(seq(",", $.graph_match_pattern_path)),
        optional($.graph_match_where_clause),
        optional($.graph_match_project_clause),
      ),
    graph_match_pattern_path: ($) =>
      seq($.graph_match_pattern, repeat($.graph_match_pattern)),
    graph_match_pattern: ($) =>
      choice(
        $.graph_match_pattern_node,
        $.graph_match_pattern_unnamed_edge,
        $.graph_match_pattern_named_edge,
      ),
    graph_match_pattern_node: ($) =>
      seq("(", $.identifier_or_keyword_or_escaped_name, ")"),
    graph_match_pattern_unnamed_edge: ($) =>
      choice("-->", "<--", "--"),
    graph_match_pattern_named_edge: ($) =>
      seq(
        choice("-[", "<-["),
        $.identifier_or_keyword_or_escaped_name,
        optional($.graph_match_pattern_range),
        choice("]->", "]-"),
      ),
    graph_match_pattern_range: ($) =>
      seq("*", $.invocation_expression, "..", $.invocation_expression),
    graph_match_where_clause: ($) =>
      seq("where", field("expression", $.unnamed_expression)),
    graph_match_project_clause: ($) =>
      seq(
        "project",
        $.named_expression,
        repeat(seq(",", $.named_expression)),
      ),
    graph_shortest_paths_operator: ($) =>
      seq(
        "graph-shortest-paths",
        repeat($.relaxed_query_operator_parameter),
        $.graph_match_pattern_path,
        repeat(seq(",", $.graph_match_pattern_path)),
        optional($.graph_match_where_clause),
        optional($.graph_match_project_clause),
      ),
    graph_to_table_operator: ($) =>
      seq(
        "graph-to-table",
        $.graph_to_table_output,
        repeat(seq(",", $.graph_to_table_output)),
      ),
    graph_to_table_output: ($) =>
      seq(
        choice("nodes", "edges"),
        optional(seq("as", $.identifier_or_keyword_or_escaped_name)),
        repeat($.relaxed_query_operator_parameter),
      ),
    invoke_operator: ($) =>
      seq("invoke", $.dot_composite_function_call_expression),
    join_operator: ($) =>
      seq(
        "join",
        repeat($.relaxed_query_operator_parameter),
        field("table", $.unnamed_expression),
        optional(choice($.join_operator_on_clause, $.join_operator_where_clause)),
      ),
    join_operator_on_clause: ($) =>
      seq(
        "on",
        optional(
          seq(
            $.unnamed_expression,
            repeat(seq(",", $.unnamed_expression)),
          ),
        ),
      ),
    join_operator_where_clause: ($) =>
      seq("where", field("predicate", $.unnamed_expression)),
    lookup_operator: ($) =>
      seq(
        "lookup",
        repeat($.relaxed_query_operator_parameter),
        field("table", $.unnamed_expression),
        $.join_operator_on_clause,
      ),
    macro_expand_operator: ($) =>
      seq(
        "macro-expand",
        repeat($.relaxed_query_operator_parameter),
        $.macro_expand_entity_group,
        "as",
        $.identifier_or_keyword_or_escaped_name,
        "(",
        $.statement,
        repeat(seq(";", $.statement)),
        optional(";"),
        ")",
      ),
    macro_expand_entity_group: ($) =>
      choice(
        $.entity_group_expression,
        $.simple_name_reference,
        $.entity_expression,
      ),
    make_graph_operator: ($) =>
      seq(
        "make-graph",
        repeat($.relaxed_query_operator_parameter),
        $.simple_name_reference,
        choice("-->", "--"),
        $.simple_name_reference,
        optional(
          choice(
            seq("with_node_id", "=", $.identifier_or_keyword_or_escaped_name),
            seq(
              "with",
              $.invocation_expression,
              "on",
              $.simple_name_reference,
            ),
          ),
        ),
        optional(
          seq(
            "partitioned-by",
            $.entity_path_or_element_expression,
            "(",
            $.contextual_sub_expression,
            ")",
          ),
        ),
      ),
    make_series_operator: ($) =>
      seq(
        "make-series",
        repeat($.relaxed_query_operator_parameter),
        $.make_series_operator_aggregation,
        repeat(seq(",", $.make_series_operator_aggregation)),
        "on",
        $.make_series_on_expression,
        choice(
          seq(
            "in",
            "range",
            "(",
            $.named_expression,
            ",",
            $.named_expression,
            ",",
            $.named_expression,
            ")",
          ),
          seq(
            optional(seq("from", $.named_expression)),
            optional(seq("to", $.named_expression)),
            "step",
            $.named_expression,
          ),
        ),
        optional(
          seq(
            "by",
            $.named_expression,
            repeat(seq(",", $.named_expression)),
          ),
        ),
      ),
    make_series_operator_aggregation: ($) =>
      seq(
        $.named_expression,
        optional(seq("default", "=", $.named_expression)),
      ),
    make_series_on_expression: ($) =>
      prec(1, $.named_expression),
    mvapply_operator: ($) =>
      seq(
        choice("mvapply", "mv-apply"),
        repeat($.strict_query_operator_parameter),
        $.mvapply_operator_expression,
        repeat(seq(",", $.mvapply_operator_expression)),
        optional(seq("limit", $.long_literal_expression)),
        optional(seq("id", $.guid_literal_expression)),
        "on",
        "(",
        $.contextual_sub_expression,
        ")",
      ),
    mvapply_operator_expression: ($) =>
      seq(
        $.named_expression,
        optional(seq("to", $.type_literal_expression)),
      ),
    mvexpand_operator: ($) =>
      seq(
        choice("mvexpand", "mv-expand"),
        repeat($.strict_query_operator_parameter),
        $.named_expression,
        repeat(seq(",", $.named_expression)),
        optional(seq("limit", $.long_literal_expression)),
      ),
    print_operator: ($) =>
      seq(
        "print",
        $.named_expression,
        repeat(seq(",", $.named_expression)),
      ),
    evaluate_operator: ($) =>
      seq(
        "evaluate",
        repeat($.relaxed_query_operator_parameter),
        $.function_call_expression,
        optional(seq(":", $.row_schema)),
      ),
    parse_operator: ($) =>
      seq(
        "parse",
        optional($.parse_operator_kind_clause),
        $.unnamed_expression,
        "with",
        optional($.parse_operator_pattern),
      ),
    parse_where_operator: ($) =>
      seq(
        "parse-where",
        optional($.parse_operator_kind_clause),
        $.unnamed_expression,
        "with",
        optional($.parse_operator_pattern),
      ),
    parse_operator_kind_clause: ($) =>
      seq(
        "kind",
        "=",
        choice(
          seq(
            choice("simple", "regex", "relaxed"),
            optional(seq("flags", "=", $.identifier)),
          ),
        ),
      ),
    parse_operator_pattern: ($) =>
      choice(
        "*",
        seq(
          optional($.parse_operator_name_and_optional_type),
          repeat1($.parse_operator_pattern_segment),
          optional("*"),
        ),
      ),
    parse_operator_pattern_segment: ($) =>
      seq(
        optional("*"),
        $.string_literal_expression,
        optional($.parse_operator_name_and_optional_type),
      ),
    parse_operator_name_and_optional_type: ($) =>
      seq($.simple_name_reference, optional(seq(":", $.scalar_type))),
    parse_kv_operator: ($) =>
      seq(
        "parse-kv",
        $.unnamed_expression,
        $.row_schema,
        optional(
          seq(
            "with",
            "(",
            $.query_operator_property,
            repeat(seq(",", $.query_operator_property)),
            ")",
          ),
        ),
      ),
    query_operator_property: ($) =>
      seq(
        $.identifier,
        "=",
        choice($.identifier_or_keyword_name, $.literal_expression),
      ),
    partition_operator: ($) =>
      seq(
        "partition",
        repeat($.relaxed_query_operator_parameter),
        "by",
        $.entity_expression,
        optional(
          seq(
            "in",
            choice($.function_call_expression, $.dynamic_literal_expression),
          ),
        ),
        choice(
          seq("(", $.pipe_sub_expression, ")"),
          seq("{", $.pipe_expression, "}"),
        ),
      ),
    partition_by_operator: ($) =>
      seq(
        "__partitionby",
        repeat($.relaxed_query_operator_parameter),
        $.entity_expression,
        optional(seq("id", $.guid_literal_expression)),
        "(",
        $.contextual_sub_expression,
        ")",
      ),
    project_operator: ($) =>
      seq(
        "project",
        optional(seq($.project_expression, repeat(seq(",", $.project_expression)))),
      ),
    project_expression: ($) =>
      choice($.named_expression, $.simple_or_wildcarded_name_reference),
    project_away_operator: ($) =>
      seq(
        "project-away",
        optional(seq($.simple_or_wildcarded_name_reference, repeat(seq(",", $.simple_or_wildcarded_name_reference)))),
      ),
    project_keep_operator: ($) =>
      seq(
        "project-keep",
        $.simple_or_wildcarded_name_reference,
        repeat(seq(",", $.simple_or_wildcarded_name_reference)),
      ),
    project_rename_operator: ($) =>
      seq(
        "project-rename",
        optional(seq($.named_expression, repeat(seq(",", $.named_expression)))),
      ),
    project_reorder_operator: ($) =>
      seq(
        "project-reorder",
        optional(seq($.project_reorder_expression, repeat(seq(",", $.project_reorder_expression)))),
      ),
    project_reorder_expression: ($) =>
      seq($.simple_or_wildcarded_name_reference, optional(choice("asc", "desc", "granny-asc", "granny-desc"))),
    reduce_by_operator: ($) =>
      seq(
        "reduce",
        repeat($.strict_query_operator_parameter),
        "by",
        $.named_expression,
        optional(
          seq(
            "with",
            $.named_expression,
            repeat(seq(",", $.named_expression)),
          ),
        ),
      ),
    render_operator: ($) =>
      seq(
        "render",
        choice(
          "table",
          "list",
          "barchart",
          "piechart",
          "ladderchart",
          "timechart",
          "linechart",
          "anomalychart",
          "pivotchart",
          "areachart",
          "stackedareachart",
          "scatterchart",
          "timepivot",
          "columnchart",
          "timeline",
          "3Dchart",
          "card",
          "treemap",
          $.identifier,
        ),
        optional(
          choice(
            seq(
              "with",
              "(",
              optional(
                seq(
                  $.render_operator_property,
                  repeat(seq(",", $.render_operator_property)),
                ),
              ),
              ")",
            ),
            repeat1($.render_operator_legacy_property),
          ),
        ),
      ),
    render_operator_property: ($) =>
      choice(
        seq("title", "=", $.function_call_or_path_expression),
        seq("xcolumn", "=", $.simple_name_reference),
        seq("series", "=", $.render_property_name_list),
        seq("ycolumns", "=", $.render_property_name_list),
        seq("anomalycolumns", "=", $.render_property_name_list),
        seq("kind", "=", choice("default", "unstacked", "stacked", "stacked100", "map")),
        seq("xtitle", "=", $.function_call_or_path_expression),
        seq("ytitle", "=", $.function_call_or_path_expression),
        seq("xaxis", "=", choice("linear", "log")),
        seq("yaxis", "=", choice("linear", "log")),
        seq("legend", "=", choice("visible", "hidden")),
        seq("ysplit", "=", choice("none", "axes", "panels")),
        seq("accumulate", "=", $.boolean_literal_expression),
        seq("ymin", "=", $.numeric_literal_expression),
        seq("ymax", "=", $.numeric_literal_expression),
        seq("xmin", "=", $.literal_expression),
        seq("xmax", "=", $.literal_expression),
      ),
    render_property_name_list: ($) =>
      seq(
        $.extended_name_reference,
        repeat(seq(",", $.extended_name_reference)),
      ),
    render_operator_legacy_property: ($) =>
      choice(
        seq("title", "=", $.string_literal_expression),
        seq("kind", "=", choice("default", "unstacked", "stacked", "stacked100", "map")),
        seq("with", $.string_literal_expression),
        seq("by", $.render_property_name_list),
        seq("accumulate", "=", $.boolean_literal_expression),
      ),
    sample_distinct_operator: ($) =>
      seq(
        "sample-distinct",
        repeat($.strict_query_operator_parameter),
        $.named_expression,
        "of",
        $.named_expression,
      ),
    sample_operator: ($) =>
      seq("sample", repeat($.strict_query_operator_parameter), $.named_expression),
    scan_operator: ($) =>
      seq(
        "scan",
        repeat($.relaxed_query_operator_parameter),
        optional($.scan_operator_order_by_clause),
        optional($.scan_operator_partition_by_clause),
        optional($.scan_operator_declare_clause),
        "with",
        "(",
        repeat1($.scan_operator_step),
        ")",
      ),
    scan_operator_order_by_clause: ($) =>
      seq(
        "order",
        "by",
        $.scan_ordered_expression,
        repeat(seq(",", $.scan_ordered_expression)),
      ),
    scan_ordered_expression: ($) =>
      $.ordered_expression,
    scan_operator_partition_by_clause: ($) =>
      seq(
        "partition",
        "by",
        $.unnamed_expression,
        repeat(seq(",", $.unnamed_expression)),
      ),
    scan_operator_declare_clause: ($) =>
      seq(
        "declare",
        "(",
        $.scalar_parameter,
        repeat(seq(",", $.scalar_parameter)),
        ")",
      ),
    scan_operator_step: ($) =>
      seq(
        "step",
        $.parameter_name,
        optional("optional"),
        optional(seq("output", "=", choice("all", "last", "none"))),
        ":",
        $.unnamed_expression,
        optional($.scan_operator_body),
        ";",
      ),
    scan_operator_body: ($) =>
      seq(
        "=>",
        $.scan_operator_assignment,
        repeat(seq(",", $.scan_operator_assignment)),
      ),
    scan_operator_assignment: ($) =>
      seq($.parameter_name, "=", $.unnamed_expression),
    search_operator: ($) =>
      seq(
        "search",
        repeat($.relaxed_query_operator_parameter),
        optional($.data_scope_clause),
        optional(
          seq(
            "in",
            "(",
            $.find_operator_source,
            repeat(seq(",", $.find_operator_source)),
            ")",
          ),
        ),
        choice(
          $.unnamed_expression,
          "*",
          seq("*", "and", $.unnamed_expression),
        ),
      ),
    serialize_operator: ($) =>
      seq(
        "serialize",
        repeat($.strict_query_operator_parameter),
        $.named_expression,
        repeat(seq(",", $.named_expression)),
      ),
    sort_operator: ($) =>
      seq(
        choice("sort", "order"),
        repeat($.relaxed_query_operator_parameter),
        "by",
        $.ordered_expression,
        repeat(seq(",", $.ordered_expression)),
      ),
    ordered_expression: ($) =>
      seq($.named_expression, optional($.sort_ordering)),
    sort_ordering: ($) =>
      choice(
        choice("asc", "desc"),
        seq("nulls", choice("first", "last")),
        seq(
          choice("asc", "desc"),
          "nulls",
          choice("first", "last"),
        ),
      ),
    summarize_operator: ($) =>
      seq(
        "summarize",
        repeat($.strict_query_operator_parameter),
        optional(seq($.named_expression, repeat(seq(",", $.named_expression)))),
        optional(
          seq(
            "by",
            $.named_expression,
            repeat(seq(",", $.named_expression)),
            optional(seq("bin", "=", $.number_like_literal_expression)),
          ),
        ),
      ),
    take_operator: ($) =>
      seq(
        choice("take", "limit"),
        repeat($.strict_query_operator_parameter),
        $.named_expression,
      ),
    top_hitters_operator: ($) =>
      seq(
        "top-hitters",
        $.named_expression,
        "of",
        $.named_expression,
        optional(seq("by", $.ordered_expression)),
      ),
    top_operator: ($) =>
      seq(
        "top",
        repeat($.strict_query_operator_parameter),
        $.named_expression,
        "by",
        $.ordered_expression,
      ),
    top_nested_operator: ($) =>
      seq(
        $.top_nested_operator_part,
        repeat(seq(",", $.top_nested_operator_part)),
      ),
    top_nested_operator_part: ($) =>
      seq(
        "top-nested",
        optional($.named_expression),
        "of",
        $.named_expression,
        optional(seq("with", "others", "=", $.named_expression)),
        "by",
        $.ordered_expression,
      ),
    union_operator: ($) =>
      seq(
        "union",
        repeat($.relaxed_query_operator_parameter),
        $.union_operator_expression,
        repeat(seq(",", $.union_operator_expression)),
      ),
    union_operator_expression: ($) =>
      choice($.wildcarded_entity_expression, $.entity_name_reference, $.parenthesized_expression),
    where_operator: ($) =>
      seq(
        choice("where", "filter"),
        repeat($.strict_query_operator_parameter),
        field("predicate", $.named_expression),
      ),
    contextual_sub_expression: ($) =>
      choice($.pipe_sub_expression, $.contextual_pipe_expression),
    contextual_pipe_expression: ($) =>
      seq(
      $.contextual_data_table_expression,
      repeat(seq("|", $.after_pipe_operator)),
      ),
    entity_expression: ($) =>
      choice($.entity_name_reference, $.entity_path_or_element_expression),
    entity_path_or_element_expression: ($) =>
      seq(
      $.entity_name_reference,
      repeat1($.entity_path_or_element_operator),
      ),
    entity_path_or_element_operator: ($) =>
      choice(
      seq(".", $.entity_name),
      seq("[", $.unnamed_expression, "]"),
      seq(".", "[", $.unnamed_expression, "]"),
      ),

    relaxed_query_operator_parameter: ($) =>
      seq(
        choice(
          "bagexpansion",
          "bin_legacy",
          "__crossCluster",
          "__crossDB",
          "decodeblocks",
          "expandoutput",
          "hint.concurrency",
          "hint.distribution",
          "hint.materialized",
          "hint.num_partitions",
          "hint.pass_filters",
          "hint.pass_filters_column",
          "hint.progressive_top",
          "hint.remote",
          "hint.shufflekey",
          "hint.spread",
          "hint.strategy",
          "isfuzzy",
          "__isFuzzy",
          "__id",
          "kind",
          "__packedColumn",
          "__sourceColumnIndex",
          "with_itemindex",
          "with_match_id",
          "with_step_name",
          "withsource",
          "with_source",
          "__noWithSource",
          $.identifier_or_keyword_name,
        ),
        "=",
        choice($.identifier_or_keyword_name, $.literal_expression),
      ),
    strict_query_operator_parameter: ($) =>
      seq(
        choice(
          "bagexpansion",
          "bin_legacy",
          "__crossCluster",
          "__crossDB",
          "decodeblocks",
          "expandoutput",
          "hint.concurrency",
          "hint.distribution",
          "hint.materialized",
          "hint.num_partitions",
          "hint.pass_filters",
          "hint.pass_filters_column",
          "hint.progressive_top",
          "hint.remote",
          "hint.shufflekey",
          "hint.spread",
          "hint.strategy",
          "isfuzzy",
          "__isFuzzy",
          "__id",
          "kind",
          "__packedColumn",
          "__sourceColumnIndex",
          "with_itemindex",
          "with_match_id",
          "with_step_name",
          "withsource",
          "with_source",
          "__noWithSource",
        ),
        "=",
        choice($.identifier_or_keyword_name, $.literal_expression),
      ),

    named_expression: ($) =>
      seq(
        optional(seq($.named_expression_name_clause, "=")),
        $.unnamed_expression,
      ),
    named_expression_name_clause: ($) =>
      choice(
        $.identifier_or_extended_keyword_or_escaped_name,
        seq(
          "(",
          $.identifier_or_extended_keyword_or_escaped_name,
          repeat(seq(",", $.identifier_or_extended_keyword_or_escaped_name)),
          ")",
        ),
      ),

    unnamed_expression: ($) => $.logical_or_expression,
    logical_or_expression: ($) =>
      prec.left(
        1,
        seq($.logical_and_expression, repeat(seq("or", $.logical_and_expression))),
      ),
    logical_and_expression: ($) =>
      prec.left(
        2,
        seq($.equality_expression, repeat(seq("and", $.equality_expression))),
      ),
    equality_expression: ($) =>
      choice(
        $.star_equality_expression,
        seq(
          $.relational_expression,
          choice("==", "<>", "!="),
          $.relational_expression,
        ),
        seq(
          $.relational_expression,
          choice("in", "!in", "in~", "!in~", "has_any", "has_all"),
          "(",
          $.invocation_expression,
          repeat(seq(",", $.invocation_expression)),
          ")",
        ),
        seq(
          $.relational_expression,
          choice("between", "!between"),
          "(",
          $.invocation_expression,
          "..",
          $.invocation_expression,
          ")",
        ),
        $.relational_expression,
      ),
    star_equality_expression: ($) =>
      seq("*", "==", $.relational_expression),
    relational_expression: ($) =>
      prec.left(
        3,
        seq(
          $.additive_expression,
          optional(seq(choice("<", ">", "<=", ">="), $.additive_expression)),
        ),
      ),
    additive_expression: ($) =>
      prec.left(
        4,
        seq(
          $.multiplicative_expression,
          repeat(seq(choice("+", "-"), $.multiplicative_expression)),
        ),
      ),
    multiplicative_expression: ($) =>
      prec.left(
        5,
        seq(
          $.string_operator_expression,
          repeat(seq(choice("*", "/", "%"), $.string_operator_expression)),
        ),
      ),
    string_operator_expression: ($) =>
      choice(
        $.string_binary_operator_expression,
        $.string_star_operator_expression,
      ),
    string_binary_operator_expression: ($) =>
      seq(
        $.invocation_expression,
        optional(
          seq(
            choice($.string_binary_operator, ":"),
            $.invocation_expression,
          ),
        ),
      ),
    string_star_operator_expression: ($) =>
      seq("*", $.string_binary_operator, $.invocation_expression),
    string_binary_operator: ($) =>
      choice(
        "=~",
        "!~",
        "has",
        "!has",
        "has_cs",
        "!has_cs",
        "hasprefix",
        "!hasprefix",
        "hasprefix_cs",
        "!hasprefix_cs",
        "hassuffix",
        "!hassuffix",
        "hassuffix_cs",
        "!hassuffix_cs",
        "like",
        "likecs",
        "notlike",
        "notlikecs",
        "contains",
        "containscs",
        "notcontains",
        "notcontainscs",
        "!contains",
        "contains_cs",
        "!contains_cs",
        "startswith",
        "!startswith",
        "startswith_cs",
        "!startswith_cs",
        "endswith",
        "!endswith",
        "endswith_cs",
        "!endswith_cs",
        "matches regex",
      ),
    invocation_expression: ($) =>
      seq(optional(choice("+", "-")), $.function_call_or_path_expression),
    function_call_or_path_expression: ($) =>
      choice(
        $.function_call_or_path_path_expression,
        $.function_call_or_path_root,
      ),
    function_call_or_path_root: ($) =>
      choice(
        $.dot_composite_function_call_expression,
        $.primary_expression,
        $.to_scalar_expression,
        $.to_table_expression,
      ),
    function_call_or_path_path_expression: ($) =>
      seq(
        $.function_call_or_path_root,
        repeat1($.function_call_or_path_operation),
      ),
    function_call_or_path_operation: ($) =>
      choice(
        seq(".", $.identifier_or_keyword_or_escaped_name),
        seq("[", $.unnamed_expression, "]"),
        seq(".", "[", $.unnamed_expression, "]"),
      ),
    to_scalar_expression: ($) =>
      seq(
        "toscalar",
        optional($.no_optimization_parameter),
        "(",
        field("expression", $.pipe_expression),
        ")",
      ),
    to_table_expression: ($) =>
      seq(
        "totable",
        optional($.no_optimization_parameter),
        "(",
        field("expression", $.pipe_expression),
        ")",
      ),
    no_optimization_parameter: ($) =>
      seq("kind", "=", "nooptimization"),
    dot_composite_function_call_expression: ($) =>
      prec.left(
        seq(
          $.function_call_expression,
          repeat(seq(".", $.function_call_expression)),
        ),
      ),
    function_call_expression: ($) =>
      choice($.named_function_call_expression, $.count_expression),
    named_function_call_expression: ($) =>
      seq(
        field("name", $.simple_name_reference),
        "(",
        optional(seq($.argument_expression, repeat(seq(",", $.argument_expression)))),
        ")",
      ),
    argument_expression: ($) => choice($.named_expression, $.star_expression),
    count_expression: ($) =>
      seq("count", "(", optional($.named_expression), ")"),
    star_expression: ($) => "*",

    primary_expression: ($) =>
      choice(
        $.unsigned_literal_expression,
        $.name_reference_with_data_scope,
        $.data_table_expression,
        $.external_data_expression,
        $.contextual_data_table_expression,
        $.materialized_view_combine_expression,
        $.parenthesized_expression,
      ),
    name_reference_with_data_scope: ($) =>
      seq($.simple_name_reference, optional($.data_scope_clause)),
    data_scope_clause: ($) =>
      seq("datascope", "=", choice("hotcache", "all")),
    parenthesized_expression: ($) => seq("(", $.expression, ")"),
    range_expression: ($) =>
      seq(
        "range",
        field("expression", $.simple_name_reference),
        "from",
        field("from", $.unnamed_expression),
        "to",
        field("to", $.unnamed_expression),
        "step",
        field("step", $.unnamed_expression),
      ),

    entity_name: ($) =>
      choice(
        "@",
        $.identifier_or_extended_keyword_or_escaped_name,
        $.extended_path_name,
      ),
    extended_path_name: ($) =>
      choice("kind", "withsource", "with_source"),
    entity_name_reference: ($) => $.entity_name,
    wildcarded_entity_expression: ($) =>
      choice(
        $.wildcarded_name_reference,
        $.dot_composite_function_call_expression,
        $.wildcarded_path_expression,
      ),
    wildcarded_path_expression: ($) =>
      seq(
        $.dot_composite_function_call_expression,
        ".",
        field("name", $.wildcarded_path_name),
      ),
    wildcarded_path_name: ($) =>
      choice($.wildcarded_name, $.entity_name),
    contextual_data_table_expression: ($) =>
      seq("__contextual_datatable", $.guid_literal_expression, $.row_schema),
    data_table_expression: ($) =>
      seq(
        "datatable",
        repeat($.relaxed_query_operator_parameter),
        $.row_schema,
        "[",
        optional($.literal_expression),
        repeat(seq(",", $.literal_expression)),
        optional(","),
        "]",
      ),
    row_schema: ($) =>
      seq(
        "(",
        optional(
          seq(
            $.row_schema_column_declaration,
            repeat(seq(",", $.row_schema_column_declaration)),
          ),
        ),
        optional(","),
        ")",
      ),
    row_schema_column_declaration: ($) =>
      seq($.parameter_name, ":", $.scalar_type),
    external_data_expression: ($) =>
      seq(
        choice("externaldata", "external_data"),
        repeat($.relaxed_query_operator_parameter),
        $.row_schema,
        "[",
        $.string_literal_expression,
        repeat(seq(",", $.string_literal_expression)),
        "]",
        optional($.external_data_with_clause),
      ),
    external_data_with_clause: ($) =>
      seq(
        "with",
        "(",
        optional(
          seq(
            $.external_data_with_clause_property,
            repeat(seq(",", $.external_data_with_clause_property)),
            optional(","),
          ),
        ),
        ")",
      ),
    external_data_with_clause_property: ($) =>
      seq(
        $.parameter_name,
        "=",
        choice(
          $.string_literal_expression,
          $.long_literal_expression,
          $.real_literal_expression,
          $.boolean_literal_expression,
          $.date_time_literal_expression,
          $.type_literal_expression,
          $.guid_literal_expression,
          $.raw_guid_literal_expression,
          $.parameter_name,
        ),
      ),
    materialized_view_combine_expression: ($) =>
      seq(
        "materialized-view-combine",
        "(",
        $.string_literal_expression,
        ")",
        "base",
        "(",
        $.expression,
        ")",
        "delta",
        "(",
        $.expression,
        ")",
        "aggregations",
        "(",
        $.summarize_operator,
        ")",
      ),
    entity_group_expression: ($) =>
      seq(
        "entity_group",
        "[",
        $.unnamed_expression,
        repeat(seq(",", $.unnamed_expression)),
        "]",
      ),

    scalar_type: ($) =>
      choice(
        "bool",
        "boolean",
        "date",
        "datetime",
        "decimal",
        "double",
        "dynamic",
        "guid",
        "int",
        "int64",
        "int8",
        "long",
        "real",
        "string",
        "time",
        "timespan",
        "uniqueid",
      ),
    extended_scalar_type: ($) =>
      choice(
        "bool",
        "boolean",
        "date",
        "datetime",
        "decimal",
        "double",
        "dynamic",
        "float",
        "guid",
        "int",
        "int16",
        "int32",
        "int64",
        "int8",
        "long",
        "real",
        "string",
        "time",
        "timespan",
        "uint",
        "uint16",
        "uint32",
        "uint64",
        "uint8",
        "ulong",
        "uniqueid",
      ),
    parameter_name: ($) => $.identifier_or_extended_keyword_or_escaped_name,
    simple_name_reference: ($) => $.identifier_or_keyword_or_escaped_name,
    extended_name_reference: ($) =>
      $.identifier_or_extended_keyword_or_escaped_name,
    wildcarded_name_reference: ($) => $.wildcarded_name,
    simple_or_wildcarded_name_reference: ($) =>
      choice($.simple_name_reference, $.wildcarded_name_reference),

    identifier_or_keyword_name: ($) =>
      choice($.identifier_name, $.keyword_name),
    identifier_or_keyword_or_escaped_name: ($) =>
      choice($.identifier_name, $.keyword_name, $.escaped_name),
    identifier_or_extended_keyword_or_escaped_name: ($) =>
      choice(
        $.identifier_name,
        $.keyword_name,
        $.extended_keyword_name,
        $.escaped_name,
      ),
    identifier_name: ($) =>
      choice(alias($._digit_leading_identifier, $.identifier), $.identifier),
    keyword_name: ($) =>
      choice(
        "access",
        "aggregations",
        "alias",
        "all",
        "axes",
        "base",
        "bin",
        "bool",
        "cluster",
        "database",
        "declare",
        "default",
        "delta",
        "edges",
        "evaluate",
        "execute",
        "facet",
        "fork",
        "from",
        "guid",
        "hidden",
        "hot",
        "hotdata",
        "hotindex",
        "id",
        "into",
        "legend",
        "let",
        "linear",
        "log",
        "lookup",
        "list",
        "map",
        "nodes",
        "none",
        "null",
        "nulls",
        "on",
        "optional",
        "output",
        "pack",
        "partition",
        "__partitionby",
        "pattern",
        "plugin",
        "query_parameters",
        "range",
        "reduce",
        "replace",
        "render",
        "restrict",
        "series",
        "stacked",
        "stacked100",
        "step",
        "threshold",
        "typeof",
        "unstacked",
        "uuid",
        "view",
        "visible",
        "with",
        "xaxis",
        "xcolumn",
        "xmax",
        "xmin",
        "xtitle",
        "yaxis",
        "ycolumns",
        "ymax",
        "ymin",
        "ytitle",
        "ysplit",
      ),
    extended_keyword_name: ($) =>
      choice(
        "accumulate",
        "as",
        "by",
        "contains",
        "consume",
        "count",
        "datatable",
        "distinct",
        "extend",
        "externaldata",
        "find",
        "filter",
        "has",
        "in",
        "invoke",
        "limit",
        "materialize",
        "of",
        "parse",
        "print",
        "sample",
        "sample-distinct",
        "scan",
        "search",
        "serialize",
        "set",
        "sort",
        "summarize",
        "take",
        "title",
        "to",
        "top",
        "toscalar",
        "totable",
        "top-nested",
        "top-hitters",
        "where",
      ),
    escaped_name: ($) =>
      seq("[", $.string_literal_expression, "]"),
    wildcarded_name: ($) =>
      seq(
        optional(choice($.identifier, $.keyword_name, $.extended_keyword_name)),
        "*",
        repeat(
          choice(
            $.identifier,
            $.keyword_name,
            $.extended_keyword_name,
            $.long_literal_expression,
            "*",
          ),
        ),
      ),

    literal_expression: ($) =>
      choice($.signed_literal_expression, $.unsigned_literal_expression),
    number_like_literal_expression: ($) =>
      choice(
        $.long_literal_expression,
        $.real_literal_expression,
        $.decimal_literal_expression,
        $.time_span_literal_expression,
      ),
    numeric_literal_expression: ($) =>
      choice(
        $.long_literal_expression,
        $.int_literal_expression,
        $.real_literal_expression,
        $.decimal_literal_expression,
        $.signed_literal_expression,
      ),
    unsigned_literal_expression: ($) =>
      choice(
        $.long_literal_expression,
        $.int_literal_expression,
        $.real_literal_expression,
        $.decimal_literal_expression,
        $.date_time_literal_expression,
        $.time_span_literal_expression,
        $.boolean_literal_expression,
        $.guid_literal_expression,
        $.raw_guid_literal_expression,
        $.type_literal_expression,
        $.string_literal_expression,
        $.dynamic_literal_expression,
      ),
    signed_literal_expression: ($) =>
      choice($.signed_long_literal_expression, $.signed_real_literal_expression),
    long_literal_expression: ($) =>
      choice(
        $.integer_literal,
        token(
          prec(4, seq(choice("long", "int64"), "(", /[^)]*/, ")")),
        ),
      ),
    int_literal_expression: ($) =>
      token(prec(4, seq(choice("int", "int32"), "(", /[^)]*/, ")"))),
    real_literal_expression: ($) =>
      choice(
        $.real_number,
        token(
          prec(4, seq(choice("real", "double"), "(", /[^)]*/, ")")),
        ),
      ),
    decimal_literal_expression: ($) =>
      token(prec(4, seq("decimal", "(", /[^)]*/, ")"))),
    date_time_literal_expression: ($) =>
      token(prec(4, seq("datetime", "(", /[^)]*/, ")"))),
    time_span_literal_expression: ($) =>
      choice(
        $.time_span_literal,
        token(prec(4, seq(choice("time", "timespan"), "(", /[^)]*/, ")"))),
      ),
    boolean_literal_expression: ($) =>
      choice(
        "true",
        "false",
        "TRUE",
        "FALSE",
        "True",
        "False",
        token(prec(4, seq("bool", "(", /[^)]*/, ")"))),
      ),
    guid_literal_expression: ($) =>
      token(
        prec(4, seq(choice("guid", "uuid", "uniqueid"), "(", /[^)]*/, ")")),
      ),
    raw_guid_literal_expression: ($) => $.raw_guid,
    type_literal_expression: ($) =>
      token(prec(4, seq("typeof", "(", /[^)]*/, ")"))),
    signed_long_literal_expression: ($) =>
      seq(choice("+", "-"), $.long_literal_expression),
    signed_real_literal_expression: ($) =>
      seq(choice("+", "-"), $.real_literal_expression),

    dynamic_literal_expression: ($) =>
      seq("dynamic", "(", field("value", $.json_value), ")"),
    json_value: ($) =>
      choice(
        $.json_array,
        $.json_boolean,
        $.json_date_time,
        $.json_guid,
        $.json_long,
        $.json_null,
        $.json_object,
        $.json_real,
        $.json_string,
        $.json_time_span,
        $.dynamic_literal_expression,
      ),
    json_object: ($) =>
      seq(
        "{",
        optional(seq($.json_pair, repeat(seq(",", $.json_pair)))),
        "}",
      ),
    json_pair: ($) => seq($.string_literal, ":", $.json_value),
    json_array: ($) =>
      seq(
        "[",
        optional(seq($.json_value, repeat(seq(",", $.json_value)))),
        "]",
      ),
    json_boolean: ($) => $.boolean_literal_expression,
    json_date_time: ($) => $.date_time_literal_expression,
    json_guid: ($) => $.guid_literal_expression,
    json_long: ($) => seq(optional("-"), $.long_literal_expression),
    json_null: ($) => "null",
    json_string: ($) => $.string_literal_expression,
    json_real: ($) => seq(optional("-"), $.real_literal_expression),
    json_time_span: ($) => $.time_span_literal_expression,

    integer_literal: ($) =>
      token(prec(1, /(?:0[xX][0-9a-fA-F]+|[0-9]+)/)),
    real_number: ($) =>
      token(prec(2, /(?:[0-9]+\.[0-9]*[eE][+-]?[0-9]+|[0-9]+\.[0-9]*|[0-9]+[eE][+-]?[0-9]+)/)),
    time_span_literal: ($) =>
      token(
        prec(
          3,
          /[0-9]+(?:\.[0-9]+)?(?:m(?:in(?:ute)?s?|s?)|s(?:ec(?:ond)?s?)?|d(?:ays?)?|h(?:ours?|rs?)?|ms|milli(?:s(?:ec(?:ond)?s?)?)?|micro(?:s(?:ec(?:ond)?s?)?)?|nano(?:s(?:ec(?:ond)?s?)?)?|ticks?)/,
        ),
      ),
    raw_guid: ($) =>
      token(/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}/),
    string_literal: ($) =>
      choice(
        $.double_quoted_string,
        $.single_quoted_string,
        $.verbatim_double_quoted_string,
        $.verbatim_single_quoted_string,
        $.multiline_backtick_string,
        $.multiline_tilde_string,
      ),
    string_literal_expression: ($) =>
      prec.left(1, seq($.string_literal, repeat($.string_literal))),
    double_quoted_string: ($) =>
      token(/[hH]?"(?:\\[^\r\n]|[^"\\\r\n])*"/),
    single_quoted_string: ($) =>
      token(/[hH]?'(?:\\[^\r\n]|[^'\\\r\n])*'/),
    verbatim_double_quoted_string: ($) =>
      token(/[hH]?@"(?:""|[^"\r\n])*"/),
    verbatim_single_quoted_string: ($) =>
      token(/[hH]?@'(?:''|[^'\r\n])*'/),
    multiline_backtick_string: ($) =>
      token(
        seq(
          optional(choice("h", "H")),
          "```",
          repeat(choice(/[^`]/, seq("`", /[^`]/), seq("``", /[^`]/))),
          "```",
        ),
      ),
    multiline_tilde_string: ($) =>
      token(
        seq(
          optional(choice("h", "H")),
          "~~~",
          repeat(choice(/[^~]/, seq("~", /[^~]/), seq("~~", /[^~]/))),
          "~~~",
        ),
      ),

    identifier: ($) =>
      /(?:[$_a-zA-Z][_a-zA-Z0-9]*|[0-9]+[_a-zA-Z][_a-zA-Z0-9]*)/,
    _digit_leading_identifier: ($) =>
      token(prec(2, /[0-9]+[_a-zA-Z][_a-zA-Z0-9]*/)),
    comment: ($) =>
      token(seq("//", /[^\r\n\u2028\u2029]*/)),
  },
});
