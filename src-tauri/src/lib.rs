use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

const OPEN_FILE_EVENT: &str = "markdown-opened";

#[derive(Default)]
struct PendingFiles(Mutex<Vec<String>>);

fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|extension| extension.to_str()),
        Some("md" | "markdown" | "MD" | "MARKDOWN")
    )
}

fn emit_or_queue_file(app: &AppHandle, path: PathBuf) {
    if !is_markdown_path(&path) {
        return;
    }

    let path = path.to_string_lossy().into_owned();
    if let Ok(mut pending) = app.state::<PendingFiles>().0.lock() {
        pending.push(path.clone());
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
fn read_markdown_file(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    if !is_markdown_path(&path) {
        return Err("Only .md and .markdown files can be opened.".into());
    }
    std::fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_markdown_file(path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !is_markdown_path(&path) {
        return Err("Only .md and .markdown files can be saved.".into());
    }
    std::fs::write(path, content).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PendingFiles::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            for argument in args.into_iter().skip(1) {
                emit_or_queue_file(app, PathBuf::from(argument));
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
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
            write_markdown_file
        ])
        .build(tauri::generate_context!())
        .expect("error while building Tauri application")
        .run(|app, event| {
            if let RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        emit_or_queue_file(app, path);
                    }
                }
            }
        });
}
