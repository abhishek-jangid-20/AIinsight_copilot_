export type RepositoryStatus = "queued" | "parsing" | "embedding" | "ready" | "failed";

export interface CodeSymbol {
  name: string;
  kind: "function" | "class" | "method" | "api" | "import";
  filePath: string;
  startLine: number;
  endLine: number;
  signature?: string;
}

export interface CodeChunk {
  id: string;
  repositoryId: string;
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  content: string;
  symbol?: CodeSymbol;
  imports: string[];
}

export interface DependencyEdge {
  source: string;
  target: string;
  kind: "imports" | "calls" | "contains" | "api";
}

export interface RepositoryAnalysis {
  repositoryId: string;
  files: Array<{ path: string; language: string; size: number; content?: string }>;
  chunks: CodeChunk[];
  symbols: CodeSymbol[];
  dependencies: DependencyEdge[];
  summary: {
    languages: Record<string, number>;
    fileCount: number;
    chunkCount: number;
    symbolCount: number;
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  citations?: Array<{ filePath: string; startLine: number; endLine: number }>;
}
