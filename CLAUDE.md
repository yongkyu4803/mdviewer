# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server on http://localhost:3006
npm run build    # Production build
npm run lint     # ESLint
```

No test suite is configured.

## Architecture

**Mark_md** is a single-page Markdown viewer/editor. The entire application is one large client component at `src/app/page.tsx` — no sub-components, no API routes, no server components beyond the root layout.

State is managed with React hooks and persisted to `localStorage`:
- `markmd_documents` — array of `MarkdownDocument` objects
- `markmd_theme` — `'dark'` or `'light'`

Markdown rendering uses `marked` synchronously; the HTML is injected via `dangerouslySetInnerHTML` into a `<div class="markdown-preview">`.

### Theming

Two themes ("Midnight Abyss" dark, "Nordic Frost" light) are driven entirely by CSS custom properties in `globals.css`. Theme is toggled by setting `data-theme="dark"` on `<html>` — Tailwind `dark:` classes also key off this attribute. All color/spacing tokens are `var(--*)` variables; avoid hardcoding colors.

### Styling conventions

Tailwind utility classes are used inline. Custom utilities (`.glass`, `.glass-interactive`, `.glow-spot`, `.animate-fade-in`, `.markdown-preview`) are defined in `globals.css`. The editor uses `--font-mono` (Fira Code); body uses `--font-sans` (Inter); both are loaded via Google Fonts in `globals.css` and exposed as CSS variables (not Next.js font variables, which are only used in `layout.tsx`).

### View modes

The header tab bar switches between `'viewer'`, `'editor'`, and `'split'`. The markdown toolbar (bold, italic, headings, lists, code, blockquote, table, task) only renders in `'editor'` and `'split'` modes and calls `insertMarkdown()` which manipulates the textarea via `selectionStart`/`selectionEnd`.
