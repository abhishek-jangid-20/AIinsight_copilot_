export type RepositoryStatus = "queued" | "parsing" | "embedding" | "ready" | "failed";

export interface Repository {
  _id: string;
  name: string;
  sourceType: "github" | "zip";
  sourceUrl?: string;
  status: RepositoryStatus;
  lastError?: string;
  analysis?: RepositoryAnalysis;
  updatedAt: string;
}

export interface RepositoryAnalysis {
  files: SourceFile[];
  chunks: CodeChunk[];
  symbols: CodeSymbol[];
  dependencies: DependencyEdge[];
  summary: Record<string, unknown>;
}

export interface SourceFile {
  path: string;
  language: string;
  size: number;
  content?: string;
}

export interface CodeSymbol {
  name: string;
  kind: string;
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface CodeChunk {
  id: string;
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  content: string;
}

export interface DependencyEdge {
  source: string;
  target: string;
  kind: string;
}
