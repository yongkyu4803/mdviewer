'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  Sun, 
  Moon, 
  Eye, 
  Edit3, 
  Columns, 
  HelpCircle, 
  CheckSquare, 
  Bold, 
  Italic, 
  Heading1, 
  Heading2, 
  List, 
  ListOrdered, 
  Code, 
  Quote, 
  Table, 
  ChevronLeft, 
  ChevronRight,
  BookOpen,
  Info,
  Clock,
  Sparkles,
  FileDown,
  FileType,
  FileType2,
  ChevronDown,
  Loader2
} from 'lucide-react';
import { exportMarkdownToPdf, exportMarkdownToDocx } from '@/lib/markdownExport';
import {
  getStartupMarkdownPaths,
  isDesktopApp,
  onMarkdownOpened,
  readMarkdownPath,
  writeMarkdownPath,
} from '@/lib/desktop';

interface MarkdownDocument {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  desktopFilePath?: string;
}

const DEFAULT_DOCUMENTS: MarkdownDocument[] = [
  {
    id: 'welcome',
    title: 'Welcome.md',
    content: `# ✨ Welcome to Mark_md!

Your ultra-modern, high-performance, and beautifully designed **Markdown Viewer & Editor**. 

This application has been crafted to provide a premium writing and reading experience. 

---

## 🚀 Key Features

- [x] **Dynamic Dual Views**: Seamlessly switch between **Viewer**, **Editor**, and **Split-Screen** modes.
- [x] **File Manager**: Create, rename, delete, and manage multiple markdown notes.
- [x] **LocalStorage Auto-Save**: Your drafts are safely stored locally in your browser.
- [x] **Markdown Formatting Helper**: Use the interactive toolbar to insert tags instantly.
- [x] **Import & Export**: Easily import local \`.md\` files or export your work to your computer.
- [x] **Premium Design Themes**: Toggle between **Midnight Abyss** (dark mode) and **Nordic Frost** (light mode).

---

## 🎨 Markdown Formatting Showcase

### Typography
You can use standard Markdown formatting like **bold text**, *italicized text*, or even ***bold-italic text***. You can also represent ~~strikethrough text~~ easily!

### Blockquotes
> "Writing is the painting of the voice."
> — *Voltaire*
> 
> Blockquotes are styled with a sleek gradient border to complement your content.

### Code Highlighting
Here is some inline code: \`const app = next();\`. And here is a syntax-highlighted code block:

\`\`\`javascript
// A simple React Markdown renderer helper
import { marked } from 'marked';

function renderMarkdown(content) {
  const parsedHtml = marked.parse(content);
  return { __html: parsedHtml };
}
\`\`\`

### Premium Custom Tables
We have custom-designed table aesthetics:

| Feature | Mark_md | Basic Editors |
| :--- | :---: | :---: |
| Dynamic Live Split | Yes | No |
| Ambient Themes | Yes | No |
| Auto-save | Yes | No |
| Ultra-smooth Animations | Yes | No |

---

## 💡 Pro Tips

1. Click on **Split-Screen** in the header to see your updates render in real-time as you write!
2. Use the **Cheatsheet** button \`( ? )\` in the top-right whenever you forget any Markdown syntax.
3. Your document auto-saves instantly every time you type!

*Start editing this document by clicking on the **Editor** tab above, or create a brand-new draft using the **New Document** button in the sidebar!*`,
    updatedAt: new Date().toLocaleDateString(),
  },
  {
    id: 'cheatsheet',
    title: 'Markdown Cheatsheet.md',
    content: `# 📝 Markdown Reference Guide

Here is a quick cheat sheet for Markdown syntax to help you write stunning documents.

### Headers
\`# Header 1\`
\`## Header 2\`
\`### Header 3\`

### Emphasis
*   Bold: \`**text**\` or \`__text__\`
*   Italic: \`*text*\` or \`_text_\`
*   Strikethrough: \`~~text~~\`

### Lists
**Unordered List:**
\`\`\`markdown
* Item 1
* Item 2
  * Sub-item 2a
\`\`\`

**Ordered List:**
\`\`\`markdown
1. First item
2. Second item
3. Third item
\`\`\`

**Task List:**
\`\`\`markdown
- [x] Completed task
- [ ] Incomplete task
\`\`\`

### Links & Images
*   Link: \`[Link Text](https://example.com)\`
*   Image: \`![Alt Text](https://example.com/image.png)\`

### Blockquotes
\`\`\`markdown
> This is a blockquote.
> It can span multiple lines.
\`\`\`

### Code Blocks
**Inline Code:** \` \`const x = 5;\` \`

**Block Code:**
\\\`\\\`\\\`javascript
function greet() {
  console.log("Hello, world!");
}
\\\`\\\`\\\`
`,
    updatedAt: new Date().toLocaleDateString(),
  }
];

export default function Home() {
  const [documents, setDocuments] = useState<MarkdownDocument[]>([]);
  const [activeDocId, setActiveDocId] = useState<string>('welcome');
  const [viewMode, setViewMode] = useState<'viewer' | 'editor' | 'split'>('viewer');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [exportMenu, setExportMenu] = useState<'sidebar' | 'header' | null>(null);
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'docx' | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sidebarExportRef = useRef<HTMLDivElement>(null);
  const headerExportRef = useRef<HTMLDivElement>(null);
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const openDesktopPaths = useCallback(async (paths: string[]) => {
    for (const path of paths) {
      try {
        const content = await readMarkdownPath(path);
        const title = path.split('/').pop() || 'Untitled.md';
        const document: MarkdownDocument = {
          id: `file:${path}`,
          title,
          content,
          updatedAt: new Date().toLocaleDateString(),
          desktopFilePath: path,
        };
        setDocuments((current) => [
          document,
          ...current.filter((item) => item.id !== document.id),
        ]);
        setActiveDocId(document.id);
        setViewMode('viewer');
      } catch (error) {
        console.error(`Could not open ${path}:`, error);
      }
    }
  }, []);

  // Initialize documents from LocalStorage or use defaults
  useEffect(() => {
    const savedDocs = localStorage.getItem('markmd_documents');
    const savedTheme = localStorage.getItem('markmd_theme') as 'dark' | 'light';
    
    if (savedDocs) {
      try {
        const parsed = JSON.parse(savedDocs);
        if (parsed.length > 0) {
          setDocuments(parsed);
          setActiveDocId(parsed[0].id);
        } else {
          setDocuments(DEFAULT_DOCUMENTS);
          localStorage.setItem('markmd_documents', JSON.stringify(DEFAULT_DOCUMENTS));
        }
      } catch (e) {
        setDocuments(DEFAULT_DOCUMENTS);
      }
    } else {
      setDocuments(DEFAULT_DOCUMENTS);
      localStorage.setItem('markmd_documents', JSON.stringify(DEFAULT_DOCUMENTS));
    }

    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      setTheme('light');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, []);

  // macOS passes files opened from Finder to Tauri. This also receives files
  // while the application is already running.
  useEffect(() => {
    if (!isDesktopApp()) return;

    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await onMarkdownOpened(openDesktopPaths);
      const startupPaths = await getStartupMarkdownPaths();
      await openDesktopPaths(startupPaths);
    })();

    return () => unlisten?.();
  }, [openDesktopPaths]);

  // Close the export format menu when clicking outside of it
  useEffect(() => {
    if (!exportMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const ref = exportMenu === 'sidebar' ? sidebarExportRef : headerExportRef;
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setExportMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportMenu]);

  // Sync theme changes with DOM
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('markmd_theme', nextTheme);
  };

  // Find the active document
  const activeDoc = useMemo(() => {
    return documents.find(doc => doc.id === activeDocId) || documents[0] || null;
  }, [documents, activeDocId]);

  // Compute live HTML from markdown safely
  const renderedHtml = useMemo(() => {
    if (!activeDoc) return '';
    try {
      // marked parses synchronous and yields raw HTML string
      return DOMPurify.sanitize(marked.parse(activeDoc.content) as string);
    } catch (e) {
      return '<p style="color:red;">Error parsing Markdown content.</p>';
    }
  }, [activeDoc?.content]);

  // Document metadata calculations
  const stats = useMemo(() => {
    if (!activeDoc) return { words: 0, characters: 0, readTime: 0 };
    const text = activeDoc.content.trim();
    const words = text === '' ? 0 : text.split(/\s+/).length;
    const characters = text.length;
    const readTime = Math.max(1, Math.ceil(words / 200)); // Estimated 200 WPM
    return { words, characters, readTime };
  }, [activeDoc?.content]);

  // Save active document state on change
  const updateActiveDocContent = (newContent: string) => {
    if (!activeDoc) return;
    const updated = documents.map(doc => {
      if (doc.id === activeDocId) {
        return {
          ...doc,
          content: newContent,
          updatedAt: new Date().toLocaleDateString()
        };
      }
      return doc;
    });
    setDocuments(updated);
    localStorage.setItem('markmd_documents', JSON.stringify(updated));
    if (activeDoc.desktopFilePath) {
      const existingTimer = saveTimersRef.current.get(activeDoc.desktopFilePath);
      if (existingTimer) clearTimeout(existingTimer);
      saveTimersRef.current.set(activeDoc.desktopFilePath, setTimeout(() => {
        void writeMarkdownPath(activeDoc.desktopFilePath!, newContent).catch((error) => {
          console.error('Could not save Markdown file:', error);
        });
      }, 400));
    }
  };

  const updateActiveDocTitle = (newTitle: string) => {
    if (!activeDoc) return;
    const updated = documents.map(doc => {
      if (doc.id === activeDocId) {
        return {
          ...doc,
          title: newTitle.endsWith('.md') ? newTitle : `${newTitle}.md`,
          updatedAt: new Date().toLocaleDateString()
        };
      }
      return doc;
    });
    setDocuments(updated);
    localStorage.setItem('markmd_documents', JSON.stringify(updated));
  };

  // Document Action Helpers
  const createNewDoc = () => {
    const newDoc: MarkdownDocument = {
      id: `doc_${Date.now()}`,
      title: `Untitled_${documents.length + 1}.md`,
      content: `# Untitled Document\n\nStart writing your markdown here...`,
      updatedAt: new Date().toLocaleDateString()
    };
    const updated = [newDoc, ...documents];
    setDocuments(updated);
    setActiveDocId(newDoc.id);
    setViewMode('editor'); // transition to editor for immediate writing
    localStorage.setItem('markmd_documents', JSON.stringify(updated));
  };

  const deleteDoc = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (documents.length <= 1) {
      alert("At least one document must remain in your library.");
      return;
    }
    if (confirm("Are you sure you want to delete this document?")) {
      const updated = documents.filter(doc => doc.id !== id);
      setDocuments(updated);
      if (activeDocId === id) {
        setActiveDocId(updated[0].id);
      }
      localStorage.setItem('markmd_documents', JSON.stringify(updated));
    }
  };

  const exportDoc = async () => {
    if (!activeDoc) return;
    if (activeDoc.desktopFilePath && isDesktopApp()) {
      try {
        await writeMarkdownPath(activeDoc.desktopFilePath, activeDoc.content);
      } catch (error) {
        console.error('Could not save Markdown file:', error);
        alert('Could not save the Markdown file.');
      }
      return;
    }
    const blob = new Blob([activeDoc.content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', activeDoc.title);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = async (format: 'md' | 'pdf' | 'docx') => {
    setExportMenu(null);
    if (!activeDoc) return;

    if (format === 'md') {
      await exportDoc();
      return;
    }

    setExportingFormat(format);
    try {
      if (format === 'pdf') {
        exportMarkdownToPdf(activeDoc.title, activeDoc.content);
      } else {
        await exportMarkdownToDocx(activeDoc.title, activeDoc.content);
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Something went wrong while exporting. Please try again.');
    } finally {
      setExportingFormat(null);
    }
  };

  const importDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const newDoc: MarkdownDocument = {
        id: `doc_${Date.now()}`,
        title: file.name.endsWith('.md') ? file.name : `${file.name}.md`,
        content: content,
        updatedAt: new Date().toLocaleDateString()
      };
      const updated = [newDoc, ...documents];
      setDocuments(updated);
      setActiveDocId(newDoc.id);
      localStorage.setItem('markmd_documents', JSON.stringify(updated));
    };
    reader.readAsText(file);
    // Reset file input value
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Textarea selection formatting logic
  const insertMarkdown = (syntax: string, placeholder = "") => {
    const textarea = textareaRef.current;
    if (!textarea || !activeDoc) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = textarea.value.substring(start, end);
    let replacement = "";

    switch(syntax) {
      case 'bold':
        replacement = `**${selection || placeholder || 'bold text'}**`;
        break;
      case 'italic':
        replacement = `*${selection || placeholder || 'italic text'}*`;
        break;
      case 'h1':
        replacement = `\n# ${selection || placeholder || 'Heading 1'}\n`;
        break;
      case 'h2':
        replacement = `\n## ${selection || placeholder || 'Heading 2'}\n`;
        break;
      case 'list':
        replacement = `\n- ${selection || placeholder || 'List item'}`;
        break;
      case 'ordered-list':
        replacement = `\n1. ${selection || placeholder || 'List item'}`;
        break;
      case 'code':
        replacement = `\`${selection || placeholder || 'code'}\``;
        break;
      case 'code-block':
        replacement = `\n\`\`\`javascript\n${selection || placeholder || '// code block'}\n\`\`\`\n`;
        break;
      case 'quote':
        replacement = `\n> ${selection || placeholder || 'Blockquote'}\n`;
        break;
      case 'table':
        replacement = `\n| Header 1 | Header 2 |\n| :--- | :--- |\n| Row 1 | Data 1 |\n| Row 2 | Data 2 |\n`;
        break;
      case 'todo':
        replacement = `\n- [ ] ${selection || placeholder || 'New task'}`;
        break;
      default:
        return;
    }

    const newContent = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    updateActiveDocContent(newContent);

    // Reposition cursor
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + replacement.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 50);
  };

  // Key tracking to support cursor highlighting
  const handleTextareaScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const cursorLine = textarea.value.substring(0, textarea.selectionStart).split('\n').length;
    setActiveLine(cursorLine);
  };

  return (
    <div
      className="flex h-screen w-screen transition-colors duration-300 select-none"
      style={{ backgroundColor: 'var(--bg-app)', padding: '20px' }}
    >
      <div className="flex flex-1 overflow-hidden relative rounded-xl" style={{ border: '1px solid var(--border-color)', boxShadow: 'var(--app-shadow-lg)' }}>
      {/* Sidebar Panel */}
      <div 
        className={`h-full flex flex-col z-20 shrink-0 relative transition-all duration-300 ${
          sidebarOpen ? 'w-80 opacity-100 translate-x-0' : 'w-0 opacity-0 -translate-x-full pointer-events-none'
        }`}
        style={{
          borderRight: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-sidebar)',
        }}
      >
        {/* Brand Header */}
        <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--bg-item-active)', border: '1px solid var(--border-color)' }}>
              <Sparkles className="w-[18px] h-[18px]" style={{ color: 'var(--text-primary)' }} />
            </div>
            <div>
              <h1 className="font-bold text-[17px] tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Mark_md
              </h1>
              <p className="text-[11px] font-medium tracking-widest uppercase mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Markdown Workspace
              </p>
            </div>
          </div>
          
          <button 
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg opacity-60 hover:opacity-100 transition-opacity hover:bg-[var(--bg-button-hover)]"
            title="Collapse Sidebar"
          >
            <ChevronLeft className="w-5 h-5" style={{ color: 'var(--text-primary)' }} />
          </button>
        </div>

        {/* Action Panel */}
        <div className="px-5 py-5 flex flex-col gap-2.5">
          <button
            onClick={createNewDoc}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors duration-150"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
            }}
          >
            <Plus className="w-4.5 h-4.5" />
            New Document
          </button>
          
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium hover:bg-[var(--bg-button-hover)] transition-colors duration-150"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-sidebar)' }}
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={importDoc} 
              accept=".md,.txt" 
              className="hidden" 
            />
            
            <div className="relative" ref={sidebarExportRef}>
              <button
                onClick={() => setExportMenu(exportMenu === 'sidebar' ? null : 'sidebar')}
                disabled={exportingFormat !== null}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium hover:bg-[var(--bg-button-hover)] transition-colors duration-150 disabled:opacity-60"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-sidebar)' }}
              >
                {exportingFormat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                Export
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
              {exportMenu === 'sidebar' && (
                <div className="glass animate-fade-in absolute left-0 right-0 top-full mt-1.5 z-20 rounded-lg overflow-hidden">
                  <button
                    onClick={() => handleExport('md')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-[var(--bg-button-hover)] transition-colors duration-150"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <FileText className="w-3.5 h-3.5" /> Markdown (.md)
                  </button>
                  <button
                    onClick={() => handleExport('pdf')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-[var(--bg-button-hover)] transition-colors duration-150"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <FileType className="w-3.5 h-3.5" /> PDF (.pdf)
                  </button>
                  <button
                    onClick={() => handleExport('docx')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-[var(--bg-button-hover)] transition-colors duration-150"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <FileType2 className="w-3.5 h-3.5" /> Word (.docx)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Library Documents List */}
        <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-1">
          <div className="px-3 pt-3 pb-2 text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>
            My Library
          </div>
          {documents.map((doc) => {
            const isActive = doc.id === activeDocId;
            return (
              <div 
                key={doc.id}
                onClick={() => {
                  setActiveDocId(doc.id);
                  // Optionally go to default view when clicking another file
                }}
                className="group flex items-center justify-between px-3 py-3.5 rounded-lg cursor-pointer transition-colors duration-150 border"
                style={{
                  backgroundColor: isActive ? 'var(--bg-item-active)' : 'transparent',
                  borderColor: isActive ? 'var(--border-color)' : 'transparent',
                }}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <FileText
                    className={`w-4 h-4 shrink-0 ${isActive ? 'opacity-100' : 'opacity-40'}`}
                    style={{ color: 'var(--text-primary)' }}
                  />
                  <div className="flex flex-col overflow-hidden">
                    <span 
                      className={`text-sm font-semibold truncate ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
                    >
                      {doc.title}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      Updated {doc.updatedAt}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={(e) => deleteDoc(doc.id, e)}
                  className={`p-1.5 rounded-md hover:bg-[var(--bg-button-hover)] transition-all ${
                    isActive ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
                  }`}
                  style={{ color: 'var(--text-muted)' }}
                  title="Delete Document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Themes and Settings Foot Panel */}
        <div className="px-5 py-4 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent-success)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Saved</span>
          </div>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg border hover:bg-[var(--bg-button-hover)] transition-colors duration-150 flex items-center justify-center"
            style={{ borderColor: 'var(--border-color)' }}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4.5 h-4.5" style={{ color: 'var(--text-primary)' }} />
            ) : (
              <Moon className="w-4.5 h-4.5" style={{ color: 'var(--text-primary)' }} />
            )}
          </button>
        </div>
      </div>

      {/* Main Working Panel */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative z-10">
        
        {/* Main Work Header Toolbar */}
        <header
          className="h-[68px] px-8 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-sidebar)', borderBottomWidth: '1px' }}
        >
          {/* File Metadata & Sidebar Toggler */}
          <div className="flex items-center gap-4 shrink-0 overflow-hidden max-w-[40%]">
            {!sidebarOpen && (
              <button 
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg border hover:bg-[var(--bg-button-hover)] transition-all shrink-0"
                style={{ borderColor: 'var(--border-color)' }}
                title="Expand Sidebar"
              >
                <ChevronRight className="w-4.5 h-4.5" style={{ color: 'var(--text-primary)' }} />
              </button>
            )}
            
            <div className="flex flex-col justify-center min-w-0">
              <input 
                type="text" 
                value={activeDoc?.title.replace(/\.md$/, '') || ''} 
                onChange={(e) => updateActiveDocTitle(e.target.value)}
                placeholder="Rename file..."
                className="text-base font-bold bg-transparent border-b border-transparent hover:border-[var(--border-color)] focus:border-[var(--accent-primary)] focus:outline-none transition-colors py-0.5 truncate select-text w-48"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* View Mode Switching Tabs (Viewer / Editor / Split-Screen) */}
          <div className="flex items-center gap-0.5 p-1 rounded-lg shrink-0" style={{ backgroundColor: 'var(--bg-item-active)', border: '1px solid var(--border-color)' }}>
            {(['viewer', 'editor', 'split'] as const).map((mode) => {
              const icons = { viewer: <Eye className="w-3.5 h-3.5" />, editor: <Edit3 className="w-3.5 h-3.5" />, split: <Columns className="w-3.5 h-3.5" /> };
              const labels = { viewer: 'Viewer', editor: 'Editor', split: 'Split' };
              const isActive = viewMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150"
                  style={{
                    backgroundColor: isActive ? 'var(--bg-sidebar)' : 'transparent',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                    boxShadow: isActive ? 'var(--app-shadow-sm)' : 'none',
                  }}
                >
                  {icons[mode]}
                  {labels[mode]}
                </button>
              );
            })}
          </div>

          {/* Extra utility operations */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setCheatsheetOpen(!cheatsheetOpen)}
              className="p-2 rounded-lg border transition-colors duration-150 flex items-center justify-center"
              style={{
                borderColor: 'var(--border-color)',
                backgroundColor: cheatsheetOpen ? 'var(--bg-item-active)' : 'transparent',
              }}
              title="Markdown Cheatsheet"
            >
              <HelpCircle className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
            </button>

            <div className="relative" ref={headerExportRef}>
              <button
                onClick={() => setExportMenu(exportMenu === 'header' ? null : 'header')}
                disabled={exportingFormat !== null}
                className="py-2 px-3 rounded-lg border hover:bg-[var(--bg-button-hover)] transition-colors duration-150 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
                title="Download File"
              >
                {exportingFormat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span className="hidden md:inline">Export</span>
                <ChevronDown className="w-3 h-3 opacity-60 hidden md:inline" />
              </button>
              {exportMenu === 'header' && (
                <div className="glass animate-fade-in absolute right-0 top-full mt-1.5 z-20 rounded-lg overflow-hidden w-44">
                  <button
                    onClick={() => handleExport('md')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-[var(--bg-button-hover)] transition-colors duration-150"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <FileText className="w-3.5 h-3.5" /> Markdown (.md)
                  </button>
                  <button
                    onClick={() => handleExport('pdf')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-[var(--bg-button-hover)] transition-colors duration-150"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <FileType className="w-3.5 h-3.5" /> PDF (.pdf)
                  </button>
                  <button
                    onClick={() => handleExport('docx')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-[var(--bg-button-hover)] transition-colors duration-150"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <FileType2 className="w-3.5 h-3.5" /> Word (.docx)
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Markdown Toolbar Insertion Panel (Only shown in editor or split mode) */}
        {(viewMode === 'editor' || viewMode === 'split') && (
          <div
            className="h-12 px-8 border-b flex items-center gap-0.5 shrink-0 overflow-x-auto relative select-none"
            style={{
              borderColor: 'var(--border-color)',
              backgroundColor: 'var(--bg-editor)',
            }}
          >
            <button onClick={() => insertMarkdown('bold')} className="p-1.5 rounded hover:bg-[var(--bg-button-hover)]" title="Bold"><Bold className="w-4 h-4" /></button>
            <button onClick={() => insertMarkdown('italic')} className="p-1.5 rounded hover:bg-[var(--bg-button-hover)]" title="Italic"><Italic className="w-4 h-4" /></button>
            <button onClick={() => insertMarkdown('h1')} className="p-1.5 rounded hover:bg-[var(--bg-button-hover)]" title="Heading 1"><Heading1 className="w-4 h-4" /></button>
            <button onClick={() => insertMarkdown('h2')} className="p-1.5 rounded hover:bg-[var(--bg-button-hover)]" title="Heading 2"><Heading2 className="w-4 h-4" /></button>
            <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--border-color)' }} />
            
            <button onClick={() => insertMarkdown('list')} className="p-1.5 rounded hover:bg-[var(--bg-button-hover)]" title="Unordered List"><List className="w-4 h-4" /></button>
            <button onClick={() => insertMarkdown('ordered-list')} className="p-1.5 rounded hover:bg-[var(--bg-button-hover)]" title="Ordered List"><ListOrdered className="w-4 h-4" /></button>
            <button onClick={() => insertMarkdown('todo')} className="p-1.5 rounded hover:bg-[var(--bg-button-hover)]" title="Task List"><CheckSquare className="w-4 h-4" /></button>
            <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--border-color)' }} />
            
            <button onClick={() => insertMarkdown('code')} className="p-1.5 rounded hover:bg-[var(--bg-button-hover)]" title="Inline Code"><Code className="w-4 h-4" /></button>
            <button onClick={() => insertMarkdown('code-block')} className="p-1.5 rounded hover:bg-[var(--bg-button-hover)]" title="Code Block"><Quote className="w-4 h-4" /></button> {/* use Lucide quote as standin */}
            <button onClick={() => insertMarkdown('quote')} className="p-1.5 rounded hover:bg-[var(--bg-button-hover)]" title="Blockquote"><Quote className="w-4 h-4" /></button>
            <button onClick={() => insertMarkdown('table')} className="p-1.5 rounded hover:bg-[var(--bg-button-hover)]" title="Table"><Table className="w-4 h-4" /></button>
          </div>
        )}

        {/* Content Panel Body */}
        <div className="flex-1 flex overflow-hidden w-full relative">
          
          {/* EDITOR WORKSPACE */}
          {(viewMode === 'editor' || viewMode === 'split') && (
            <div 
              className="flex-1 h-full overflow-hidden flex relative"
              style={{ backgroundColor: 'var(--bg-editor)' }}
            >
              <textarea 
                ref={textareaRef}
                value={activeDoc?.content || ''} 
                onChange={(e) => updateActiveDocContent(e.target.value)}
                onScroll={handleTextareaScroll}
                onKeyUp={handleTextareaScroll}
                onMouseUp={handleTextareaScroll}
                placeholder="Start writing elegant markdown..."
                className="w-full h-full border-none resize-none focus:outline-none bg-transparent overflow-y-auto select-text leading-relaxed text-[15px] selection:bg-[var(--bg-item-active)]"
                style={{
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  caretColor: 'var(--accent-primary)',
                  padding: '40px 48px',
                  lineHeight: '1.75',
                }}
              />
            </div>
          )}

          {/* VIEW SPLIT DIVIDER LINES */}
          {viewMode === 'split' && (
            <div className="w-px h-full shrink-0" style={{ backgroundColor: 'var(--border-color)' }} />
          )}

          {/* VIEWER PREVIEW WORKSPACE */}
          {(viewMode === 'viewer' || viewMode === 'split') && (
            <div
              className="flex-1 h-full overflow-y-auto animate-fade-in relative"
              style={{ backgroundColor: 'var(--bg-preview)', padding: '48px 56px' }}
            >
              {activeDoc ? (
                <div 
                  className="markdown-preview max-w-3xl mx-auto selection:bg-[var(--bg-item-active)] select-text"
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 opacity-60">
                  <FileText className="w-12 h-12 mb-3" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm font-semibold">No Document Selected</p>
                </div>
              )}
            </div>
          )}

          {/* SIDE CHEATSHEET SLIDEOUT DRAWER */}
          <div 
            className={`absolute top-0 right-0 h-full w-80 z-30 flex flex-col border-l transition-transform duration-300 ${
              cheatsheetOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
            style={{
              borderColor: 'var(--border-color)',
              backgroundColor: 'var(--bg-sidebar)',
              boxShadow: 'var(--app-shadow-lg)',
            }}
          >
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-2 font-bold text-sm">
                <BookOpen className="w-4 h-4 text-[var(--accent-primary)]" />
                Quick Cheatsheet
              </div>
              <button 
                onClick={() => setCheatsheetOpen(false)}
                className="text-xs font-semibold hover:bg-[var(--bg-button-hover)] py-1 px-2 rounded-lg border"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
              >
                Close
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-xs select-text">
              <div>
                <h4 className="font-bold mb-1.5 flex items-center gap-1"><Info className="w-3.5 h-3.5" /> Headers</h4>
                <code className="block p-2 rounded font-mono" style={{ backgroundColor: 'var(--bg-item-active)', color: 'var(--text-secondary)' }}># Heading 1<br/>## Heading 2<br/>### Heading 3</code>
              </div>
              <div>
                <h4 className="font-bold mb-1.5">Emphasis</h4>
                <code className="block p-2 rounded font-mono" style={{ backgroundColor: 'var(--bg-item-active)', color: 'var(--text-secondary)' }}>**Bold text**<br/>*Italic text*<br/>~~Strikethrough~~</code>
              </div>
              <div>
                <h4 className="font-bold mb-1.5">Lists</h4>
                <code className="block p-2 rounded font-mono" style={{ backgroundColor: 'var(--bg-item-active)', color: 'var(--text-secondary)' }}>- Unordered List Item<br/>1. Ordered List Item<br/>- [ ] Task checkbox</code>
              </div>
              <div>
                <h4 className="font-bold mb-1.5">Links & Images</h4>
                <code className="block p-2 rounded font-mono" style={{ backgroundColor: 'var(--bg-item-active)', color: 'var(--text-secondary)' }}>[Link Text](url)<br/>![Image Alt](imgUrl)</code>
              </div>
              <div>
                <h4 className="font-bold mb-1.5">Quotes</h4>
                <code className="block p-2 rounded font-mono" style={{ backgroundColor: 'var(--bg-item-active)', color: 'var(--text-secondary)' }}>&gt; Quotation line 1<br/>&gt; Quotation line 2</code>
              </div>
              <div>
                <h4 className="font-bold mb-1.5">Code Snippets</h4>
                <code className="block p-2 rounded font-mono" style={{ backgroundColor: 'var(--bg-item-active)', color: 'var(--text-secondary)' }}>\`inline code\`</code>
                <code className="block p-2 mt-1 rounded font-mono" style={{ backgroundColor: 'var(--bg-item-active)', color: 'var(--text-secondary)' }}>\\\`\\\`\\\`javascript<br/>// JS Code Block<br/>\\\`\\\`\\\`</code>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Status Metadata Bar */}
        <footer
          className="h-11 px-8 border-t flex items-center justify-between shrink-0 text-[12px] font-medium"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-sidebar)', color: 'var(--text-muted)' }}
        >
          <div className="flex items-center gap-6">
            <span><span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{stats.words}</span> words</span>
            <span><span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{stats.characters}</span> characters</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span><span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{stats.readTime}</span> min read</span>
          </div>
        </footer>

      </div>
      </div>
    </div>
  );
}
