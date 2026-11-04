This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## macOS and Windows desktop applications

Mark_md uses the same Next.js/React frontend and Tauri 2 backend on both desktop
platforms. The app bundles the static `out` directory; end users do not need
Node.js or a local server. Installers register `.md` and `.markdown` files so
Finder or Windows Explorer can open documents directly in the viewer.

Build targets are **macOS Apple Silicon** and **Windows 11 x64**. Windows 10,
Windows ARM64, Linux, and Intel Mac are not release test targets yet. Windows
installation and WebView2 checks must pass the [Windows release checklist](docs/windows-testing.md)
before a build is declared verified. Build configuration alone is not a passed
Windows runtime test.

### Development

```bash
npm ci
npm run desktop:dev
```

Install Node.js 22 and Rust stable first. On Windows, also install Microsoft C++
Build Tools with **Desktop development with C++**, a Windows SDK, and WebView2.
On macOS, install the Xcode command-line tools. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

### Create a macOS application bundle

```bash
npm run desktop:build
```

The finished app is at `src-tauri/target/release/bundle/macos/Mark_md.app`.
Move it to `/Applications`, then in Finder use **Open With → Mark_md** on a
Markdown file. Choose **Change All…** there to make it the default app.

### Create a Windows installer

Run on a Windows build machine:

```powershell
npm ci
npm run desktop:build:windows
```

The installer is under `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`
and ends in `-setup.exe`. It installs for the current user, includes Korean and
English installer UI, and downloads WebView2 if it is missing. Right-click a
Markdown document in Explorer and choose **Open with → Mark_md**. Default-app
selection remains the user's choice.

For machines without internet access, build an installer containing WebView2:

```powershell
npm run desktop:build:windows:offline
```

The offline installer uses the same output name and directory, so copy it before
building the other variant. Tauri automatically merges `tauri.windows.conf.json`
for Windows targets; the offline command adds the WebView2 override. The ordinary
`npm run desktop:build` command also uses the current OS's configuration.

### Automated builds

`.github/workflows/desktop.yml` checks lint, JavaScript tests, Rust tests and
formatting, then builds Windows x64 and macOS Apple Silicon. The WebKit parser
test also runs on macOS. It runs on pull requests, pushes to `main`, `v*` tags,
or **Actions → Desktop builds → Run workflow**. Manual runs can select the offline
Windows installer. Download `Mark_md-windows-x64` or `Mark_md-macos-arm64` from the
completed run's artifacts. No public release is published automatically.

### Opening and saving documents

Explorer/Finder opens work both on first launch and when the app is already
running; the existing window is restored and focused. The desktop **Import**
button opens a native file picker and keeps the original document path. Edits
are saved to the original file after a short pause. A failed disk write is shown
in the save status and a notification. Wait for **Saved** before closing the app.
Plain `.txt` imports remain editable copies and never overwrite the source text file.

Exporting a new Markdown document opens the native Save dialog and associates
the document with that file for subsequent saves. PDF and DOCX exports also use
the native Save dialog. Cancelling a dialog leaves the document unchanged.
The web version retains browser file uploads and downloads.

HTML tables in converted documents retain merged cells (`rowspan`/`colspan`)
and scroll horizontally within the preview. Large documents skip layout for
offscreen sections and load images lazily. The library uses IndexedDB and
automatically migrates older localStorage drafts, avoiding localStorage's small
size limit.

When a document is opened from Finder, Explorer, or the desktop file picker, relative images are resolved from its
folder, including URL-encoded Korean filenames. Keep the exported `images`
folder alongside the Markdown file. Asset access is granted only to folders of
opened documents. Browser imports display the text and tables; browsers cannot
access neighboring image files from a single-file upload.

The parser uses anchored matching to avoid a JavaScriptCore regex slowdown on
large documents. Run `npm test` for parsing regressions and `npm run test:webkit`
on macOS for an output and performance check in JavaScriptCore. You can also
pass a real document: `npm run test:webkit -- /path/to/document.md`.

Local and CI builds have no distribution signing credentials configured. Windows
code signing and Apple Developer signing/notarization must be configured before
a signed release. Signing does not guarantee that a new Windows build has enough
SmartScreen reputation to avoid a warning. See [Windows signing](https://v2.tauri.app/distribute/sign/windows/)
and [macOS signing](https://v2.tauri.app/distribute/sign/macos/).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3006](http://localhost:3006) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
