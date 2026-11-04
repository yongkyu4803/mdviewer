use std::path::{Path, PathBuf};

pub fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}

pub fn is_import_path(path: &Path) -> bool {
    is_markdown_path(path)
        || path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("txt"))
}

/// The sender's working directory matters when forwarding a second launch.
pub fn resolve_open_path(path: &Path, cwd: &Path) -> Option<PathBuf> {
    if !is_markdown_path(path) {
        return None;
    }
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    };
    if !absolute.is_file() {
        return None;
    }
    // Avoid Windows verbatim prefixes where a normal Win32 path can be used.
    dunce::canonicalize(absolute).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_mixed_case_markdown_extensions_only() {
        for name in ["자료.md", "자료.Md", "notes.MarkDown"] {
            assert!(is_markdown_path(Path::new(name)));
        }
        assert!(is_import_path(Path::new("notes.TXT")));
        assert!(!is_import_path(Path::new("notes.exe")));
        for name in ["--flag", "notes.md.exe", "notes.txt", "markdown"] {
            assert!(!is_markdown_path(Path::new(name)));
        }
    }

    #[test]
    fn resolves_files_against_the_sending_process_directory() {
        let folder = std::env::temp_dir().join(format!("markmd-path-test-{}", std::process::id()));
        std::fs::create_dir_all(folder.join("문서 #1%")).unwrap();
        let file = folder.join("문서 #1%").join("자료.Md");
        std::fs::write(&file, "# test\r\n").unwrap();
        let expected = dunce::canonicalize(&file).unwrap();
        assert_eq!(
            resolve_open_path(Path::new("문서 #1%/자료.Md"), &folder),
            Some(expected.clone())
        );
        assert_eq!(
            resolve_open_path(&file, Path::new("unused")),
            Some(expected)
        );
        assert_eq!(resolve_open_path(Path::new("missing.md"), &folder), None);
        assert_eq!(resolve_open_path(Path::new("--flag"), &folder), None);
        std::fs::remove_dir_all(folder).unwrap();
    }
}
