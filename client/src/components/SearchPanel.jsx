/**
 * ---------------------------------------------------------
 * Component: SearchPanel
 * ---------------------------------------------------------
 *
 * Purpose:
 *   Manages the Semantic Search sub-panel interface.
 *   Enables users to ask questions in natural language about the codebase
 *   and displays code snippet results matched by vector similarity.
 *
 * Responsibilities:
 * - Directs semantic queries inputs.
 * - Handles search submissions via TanStack Query mutations.
 * - Renders skeleton placeholders during loading cycles.
 * - Triggers CustomEvent emitters when clicking search results to navigate Monaco.
 * - Disables search capabilities if the repository is not in "ready" status.
 * - Resets query inputs and clears stale search results when the active repository changes.
 *
 * Props:
 * - repository: The active repository database object (indexing statuses and keys).
 *
 * State:
 * - query (string): Controlled input string representing the natural language query.
 *
 * Lifecycle / Hooks:
 * 1. useMutation: Submits semantic queries to the search service, tracking request states.
 * 2. useEffect: Triggers whenever `repository._id` changes to reset the query string.
 *
 * Related Files:
 * - client/src/components/CodeWorkspace.jsx (Subscribes to file navigation events)
 * - client/src/lib/api.js (semanticSearch API calls)
 */

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { SearchCode, FileCode2, SearchX, Loader2, AlertTriangle } from "lucide-react";
import { semanticSearch } from "../lib/api";

// Custom event key string for sibling tab navigations
export const NAVIGATE_TO_FILE_EVENT = "codeinsight:navigate-to-file";

/**
 * Emits a custom DOM event to open a specific file and highlight a target line.
 *
 * Why setTimeout with 0ms?
 *   In Javascript, `setTimeout(fn, 0)` pushes execution of `fn` to the end of the
 *   event loop queue (the next tick). If CodeWorkspace is mounting at the same time
 *   SearchPanel mounts, CodeWorkspace might not have registered its event listener
 *   yet. Deferring the dispatch guarantees the listener is active and captures the event.
 *
 * Inputs:
 * - filePath (string): File to select in browser.
 * - line (number): Target line to scroll to.
 *
 * References:
 * - https://javascript.info/settimeout-setinterval#zero-delay-settimeout
 * - https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/dispatchEvent
 */
export function emitNavigateToFile(filePath, line) {
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent(NAVIGATE_TO_FILE_EVENT, { detail: { filePath, line } }));
  }, 0);
}

export function SearchPanel({ repository }) {
  // Controlled input value
  const [query, setQuery] = useState("Find authentication and API entry points");

  /**
   * Triggers the semantic vector search API.
   *
   * Why a mutation instead of useQuery?
   *   Queries run automatically on render. We only want to trigger search queries
   *   explicitly when the user submits the search form. useMutation provides a
   *   trigger callback `mutate()` that gives us manual execution control.
   */
  const mutation = useMutation({ mutationFn: () => semanticSearch(repository._id, query) });

  // Reset query inputs and clear stale search results when the active repository changes
  useEffect(() => {
    setQuery("Find authentication and API entry points");
  }, [repository._id]);

  // Derived state: Search is disabled unless the repository has finished indexing
  const isReady = repository.status === "ready";

  return (
    <section className="h-full overflow-auto flex flex-col"
      style={{ background: "rgba(7,9,26,0.55)", borderBottom: "1px solid rgba(29,42,66,0.6)" }}>

      {/* ── Search Panel Header ── */}
      <div className="flex items-center justify-between px-4 h-10 shrink-0"
        style={{ borderBottom: "1px solid rgba(29,42,66,0.5)", background: "rgba(6,10,18,0.4)" }}>
        <div className="flex items-center gap-2">
          <SearchCode size={13} style={{ color: "#43d9ff" }} />
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#475569" }}>
            Semantic Search
          </span>
        </div>
        {mutation.data?.results && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(67,217,255,0.08)", color: "#43d9ff", border: "1px solid rgba(67,217,255,0.15)" }}>
            {mutation.data.results.length} results
          </span>
        )}
      </div>

      {/* ── Search Input Row ── */}
      <div className="px-3 py-2.5 shrink-0" style={{ borderBottom: "1px solid rgba(29,42,66,0.4)" }}>
        {/* Warning banner indicating indexing status */}
        {!isReady && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg text-[11px]"
            style={{ background: "rgba(247,196,95,0.07)", border: "1px solid rgba(247,196,95,0.2)", color: "#f7c45f" }}>
            <AlertTriangle size={11} className="shrink-0" />
            <span>Search is available once indexing completes. Repository is <strong>{repository.status}</strong>.</span>
          </div>
        )}
        
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (isReady) mutation.mutate();
          }}
        >
          <input
            className="min-w-0 flex-1 h-9 rounded-lg px-3 text-[12px] transition-all"
            style={{
              background: "rgba(6,10,18,0.7)",
              border: "1px solid rgba(29,42,66,0.7)",
              color: "#e2e8f4",
              outline: "none",
              opacity: !isReady ? 0.5 : 1
            }}
            onFocus={e => { if (isReady) { e.currentTarget.style.borderColor = "rgba(67,217,255,0.35)"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(67,217,255,0.06)"; } }}
            onBlur={e => { e.currentTarget.style.borderColor = "rgba(29,42,66,0.7)"; e.currentTarget.style.boxShadow = ""; }}
            placeholder={isReady ? "Ask a semantic question about the codebase…" : `Repository is ${repository.status}…`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={!isReady}
          />
          <button
            type="submit"
            disabled={mutation.isPending || !query.trim() || !isReady}
            className="text-xs font-semibold px-3 h-9 rounded-lg transition flex items-center gap-1.5 shrink-0"
            style={mutation.isPending || !query.trim() || !isReady ? {
              background: "rgba(29,42,66,0.3)",
              border: "1px solid rgba(29,42,66,0.5)",
              color: "#334155",
              cursor: "not-allowed"
            } : {
              background: "rgba(67,217,255,0.1)",
              border: "1px solid rgba(67,217,255,0.25)",
              color: "#43d9ff",
              cursor: "pointer"
            }}
          >
            {mutation.isPending ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Searching
              </>
            ) : (
              "Run"
            )}
          </button>
        </form>

        {/* Error State Banner */}
        {mutation.isError && (
          <p className="mt-2 text-[11px] px-3 py-2 rounded-lg"
            style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.18)", color: "#f87171" }}>
            Search failed — please try again.
          </p>
        )}
      </div>

      {/* ── Search Results Area ── */}
      <div className="flex-1 overflow-auto px-3 pb-3 pt-2 space-y-2">
        {/* Loading skeletons (displayed during mutation pending states) */}
        {mutation.isPending && (
          <div className="space-y-2 animate-fade-in">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg p-3 space-y-2"
                style={{ border: "1px solid rgba(29,42,66,0.5)", background: "rgba(17,24,41,0.5)" }}>
                <div className="h-2.5 w-2/5 rounded skeleton" />
                <div className="h-2 w-1/6 rounded skeleton" />
                <div className="space-y-1.5 mt-1">
                  <div className="h-2 w-full rounded skeleton" />
                  <div className="h-2 w-11/12 rounded skeleton" />
                  <div className="h-2 w-4/5 rounded skeleton" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Result cards mapping */}
        {!mutation.isPending && mutation.data?.results && mutation.data.results.length > 0 && (
          <div className="space-y-2 animate-fade-in">
            {mutation.data.results.map((result, index) => (
              <button
                key={index}
                className="w-full text-left rounded-lg p-3 space-y-1.5 transition-all duration-150"
                style={{
                  border: "1px solid rgba(29,42,66,0.55)",
                  background: "rgba(17,24,41,0.6)"
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(67,217,255,0.35)"; e.currentTarget.style.background = "rgba(17,24,41,0.8)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(29,42,66,0.55)"; e.currentTarget.style.background = "rgba(17,24,41,0.6)"; }}
                onClick={() => {
                  const fp = String(result.metadata.filePath);
                  const line = Number(result.metadata.startLine) || 1;
                  // Dispatch custom DOM event to open file and scroll Monaco
                  emitNavigateToFile(fp, line);
                }}
                title="Click to open in editor"
              >
                {/* File path + line numbers label */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileCode2 size={11} className="shrink-0" style={{ color: "rgba(67,217,255,0.5)" }} />
                    <span className="font-mono text-[10px] truncate" style={{ color: "#43d9ff" }}>
                      {String(result.metadata.filePath)}
                    </span>
                  </div>
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: "rgba(6,10,18,0.8)", color: "#475569", border: "1px solid rgba(29,42,66,0.5)" }}>
                    {String(result.metadata.startLine)}–{String(result.metadata.endLine)}
                  </span>
                </div>

                {/* Code preview block with gradient bottom fade */}
                <div className="relative">
                  <pre className="code-block max-h-24 overflow-hidden text-[11px] leading-relaxed whitespace-pre-wrap break-all"
                    style={{ color: "#64748b" }}>
                    {result.content}
                  </pre>
                  <div className="absolute bottom-0 left-0 right-0 h-8 rounded-b pointer-events-none"
                    style={{ background: "linear-gradient(to top, rgba(17,24,41,0.9), transparent)" }} />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Empty / Idle state instructions */}
        {!mutation.isPending && !mutation.data && !mutation.isError && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 animate-fade-in">
            <div className="rounded-xl p-4" style={{ background: "rgba(6,10,18,0.5)", border: "1px solid rgba(29,42,66,0.5)" }}>
              <SearchCode size={22} style={{ color: "#1d2a42" }} />
            </div>
            <p className="text-xs text-center max-w-[18rem] leading-relaxed" style={{ color: "#334155" }}>
              {isReady
                ? "Enter a natural-language query to semantically search the codebase."
                : "Waiting for repository to finish indexing…"}
            </p>
          </div>
        )}

        {/* No results match state */}
        {!mutation.isPending && mutation.data?.results?.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 animate-fade-in">
            <div className="rounded-xl p-4" style={{ background: "rgba(6,10,18,0.5)", border: "1px solid rgba(29,42,66,0.5)" }}>
              <SearchX size={22} style={{ color: "#1d2a42" }} />
            </div>
            <p className="text-xs text-center" style={{ color: "#334155" }}>
              No results found for this query.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
