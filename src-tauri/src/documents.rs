//! File authority is created only by an OS open event or a native dialog.
//! The webview receives session IDs, never authority derived from a saved path.
use crate::files::{is_import_path, is_markdown_path};
use base64::{engine::general_purpose::STANDARD, Engine};
use cap_fs_ext::{FollowSymlinks, OpenOptionsFollowExt};
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions},
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    ffi::OsString,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

pub const MAX_DOCUMENT_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_EXPORT_BYTES: usize = 64 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;
const MAX_IMAGE_PIXELS: u64 = 16_000_000;
const MAX_IMAGES: usize = 64;
const MAX_IMAGE_TOTAL_BYTES: usize = 32 * 1024 * 1024;
const MAX_OPEN_DOCUMENTS: usize = 128;

#[derive(Clone, Debug, Serialize)]
pub struct DocumentRef {
    pub id: String,
    pub path: String,
}

struct ApprovedFile {
    directory: Dir,
    name: OsString,
    path: PathBuf,
    digest: Vec<u8>,
    writable: bool,
}

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn read_bounded(directory: &Dir, name: &Path, limit: usize) -> Result<Vec<u8>, String> {
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    let file = directory.open_with(name, &options).map_err(error)?;
    let metadata = file.metadata().map_err(error)?;
    if !metadata.is_file() || metadata.len() > limit as u64 {
        return Err("Only regular files within the size limit can be opened.".into());
    }
    let mut bytes = Vec::new();
    file.take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(error)?;
    if bytes.len() > limit {
        return Err("File size limit exceeded.".into());
    }
    Ok(bytes)
}

fn selected_location(path: &Path) -> Result<(Dir, OsString, PathBuf), String> {
    let parent = path.parent().ok_or("A parent directory is required.")?;
    let name = path
        .file_name()
        .ok_or("A filename is required.")?
        .to_owned();
    let parent = dunce::canonicalize(parent).map_err(error)?;
    // Hold the directory handle: later parent-path replacement cannot redirect I/O.
    let directory = Dir::open_ambient_dir(&parent, ambient_authority()).map_err(error)?;
    Ok((directory, name.clone(), parent.join(name)))
}

fn atomic_replace(
    directory: &Dir,
    name: &std::ffi::OsStr,
    bytes: &[u8],
    expected: Option<&[u8]>,
) -> Result<(), String> {
    let path = Path::new(name);
    let old_permissions = if let Some(expected) = expected {
        let current = read_bounded(directory, path, MAX_EXPORT_BYTES)?;
        if Sha256::digest(&current).as_slice() != expected {
            return Err("File changed outside Mark_md. Reopen it before saving.".into());
        }
        let permissions = directory
            .symlink_metadata(path)
            .map_err(error)?
            .permissions();
        if permissions.readonly() {
            return Err("The file is read-only.".into());
        }
        Some(permissions)
    } else {
        if directory.symlink_metadata(path).is_ok() {
            return Err("A file appeared at the selected location. Choose Save again.".into());
        }
        None
    };
    let mut temporary = cap_tempfile::TempFile::new(directory).map_err(error)?;
    temporary.as_file_mut().write_all(bytes).map_err(error)?;
    if let Some(permissions) = old_permissions {
        temporary
            .as_file()
            .set_permissions(permissions)
            .map_err(error)?;
    } else {
        let mut permissions = temporary.as_file().metadata().map_err(error)?.permissions();
        #[cfg(unix)]
        {
            use cap_std::fs::PermissionsExt;
            permissions.set_mode(0o600);
        }
        #[cfg(windows)]
        permissions.set_readonly(false);
        temporary
            .as_file()
            .set_permissions(permissions)
            .map_err(error)?;
    }
    temporary.as_file().sync_all().map_err(error)?;
    // Recheck after writing the temporary file. rename replaces the directory
    // entry itself; it never follows a final symlink into an unrelated target.
    if let Some(expected) = expected {
        if Sha256::digest(read_bounded(directory, path, MAX_EXPORT_BYTES)?).as_slice() != expected {
            return Err("File changed outside Mark_md. Reopen it before saving.".into());
        }
    } else if directory.symlink_metadata(path).is_ok() {
        return Err("The destination changed. Choose Save again.".into());
    }
    temporary.replace(name).map_err(error)?;
    #[cfg(unix)]
    directory
        .try_clone()
        .map_err(error)?
        .into_std_file()
        .sync_all()
        .map_err(error)?;
    Ok(())
}

#[derive(Default)]
pub struct Documents {
    files: HashMap<String, ApprovedFile>,
}

fn prepare(path: &Path) -> Result<ApprovedFile, String> {
    if !is_import_path(path) {
        return Err("Only Markdown and text documents can be opened.".into());
    }
    let (directory, name, path) = selected_location(path)?;
    let bytes = read_bounded(&directory, Path::new(&name), MAX_DOCUMENT_BYTES)?;
    std::str::from_utf8(&bytes).map_err(error)?;
    Ok(ApprovedFile {
        writable: is_markdown_path(&path),
        directory,
        name,
        path,
        digest: Sha256::digest(bytes).to_vec(),
    })
}

impl Documents {
    pub fn approve(&mut self, path: &Path) -> Result<DocumentRef, String> {
        let file = prepare(path)?;
        self.ensure_capacity(std::slice::from_ref(&file))?;
        Ok(self.insert(file))
    }

    /// Validates a whole dialog selection before issuing any ID. A failure
    /// leaves earlier approvals, including reopened documents, untouched.
    pub fn approve_all(&mut self, paths: &[PathBuf]) -> Result<Vec<DocumentRef>, String> {
        let files = paths
            .iter()
            .map(|path| {
                prepare(path).map_err(|error| {
                    let name = path
                        .file_name()
                        .map(|name| name.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    format!("{name}: {error}")
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        self.ensure_capacity(&files)?;
        Ok(files.into_iter().map(|file| self.insert(file)).collect())
    }

    fn ensure_capacity(&self, files: &[ApprovedFile]) -> Result<(), String> {
        let mut added: Vec<&PathBuf> = files
            .iter()
            .map(|file| &file.path)
            .filter(|path| !self.files.values().any(|file| &file.path == *path))
            .collect();
        added.sort();
        added.dedup();
        if self.files.len() + added.len() > MAX_OPEN_DOCUMENTS {
            return Err("Close a document before opening more files (limit 128).".into());
        }
        Ok(())
    }

    /// Reopening a path issues a new ID and revokes the previous one.
    fn insert(&mut self, file: ApprovedFile) -> DocumentRef {
        self.files.retain(|_, existing| existing.path != file.path);
        let id = uuid::Uuid::new_v4().to_string();
        let reference = DocumentRef {
            id: id.clone(),
            path: file.path.to_string_lossy().into_owned(),
        };
        self.files.insert(id, file);
        reference
    }

    pub fn read(&self, id: &str) -> Result<String, String> {
        let file = self
            .files
            .get(id)
            .ok_or("Document permission expired. Use Import to reopen the file.")?;
        let bytes = read_bounded(&file.directory, Path::new(&file.name), MAX_DOCUMENT_BYTES)?;
        if Sha256::digest(&bytes).as_slice() != file.digest {
            return Err("File changed outside Mark_md. Use Import to reopen it.".into());
        }
        String::from_utf8(bytes).map_err(error)
    }

    pub fn write(&mut self, id: &str, content: &str) -> Result<(), String> {
        if content.len() > MAX_DOCUMENT_BYTES {
            return Err("Document exceeds the 8 MiB limit.".into());
        }
        let file = self
            .files
            .get_mut(id)
            .ok_or("Document permission expired. Use Import to reopen the file.")?;
        if !file.writable {
            return Err("Text imports must be saved as a new Markdown file.".into());
        }
        atomic_replace(
            &file.directory,
            &file.name,
            content.as_bytes(),
            Some(&file.digest),
        )?;
        file.digest = Sha256::digest(content.as_bytes()).to_vec();
        Ok(())
    }

    pub fn close(&mut self, id: &str) {
        self.files.remove(id);
    }

    /// A duplicate handle lets image reads run without holding the session lock.
    pub fn image_directory(&self, id: &str) -> Result<Dir, String> {
        self.files
            .get(id)
            .ok_or("Document permission expired.")?
            .directory
            .try_clone()
            .map_err(error)
    }

    #[cfg(test)]
    fn images(&self, id: &str, sources: &[String]) -> Result<HashMap<String, String>, String> {
        read_images(&self.image_directory(id)?, sources)
    }
}

pub fn read_images(directory: &Dir, sources: &[String]) -> Result<HashMap<String, String>, String> {
    if sources.len() > MAX_IMAGES {
        return Err("At most 64 local images can be loaded per document.".into());
    }
    let mut total = 0;
    let mut result = HashMap::new();
    for source in sources {
        if let Ok((url, size)) = image_url(directory, source) {
            total += size;
            if total > MAX_IMAGE_TOTAL_BYTES {
                break;
            }
            result.insert(source.clone(), url);
        }
    }
    Ok(result)
}

fn image_url(directory: &Dir, source: &str) -> Result<(String, usize), String> {
    let encoded = source.split(['?', '#']).next().unwrap_or_default();
    let decoded = percent_encoding::percent_decode_str(encoded)
        .decode_utf8()
        .map_err(error)?;
    // Reject drive names, UNC, alternate streams, traversal and platform ambiguity.
    if decoded.is_empty()
        || decoded.contains([':', '\\', '\0'])
        || decoded.starts_with('/')
        || Path::new(decoded.as_ref())
            .components()
            .any(|part| !matches!(part, Component::Normal(_) | Component::CurDir))
    {
        return Err("Only relative images inside the document folder are allowed.".into());
    }
    let path = Path::new(decoded.as_ref());
    let ext = path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp") {
        return Err("Unsupported image format.".into());
    }
    let bytes = read_bounded(directory, path, MAX_IMAGE_BYTES)?;
    let format = image::guess_format(&bytes).map_err(error)?;
    let mime = match format {
        image::ImageFormat::Png => "image/png",
        image::ImageFormat::Jpeg => "image/jpeg",
        image::ImageFormat::WebP => "image/webp",
        _ => return Err("Unsupported image data.".into()),
    };
    let (width, height) = image::ImageReader::with_format(std::io::Cursor::new(&bytes), format)
        .into_dimensions()
        .map_err(error)?;
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS {
        return Err("Image dimensions exceed the limit.".into());
    }
    Ok((
        format!("data:{mime};base64,{}", STANDARD.encode(&bytes)),
        bytes.len(),
    ))
}

pub fn save_selected_export(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > MAX_EXPORT_BYTES {
        return Err("Export exceeds the 64 MiB limit.".into());
    }
    let (directory, name, _) = selected_location(path)?;
    let existing = match directory.symlink_metadata(Path::new(&name)) {
        Ok(_) => Some(
            Sha256::digest(read_bounded(
                &directory,
                Path::new(&name),
                MAX_EXPORT_BYTES,
            )?)
            .to_vec(),
        ),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(error(e)),
    };
    atomic_replace(&directory, &name, bytes, existing.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unknown_ids_never_grant_access() {
        let mut docs = Documents::default();
        assert!(docs.read("/tmp/notes.md").is_err());
        assert!(docs.write("C:\\notes.md", "bad").is_err());
        assert!(docs.images("forged", &[]).is_err());
    }

    #[test]
    fn approves_saves_revokes_and_detects_external_changes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("한글.md");
        std::fs::write(&path, "original").unwrap();
        let mut docs = Documents::default();
        let reference = docs.approve(&path).unwrap();
        assert_eq!(docs.read(&reference.id).unwrap(), "original");
        docs.write(&reference.id, "updated").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "updated");
        std::fs::write(&path, "external edit").unwrap();
        assert!(docs.write(&reference.id, "overwrite").is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "external edit");
        docs.close(&reference.id);
        assert!(docs.read(&reference.id).is_err());
    }
    #[test]
    fn text_imports_cannot_write_and_oversized_files_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("notes.txt");
        std::fs::write(&path, "original").unwrap();
        let mut docs = Documents::default();
        let reference = docs.approve(&path).unwrap();
        assert!(docs.write(&reference.id, "overwrite").is_err());
        let large = dir.path().join("large.md");
        std::fs::File::create(&large)
            .unwrap()
            .set_len(MAX_DOCUMENT_BYTES as u64 + 1)
            .unwrap();
        assert!(docs.approve(&large).is_err());
    }
    #[test]
    fn failed_selection_issues_no_ids_and_keeps_open_documents() {
        let dir = tempfile::tempdir().unwrap();
        let open = dir.path().join("open.md");
        let fresh = dir.path().join("fresh.md");
        let large = dir.path().join("large.md");
        std::fs::write(&open, "open").unwrap();
        std::fs::write(&fresh, "fresh").unwrap();
        std::fs::File::create(&large)
            .unwrap()
            .set_len(MAX_DOCUMENT_BYTES as u64 + 1)
            .unwrap();
        let mut docs = Documents::default();
        let existing = docs.approve(&open).unwrap();
        let error = docs
            .approve_all(&[open.clone(), fresh.clone(), large])
            .unwrap_err();
        assert!(error.starts_with("large.md: "));
        assert_eq!(docs.files.len(), 1);
        assert_eq!(docs.read(&existing.id).unwrap(), "open");
        let approved = docs.approve_all(&[open, fresh]).unwrap();
        assert!(docs.read(&existing.id).is_err());
        assert_eq!(docs.read(&approved[1].id).unwrap(), "fresh");
    }
    #[test]
    fn selection_capacity_counts_only_new_paths() {
        let dir = tempfile::tempdir().unwrap();
        let mut docs = Documents::default();
        let paths: Vec<PathBuf> = (0..MAX_OPEN_DOCUMENTS)
            .map(|index| {
                let path = dir.path().join(format!("{index}.md"));
                std::fs::write(&path, "x").unwrap();
                path
            })
            .collect();
        docs.approve_all(&paths).unwrap();
        assert!(docs.approve_all(&paths[..2]).is_ok());
        let extra = dir.path().join("extra.md");
        std::fs::write(&extra, "x").unwrap();
        assert!(docs.approve_all(&[paths[0].clone(), extra]).is_err());
        assert_eq!(docs.files.len(), MAX_OPEN_DOCUMENTS);
    }
    #[test]
    fn export_is_writable_and_image_scope_rejects_traversal_and_disguised_html() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("new.md");
        save_selected_export(&path, b"export").unwrap();
        let mut docs = Documents::default();
        let reference = docs.approve(&path).unwrap();
        docs.write(&reference.id, "new version").unwrap();
        std::fs::write(dir.path().join("fake.png"), "<script>bad</script>").unwrap();
        let sources = [
            "../secret.png",
            "%2e%2e/secret.png",
            "https://host/a.png",
            "C:/file.png",
            "file.png:secret",
            "fake.png",
        ]
        .map(String::from);
        assert!(docs.images(&reference.id, &sources).unwrap().is_empty());
        let img = image::RgbImage::new(2, 2);
        img.save(dir.path().join("한글.png")).unwrap();
        assert!(docs
            .images(&reference.id, &["%ED%95%9C%EA%B8%80.png".into()])
            .unwrap()
            .values()
            .next()
            .unwrap()
            .starts_with("data:image/png;base64,"));
    }
    #[cfg(unix)]
    #[test]
    fn symlink_swap_cannot_write_another_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("notes.md");
        let target = dir.path().join("secret.txt");
        std::fs::write(&path, "original").unwrap();
        std::fs::write(&target, "secret").unwrap();
        let mut docs = Documents::default();
        let reference = docs.approve(&path).unwrap();
        std::fs::remove_file(&path).unwrap();
        std::os::unix::fs::symlink(&target, &path).unwrap();
        assert!(docs.write(&reference.id, "bad").is_err());
        assert!(docs.approve(&path).is_err());
        assert!(save_selected_export(&path, b"bad").is_err());
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "secret");
    }
    #[cfg(unix)]
    #[test]
    fn replacing_parent_path_cannot_redirect_a_save() {
        let dir = tempfile::tempdir().unwrap();
        let parent = dir.path().join("documents");
        let outside = dir.path().join("outside");
        std::fs::create_dir(&parent).unwrap();
        std::fs::create_dir(&outside).unwrap();
        std::fs::write(parent.join("notes.md"), "original").unwrap();
        std::fs::write(outside.join("notes.md"), "untouched").unwrap();
        let mut docs = Documents::default();
        let reference = docs.approve(&parent.join("notes.md")).unwrap();
        let moved = dir.path().join("moved");
        std::fs::rename(&parent, &moved).unwrap();
        std::os::unix::fs::symlink(&outside, &parent).unwrap();
        docs.write(&reference.id, "safe update").unwrap();
        assert_eq!(
            std::fs::read_to_string(moved.join("notes.md")).unwrap(),
            "safe update"
        );
        assert_eq!(
            std::fs::read_to_string(outside.join("notes.md")).unwrap(),
            "untouched"
        );
    }
    #[cfg(unix)]
    #[test]
    fn image_symlink_cannot_escape_document_directory() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        image::RgbImage::new(2, 2)
            .save(outside.path().join("secret.png"))
            .unwrap();
        std::fs::write(dir.path().join("notes.md"), "original").unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("images")).unwrap();
        let mut docs = Documents::default();
        let reference = docs.approve(&dir.path().join("notes.md")).unwrap();
        assert!(docs
            .images(&reference.id, &["images/secret.png".into()])
            .unwrap()
            .is_empty());
    }
}
