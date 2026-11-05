# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server on http://localhost:3006
npm run build    # Production build
npm run lint     # ESLint
```

Run `npm test`, `npm run lint`, `cargo test --manifest-path src-tauri/Cargo.toml --locked --lib` and the relevant security checks in @SECURITY.md.
Read @SECURITY.md before changing document rendering, storage, native commands or release configuration.

## Architecture

**Mark_md** is a single-page Markdown viewer/editor. The entire application is one large client component at `src/app/page.tsx` — no sub-components, no API routes, no server components beyond the root layout.

State is managed with React hooks. Optional draft retention uses IndexedDB; localStorage is a compatibility fallback:
- `markmd_documents` — array of `MarkdownDocument` objects
- `markmd_theme` — `'dark'` or `'light'`

Markdown parsing runs in a cancellable worker with input/output limits. Only the output of `sanitizeDocumentHtml` may enter the preview or PDF DOM. Native file authority is issued by Rust using session IDs; never restore authority from persisted paths. Remote images and raw document CSS are blocked.

### Theming

Two themes ("Midnight Abyss" dark, "Nordic Frost" light) are driven entirely by CSS custom properties in `globals.css`. Theme is toggled by setting `data-theme="dark"` on `<html>` — Tailwind `dark:` classes also key off this attribute. All color/spacing tokens are `var(--*)` variables; avoid hardcoding colors.

### Styling conventions

Tailwind utility classes are used inline. Custom utilities (`.glass`, `.glass-interactive`, `.glow-spot`, `.animate-fade-in`, `.markdown-preview`) are defined in `globals.css`. The editor uses `--font-mono` (Fira Code); body uses `--font-sans` (Inter); fonts use system fallbacks without remote font loading and are exposed as CSS variables.

### View modes

The header tab bar switches between `'viewer'`, `'editor'`, and `'split'`. The markdown toolbar (bold, italic, headings, lists, code, blockquote, table, task) only renders in `'editor'` and `'split'` modes and calls `insertMarkdown()` which manipulates the textarea via `selectionStart`/`selectionEnd`.
