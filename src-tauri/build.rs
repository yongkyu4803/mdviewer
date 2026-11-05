fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "take_pending_markdown_files",
            "read_markdown_file",
            "write_markdown_file",
            "close_markdown_file",
            "read_document_images",
            "pick_markdown_files",
            "save_export_file",
        ]),
    ))
    .expect("failed to build application permissions");
}
