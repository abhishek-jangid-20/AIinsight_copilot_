import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { Network, Download, Maximize2, Minimize2 } from "lucide-react";
import { repositoryGraph } from "../lib/api";
import type { Repository } from "../types";

// ENH-007: Simple dagre-style layout — arrange nodes in a left-to-right layered grid
// grouped by type (file nodes on left, symbol nodes on right)
function computeLayout(rawNodes: Array<{ id: string; label: string; type: string }>, edges: Array<{ source: string; target: string }>) {
  const fileNodes = rawNodes.filter((n) => n.type === "file");
  const symbolNodes = rawNodes.filter((n) => n.type !== "file");

  const HGAP = 220;
  const VGAP = 70;
  const COL_SYMBOLS_X = Math.ceil(fileNodes.length / 10) * HGAP;

  const nodes: Node[] = [
    ...fileNodes.map((n, i) => ({
      id: n.id,
      data: { label: n.label, nodeType: "file" },
      position: { x: (Math.floor(i / 10)) * HGAP, y: (i % 10) * VGAP },
      style: { background: "rgba(67,217,255,0.07)", border: "1px solid rgba(67,217,255,0.3)", color: "#43d9ff", borderRadius: 8, fontSize: 10, padding: "4px 10px" }
    })),
    ...symbolNodes.map((n, i) => ({
      id: n.id,
      data: { label: n.label, nodeType: n.type },
      position: { x: COL_SYMBOLS_X + (Math.floor(i / 12)) * HGAP, y: (i % 12) * VGAP },
      style: { background: "rgba(139,115,255,0.07)", border: "1px solid rgba(139,115,255,0.25)", color: "#8b73ff", borderRadius: 8, fontSize: 10, padding: "4px 10px" }
    })),
  ];

  return nodes;
}

export function GraphPanel({ repository }: { repository: Repository }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const graphQuery = useQuery({
    queryKey: ["graph", repository._id, repository.status],
    queryFn: () => repositoryGraph(repository._id),
    enabled: repository.status === "ready",
  });

  const elements = useMemo(() => {
    if (!graphQuery.data) return { nodes: [], edges: [], truncated: false, totalNodes: 0 };

    const totalNodes = graphQuery.data.nodes.length;
    const rawNodes = graphQuery.data.nodes.slice(0, 70);
    const nodes = computeLayout(rawNodes, graphQuery.data.edges);

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges: Edge[] =
      graphQuery.data.edges
        .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
        .slice(0, 120)
        .map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          // BUG-011: Style edges based on their label type
          style: { stroke: edge.label === "contains" ? "rgba(67,217,255,0.3)" : "rgba(139,115,255,0.3)" },
          labelStyle: { fill: "#475569", fontSize: 9 },
        }));
    return { nodes, edges, truncated: totalNodes > 70, totalNodes };
  }, [graphQuery.data]);

  const downloadGraph = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(elements, null, 2));
    const a = document.createElement("a");
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `${repository.name}-architecture-graph.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const isReady = repository.status === "ready";
  const hasNodes = elements.nodes.length > 0;

  const emptyMessage = (() => {
    if (!isReady) {
      if (repository.status === "queued")   return "Repository is queued…";
      if (repository.status === "parsing")   return "Parsing source files…";
      if (repository.status === "embedding") return "Building embeddings…";
      if (repository.status === "failed")    return "Repository failed to index";
      return "Repository not ready";
    }
    if (graphQuery.isLoading) return "Loading graph…";
    if (graphQuery.isError) return "Failed to load graph";
    return "No graph data available";
  })();

  const containerStyle: React.CSSProperties = isFullscreen
    ? { position: "fixed", inset: 0, zIndex: 9999, display: "grid", gridTemplateRows: "56px minmax(0,1fr)", background: "#060a12" }
    : { display: "grid", gridTemplateRows: "40px minmax(0,1fr)", minHeight: 0, background: "rgba(6,10,18,0.4)" };

  return (
    <section style={containerStyle}>
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          padding: isFullscreen ? "0 20px" : "0 16px",
          borderBottom: "1px solid rgba(29,42,66,0.5)",
          background: "rgba(6,10,18,0.5)"
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Network
            size={isFullscreen ? 17 : 13}
            style={{ color: "#8b73ff", flexShrink: 0 }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-widest truncate" style={{ color: "#475569" }}>
            Architecture Graph
          </span>
          {hasNodes && (
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded ml-1 shrink-0"
              style={{ background: "rgba(29,42,66,0.5)", color: "#475569" }}>
              {elements.nodes.length} nodes
            </span>
          )}
          {/* FIX-007: Show truncation notice when the graph is capped at 70 nodes */}
          {elements.truncated && (
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded ml-1 shrink-0"
              style={{ background: "rgba(247,196,95,0.1)", color: "#f7c45f", border: "1px solid rgba(247,196,95,0.25)" }}
              title={`Graph capped at 70 nodes. ${elements.totalNodes} total nodes in this repository.`}>
              {elements.totalNodes - 70}+ hidden
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isReady && hasNodes && (
            <button
              onClick={downloadGraph}
              title="Export JSON"
              className="p-1.5 rounded-md transition"
              style={{ color: "#334155" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(29,42,66,0.5)"; (e.currentTarget as HTMLButtonElement).style.color = "#e2e8f4"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ""; (e.currentTarget as HTMLButtonElement).style.color = "#334155"; }}
            >
              <Download size={13} />
            </button>
          )}
          <button
            onClick={() => setIsFullscreen((prev) => !prev)}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            className="p-1.5 rounded-md transition"
            style={{ color: "#334155" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(29,42,66,0.5)"; (e.currentTarget as HTMLButtonElement).style.color = "#e2e8f4"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ""; (e.currentTarget as HTMLButtonElement).style.color = "#334155"; }}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* ── Graph area ── */}
      <div className="relative h-full w-full min-h-0">
        {/* Empty / loading state */}
        {(!isReady || (graphQuery.isLoading && isReady) || !hasNodes) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none select-none z-10">
            {/* FIX-016: Only show spinner when repo is ready and data is genuinely loading */}
            {graphQuery.isLoading && isReady ? (
              <div className="rounded-full animate-spin"
                style={{ width: 20, height: 20, border: "2px solid rgba(29,42,66,0.6)", borderTopColor: "#43d9ff" }} />
            ) : (
              <Network size={28} strokeWidth={1.5} style={{ color: "#1d2a42" }} />
            )}
            <span className="text-xs" style={{ color: "#334155" }}>{emptyMessage}</span>
          </div>
        )}

        {/* ReactFlow canvas */}
        {isReady && !graphQuery.isLoading && (
          <ReactFlow
            nodes={elements.nodes}
            edges={elements.edges}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#0f1828" gap={22} size={1} />
            <Controls />
            {/* BUG-011: MiniMap now uses data.nodeType (set in computeLayout) instead of n.type */}
            <MiniMap
              nodeStrokeColor={(n) => n.data?.nodeType === "file" ? "#43d9ff" : "#8b73ff"}
              nodeColor={(n) => n.data?.nodeType === "file" ? "rgba(67,217,255,0.12)" : "rgba(139,115,255,0.12)"}
              nodeBorderRadius={4}
              maskColor="rgba(5,7,13,0.7)"
              style={{ backgroundColor: "#0c1527", border: "1px solid #1d2a42" }}
            />
          </ReactFlow>
        )}
      </div>
    </section>
  );
}
