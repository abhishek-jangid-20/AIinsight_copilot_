import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, FastForward, RotateCcw, Cpu, Sparkles, BookOpen, GraduationCap } from "lucide-react";
import { api } from "../lib/api";
import { LossChart } from "./minigpt/LossChart";

export function MiniGPTLab() {
  // Model Initialization Configuration
  const [corpusText, setCorpusText] = useState("");
  const [nLayer, setNLayer] = useState(2);
  const [nHead, setNHead] = useState(4);
  const [nEmbd, setNEmbd] = useState(64);
  const [blockSize, setBlockSize] = useState(32);
  
  // Active Status States
  const [initialized, setInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [vocabSize, setVocabSize] = useState(0);
  
  // Training Configuration & Status
  const [lr, setLr] = useState(0.003);
  const [batchSize, setBatchSize] = useState(16);
  const [isTraining, setIsTraining] = useState(false);
  const [stepsPerClick, setStepsPerClick] = useState(10);
  const [currentStep, setCurrentStep] = useState(0);
  const [gradNorm, setGradNorm] = useState(null);
  const [lossHistory, setLossHistory] = useState([]);
  
  // Text Generator Configuration & Status
  const [seedText, setSeedText] = useState("A");
  const [genTokensCount, setGenTokensCount] = useState(50);
  const [temperature, setTemperature] = useState(1.0);
  const [topK, setTopK] = useState(10);
  const [generatedText, setGeneratedText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [attentionMaps, setAttentionMaps] = useState([]);
  const [tokenLabels, setTokenLabels] = useState([]);
  const [isLoadingWikitext, setIsLoadingWikitext] = useState(false);
  
  // Background loop interval reference
  const trainingIntervalRef = useRef(null);

  // Sync state on load
  useEffect(() => {
    async function fetchState() {
      try {
        const state = await api("/api/minigpt/state");
        if (state.initialized && state.hyperparameters) {
          setInitialized(true);
          setVocabSize(state.vocabSize ?? 0);
          setCurrentStep(state.step ?? 0);
          setLossHistory(state.lossHistory ?? []);
          setNLayer(state.hyperparameters.n_layer);
          setNHead(state.hyperparameters.n_head);
          setNEmbd(state.hyperparameters.n_embd);
          setBlockSize(state.hyperparameters.block_size);
        }
      } catch (err) {
        console.error("Failed to load MiniGPT state:", err);
      }
    }
    void fetchState();
    
    return () => {
      if (trainingIntervalRef.current) {
        window.clearInterval(trainingIntervalRef.current);
      }
    };
  }, []);

  // Initialize model & vocabulary builder
  const handleInitialize = async () => {
    setIsInitializing(true);
    try {
      const res = await api("/api/minigpt/init", {
        method: "POST",
        body: JSON.stringify({
          text: corpusText.trim() || undefined,
          n_layer: nLayer,
          n_head: nHead,
          n_embd: nEmbd,
          block_size: blockSize
        })
      });
      
      setInitialized(true);
      setVocabSize(res.vocabSize);
      setCurrentStep(0);
      setLossHistory([]);
      setGeneratedText("");
      setAttentionMaps([]);
      setTokenLabels([]);
    } catch (err) {
      alert(`Initialization failed: ${err.message}`);
    } finally {
      setIsInitializing(false);
    }
  };

  // Keep training configuration refs so the active loop always uses the latest slider settings
  const lrRef = useRef(lr);
  lrRef.current = lr;
  const batchSizeRef = useRef(batchSize);
  batchSizeRef.current = batchSize;
  const stepsPerClickRef = useRef(stepsPerClick);
  stepsPerClickRef.current = stepsPerClick;

  // Active training status ref
  const isTrainingRef = useRef(isTraining);
  isTrainingRef.current = isTraining;

  // Perform training step(s)
  const handleTrainStep = async (stepsOverride) => {
    try {
      const res = await api("/api/minigpt/train-step", {
        method: "POST",
        body: JSON.stringify({
          lr: lrRef.current,
          batch_size: batchSizeRef.current,
          steps: stepsOverride ?? stepsPerClickRef.current
        })
      });
      
      setCurrentStep(res.step);
      setLossHistory(res.lossHistory);
      if (res.gradNorm != null) {
        setGradNorm(res.gradNorm);
      }
    } catch (err) {
      console.error("Training step error:", err);
      setIsTraining(false);
      isTrainingRef.current = false;
    }
  };

  // Manage recursive timeout loop for continuous training
  useEffect(() => {
    let timeoutId = null;

    const runLoop = async () => {
      if (!isTrainingRef.current) return;
      
      await handleTrainStep(stepsPerClickRef.current);
      
      if (isTrainingRef.current) {
        // Use minimal delay (50ms) for fast training; UI updates happen async
        timeoutId = window.setTimeout(runLoop, 50);
      }
    };

    if (isTraining) {
      void runLoop();
    }

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isTraining]);

  // Toggle continuous training loops
  const toggleTrainingLoop = () => {
    setIsTraining(!isTraining);
  };

  // Text Sequence Generation
  const handleGenerateText = async () => {
    setIsGenerating(true);
    try {
      const res = await api("/api/minigpt/generate", {
        method: "POST",
        body: JSON.stringify({
          seed: seedText,
          max_new_tokens: genTokensCount,
          temperature,
          top_k: topK
        })
      });
      
      setGeneratedText(res.generatedText);
      setAttentionMaps(res.attentionMaps);
      setTokenLabels(res.tokenLabels);
    } catch (err) {
      alert(`Generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Pre-load a sample tiny Shakespeare dataset
  const loadShakespeareCorpus = () => {
    setCorpusText(
      "First Citizen:\nBefore we proceed any further, hear me speak.\n\n" +
      "All:\nSpeak, speak.\n\n" +
      "First Citizen:\nYou are all resolved rather to die than to famish?\n\n" +
      "All:\nResolved, resolved.\n\n" +
      "First Citizen:\nFirst, you know Caius Marcius is chief enemy to the people.\n\n" +
      "All:\nWe know't, we know't.\n\n" +
      "Let us kill him, and we'll have corn at our own price.\n" +
      "Is't a verdict?\n\n" +
      "Second Citizen:\nOne word, good citizens.\n\n" +
      "First Citizen:\nWe are accounted poor citizens, the patricians good.\n" +
      "What authority surfeits on would relieve us: if they would yield us but the superfluity,\n" +
      "while it were wholesome, we might guess they relieved us humanely;\n" +
      "but they think we are too dear: the leanness that afflicts us,\n" +
      "the object of our misery, is as an inventory to particularise their abundance;\n" +
      "our sufferance is a gain to them.\n\n" +
      "Let us revenge this with our pikes, ere we become rakes:\n" +
      "for the gods know I speak this in hunger for bread, not in thirst for revenge.\n\n" +
      "Second Citizen:\nWould you proceed especially against Caius Marcius?\n\n" +
      "All:\nAgainst him first: he's a very dog to the commonalty.\n\n" +
      "Second Citizen:\nConsider you what services he has done for his country?\n\n" +
      "First Citizen:\nVery well; and could be content to give him good report for't,\n" +
      "but that he pays himself with being proud.\n"
    );
    // Shakespeare demo = tiny corpus, use smallest model for fast convergence
    setNLayer(1); setNHead(2); setNEmbd(32); setBlockSize(16);
  };


  // Pre-load a sample finance dataset (~30k chars for better convergence)
  const loadFinanceCorpus = () => {
    const text = `THE COMPLETE GUIDE TO PERSONAL FINANCE, INVESTING, AND WEALTH BUILDING

CHAPTER ONE: THE FOUNDATIONS OF MONEY AND WEALTH

Money is one of the most powerful forces in modern society. It is the medium through which we exchange labor for goods and services, and it represents the accumulated value of human effort and ingenuity. Understanding how money works, how it grows, and how to manage it effectively is one of the most important skills anyone can develop.

Wealth is not simply the accumulation of money. True wealth is the ability to live the life you want without being constrained by financial concerns. Wealthy individuals do not necessarily have the most money; they have the most financial freedom. Financial freedom is achieved when your passive income from investments exceeds your monthly expenses, allowing you to choose how you spend your time without being dependent on a paycheck.

The journey to financial freedom begins with a simple but powerful concept: spend less than you earn, and invest the difference consistently over time. This principle, applied with patience and discipline, has created more millionaires than any other strategy in history.

CHAPTER TWO: THE POWER OF COMPOUNDING INTEREST

Albert Einstein reportedly called compound interest the eighth wonder of the world. Whether or not he actually said this, the sentiment captures something profound about the nature of exponential growth in finance.

Compounding interest is the process by which an investment earns returns, and those returns then earn returns of their own in subsequent periods. Unlike simple interest, which is calculated only on the original principal, compound interest accelerates wealth accumulation because the base upon which interest is calculated grows larger every year.

Consider a simple example. If you invest ten thousand dollars at an annual return of eight percent, you will earn eight hundred dollars in the first year, bringing your total to ten thousand eight hundred dollars. In the second year, you earn eight percent on ten thousand eight hundred dollars, not just the original ten thousand. This gives you eight hundred and sixty-four dollars in interest, bringing your total to eleven thousand six hundred and sixty-four dollars.

This acceleration continues year after year. By the end of ten years, your original ten thousand dollar investment has grown to approximately twenty-one thousand five hundred dollars without adding a single additional dollar. By the end of thirty years, it has grown to over one hundred thousand dollars. This is the magic of compounding interest: time is your most powerful ally.

The rule of seventy-two is a simple mental shortcut to estimate how long it takes for an investment to double. Divide seventy-two by the annual interest rate to get the approximate number of years required to double your money. At eight percent, your money doubles every nine years. At twelve percent, it doubles every six years. At four percent, it doubles every eighteen years.

CHAPTER THREE: ASSET ALLOCATION AND RISK MANAGEMENT

Asset allocation is the strategic distribution of your investment capital across different asset classes with the goal of balancing risk and reward according to your financial goals, time horizon, and risk tolerance. It is widely regarded as the single most important determinant of long-term portfolio performance.

The major asset classes include stocks, bonds, real estate, commodities, and cash equivalents. Each asset class has distinct risk and return characteristics, and they often move in different directions in response to economic conditions.

True financial freedom is not about becoming fabulously wealthy. It is about having enough investment assets to generate reliable passive income that covers your needs and wants. By understanding the principles of compounding, diversification, tax-advantaged investing, and behavioral discipline, anyone can build lasting financial security and achieve the freedom to live life on their own terms.`;
    setCorpusText(text);
    // Auto-set smart hyperparameters for this corpus size
    setNLayer(2); setNHead(4); setNEmbd(64); setBlockSize(32);
  };

  // Dynamically fetch wikitext dataset (100k words) from server
  const loadWikitextCorpus = async () => {
    setIsLoadingWikitext(true);
    try {
      const res = await api("/api/minigpt/wikitext");
      setCorpusText(res.text);
      // WikiText is large — use bigger model for better quality (needs 1000+ steps)
      setNLayer(2); setNHead(4); setNEmbd(128); setBlockSize(64);
    } catch (err) {
      alert(`Failed to load wikitext: ${err.message}`);
    } finally {
      setIsLoadingWikitext(false);
    }
  };

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[380px_1fr] overflow-hidden min-h-0 bg-ink">
      
      {/* LEFT COLUMN: Data Prep & Architecture Config */}
      <aside className="border-r border-line bg-panel/30 p-5 overflow-y-auto flex flex-col gap-6">
        
        {/* Dataset Prep Panel */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-cyan">
            <BookOpen size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider">1. Prepare Data Corpus</h3>
          </div>
          <p className="text-xs text-slate-400">
            Train on custom texts or build mapping codes instantly. Leaving blank uses the Tiny Shakespeare demo dataset.
          </p>
          <textarea
            value={corpusText}
            onChange={(e) => setCorpusText(e.target.value)}
            placeholder="Type custom text dataset here..."
            className="h-28 w-full rounded border border-line bg-ink/75 p-2 text-xs outline-none focus:border-cyan/50 font-mono resize-none"
          />
          {/* Corpus size indicator */}
          {corpusText && (
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>{corpusText.length.toLocaleString()} chars</span>
              <span className={corpusText.length < 10000 ? "text-amber" : corpusText.length < 50000 ? "text-cyan" : "text-mint"}>
                {corpusText.length < 5000 ? "Tiny (overfit fast)" :
                 corpusText.length < 20000 ? "Small (~200 steps)" :
                 corpusText.length < 100000 ? "Medium (~500 steps)" : "Large (~1000+ steps)"}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={loadShakespeareCorpus}
                className="inline-flex items-center justify-center gap-1.5 h-8 rounded border border-line hover:border-slate-400 bg-ink/30 text-xs font-semibold text-slate-300"
                title="~1.2k chars — auto-sets tiny model: 1L/2H/32E"
              >
                Shakespeare
              </button>
              <button
                onClick={loadFinanceCorpus}
                className="inline-flex items-center justify-center gap-1.5 h-8 rounded border border-line hover:border-slate-400 bg-ink/30 text-xs font-semibold text-slate-300"
                title="~30k chars — auto-sets model: 2L/4H/64E"
              >
                Finance (~30k)
              </button>
            </div>
            <button
              onClick={loadWikitextCorpus}
              disabled={isLoadingWikitext}
              className="inline-flex items-center justify-center gap-1.5 h-8 rounded border border-cyan/40 hover:border-cyan bg-cyan/10 text-cyan text-xs font-semibold transition"
              title="~530k chars — auto-sets model: 2L/4H/128E"
            >
              {isLoadingWikitext ? "Loading 100k Words..." : "Load WikiText-103 (~530k chars)"}
            </button>
          </div>
        </section>

        {/* Sliders Configuration */}
        <section className="flex flex-col gap-4 border-t border-line/40 pt-5">
          <div className="flex items-center gap-2 text-cyan">
            <Cpu size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider">2. Hyperparameters</h3>
          </div>
          <p className="text-xs text-slate-400">
            Configure self-attention dimension configurations before compiling.
          </p>

          <div className="space-y-3.5">
            <div>
              <div className="mb-1 flex justify-between text-xs font-medium">
                <span className="text-slate-400">Layers (Blocks)</span>
                <span className="text-cyan font-mono">{nLayer}</span>
              </div>
              <input
                type="range" min="1" max="4" step="1"
                value={nLayer} onChange={(e) => setNLayer(Number(e.target.value))}
                disabled={isInitializing || isTraining}
                className="w-full accent-cyan"
              />
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs font-medium">
                <span className="text-slate-400">Attention Heads</span>
                <span className="text-cyan font-mono">{nHead}</span>
              </div>
              <input
                type="range" min="1" max="8" step="1"
                value={nHead} onChange={(e) => setNHead(Number(e.target.value))}
                disabled={isInitializing || isTraining}
                className="w-full accent-cyan"
              />
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs font-medium">
                <span className="text-slate-400">Embedding Size (n_embd)</span>
                <span className="text-cyan font-mono">{nEmbd}</span>
              </div>
              <input
                type="range" min="16" max="128" step="16"
                value={nEmbd} onChange={(e) => setNEmbd(Number(e.target.value))}
                disabled={isInitializing || isTraining}
                className="w-full accent-cyan"
              />
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs font-medium">
                <span className="text-slate-400">Context Length (Block Size)</span>
                <span className="text-cyan font-mono">{blockSize}</span>
              </div>
              <input
                type="range" min="8" max="64" step="8"
                value={blockSize} onChange={(e) => setBlockSize(Number(e.target.value))}
                disabled={isInitializing || isTraining}
                className="w-full accent-cyan"
              />
            </div>
          </div>

          <button
            onClick={handleInitialize}
            disabled={isInitializing}
            className={`w-full h-10 rounded font-semibold text-xs transition uppercase ${
              isInitializing ? "bg-slate-700 text-slate-400 cursor-not-allowed" : "bg-cyan text-ink hover:bg-cyan/80"
            }`}
          >
            {isInitializing ? "⚙ Compiling Model..." : initialized ? "Reinitialize Lab" : "Build Vocab & Compile Model"}
          </button>
        </section>
      </aside>

      {/* CENTER COLUMN: SVG Loss curves, live training controllers & seed generator */}
      <main className="p-5 flex flex-col gap-6 overflow-y-auto min-h-0 bg-ink/15">
        
        {/* Training Console Card */}
        <section className="rounded-lg border border-line bg-panel/30 p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-cyan">
              <GraduationCap size={18} />
              <h3 className="text-sm font-bold uppercase tracking-wider">3. Live Training Loop</h3>
            </div>
          {initialized && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-mint/20 bg-mint/5 text-mint font-semibold">
                Vocab: {vocabSize} chars
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-600 bg-slate-800 text-slate-300 font-mono">
                Step {currentStep}
              </span>
              {gradNorm != null && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${
                  gradNorm > 1.5 ? "border-amber/30 bg-amber/5 text-amber" : "border-line bg-ink text-slate-400"
                }`} title="Gradient norm (clipped at 1.0 to prevent divergence)">
                  grad={gradNorm.toFixed(2)}
                </span>
              )}
            </div>
          )}
          </div>

          {!initialized ? (
            <div className="grid h-48 place-items-center rounded border border-dashed border-line text-center p-8 text-xs text-slate-400">
              Please compile the model in Step 2 to enable the training loop and generation console.
            </div>
          ) : (
            <>
              {/* Training guidance banner */}
              <div className="rounded border border-cyan/10 bg-cyan/5 px-3 py-2 text-[11px] text-slate-300">
                <span className="font-semibold text-cyan">Training guide: </span>
                Expected initial loss ≈ <span className="font-mono text-slate-200">{Math.log(vocabSize).toFixed(2)}</span> (log vocab).
                Use <span className="font-mono text-cyan">LR = 0.003</span> for optimal and stable convergence.
                Finance dataset → ~200 steps for coherent text. WikiText → ~1000+ steps.
                Constrained Top-k sampling is active to ensure highly coherent generation.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-5">
              {/* Curve chart */}
              <LossChart history={lossHistory} />

              {/* Loop Tuning */}
              <div className="flex flex-col justify-between border-l border-line/40 pl-5">
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-0.5">Learning Rate <span className="text-cyan text-[10px]">(optimal: 0.003)</span></label>
                    <input
                      type="number" step="0.001" min="0.0001" max="0.1"
                      value={lr} onChange={(e) => setLr(Number(e.target.value))}
                      className="w-full rounded border border-line bg-ink/80 p-1.5 font-mono text-cyan"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-0.5">Batch Size</label>
                    <input
                      type="number" step="4" min="4" max="64"
                      value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))}
                      className="w-full rounded border border-line bg-ink/80 p-1.5 font-mono text-cyan"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-0.5">Steps per Click</label>
                    <input
                      type="number" min="1" max="100"
                      value={stepsPerClick} onChange={(e) => setStepsPerClick(Number(e.target.value))}
                      className="w-full rounded border border-line bg-ink/80 p-1.5 font-mono text-cyan"
                    />
                  </div>
                </div>

                {/* Training Actions */}
                <div className="mt-4 pt-3 border-t border-line/40 grid grid-cols-2 gap-2">
                  <button
                    onClick={toggleTrainingLoop}
                    className={`h-9 flex items-center justify-center gap-1.5 rounded text-xs font-semibold uppercase text-ink ${
                      isTraining ? "bg-amber hover:bg-amber/80" : "bg-mint hover:bg-mint/85"
                    }`}
                  >
                    {isTraining ? (
                      <>
                        <Pause size={13} /> Pause
                      </>
                    ) : (
                      <>
                        <Play size={13} /> Train Loop
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleTrainStep()}
                    disabled={isTraining}
                    className="h-9 flex items-center justify-center gap-1.5 rounded bg-cyan hover:bg-cyan/85 disabled:bg-slate-700 text-ink text-xs font-semibold uppercase"
                  >
                    <FastForward size={13} /> Run Step
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
        </section>

        {/* Text Sequence Generation Card */}
        <section className="rounded-lg border border-line bg-panel/30 p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-cyan">
            <Sparkles size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider">4. Causal Text Generator</h3>
          </div>

          {!initialized ? (
            <div className="grid h-32 place-items-center rounded border border-dashed border-line text-center p-8 text-xs text-slate-400">
              Compilation required in Step 2.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Seed Text (Prompt)</label>
                  <input
                    type="text"
                    value={seedText}
                    onChange={(e) => setSeedText(e.target.value)}
                    className="w-full rounded border border-line bg-ink p-2 text-xs outline-none focus:border-cyan/50 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Tokens to Generate</label>
                  <input
                    type="number" min="5" max="300"
                    value={genTokensCount}
                    onChange={(e) => setGenTokensCount(Number(e.target.value))}
                    className="w-full rounded border border-line bg-ink p-2 text-xs outline-none focus:border-cyan/50 font-mono text-cyan"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Temperature ({temperature})</label>
                  <input
                    type="range" min="0.0" max="2.0" step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="w-full accent-cyan mt-2"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Top-K Sampling ({topK})</label>
                  <input
                    type="range" min="1" max="50" step="1"
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                    className="w-full accent-cyan mt-2"
                  />
                </div>
              </div>

              <button
                onClick={handleGenerateText}
                disabled={isGenerating}
                className="w-full h-10 rounded bg-cyan hover:bg-cyan/85 disabled:bg-slate-700 text-ink text-xs font-semibold uppercase flex items-center justify-center gap-2"
              >
                <Sparkles size={15} />
                {isGenerating ? "Casting Token Prediction Matrices..." : "Autoregressive Generation (Generate text)"}
              </button>

              {generatedText && (
                <div className="rounded border border-line bg-ink p-4 flex flex-col gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Model Output text:</span>
                  <div className="text-sm font-mono whitespace-pre-wrap leading-relaxed text-mint tracking-wide select-all">
                    {generatedText}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

    </div>
  );
}
