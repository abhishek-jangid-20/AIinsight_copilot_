/**
 * ---------------------------------------------------------
 * Folder: components/minigpt/
 * Location: client/src/components/minigpt/
 * ---------------------------------------------------------
 *
 * Folder Purpose:
 *   Contains educational components specific to the MiniGPT Lab simulator,
 *   such as training trackers and visualization dashboards.
 *
 * ---------------------------------------------------------
 * Component: LossChart
 * ---------------------------------------------------------
 *
 * Purpose:
 *   Renders a lightweight, responsive vector line graph (SVG) tracking
 *   training and validation loss metrics in real-time.
 *
 * Responsibilities:
 * - Calculates coordinate maps converting numeric training losses into SVG pixels.
 * - Draws background grid lines, ticks, and border axes automatically.
 * - Draws continuous polyline tracks connecting training steps.
 * - Displays exact loss figures inside numerical legends.
 *
 * Props:
 * - history: Array containing logged training iterations: [{ step: number, trainLoss: number, valLoss?: number }]
 *
 * State:
 *   None. (Strictly controlled presentation component utilizing derived props)
 *
 * Related Files:
 * - client/src/components/MiniGPTLab.jsx (Invokes LossChart with state variables)
 */

import React from "react";

export function LossChart({ history }) {
  // Empty state: render instructions if history logs contain no records yet
  if (history.length === 0) {
    return (
      <div className="flex h-48 w-full flex-col items-center justify-center rounded-lg border border-line bg-ink/40 p-4 text-center">
        <p className="text-sm text-slate-400">No training data yet.</p>
        <p className="mt-1 text-xs text-slate-500">Run a few steps to see live loss metrics.</p>
      </div>
    );
  }

  // Visual Dimension configurations
  const width = 500;
  const height = 200;
  const padding = 35;

  // Extract raw steps and losses to compute boundaries
  const steps = history.map((h) => h.step);
  const trainLosses = history.map((h) => h.trainLoss);
  const valLosses = history.map((h) => h.valLoss ?? h.trainLoss);

  // Math boundaries
  const minStep = Math.min(...steps);
  const maxStep = Math.max(...steps);
  const maxLoss = Math.max(...trainLosses, ...valLosses, 1.0) * 1.1; // Ensure height covers maximum loss with 10% padding
  const minLoss = 0.0;

  /**
   * =============================================================================
   * REACT CONCEPT: Coordinate Scaling Math (Normalized Mapping)
   * =============================================================================
   * Why?
   *   Numerical values (e.g. step=200, loss=4.5) cannot be mapped directly to SVG
   *   pixel values (e.g. width=500, height=200). We must scale them into percentages
   *   and multiply them by the viewport width/height.
   *
   * X-Coordinate (Steps):
   *   `getX = padding + (normalizedStep * viewportWidth)`
   *
   * Y-Coordinate (Loss):
   *   In SVG and browser canvas, coordinate 0 is at the TOP-left, and increases
   *   downward. Since we want higher losses to appear higher on the graph, we must
   *   invert the Y value:
   *   `getY = height - padding - (normalizedLoss * viewportHeight)`
   */
  const getX = (step) => {
    if (maxStep === minStep) return padding;
    return padding + ((step - minStep) / (maxStep - minStep)) * (width - 2 * padding);
  };

  const getY = (loss) => {
    return height - padding - (loss / maxLoss) * (height - 2 * padding);
  };

  // Build SVG polyline points string format: "x1,y1 x2,y2 x3,y3 ..."
  const trainPoints = history.map((pt) => `${getX(pt.step)},${getY(pt.trainLoss)}`).join(" ");
  const valPoints = history
    .filter((pt) => pt.valLoss !== undefined)
    .map((pt) => `${getX(pt.step)},${getY(pt.valLoss)}`)
    .join(" ");

  // Grid tick counts
  const xTicks = 4;
  const yTicks = 4;

  // Compute label ticks intervals
  const yGridValues = Array.from({ length: yTicks }, (_, i) => (maxLoss / (yTicks - 1)) * i);
  const xGridValues = Array.from({ length: xTicks }, (_, i) => {
    if (maxStep === minStep) return minStep;
    return Math.round(minStep + ((maxStep - minStep) / (xTicks - 1)) * i);
  });

  return (
    <div className="w-full rounded-lg border border-line bg-ink/40 p-4 shadow-glow">
      {/* Legend & Labels Header */}
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Training Loss Curve</h4>
        <div className="flex gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5 text-cyan">
            <span className="h-2 w-2 rounded-full bg-cyan" />
            Train Loss: {history[history.length - 1].trainLoss.toFixed(4)}
          </span>
          {history[history.length - 1].valLoss !== undefined && (
            <span className="flex items-center gap-1.5 text-mint">
              <span className="h-2 w-2 rounded-full bg-mint" />
              Val Loss: {history[history.length - 1].valLoss?.toFixed(4)}
            </span>
          )}
        </div>
      </div>

      {/* SVG Canvas wrapper */}
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
          {/* ===================================================================
             SVG Grid Layout
             Iterates grid lists to render tick labels and dashed grid lines.
          =================================================================== */}
          
          {/* Y-Axis dashed grid lines */}
          {yGridValues.map((val, idx) => {
            const y = getY(val);
            return (
              <g key={`y-grid-${idx}`} className="opacity-20">
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#1d2a42" strokeDasharray="3 3" strokeWidth="1" />
                <text x={padding - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px] font-mono">
                  {val.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* X-Axis dashed grid lines */}
          {xGridValues.map((val, idx) => {
            const x = getX(val);
            return (
              <g key={`x-grid-${idx}`} className="opacity-20">
                <line x1={x} y1={padding} x2={x} y2={height - padding} stroke="#1d2a42" strokeDasharray="3 3" strokeWidth="1" />
                <text x={x} y={height - padding + 14} textAnchor="middle" className="fill-slate-400 text-[10px] font-mono">
                  {val}
                </text>
              </g>
            );
          })}

          {/* Border axes lines */}
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#1d2a42" strokeWidth="1.5" className="opacity-30" />
          <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#1d2a42" strokeWidth="1.5" className="opacity-30" />

          {/* ===================================================================
             Training & Validation Line Tracks
             Polylines trace connected coordinate arrays dynamically.
          =================================================================== */}
          
          {/* Train Loss Path */}
          {history.length > 1 ? (
            <polyline fill="none" stroke="url(#cyan-glow-grad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={trainPoints} />
          ) : (
            <circle cx={getX(history[0].step)} cy={getY(history[0].trainLoss)} r="4" className="fill-cyan" />
          )}

          {/* Validation Loss Path */}
          {history.length > 1 && valPoints && (
            <polyline fill="none" stroke="url(#mint-glow-grad)" strokeWidth="2" strokeDasharray="4 2" strokeLinecap="round" strokeLinejoin="round" points={valPoints} />
          )}

          {/* Linear gradient color definitions */}
          <defs>
            <linearGradient id="cyan-glow-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#43d9ff" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
            <linearGradient id="mint-glow-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#62f5c6" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}
