#[test]
fn parses_management_commands_with_the_external_scanner() {
    let mut parser = tree_sitter::Parser::new();
    parser
        .set_language(&tree_sitter_kusto::LANGUAGE.into())
        .expect("failed to load Kusto language");

    let tree = parser.parse(".show queries | take 10", None).unwrap();

    assert!(!tree.root_node().has_error());
}
