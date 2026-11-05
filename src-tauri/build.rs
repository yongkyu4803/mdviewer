fn main() {
    let mut attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "take_pending_markdown_files",
            "read_markdown_file",
            "write_markdown_file",
            "close_markdown_file",
            "read_document_images",
            "pick_markdown_files",
            "save_export_file",
        ]));
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os == "windows" && target_env == "msvc" {
        // tauri-build embeds the Common Controls v6 manifest into binaries only.
        // The IPC tests link the dialog commands, so the library test binary
        // needs the same manifest or Windows refuses to load it
        // (STATUS_ENTRYPOINT_NOT_FOUND). Embed it once through the linker for
        // every target instead of as a binary-only resource.
        let manifest = std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").unwrap())
            .join("windows-app-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    }
    tauri_build::try_build(attributes).expect("failed to build application permissions");
}
