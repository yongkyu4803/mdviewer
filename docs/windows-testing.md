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
- Confirm `.txt` and source files are not claimed by Mark_md after installation and
  that macOS versions earlier than 14 refuse to launch the bundle.

## Distribution

- For external distribution, configure signing credentials and check signature
  validity. Verify actual behavior under the intended Windows security settings;
  a successful unsigned build is not proof that those machines will allow it.

## Security regression checks (2026-11-05)

- Open/import/save using Korean names, then restart: restored drafts must not gain native file access until reopened with Import.
- Edit the original file with another program while Mark_md is open. Mark_md must show Save failed and preserve the external edit.
- Test NTFS symlink/junction/reparse-point replacement in a disposable fixture directory. Native saves must not redirect to an unapproved target; no other files may be touched.
- Preview and export the harmless event-handler/CSS sample in the security report. No script, global CSS or automatic external-image request may execute.
- Verify local PNG/JPEG/WebP inside the document directory, and rejection of traversal, SVG/GIF, fake images and oversized images.
- Verify local-draft opt-in, full saved-copy deletion, native save-dialog cancellation and read-only files.
- Verify PDF and DOCX exports under WebView2 with CSP enabled. DOCX must not contain javascript/file link relationships.
- Release candidates must pass Authenticode signer and timestamp checks; unsigned-test artifacts are not signed releases.

## Security regression checks (2026-11-05, second review)

- Second launch: opening another document while the app runs must reach the existing window (single-instance plugin, Windows only).
- While a document is open, renaming or deleting its folder is refused by Windows (the app holds the approved directory handle). After closing the document in Mark_md, the folder can be renamed again.
- Export a PDF of at least 100 pages and a DOCX to a Korean path; the save completes without the window freezing (raw IPC body instead of a JSON byte array).
- Type continuously in a document that references many large local images; typing stays responsive and images remain visible.
- Select several files in Import where one exceeds 8 MiB: none open, the message names the failing file, and already open documents keep saving.
- Edit an open document, change the file externally, wait for Save failed, then reopen it: the disk version is shown and the edits remain in a separate `(unsaved edits)` draft.

Record the tested commit, Windows/WebView2 versions and outcomes in [SECURITY.md](../SECURITY.md). Configuration and macOS results do not substitute for this checklist.
