This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## macOS desktop application

Mark_md also runs as a Tauri desktop application. This bundle registers `.md`
and `.markdown` files with macOS, so Finder can open documents directly in the
viewer.

> **Current platform limitation:** The desktop release currently supports
> **macOS on Apple Silicon (M1/M2/M3/M4)** only. Windows, Linux, and Intel Mac
> installers are not published yet. The web version remains available on any
> platform with a supported browser.

### Development

```bash
npm install
npm run desktop:dev
```

### Create an application bundle

```bash
npm run desktop:build
```

The finished app is at `src-tauri/target/release/bundle/macos/Mark_md.app`.
Move it to `/Applications`, then in Finder use **Open With → Mark_md** on a
Markdown file. Choose **Change All…** there to make it the default app.

Finder-opened files are rendered immediately. If Mark_md is already running,
it brings its existing window forward and opens the newly selected document.
Edits to Finder-opened documents are saved back to their original files after a
short pause in typing.

The local build is unsigned. Apple Developer signing and notarization are
needed before distributing it to other Macs without Gatekeeper warnings.

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
