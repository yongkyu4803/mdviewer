# Windows release verification

Target: Windows 11 x64. Run these checks using the installed NSIS build, not only
the development server or a Chromium browser. Record the app version, Windows
version, WebView2 version and result with the release. These are manual acceptance
criteria, not a claim that a Windows machine has already passed them.

## Build checks

- `npm ci`, `npm run lint`, `npm test` and `npm run build` pass.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check` passes.
- `cargo test --manifest-path src-tauri/Cargo.toml --locked --lib` passes on Windows.
- `npm run desktop:build:windows` creates a `*-setup.exe` installer.

## Installation and integration

- Install as a standard user; confirm the Start menu entry and app icon.
- On a VM without WebView2, test the online installer with internet access.
- On a separate VM without WebView2 or internet, test the offline installer.
- Set Mark_md as the `.md` / `.markdown` default using Windows Settings or Open with.
- With the app closed, double-click a document and confirm its contents appear.
- With the app running or minimized, open a second document; confirm it appears
  in the existing window, the window is restored, and no extra app window remains.
- Launch from a terminal with a relative file path containing spaces; verify it
  resolves against the launching terminal's directory, including second launches.

## Document fixtures

- Open `C:\Users\사용자\문서 #1%\예산안.Md` with Korean text, CRLF line endings and
  UTF-8 with/without a BOM. Confirm readable contents and a filename-only title.
- Place `images\그림 1.png` beside the document and reference it with
  `![그림](images/그림%201.png)`. Confirm the image loads in the preview.
- Repeat using a network share `\\server\share\문서\자료.md`, if available.
- Open a large converted document with merged HTML table cells and many images.
  Verify table scrolling, search, rendering and responsiveness.

## Saving and UI

- Import a document using the app's native picker; edit, wait for Saved, and
  verify the source file using another editor. Reopen the app and check contents.
- Make the file read-only; verify edits show Save failed and a visible message.
  Restore write permission and verify a subsequent save succeeds.
- Export a new document as MD and then edit it; verify subsequent changes go to
  that file. Cancel a Save dialog and confirm no file or document change occurs.
- Export PDF and DOCX to a Korean path. Open each in its usual Windows application
  and verify the output. Cancel each export dialog as well.
- Check Korean IME composition, copy/paste, light/dark themes and 100/150/200% scaling.
- Upgrade using a later version and confirm the document library is retained.
- Uninstall and verify application shortcuts and app registration are removed;
  user-created Markdown documents must remain untouched.

## macOS regression

- Build the Apple Silicon app and run `npm run test:webkit`.
- Verify Finder first/second opens, Import, relative images, autosave and all three
  export formats, including cancelling the native dialogs.

## Distribution

- For external distribution, configure signing credentials and check signature
  validity. Verify actual behavior under the intended Windows security settings;
  a successful unsigned build is not proof that those machines will allow it.
