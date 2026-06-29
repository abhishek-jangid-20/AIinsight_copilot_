import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch, LogOut, Search, UploadCloud, Menu,
  Sparkles, GraduationCap, Plus, ChevronRight, AlertCircle,
  Zap, Database, Clock, Layers, X, Layout, Trash2
} from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { AuthPanel } from "./components/AuthPanel";
import { ChatPanel } from "./components/ChatPanel";
import { CodeWorkspace } from "./components/CodeWorkspace";
import { GraphPanel } from "./components/GraphPanel";
import { SearchPanel } from "./components/SearchPanel";
import { MiniGPTLab } from "./components/MiniGPTLab";
import {
  currentUser, deleteRepository, importGithub, listRepositories, setUnauthorizedHandler, uploadZip
} from "./lib/api";
import { signedIn, signedOut, type RootState } from "./app/store";
import type { Repository } from "./types";

// ENH-006: GitHub URL validation pattern
const GITHUB_URL_RE = /^https?:\/\/(?:www\.)?github\.com\/[^/]+\/[^/]+/i;

export function App() {
  const token = useSelector((state: RootState) => state.auth.token);
  const user = useSelector((state: RootState) => state.auth.user);
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<"rag" | "minigpt">("rag");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [githubUrlError, setGithubUrlError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ENH-009: Register auto-logout handler so api.ts can dispatch signedOut on 401
  useEffect(() => {
    setUnauthorizedHandler(() => dispatch(signedOut()));
  }, [dispatch]);

  // BUG-010: currentUser query is only for re-hydrating user on page reload
  // Guard: skip if user is already in Redux state (fresh login — already set by signedIn)
  const currentUserQuery = useQuery({
    queryKey: ["me", token],
    queryFn: currentUser,
    enabled: Boolean(token) && !user,  // BUG-010: only fetch when user is null (page reload)
    retry: false,
  });

  useEffect(() => {
    if (!token) return;
    if (currentUserQuery.data) {
      dispatch(signedIn({ token, user: currentUserQuery.data.user }));
    } else if (currentUserQuery.isError) {
      dispatch(signedOut());
    }
  }, [currentUserQuery.data, currentUserQuery.isError, dispatch, token]);

  // BUG-008: Dynamic refetchInterval — only poll when repos are actively processing
  const repositoriesQuery = useQuery({
    queryKey: ["repositories"],
    queryFn: listRepositories,
    enabled: Boolean(token),
    refetchInterval: (query) => {
      const repos = query.state.data?.repositories ?? [];
      const hasActive = repos.some((r) =>
        r.status === "queued" || r.status === "parsing" || r.status === "embedding"
      );
      return hasActive ? 3000 : false;
    },
    retry: false,
  });

  const repositories = repositoriesQuery.data?.repositories ?? [];
  const selected = repositories.find((r) => r._id === selectedId) ?? repositories[0];

  const githubMutation = useMutation({
    mutationFn: importGithub,
    onSuccess: ({ repository }) => {
      setGithubUrl("");
      setGithubUrlError(null);
      setSelectedId(repository._id);
      void queryClient.invalidateQueries({ queryKey: ["repositories"] });
      // Start polling now that a new repo is being processed
      void queryClient.refetchQueries({ queryKey: ["repositories"] });
    },
  });

  const zipMutation = useMutation({
    mutationFn: (file: File) => uploadZip(file),
    onSuccess: ({ repository }) => {
      setSelectedId(repository._id);
      void queryClient.invalidateQueries({ queryKey: ["repositories"] });
      void queryClient.refetchQueries({ queryKey: ["repositories"] });
    },
  });

  // ENH-001: Delete repository
  async function handleDeleteRepository(repo: Repository, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${repo.name}"? This cannot be undone.`)) return;
    setDeletingId(repo._id);
    try {
      await deleteRepository(repo._id);
      if (selectedId === repo._id) setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ["repositories"] });
    } catch (err) {
      alert(`Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setDeletingId(null);
    }
  }

  if (!token) return <AuthPanel />;

  const isImporting = githubMutation.isPending || zipMutation.isPending;

  // ENH-006: Validate GitHub URL before submitting
  function handleGithubSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = githubUrl.trim();
    if (!url) return;
    if (!GITHUB_URL_RE.test(url)) {
      setGithubUrlError("Please enter a valid GitHub URL (e.g. https://github.com/owner/repo)");
      return;
    }
    setGithubUrlError(null);
    githubMutation.mutate(url);
  }

  return (
    <main className="h-screen flex flex-col overflow-hidden" style={{ background: "linear-gradient(165deg, #060a12 0%, #07091a 35%, #080d1a 60%, #060a14 100%)" }}>
      {/* ── Top Header ── */}
      <header className="flex h-14 shrink-0 items-center justify-between px-4 z-40"
        style={{ background: "rgba(6,10,18,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(29,42,66,0.8)" }}>
        {/* Left: brand */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2 rounded-lg transition-all duration-150"
            style={{ color: "#64748b" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(29,42,66,0.5)"; (e.currentTarget as HTMLButtonElement).style.color = "#e2e8f4"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ""; (e.currentTarget as HTMLButtonElement).style.color = "#64748b"; }}
            title="Toggle Sidebar"
          >
            <Menu size={16} />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg"
              style={{ background: "linear-gradient(135deg, rgba(67,217,255,0.18), rgba(98,245,198,0.08))", border: "1px solid rgba(67,217,255,0.25)", color: "#43d9ff", boxShadow: "0 0 14px rgba(67,217,255,0.12)" }}>
              <GitBranch size={15} />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold tracking-tight text-white">
                CodeInsight <span className="text-gradient">AI</span>
              </h1>
              <p className="text-[10px] leading-none mt-0.5 font-mono" style={{ color: "#334155" }}>repository intelligence</p>
            </div>
          </div>
        </div>

        {/* Center: mode switcher */}
        <div className="hidden md:flex items-center gap-1 p-1 rounded-xl" style={{ background: "rgba(6,10,18,0.9)", border: "1px solid rgba(29,42,66,0.8)" }}>
          <button
            onClick={() => setActiveView("rag")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200"
            style={activeView === "rag" ? {
              background: "rgba(67,217,255,0.12)",
              color: "#43d9ff",
              border: "1px solid rgba(67,217,255,0.25)",
              boxShadow: "0 0 12px rgba(67,217,255,0.08)"
            } : { color: "#475569", border: "1px solid transparent" }}
          >
            <GitBranch size={12} />
            Repository Copilot
          </button>
          <button
            onClick={() => setActiveView("minigpt")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200"
            style={activeView === "minigpt" ? {
              background: "rgba(139,115,255,0.12)",
              color: "#8b73ff",
              border: "1px solid rgba(139,115,255,0.25)"
            } : { color: "#475569", border: "1px solid transparent" }}
          >
            <GraduationCap size={12} />
            MiniGPT Lab
          </button>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {activeView === "rag" && (
            <button
              className="p-1.5 rounded-lg border transition-all duration-150"
              style={showRightPanel
                ? { borderColor: "rgba(29,42,66,0.7)", color: "#475569" }
                : { borderColor: "rgba(67,217,255,0.3)", background: "rgba(67,217,255,0.08)", color: "#43d9ff" }}
              onClick={() => setShowRightPanel(!showRightPanel)}
              title="Toggle Search & Graph panels"
            >
              <Layout size={14} />
            </button>
          )}
          <button
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[11px] transition-all"
            style={{ borderColor: "rgba(29,42,66,0.7)", color: "#475569" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(36,51,82,0.9)"; (e.currentTarget as HTMLButtonElement).style.color = "#e2e8f4"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(29,42,66,0.7)"; (e.currentTarget as HTMLButtonElement).style.color = "#475569"; }}
            onClick={() => dispatch(signedOut())}
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      {activeView === "minigpt" ? (
        <div className="flex-1 overflow-hidden">
          <MiniGPTLab />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* ── Sidebar ── */}
          <AnimatePresence initial={false}>
            {showSidebar && (
              <motion.aside
                key="sidebar"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 272, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                className="flex-shrink-0 flex flex-col overflow-hidden"
                style={{ borderRight: "1px solid rgba(29,42,66,0.7)", background: "rgba(7,9,26,0.6)", backdropFilter: "blur(12px)" }}
              >
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {/* Import GitHub */}
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-semibold uppercase tracking-widest px-1" style={{ color: "#334155" }}>Import repository</p>
                    {/* ENH-006: GitHub URL validated before submit */}
                    <form
                      className="flex gap-1.5"
                      onSubmit={handleGithubSubmit}
                    >
                      <div className="relative flex-1">
                        <GitBranch
                          size={12}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                          style={{ color: "#334155" }}
                        />
                        <input
                          className="w-full h-9 pl-8 pr-3 rounded-lg text-xs transition-all"
                          style={{
                            background: "rgba(6,10,18,0.8)",
                            border: `1px solid ${githubUrlError ? "rgba(248,113,113,0.5)" : "rgba(29,42,66,0.8)"}`,
                            color: "#e2e8f4",
                            outline: "none"
                          }}
                          onFocus={e => { e.currentTarget.style.borderColor = "rgba(67,217,255,0.35)"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(67,217,255,0.08)"; }}
                          onBlur={e => { e.currentTarget.style.borderColor = githubUrlError ? "rgba(248,113,113,0.5)" : "rgba(29,42,66,0.8)"; e.currentTarget.style.boxShadow = ""; }}
                          placeholder="https://github.com/owner/repo"
                          value={githubUrl}
                          onChange={(e) => { setGithubUrl(e.target.value); setGithubUrlError(null); }}
                          disabled={isImporting}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isImporting || !githubUrl.trim()}
                        className="h-9 w-9 grid place-items-center rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: "rgba(67,217,255,0.1)", border: "1px solid rgba(67,217,255,0.25)", color: "#43d9ff" }}
                        title="Import"
                      >
                        {githubMutation.isPending ? (
                          <span className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(67,217,255,0.25)", borderTopColor: "#43d9ff" }} />
                        ) : (
                          <Search size={14} />
                        )}
                      </button>
                    </form>

                    {/* ENH-006: Inline URL validation error */}
                    {githubUrlError && (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px]"
                        style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171" }}>
                        <AlertCircle size={11} className="shrink-0" />
                        <span>{githubUrlError}</span>
                      </div>
                    )}

                    {/* Error from import */}
                    {githubMutation.isError && !githubUrlError && (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px]"
                        style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171" }}>
                        <AlertCircle size={11} className="shrink-0" />
                        <span className="truncate">{(githubMutation.error as Error).message}</span>
                      </div>
                    )}

                    {/* Upload ZIP */}
                    <label className="flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed text-[11px] transition-all group"
                      style={{ borderColor: "rgba(29,42,66,0.7)", color: "#475569" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLLabelElement).style.borderColor = "rgba(98,245,198,0.35)"; (e.currentTarget as HTMLLabelElement).style.color = "#62f5c6"; (e.currentTarget as HTMLLabelElement).style.background = "rgba(98,245,198,0.04)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLLabelElement).style.borderColor = "rgba(29,42,66,0.7)"; (e.currentTarget as HTMLLabelElement).style.color = "#475569"; (e.currentTarget as HTMLLabelElement).style.background = ""; }}
                    >
                      {zipMutation.isPending ? (
                        <>
                          <span className="w-3 h-3 border rounded-full animate-spin" style={{ borderColor: "rgba(98,245,198,0.25)", borderTopColor: "#62f5c6" }} />
                          <span style={{ color: "#62f5c6" }}>Uploading…</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud size={13} />
                          Upload ZIP
                        </>
                      )}
                      <input
                        type="file"
                        accept=".zip"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && zipMutation.mutate(e.target.files[0])}
                        disabled={isImporting}
                      />
                    </label>
                  </div>

                  {/* Repo list */}
                  {repositories.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-semibold uppercase tracking-widest px-1" style={{ color: "#334155" }}>
                        Repositories
                        <span className="ml-1.5 font-mono text-[8px] px-1.5 py-0.5 rounded" style={{ background: "rgba(29,42,66,0.5)", color: "#475569" }}>
                          {repositories.length}
                        </span>
                      </p>
                      {repositories.map((repo) => (
                        <RepositoryButton
                          key={repo._id}
                          repository={repo}
                          active={selected?._id === repo._id}
                          isDeleting={deletingId === repo._id}
                          onClick={() => setSelectedId(repo._id)}
                          onDelete={(e) => handleDeleteRepository(repo, e)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Empty state */}
                  {repositories.length === 0 && !repositoriesQuery.isLoading && (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                      <div className="w-11 h-11 rounded-xl grid place-items-center" style={{ background: "rgba(29,42,66,0.3)", color: "#334155" }}>
                        <Database size={18} />
                      </div>
                      <p className="text-[11px] leading-relaxed" style={{ color: "#334155" }}>
                        Import a GitHub repo<br />or upload a ZIP to get started
                      </p>
                    </div>
                  )}
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          {/* ── Main workspace ── */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {selected ? (
              <>
                <div
                  className={`flex-1 grid overflow-hidden min-h-0 transition-all duration-300 ${
                    showRightPanel ? "grid-cols-[minmax(0,1.3fr)_360px]" : "grid-cols-[minmax(0,1fr)]"
                  }`}
                >
                  <CodeWorkspace repository={selected} />
                  {showRightPanel && (
                    <div className="flex flex-col overflow-hidden min-h-0" style={{ borderLeft: "1px solid rgba(29,42,66,0.7)" }}>
                      <div className="flex-1 overflow-hidden min-h-0">
                        <SearchPanel repository={selected} />
                      </div>
                      <div className="flex-1 overflow-hidden min-h-0" style={{ borderTop: "1px solid rgba(29,42,66,0.7)" }}>
                        <GraphPanel repository={selected} />
                      </div>
                    </div>
                  )}
                </div>
                <div
                  className="shrink-0 transition-all duration-300"
                  style={{ height: showChat ? "290px" : "40px", borderTop: "1px solid rgba(29,42,66,0.7)" }}
                >
                  <ChatPanel
                    repository={selected}
                    isCollapsed={!showChat}
                    onToggle={() => setShowChat(!showChat)}
                  />
                </div>
              </>
            ) : (
              <EmptyWorkspace />
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/* ── Empty workspace ── */
function EmptyWorkspace() {
  return (
    <div className="flex-1 grid place-items-center text-center p-8 animate-fade-in">
      <div className="space-y-5 max-w-sm">
        <div className="w-16 h-16 mx-auto rounded-2xl grid place-items-center"
          style={{ background: "linear-gradient(135deg, rgba(67,217,255,0.12), rgba(98,245,198,0.06))", border: "1px solid rgba(67,217,255,0.18)", color: "#43d9ff", boxShadow: "0 0 30px rgba(67,217,255,0.1)" }}>
          <Sparkles size={28} />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: "#e2e8f4" }}>No repository selected</h2>
          <p className="text-sm leading-relaxed" style={{ color: "#475569" }}>
            Import a GitHub URL or upload a ZIP archive from the sidebar to start analysing your codebase with AI.
          </p>
        </div>
        <div className="flex items-center justify-center gap-5 text-[10px] font-mono" style={{ color: "#334155" }}>
          <span className="flex items-center gap-1"><Zap size={10} style={{ color: "#43d9ff" }} /> Semantic search</span>
          <span className="flex items-center gap-1"><Layers size={10} style={{ color: "#62f5c6" }} /> Dep graph</span>
          <span className="flex items-center gap-1"><Sparkles size={10} style={{ color: "#8b73ff" }} /> AI chat</span>
        </div>
      </div>
    </div>
  );
}

/* ── Repository sidebar button ── */
function RepositoryButton({
  repository,
  active,
  isDeleting,
  onClick,
  onDelete,
}: {
  repository: Repository;
  active: boolean;
  isDeleting: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const isPending =
    repository.status === "queued" ||
    repository.status === "parsing" ||
    repository.status === "embedding";

  const statusConfig = {
    ready:     { dot: "#62f5c6",  label: "Ready",      color: "#62f5c6" },
    failed:    { dot: "#f87171",  label: "Failed",      color: "#f87171" },
    parsing:   { dot: "#43d9ff", label: "Parsing…",    color: "#43d9ff" },
    embedding: { dot: "#f7c45f", label: "Embedding…",  color: "#f7c45f" },
    queued:    { dot: "#64748b", label: "Queued…",     color: "#64748b" },
  }[repository.status] ?? { dot: "#64748b", label: repository.status, color: "#64748b" };

  return (
    <motion.button
      layout
      onClick={onClick}
      whileTap={{ scale: 0.985 }}
      className="w-full text-left rounded-xl px-3 py-2.5 transition-all duration-150 group"
      style={active ? {
        background: "rgba(67,217,255,0.06)",
        border: "1px solid rgba(67,217,255,0.22)",
        boxShadow: "inset 0 0 0 1px rgba(67,217,255,0.08)"
      } : {
        background: "rgba(6,10,18,0.3)",
        border: "1px solid rgba(29,42,66,0.6)"
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(36,51,82,0.9)";
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(17,24,41,0.5)";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(29,42,66,0.6)";
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(6,10,18,0.3)";
        }
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="truncate text-[12px] font-medium leading-tight" style={{ color: "#e2e8f4" }}>
          {repository.name}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* ENH-001: Delete button — shown on hover */}
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
            style={{ color: "#f87171" }}
            onClick={onDelete}
            disabled={isDeleting}
            title="Delete repository"
          >
            {isDeleting
              ? <span className="w-2.5 h-2.5 border rounded-full animate-spin inline-block" style={{ borderColor: "rgba(248,113,113,0.3)", borderTopColor: "#f87171" }} />
              : <Trash2 size={10} />
            }
          </button>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusConfig.dot, boxShadow: isPending ? `0 0 6px ${statusConfig.dot}` : undefined }} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium" style={{ color: statusConfig.color }}>
          {statusConfig.label}
        </span>
        {repository.status === "failed" && repository.lastError && (
          <span className="text-[9px] truncate max-w-[120px]" style={{ color: "rgba(248,113,113,0.65)" }}>{repository.lastError}</span>
        )}
        {active && repository.status === "ready" && (
          <ChevronRight size={11} style={{ color: "#334155" }} className="shrink-0" />
        )}
        {isPending && (
          <Clock size={10} className="shrink-0 animate-spin" style={{ color: "#334155", animationDuration: "2s" }} />
        )}
      </div>
    </motion.button>
  );
}
