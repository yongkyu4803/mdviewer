use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};
use tauri::{
    ipc::{InvokeBody, Request},
    AppHandle, Emitter, Manager, Runtime, State,
};
use tauri_plugin_dialog::DialogExt;
mod documents;
mod files;
use documents::{
    read_images, save_selected_export, DocumentRef, Documents, MAX_DOCUMENT_BYTES, MAX_EXPORT_BYTES,
};
use files::{is_markdown_path, resolve_open_path};
const OPEN_FILE_EVENT: &str = "markdown-opened";
/// Percent-encoded UTF-8 filename sent alongside the raw export body.
const EXPORT_FILENAME_HEADER: &str = "x-markmd-filename";
#[derive(Default)]
struct PendingFiles(Mutex<Vec<DocumentRef>>);
#[derive(Default)]
struct ApprovedDocuments(Mutex<Documents>);

fn documents<R: Runtime>(app: &AppHandle<R>) -> Result<MutexGuard<'_, Documents>, String> {
    // A poisoned lock fails closed instead of crashing the app.
    app.state::<ApprovedDocuments>()
        .inner()
        .0
        .lock()
        .map_err(|_| "Document access is unavailable. Restart Mark_md.".to_string())
}

/// Synchronous Tauri commands run on the main thread. Disk work runs on the
/// blocking pool so a large image set or a slow volume cannot freeze the UI.
async fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|e| e.to_string())?
}

fn emit_or_queue_file<R: Runtime>(app: &AppHandle<R>, path: PathBuf) {
    if !is_markdown_path(&path) {
        return;
    }
    let reference = documents(app).and_then(|mut documents| documents.approve(&path));
    match reference {
        Ok(reference) => {
            if let Ok(mut pending) = app.state::<PendingFiles>().0.lock() {
                pending.retain(|item| item.path != reference.path);
                pending.push(reference);
            }
            let _ = app.emit(OPEN_FILE_EVENT, ());
        }
        Err(error) => {
            log::warn!("Could not open document: {error}");
        }
    }
}

#[tauri::command]
fn take_pending_markdown_files(state: State<'_, PendingFiles>) -> Vec<DocumentRef> {
    state
        .0
        .lock()
        .map(|mut files| std::mem::take(&mut *files))
        .unwrap_or_default()
}
#[tauri::command]
async fn read_markdown_file<R: Runtime>(app: AppHandle<R>, id: String) -> Result<String, String> {
    blocking(move || {
        let documents = documents(&app)?;
        documents.read(&id)
    })
    .await
}
#[tauri::command]
async fn write_markdown_file<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    content: String,
) -> Result<(), String> {
    blocking(move || {
        let mut documents = documents(&app)?;
        documents.write(&id, &content)
    })
    .await
}
#[tauri::command]
fn close_markdown_file(state: State<'_, ApprovedDocuments>, id: String) -> Result<(), String> {
    state.0.lock().map_err(|e| e.to_string())?.close(&id);
    Ok(())
}
#[tauri::command]
async fn read_document_images<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    sources: Vec<String>,
) -> Result<HashMap<String, String>, String> {
    blocking(move || {
        // Release the session lock before reading up to 32 MiB of images.
        let directory = documents(&app)?.image_directory(&id)?;
        read_images(&directory, &sources)
    })
    .await
}
#[tauri::command]
async fn pick_markdown_files<R: Runtime>(app: AppHandle<R>) -> Result<Vec<DocumentRef>, String> {
    let selected = app
        .dialog()
        .file()
        .add_filter("Markdown and text", &["md", "markdown", "txt"])
        .blocking_pick_files()
        .unwrap_or_default();
    if selected.len() > 128 {
        return Err("Select at most 128 documents.".into());
    }
    let paths = selected
        .into_iter()
        .map(|file| file.into_path().map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    blocking(move || {
        let mut documents = documents(&app)?;
        documents.approve_all(&paths)
    })
    .await
}
#[derive(serde::Serialize)]
struct ExportResult {
    path: String,
    document: Option<DocumentRef>,
}

fn decode_export_filename(header: Option<&str>) -> Result<String, String> {
    let encoded = header.ok_or("Missing export filename.")?;
    percent_encoding::percent_decode_str(encoded)
        .decode_utf8()
        .map(|name| name.into_owned())
        .map_err(|_| "Invalid export filename.".to_string())
}

/// Validates the suggested name and payload, returning the export extension.
fn export_kind(filename: &str, bytes: &[u8]) -> Result<&'static str, String> {
    if filename.is_empty()
        || filename.contains(['/', '\\', ':'])
        || filename.chars().any(char::is_control)
    {
        return Err("Invalid export filename.".into());
    }
    let extension = match Path::new(filename).extension().and_then(|v| v.to_str()) {
        Some("md") => "md",
        Some("pdf") => "pdf",
        Some("docx") => "docx",
        _ => return Err("Unsupported export format.".into()),
    };
    if bytes.len() > MAX_EXPORT_BYTES || (extension == "md" && bytes.len() > MAX_DOCUMENT_BYTES) {
        return Err("Export exceeds the size limit.".into());
    }
    if extension == "md" {
        std::str::from_utf8(bytes).map_err(|e| e.to_string())?;
    }
    Ok(extension)
}

/// Export bytes arrive as a raw IPC body, not a JSON array of numbers.
#[tauri::command]
async fn save_export_file<R: Runtime>(
    app: AppHandle<R>,
    request: Request<'_>,
) -> Result<Option<ExportResult>, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Export data must be sent as raw bytes.".into());
    };
    let filename = decode_export_filename(
        request
            .headers()
            .get(EXPORT_FILENAME_HEADER)
            .and_then(|value| value.to_str().ok()),
    )?;
    let extension = export_kind(&filename, bytes)?;
    let extensions: &[&str] = if extension == "md" {
        &["md", "markdown"]
    } else {
        &[extension]
    };
    let selected = app
        .dialog()
        .file()
        .set_file_name(&filename)
        .add_filter(extension.to_uppercase(), extensions)
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let mut path = selected.into_path().map_err(|e| e.to_string())?;
    if path.extension().is_none() {
        path.set_extension(extension);
    }
    let chosen = path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !extensions.contains(&chosen.as_str()) {
        return Err("The selected filename has an unsupported extension.".into());
    }
    save_selected_export(&path, bytes)?;
    if extension == "md" {
        let document = documents(&app)?.approve(&path)?;
        return Ok(Some(ExportResult {
            path: document.path.clone(),
            document: Some(document),
        }));
    }
    // Canonicalize only the parent: a final component swapped for a link after
    // saving must not change the reported location.
    let name = path.file_name().ok_or("A filename is required.")?;
    let parent = path.parent().ok_or("A parent directory is required.")?;
    let path = dunce::canonicalize(parent)
        .map_err(|e| e.to_string())?
        .join(name);
    Ok(Some(ExportResult {
        path: path.to_string_lossy().into_owned(),
        document: None,
    }))
}

/// Shared by the app and the IPC tests so both exercise the same commands.
fn handlers<R: Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        take_pending_markdown_files,
        read_markdown_file,
        write_markdown_file,
        close_markdown_file,
        read_document_images,
        pick_markdown_files,
        save_export_file
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(PendingFiles::default())
        .manage(ApprovedDocuments::default());
    // macOS LaunchServices already keeps one instance and delivers Finder opens
    // as RunEvent::Opened. The plugin's macOS socket lives in shared /tmp under
    // a fixed name, which another local account could occupy first.
    #[cfg(any(windows, target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        for argument in args.into_iter().skip(1) {
            if let Some(path) = resolve_open_path(Path::new(&argument), Path::new(&cwd)) {
                emit_or_queue_file(app, path);
            }
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));
    builder
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Windows Explorer passes documents as arguments on the first launch.
            // macOS Finder uses RunEvent::Opened; command-line launches work too.
            let cwd = std::env::current_dir()?;
            for argument in std::env::args_os().skip(1) {
                if let Some(path) = resolve_open_path(Path::new(&argument), &cwd) {
                    emit_or_queue_file(app.handle(), path);
                }
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(handlers())
        .build(tauri::generate_context!())
        .expect("error while building Tauri application")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        if let Some(path) = resolve_open_path(&path, Path::new("/")) {
                            emit_or_queue_file(_app, path);
                        }
                    }
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_filename_header_round_trips_unicode() {
        assert_eq!(
            decode_export_filename(Some("%ED%95%9C%EA%B8%80%20%231.pdf")).unwrap(),
            "한글 #1.pdf"
        );
        assert!(decode_export_filename(None).is_err());
        assert!(decode_export_filename(Some("%FF.pdf")).is_err());
    }

    #[test]
    fn export_kind_rejects_paths_formats_and_oversized_markdown() {
        assert_eq!(export_kind("자료.pdf", b"%PDF").unwrap(), "pdf");
        assert_eq!(export_kind("notes.md", "본문".as_bytes()).unwrap(), "md");
        for name in [
            "../x.pdf", "a/b.md", "C:x.docx", "a\nb.pdf", "x.exe", "x", "",
        ] {
            assert!(export_kind(name, b"x").is_err(), "{name}");
        }
        assert!(export_kind("bad.md", &[0xff]).is_err());
        assert!(export_kind("big.md", &vec![b'a'; MAX_DOCUMENT_BYTES + 1]).is_err());
        assert!(export_kind("big.pdf", &vec![0; MAX_EXPORT_BYTES + 1]).is_err());
    }
}

/// Exercises the real command table and capability ACL through Tauri's mock IPC.
#[cfg(test)]
mod ipc_tests {
    use super::*;
    use tauri::{
        http::{HeaderMap, HeaderValue},
        ipc::{CallbackFn, InvokeResponseBody},
        test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY},
        webview::InvokeRequest,
        App, WebviewWindow, WebviewWindowBuilder,
    };

    const LOCAL: &str = if cfg!(windows) {
        "http://tauri.localhost"
    } else {
        "tauri://localhost"
    };

    fn app() -> (App<MockRuntime>, WebviewWindow<MockRuntime>) {
        let app = mock_builder()
            .manage(PendingFiles::default())
            .manage(ApprovedDocuments::default())
            .invoke_handler(handlers())
            .build(tauri::generate_context!("tauri.conf.json", test = true))
            .unwrap();
        let webview = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        (app, webview)
    }

    fn call(
        webview: &WebviewWindow<MockRuntime>,
        origin: &str,
        cmd: &str,
        body: InvokeBody,
        headers: HeaderMap,
    ) -> Result<InvokeResponseBody, serde_json::Value> {
        get_ipc_response(
            webview,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: origin.parse().unwrap(),
                body,
                headers,
                invoke_key: INVOKE_KEY.into(),
            },
        )
    }

    fn json(value: serde_json::Value) -> InvokeBody {
        InvokeBody::Json(value)
    }

    #[test]
    fn approved_documents_and_images_are_served_off_the_main_thread() {
        let (app, webview) = app();
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("images")).unwrap();
        image::RgbImage::new(2, 2)
            .save(dir.path().join("images").join("그림 1.png"))
            .unwrap();
        let path = dir.path().join("문서.md");
        std::fs::write(&path, "# 본문").unwrap();
        let id = documents(app.handle()).unwrap().approve(&path).unwrap().id;

        let content = call(
            &webview,
            LOCAL,
            "read_markdown_file",
            json(serde_json::json!({ "id": id })),
            HeaderMap::new(),
        )
        .unwrap()
        .deserialize::<String>()
        .unwrap();
        assert_eq!(content, "# 본문");

        let images = call(
            &webview,
            LOCAL,
            "read_document_images",
            json(serde_json::json!({ "id": id, "sources": ["images/%EA%B7%B8%EB%A6%BC%201.png", "../x.png"] })),
            HeaderMap::new(),
        )
        .unwrap()
        .deserialize::<HashMap<String, String>>()
        .unwrap();
        assert_eq!(images.len(), 1);
        assert!(images["images/%EA%B7%B8%EB%A6%BC%201.png"].starts_with("data:image/png;base64,"));

        call(
            &webview,
            LOCAL,
            "write_markdown_file",
            json(serde_json::json!({ "id": id, "content": "# 수정" })),
            HeaderMap::new(),
        )
        .unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "# 수정");

        let forged = call(
            &webview,
            LOCAL,
            "read_markdown_file",
            json(serde_json::json!({ "id": path.to_string_lossy() })),
            HeaderMap::new(),
        )
        .unwrap_err();
        assert!(forged.to_string().contains("permission expired"));
    }

    #[test]
    fn export_requires_a_raw_body_and_a_valid_filename_header() {
        let (_app, webview) = app();
        let as_json = call(
            &webview,
            LOCAL,
            "save_export_file",
            json(serde_json::json!({ "filename": "x.pdf", "bytes": [1, 2] })),
            HeaderMap::new(),
        )
        .unwrap_err();
        assert!(as_json.to_string().contains("raw bytes"));

        let missing = call(
            &webview,
            LOCAL,
            "save_export_file",
            InvokeBody::Raw(vec![1, 2]),
            HeaderMap::new(),
        )
        .unwrap_err();
        assert!(missing.to_string().contains("Missing export filename"));

        let mut headers = HeaderMap::new();
        headers.insert(
            EXPORT_FILENAME_HEADER,
            HeaderValue::from_static("..%2Fpayload.exe"),
        );
        let rejected = call(
            &webview,
            LOCAL,
            "save_export_file",
            InvokeBody::Raw(vec![1, 2]),
            headers,
        )
        .unwrap_err();
        assert!(rejected.to_string().contains("Invalid export filename"));
    }

    #[test]
    fn remote_origins_cannot_invoke_document_commands() {
        let (app, webview) = app();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("secret.md");
        std::fs::write(&path, "secret").unwrap();
        let id = documents(app.handle()).unwrap().approve(&path).unwrap().id;
        let denied = call(
            &webview,
            "https://attacker.example",
            "read_markdown_file",
            json(serde_json::json!({ "id": id })),
            HeaderMap::new(),
        )
        .unwrap_err();
        assert!(denied.to_string().contains("not allowed"), "{denied}");
        assert!(call(
            &webview,
            LOCAL,
            "read_markdown_file",
            json(serde_json::json!({ "id": id })),
            HeaderMap::new(),
        )
        .is_ok());
    }
}
