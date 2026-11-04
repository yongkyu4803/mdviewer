use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

mod files;
use files::{is_import_path, is_markdown_path, resolve_open_path};

const OPEN_FILE_EVENT: &str = "markdown-opened";

#[derive(Default)]
struct PendingFiles(Mutex<Vec<String>>);

fn emit_or_queue_file(app: &AppHandle, path: PathBuf) {
    if !is_markdown_path(&path) {
        return;
    }

    let path = path.to_string_lossy().into_owned();
    if let Ok(mut pending) = app.state::<PendingFiles>().0.lock() {
        if !pending.contains(&path) {
            pending.push(path.clone());
        }
    }
    let _ = app.emit(OPEN_FILE_EVENT, vec![path]);
}

#[tauri::command]
fn take_pending_markdown_files(state: State<'_, PendingFiles>) -> Vec<String> {
    state
        .0
        .lock()
        .map(|mut files| std::mem::take(&mut *files))
        .unwrap_or_default()
}

#[tauri::command]
fn read_markdown_file(app: AppHandle, path: String) -> Result<String, String> {
    let path = dunce::canonicalize(path).map_err(|error| error.to_string())?;
    if !is_import_path(&path) {
        return Err("Only .md, .markdown and .txt files can be opened.".into());
    }
    let content = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    // Only grant asset access to the folder of a document the user has opened.
    if let Some(directory) = path.parent() {
        app.asset_protocol_scope()
            .allow_directory(directory, true)
            .map_err(|error| error.to_string())?;
    }
    Ok(content)
}

#[tauri::command]
fn write_markdown_file(path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !is_markdown_path(&path) {
        return Err("Only .md and .markdown files can be saved.".into());
    }
    std::fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
async fn pick_markdown_files(app: AppHandle) -> Result<Vec<String>, String> {
    let selected = app
        .dialog()
        .file()
        .add_filter("Markdown and text", &["md", "markdown", "txt"])
        .blocking_pick_files()
        .unwrap_or_default();
    selected
        .into_iter()
        .map(|file| {
            let path = file.into_path().map_err(|error| error.to_string())?;
            dunce::canonicalize(path)
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|error| error.to_string())
        })
        .collect()
}

#[tauri::command]
async fn save_export_file(
    app: AppHandle,
    filename: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    let extension = Path::new(&filename)
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| matches!(*value, "md" | "pdf" | "docx"))
        .ok_or("Unsupported export format.")?;
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
    let mut path = selected.into_path().map_err(|error| error.to_string())?;
    if path.extension().is_none() {
        path.set_extension(extension);
    }
    std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
    let path = dunce::canonicalize(path).map_err(|error| error.to_string())?;
    if is_markdown_path(&path) {
        if let Some(directory) = path.parent() {
            app.asset_protocol_scope()
                .allow_directory(directory, true)
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PendingFiles::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
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
        }))
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
        .invoke_handler(tauri::generate_handler![
            take_pending_markdown_files,
            read_markdown_file,
            write_markdown_file,
            pick_markdown_files,
            save_export_file
        ])
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
