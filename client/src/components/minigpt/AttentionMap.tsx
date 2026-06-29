import React, { useState } from "react";

interface AttentionMapProps {
  attentionMaps: number[][][][]; // [layer][head][query_pos][key_pos]
  tokenLabels: string[];
}

export function AttentionMap({ attentionMaps, tokenLabels }: AttentionMapProps) {
  const [selectedLayer, setSelectedLayer] = useState(0);
  const [selectedHead, setSelectedHead] = useState(0);
  const [hoveredQueryIdx, setHoveredQueryIdx] = useState<number | null>(null);
  const [hoveredKeyIdx, setHoveredKeyIdx] = useState<number | null>(null);

  if (!attentionMaps || attentionMaps.length === 0 || tokenLabels.length === 0) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border border-line bg-ink/40 p-4 text-center">
        <p className="text-sm text-slate-400">No generation session active.</p>
        <p className="mt-1 text-xs text-slate-500">Generate a sequence to visualize Multi-Head Attention weights.</p>
      </div>
    );
  }

  const numLayers = attentionMaps.length;
  const numHeads = attentionMaps[0]?.length ?? 0;
  const seqLen = tokenLabels.length;

  // Retrieve current active attention matrix
  // Shape: (seqLen, seqLen) where [q][k] represents weight of query position q attending to key position k
  const activeMatrix = attentionMaps[selectedLayer]?.[selectedHead] ?? [];

  // Helper to get color intensity based on attention weight
  const getCellBg = (weight: number) => {
    // We want a beautiful glow cyan gradient
    if (weight <= 0.0) return "rgba(67, 217, 255, 0.0)";
    return `rgba(67, 217, 255, ${weight * 0.95})`;
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-line bg-ink/40 p-4 shadow-glow">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Attention Weights (MHA)</h4>
          <p className="text-[10px] text-slate-500">Visualizing layer causal self-attention</p>
        </div>
        
        {/* Layer and Head Selector Tabs */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1 bg-ink/70 p-1 rounded-md border border-line">
            <span className="text-[10px] font-semibold text-slate-500 uppercase px-1.5">Layer</span>
            {Array.from({ length: numLayers }).map((_, l) => (
              <button
                key={`layer-btn-${l}`}
                onClick={() => setSelectedLayer(l)}
                className={`px-2 py-0.5 rounded text-xs font-semibold transition ${selectedLayer === l ? "bg-cyan text-ink" : "text-slate-400 hover:text-white"}`}
              >
                L{l}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-ink/70 p-1 rounded-md border border-line">
            <span className="text-[10px] font-semibold text-slate-500 uppercase px-1.5">Head</span>
            {Array.from({ length: numHeads }).map((_, h) => (
              <button
                key={`head-btn-${h}`}
                onClick={() => setSelectedHead(h)}
                className={`px-2 py-0.5 rounded text-xs font-semibold transition ${selectedHead === h ? "bg-cyan text-ink" : "text-slate-400 hover:text-white"}`}
              >
                H{h}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Causal attention explanation */}
      <div className="mb-3 rounded border border-cyan/10 bg-cyan/5 p-2.5 text-[11px] text-slate-300">
        <span className="font-semibold text-cyan">Causal Triangular Mask:</span> Observe how each row (Query) can only attend to previous columns (Key). Future positions are completely masked out (<span className="font-mono text-slate-400">0.0000</span>).
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-4 overflow-auto min-h-0 flex-1">
        {/* Matrix Visualization */}
        <div className="flex flex-col">
          {/* Top Key Labels */}
          <div className="flex pl-10 mb-2">
            {tokenLabels.map((lbl, idx) => (
              <div
                key={`lbl-k-${idx}`}
                className={`grid h-6 w-6 place-items-center text-xs font-mono font-bold rounded-sm transition ${
                  hoveredKeyIdx === idx ? "bg-cyan text-ink" : "text-slate-400"
                }`}
                title={`Key position ${idx}: '${lbl}'`}
              >
                {lbl === " " ? "␣" : lbl === "\n" ? "↵" : lbl}
              </div>
            ))}
          </div>

          {/* Matrix Rows */}
          <div className="flex flex-col gap-0.5">
            {activeMatrix.map((row, qIdx) => (
              <div key={`row-q-${qIdx}`} className="flex items-center gap-0.5">
                {/* Left Query Label */}
                <div
                  className={`flex h-6 w-10 items-center justify-end pr-2 text-xs font-mono font-bold rounded-sm transition ${
                    hoveredQueryIdx === qIdx ? "bg-cyan text-ink" : "text-slate-400"
                  }`}
                  title={`Query position ${qIdx}: '${tokenLabels[qIdx]}'`}
                >
                  <span className="text-[9px] text-slate-500 mr-1.5 font-normal">Q{qIdx}</span>
                  {tokenLabels[qIdx] === " " ? "␣" : tokenLabels[qIdx] === "\n" ? "↵" : tokenLabels[qIdx]}
                </div>

                {/* Row Matrix Cells */}
                <div className="flex gap-0.5">
                  {row.map((val, kIdx) => {
                    const isHovered = hoveredQueryIdx === qIdx && hoveredKeyIdx === kIdx;
                    return (
                      <div
                        key={`cell-${qIdx}-${kIdx}`}
                        onMouseEnter={() => {
                          setHoveredQueryIdx(qIdx);
                          setHoveredKeyIdx(kIdx);
                        }}
                        onMouseLeave={() => {
                          setHoveredQueryIdx(null);
                          setHoveredKeyIdx(null);
                        }}
                        className={`h-6 w-6 rounded-sm cursor-pointer border border-line/20 transition-all ${
                          isHovered ? "ring-2 ring-white scale-110 z-10" : ""
                        }`}
                        style={{ backgroundColor: getCellBg(val) }}
                        title={`Query Q${qIdx} ('${tokenLabels[qIdx]}') -> Key K${kIdx} ('${tokenLabels[kIdx]}')\nAttention Weight: ${val.toFixed(4)}`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Info Status Board */}
      <div className="mt-4 border-t border-line pt-3 flex items-center justify-between text-xs text-slate-400">
        <div>
          {hoveredQueryIdx !== null && hoveredKeyIdx !== null ? (
            <p>
              Query <strong className="text-cyan">'{tokenLabels[hoveredQueryIdx]}'</strong> attends to Key{" "}
              <strong className="text-cyan">'{tokenLabels[hoveredKeyIdx]}'</strong> with weight:{" "}
              <span className="font-mono font-semibold text-mint">{activeMatrix[hoveredQueryIdx][hoveredKeyIdx].toFixed(4)}</span>
            </p>
          ) : (
            <p className="text-slate-500 italic">Hover over heatmap cells to inspect connection strengths.</p>
          )}
        </div>
      </div>
    </div>
  );
}
