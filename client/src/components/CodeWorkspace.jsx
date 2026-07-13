/**
 * ---------------------------------------------------------
 * Component: CodeWorkspace
 * ---------------------------------------------------------
 *
 * Purpose:
 *   Represents the primary workspace area containing a directory file browser tree,
 *   a code viewer using Monaco Editor, and a retractable AI-driven file explanation drawer.
 *
 * Responsibilities:
 * - Displays files grouped by top-level directories in an interactive browser tree.
 * - Searches/filters files inside the tree dynamically using query inputs.
 * - Restores the last active file path selection on a per-repository basis.
 * - Listens for external navigation events emitted by the search drawer, automatically opening target lines.
 * - Feches, parses, and overlays AI code summaries and symbol declarations.
 *
 * Props:
 * - repository: The active repository metadata and parsed file structure list.
 *
 * State:
 * - selectedPath (string | null): The file path of the currently opened source file.
 * - showFiles (boolean): Collapses or expands the sidebar directory tree view.
 * - filter (string): Controlled input string filtering the file browser.
 * - targetLine (number | null): The line number requested to highlight and scroll to inside Monaco.
 * - explainPanel (object | null): Contains the AI summary response payload { purpose, symbols }.
 * - isExplaining (boolean): Tracks loading spinners during file explanation requests.
 *
 * Lifecycle / Hooks:
 * 1. useEffect (sync selection memory): Keeps the global `repoFileMemory` map in sync when selectedPath changes.
 * 2. useEffect (repo change): Restores the file selection state belonging to the newly loaded repository.
 * 3. useEffect (navigate event listener): Subscribes to custom sibling communication events to snap browser tabs.
 * 4. useMemo (selected file): Evaluates the active file object to prevent duplicate loop lookups.
 * 5. useMemo (filter files): Filters files list by matching strings.
 * 6. useMemo (group files): Groups files under common top-level directory names.
 *
 * Related Files:
 * - client/src/components/SearchPanel.jsx (Emits NAVIGATE_TO_FILE_EVENT custom DOM events)
 * - client/src/lib/api.js (explainFile endpoints)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  FileCode2, ChevronLeft, ChevronRight,
  Folder, AlertTriangle, Loader2, FileText,
  Info, X
} from "lucide-react";
import { explainFile } from "../lib/api";
import { NAVIGATE_TO_FILE_EVENT } from "./SearchPanel";

// Maps codebase extensions to specific glow colors
const LANG_COLOR = {
  TypeScript: "#43d9ff",
  JavaScript: "#f7c45f",
  Python:     "#62f5c6",
  Java:       "#f87171",
  "C++":      "#8b73ff",
  Config:     "#94a3b8",
};

/**
 * =============================================================================
 * REACT CONCEPT: Scope & Session Memory Map
 * =============================================================================
 * Why define `repoFileMemory` outside the component?
 *   Variables declared inside a React component function are redeclared on every
 *   re-render. React state hooks persist data across renders, but clear when the
 *   component unmounts. By declaring this JavaScript Map outside the component,
 *   we create a persistent memory cache that survives the component unmounting
 *   (e.g., when the user switches to the MiniGPT Lab view and back).
 */
const repoFileMemory = new Map();

export function CodeWorkspace({ repository }) {
  const files = repository.analysis?.files ?? [];

  // Restore last selected file for this repository on mount
  const [selectedPath, setSelectedPath] = useState(
    () => repoFileMemory.get(repository._id) ?? null
  );
  const [showFiles, setShowFiles] = useState(true);
  const [filter, setFilter] = useState("");
  // Target line to scroll/highlight in Monaco (emitted from Search Panel results)
  const [targetLine, setTargetLine] = useState(null);
  // Retrieves AI file analysis explain summaries
  const [explainPanel, setExplainPanel] = useState(null);
  const [isExplaining, setIsExplaining] = useState(false);

  // Sync selection memory when selectedPath changes
  useEffect(() => {
    if (selectedPath) repoFileMemory.set(repository._id, selectedPath);
  }, [selectedPath, repository._id]);

  // Reset selection memory when repository changes but keep other repo memories
  useEffect(() => {
    setSelectedPath(repoFileMemory.get(repository._id) ?? null);
    setFilter("");
    setExplainPanel(null);
  }, [repository._id]);

  /**
   * =============================================================================
   * REACT CONCEPT: Sibling Communication via Custom DOM Events
   * =============================================================================
   * Why?
   *   React usually communicates data downwards using props, or globally using Context/Redux.
   *   However, SearchPanel and CodeWorkspace are siblings. Lifting state up to App.jsx
   *   is an option, but would trigger full-app renders on typing. Instead, we use
   *   a native CustomEvent emitter. When a search card is clicked, we dispatch a
   *   CustomEvent which this hook intercepts, setting the selected tab and scrolling Monaco.
   *
   * Cleanup (Unmounting):
   *   Returning a function inside useEffect registers a cleanup callback. React executes
   *   this when the component unmounts to remove the listener, preventing memory leaks.
   *
   * References:
   * - https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent
   * - https://react.dev/reference/react/useEffect#connecting-to-an-external-system
   */
  useEffect(() => {
    const handler = (e) => {
      const { filePath, line } = e.detail;
      setSelectedPath(filePath);
      repoFileMemory.set(repository._id, filePath);
      setTargetLine(line);
      setExplainPanel(null);
    };
    window.addEventListener(NAVIGATE_TO_FILE_EVENT, handler);
    return () => window.removeEventListener(NAVIGATE_TO_FILE_EVENT, handler);
  }, [repository._id]);

  /**
   * =============================================================================
   * REACT CONCEPT: useMemo (Optimization)
   * =============================================================================
   * Definition:
   *   Caches the computed result of a function across renders, recalculating only
   *   if values in the dependency array change.
   *
   * Why it is used here:
   *   Grouping and filtering array lists are heavy calculations. Since this
   *   workspace re-renders during AI typing, executing array filters on every render
   *   degrades typing speeds. useMemo ensures grouping computations only run when
   *   `files` or `filter` properties actually change.
   *
   * References:
   * - https://react.dev/reference/react/useMemo
   */
  const selected = useMemo(
    () => files.find((f) => f.path === selectedPath) ?? files[0],
    [files, selectedPath]
  );

  // Memoized client filter matches
  const filtered = useMemo(() => {
    if (!filter.trim()) return files;
    const q = filter.toLowerCase();
    return files.filter((f) => f.path.toLowerCase().includes(q));
  }, [files, filter]);

  // Memoized top-level directory grouping
  const grouped = useMemo(() => {
    const groups = new Map();
    for (const file of filtered) {
      const parts = file.path.split("/");
      const dir = parts.length > 1 ? parts[0] : "";
      if (!groups.has(dir)) groups.set(dir, []);
      groups.get(dir).push(file);
    }
    return groups;
  }, [filtered]);

  const sidebarWidth = showFiles ? "240px" : "0px";

  // Requests AI explanations for the active file using api.js
  const handleExplainFile = async () => {
    if (!selected || !repository._id) return;
    setIsExplaining(true);
    setExplainPanel(null);
    try {
      const result = await explainFile(repository._id, selected.path);
      setExplainPanel({ purpose: result.purpose, symbols: result.symbols });
    } catch {
      setExplainPanel({ purpose: "Failed to load explanation.", symbols: [] });
    } finally {
      setIsExplaining(false);
    }
  };

  return (
    <div className="h-full min-h-0 flex" style={{ overflow: "hidden" }}>
      {/* ── File Tree sidebar panel ── */}
      <div
        className="flex-shrink-0 flex flex-col overflow-hidden transition-all duration-200"
        style={{
          width: sidebarWidth,
          borderRight: "1px solid rgba(29,42,66,0.7)",
          background: "rgba(6,10,18,0.5)",
          opacity: showFiles ? 1 : 0,
          visibility: showFiles ? "visible" : "hidden"
        }}
      >
        {/* Tree header tabs */}
        <div className="flex items-center justify-between px-3 h-10 shrink-0"
          style={{ borderBottom: "1px solid rgba(29,42,66,0.6)" }}>
          <div className="flex items-center gap-1.5">
            <Folder size={13} style={{ color: "#f7c45f" }} />
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#475569" }}>Files</span>
            {files.length > 0 && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(29,42,66,0.5)", color: "#475569" }}>
                {files.length}
              </span>
            )}
          </div>
        </div>

        {/* Filter browser input field (visible only if files count is > 6) */}
        {files.length > 6 && (
          <div className="px-2 py-2 shrink-0" style={{ borderBottom: "1px solid rgba(29,42,66,0.4)" }}>
            <input
              className="w-full h-7 px-2 rounded-md text-[11px] transition-all"
              style={{
                background: "rgba(6,10,18,0.7)",
                border: "1px solid rgba(29,42,66,0.6)",
                color: "#94a3b8",
                outline: "none"
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "rgba(67,217,255,0.3)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "rgba(29,42,66,0.6)"; }}
              placeholder="Filter files…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        )}

        {/* Ingestion progress or error status flags */}
        {repository.status !== "ready" && (
          <div className="mx-2 my-2 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[10px] shrink-0"
            style={repository.status === "failed"
              ? { background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171" }
              : { background: "rgba(247,196,95,0.07)", border: "1px solid rgba(247,196,95,0.2)", color: "#f7c45f" }}>
            {repository.status === "failed" ? (
              <AlertTriangle size={11} className="shrink-0 mt-0.5" />
            ) : (
              <Loader2 size={11} className="shrink-0 mt-0.5 animate-spin" />
            )}
            <span className="leading-relaxed">
              {repository.status === "failed"
                ? (repository.lastError ?? "Ingestion failed")
                : `Repository is ${repository.status}…`}
            </span>
          </div>
        )}

        {/* Directory browser list viewport */}
        <div className="flex-1 overflow-y-auto py-1">
          {files.length === 0 && repository.status === "ready" && (
            <div className="flex flex-col items-center gap-2 py-8 text-center px-3">
              <FileText size={22} style={{ color: "#1d2a42" }} />
              <p className="text-[10px]" style={{ color: "#1d2a42" }}>No source files found</p>
            </div>
          )}

          {/* Directory folders rendering mapping */}
          {Array.from(grouped.entries()).map(([dir, groupFiles]) => (
            <div key={dir}>
              {dir && (
                <div className="flex items-center gap-1 px-3 pt-2 pb-0.5">
                  <Folder size={11} className="shrink-0" style={{ color: "#334155" }} />
                  <span className="text-[10px] font-medium truncate" style={{ color: "#334155" }}>{dir}/</span>
                </div>
              )}
              {groupFiles.map((file) => {
                const isActive = selected?.path === file.path;
                const filename = file.path.split("/").pop() ?? file.path;
                const langColor = LANG_COLOR[file.language] ?? "#64748b";
                const langLabel = file.language === "Config" ? (filename.split(".").pop() ?? "cfg") : file.language.toLowerCase().slice(0, 3);
                return (
                  <button
                    key={file.path}
                    onClick={() => { setSelectedPath(file.path); setTargetLine(null); setExplainPanel(null); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-all duration-100"
                    style={isActive ? {
                      background: "rgba(67,217,255,0.07)",
                      borderLeft: "2px solid rgba(67,217,255,0.5)",
                      color: "#43d9ff"
                    } : {
                      borderLeft: "2px solid transparent",
                      color: "#64748b"
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        e.currentTarget.style.background = "rgba(17,24,41,0.5)";
                        e.currentTarget.style.color = "#94a3b8";
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        e.currentTarget.style.background = "";
                        e.currentTarget.style.color = "#64748b";
                      }
                    }}
                  >
                    <FileCode2 size={12} className="shrink-0" />
                    <span className="truncate text-[11px]">{filename}</span>
                    <span className="ml-auto text-[8px] font-mono shrink-0 px-1 py-0.5 rounded"
                      style={{
                        background: isActive ? "rgba(67,217,255,0.12)" : "rgba(29,42,66,0.4)",
                        color: isActive ? langColor : "#334155"
                      }}>
                      {langLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Monaco Editor Container ── */}
      <div className="flex-1 h-full min-h-0 flex flex-col min-w-0">
        {selected ? (
          <>
            <SourceViewer
              file={selected}
              showFiles={showFiles}
              setShowFiles={setShowFiles}
              targetLine={targetLine}
              onTargetLineConsumed={() => setTargetLine(null)}
              onExplain={handleExplainFile}
              isExplaining={isExplaining}
            />
            {/*Retractable AI Explanation Pane */}
            {explainPanel && (
              <div className="shrink-0 overflow-auto px-4 py-3 space-y-2 text-[11px]"
                style={{ borderTop: "1px solid rgba(29,42,66,0.7)", background: "rgba(7,9,26,0.8)", maxHeight: "220px" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5" style={{ color: "#43d9ff" }}>
                    <Info size={12} />
                    <span className="font-semibold uppercase tracking-widest text-[9px]">File Explanation</span>
                  </div>
                  <button onClick={() => setExplainPanel(null)} style={{ color: "#475569" }}>
                    <X size={12} />
                  </button>
                </div>
                <p className="leading-relaxed" style={{ color: "#94a3b8" }}>{explainPanel.purpose}</p>
                {explainPanel.symbols.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {explainPanel.symbols.slice(0, 10).map((s) => (
                      <span key={`${s.filePath ?? ""}:${s.kind}:${s.name}`} className="px-2 py-0.5 rounded-md text-[9px] font-mono"
                        style={{ background: "rgba(67,217,255,0.08)", border: "1px solid rgba(67,217,255,0.18)", color: "#43d9ff" }}>
                        {s.kind}: {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
            <div className="w-12 h-12 rounded-xl grid place-items-center"
              style={{ background: "rgba(29,42,66,0.3)", color: "#1d2a42" }}>
              <FileCode2 size={22} />
            </div>
            <p className="text-sm" style={{ color: "#334155" }}>
              {repository.status === "ready" ? "Select a file to view its source" : `Repository is ${repository.status}…`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Component: SourceViewer
// =============================================================================
/**
 * Renders the Monaco Editor view, handling dynamic line highlights and scrolling.
 *
 * Props:
 * - file: The active file object containing language, size, and source code content.
 * - showFiles: Sidebar browser display toggle.
 * - setShowFiles: Callback trigger to alter sidebar browser states.
 * - targetLine: Target line to center focus on.
 * - onTargetLineConsumed: Clears targetLine state to avoid refocussing loops.
 * - onExplain: Triggers file explanation queries.
 * - isExplaining: Loading state flag.
 */
function SourceViewer({
  file,
  showFiles,
  setShowFiles,
  targetLine,
  onTargetLineConsumed,
  onExplain,
  isExplaining,
}) {
  const filename = file.path.split("/").pop() ?? file.path;
  const langColor = LANG_COLOR[file.language] ?? "#64748b";
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  /**
   * Triggers scroll animations and injects decorative line highlights in Monaco.
   *
   * Dependencies:
   *   Runs when targetLine updates (i.e. clicked card inside semantic search results).
   */
  useEffect(() => {
    if (targetLine && editorRef.current && monacoRef.current) {
      const ed = editorRef.current;
      const monaco = monacoRef.current;

      // Programmatically center target line inside editor window viewports
      ed.revealLineInCenter(targetLine);

      // Create editor CSS decoration overlays
      const decorations = ed.createDecorationsCollection([{
        range: new monaco.Range(targetLine, 1, targetLine, 1),
        options: {
          isWholeLine: true,
          className: "search-highlight-line",
          glyphMarginClassName: "search-highlight-glyph",
          overviewRuler: { color: "#43d9ff", position: 1 }
        }
      }]);

      // Clear decorations after 3000ms
      const timer = setTimeout(() => {
        decorations.clear();
        onTargetLineConsumed();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [targetLine, onTargetLineConsumed]);

  return (
    <div className="grid h-full flex-1 min-h-0" style={{ gridTemplateRows: "40px minmax(0,1fr)" }}>
      {/* Editor tab navigation bar */}
      <div className="flex items-center gap-2 px-3 shrink-0"
        style={{ borderBottom: "1px solid rgba(29,42,66,0.6)", background: "rgba(7,9,26,0.5)" }}>
        <button
          onClick={() => setShowFiles(!showFiles)}
          className="p-1 rounded-md transition shrink-0"
          style={{ color: "#334155" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(29,42,66,0.5)"; e.currentTarget.style.color = "#94a3b8"; }}
          onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "#334155"; }}
          title={showFiles ? "Hide file tree" : "Show file tree"}
        >
          {showFiles ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Tab display */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] max-w-[300px]"
          style={{ background: "rgba(17,24,41,0.8)", border: "1px solid rgba(29,42,66,0.7)", color: "#94a3b8" }}>
          <FileCode2 size={11} className="shrink-0" style={{ color: "#43d9ff" }} />
          <span className="truncate font-mono">{filename}</span>
        </div>

        {/* Language, size, and AI explain button metadata */}
        <div className="flex items-center gap-2 ml-auto text-[10px] font-mono" style={{ color: "#334155" }}>
          <span style={{ color: langColor }}>{file.language}</span>
          {file.size > 0 && (
            <span>{(file.size / 1024).toFixed(1)}kb</span>
          )}
          {/* AI explain file trigger button */}
          <button
            onClick={onExplain}
            disabled={isExplaining}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] transition-all"
            style={{
              background: isExplaining ? "rgba(29,42,66,0.3)" : "rgba(67,217,255,0.08)",
              border: "1px solid rgba(67,217,255,0.2)",
              color: isExplaining ? "#475569" : "#43d9ff",
              cursor: isExplaining ? "not-allowed" : "pointer"
            }}
            title="Explain this file"
          >
            {isExplaining ? <Loader2 size={9} className="animate-spin" /> : <Info size={9} />}
            {isExplaining ? "Loading…" : "Explain"}
          </button>
        </div>
      </div>

      {/* Monaco React Editor Component */}
      <Editor
        theme="vs-dark"
        language={languageId(file.language)}
        value={file.content ?? "// No content available"}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          monacoRef.current = monaco;
          
          // Inject custom CSS styling for lines highlight once into the document head
          const STYLE_ID = "codeinsight-search-highlight";
          if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement("style");
            style.id = STYLE_ID;
            style.textContent = `.search-highlight-line { background: rgba(67,217,255,0.08) !important; }`;
            document.head.appendChild(style);
          }
        }}
        options={{
          readOnly: true,
          minimap: { enabled: true, scale: 1 },
          fontSize: 12.5,
          lineHeight: 1.8,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          wordWrap: "on",
          scrollBeyondLastLine: false,
          renderLineHighlight: "line",
          smoothScrolling: true,
          cursorBlinking: "smooth",
          padding: { top: 14, bottom: 14 },
          lineNumbers: "on",
          folding: true,
          bracketPairColorization: { enabled: true },
        }}
      />
    </div>
  );
}

// Maps file.language fields to Monaco editor identifier strings
function languageId(language) {
  const map = {
    JavaScript: "javascript",
    TypeScript: "typescript",
    Python: "python",
    Java: "java",
    "C++": "cpp",
    Config: "json",
  };
  return map[language] ?? "plaintext";
}
