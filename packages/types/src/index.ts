// =============================================================================
// ForgeMind — Shared Type Definitions
// =============================================================================

// ─── API Response Envelope ───────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ResponseMeta {
  timestamp: string;
  version: string;
  requestId?: string;
}

// ─── Health Check ────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  uptime: number;
  timestamp: string;
  services: ServiceHealth[];
}

export interface ServiceHealth {
  name: string;
  status: 'ok' | 'degraded' | 'error';
  latency?: number;
  message?: string;
}

// ─── Environment ─────────────────────────────────────────────────────────────

export type AppEnvironment = 'development' | 'staging' | 'production' | 'test';

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Auth & User Types ────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Database Models Types ────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Repository {
  id: string;
  userId: string;
  githubId: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  language?: string | null;
  description?: string | null;
  stars: number;
  forks: number;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryMember {
  id: string;
  repositoryId: string;
  userId: string;
  role: string;
  createdAt: string;
}

export type AnalysisJobStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface AnalysisJob {
  id: string;
  repositoryId: string;
  status: AnalysisJobStatus | string;
  stage?: string | null;
  stageLabel?: string | null;
  processedCount?: number | null;
  totalCount?: number | null;
  commitHash: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GithubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | string;
  sha: string;
  size?: number;
  url?: string;
}

export interface RepositoryFile {
  id: string;
  repositoryId: string;
  path: string;
  name: string;
  extension: string | null;
  language: string | null;
  type: string;
  size: number | null;
  sha: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IndexingResult {
  totalItemsProcessed: number;
  filesIndexed: number;
  ignoredItems: number;
  languageDistribution: Record<string, number>;
}

export interface RepositorySymbol {
  id: string;
  repositoryId: string;
  fileId: string;
  name: string;
  kind: string;
  filePath: string;
  startLine: number | null;
  endLine: number | null;
  exported: boolean;
  createdAt: string;
}

export interface FileDependency {
  id: string;
  repositoryId: string;
  sourceFileId: string;
  sourcePath: string;
  targetPath: string;
  isExternal: boolean;
  importedSymbols: string[];
  createdAt: string;
}

export interface ExtractionResult {
  filesParsed: number;
  totalSymbolsExtracted: number;
  totalDependenciesExtracted: number;
}

export interface VectorIndexingResult {
  filesChunked: number;
  totalChunksCreated: number;
  totalChunksEmbedded: number;
  chunksSkippedUnchanged: number;
  providerUsed: string;
}

export interface RepositoryAcquisitionResult {
  job: AnalysisJob;
  commitHash: string;
  fileCount: number;
  totalSizeBytes: number;
  indexing?: IndexingResult;
  extraction?: ExtractionResult;
  vectorIndexing?: VectorIndexingResult;
}

// ─── Vector Embeddings & Code Chunks ──────────────────────────────────────────

export interface CodeChunkMetadata {
  symbolName?: string;
  symbolKind?: string;
  headerContext?: string;
  checksum?: string;
  language?: string;
  filePath?: string;
  [key: string]: unknown;
}

export interface CodeChunk {
  id: string;
  repositoryId: string;
  fileId: string;
  chunkIndex: number;
  content: string;
  filePath: string;
  language: string | null;
  startLine: number;
  endLine: number;
  tokenCount: number;
  linesCount: number;
  checksum: string;
  metadata: CodeChunkMetadata | null;
  createdAt: string;
}

export interface VectorSearchResult {
  id: string;
  repositoryId: string;
  fileId: string;
  chunkIndex: number;
  content: string;
  filePath: string;
  language: string | null;
  startLine: number;
  endLine: number;
  tokenCount: number;
  linesCount: number;
  similarity: number;
  metadata: CodeChunkMetadata | null;
}

export interface VectorPipelineStatus {
  repositoryId: string;
  totalChunks: number;
  embeddedChunks: number;
  indexedFiles: number;
  provider: string;
}

// ─── RAG Context Retrieval & Chat Engine ───────────────────────────────────────

export interface RAGSourceCitation {
  filePath: string;
  startLine: number;
  endLine: number;
  score: number;
  symbolName?: string;
  symbolKind?: string;
  language?: string | null;
  content?: string;
}

export interface RAGQueryRequest {
  query: string;
  topK?: number;
  conversationId?: string;
}

export interface RAGQueryResponse {
  answer: string;
  sources: RAGSourceCitation[];
  repositoryId: string;
  query: string;
  providerUsed: string;
}

export interface RetrievedContextChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string | null;
  similarity: number;
  metadata: CodeChunkMetadata | null;
}

export interface ChatSession {
  id: string;
  repositoryId: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ─── Code Intelligence & Explainability ──────────────────────────────────────

export interface CodeExplainRequest {
  /** Relative file path within the repository */
  filePath: string;
  /** Optional symbol name to explain (function, class, interface) */
  symbolName?: string;
  /** Optional symbol kind hint ('function' | 'class' | 'interface' | etc.) */
  symbolKind?: string;
}

export interface CodeExplainResponse {
  filePath: string;
  symbolName?: string;
  symbolKind?: string;
  startLine?: number;
  endLine?: number;
  /** AI-generated explanation grounded in retrieved code context */
  explanation: string;
  /** Supporting source citations */
  sources: RAGSourceCitation[];
  /** Related symbols found in the same file */
  relatedSymbols: RepositorySymbol[];
  providerUsed: string;
}

export interface FileDependencyIntelligence {
  filePath: string;
  /** Files this file imports from (outgoing) */
  imports: FileDependency[];
  /** Files that import this file (incoming) */
  importedBy: FileDependency[];
  /** Count of internal dependencies */
  internalCount: number;
  /** Count of external package dependencies */
  externalCount: number;
}

export interface ImpactAnalysisResult {
  targetFilePath: string;
  targetSymbolName?: string;
  /** Files that directly import the target */
  directDependents: FileDependency[];
  /** Symbols defined in the target file */
  affectedSymbols: RepositorySymbol[];
  /** Total count of files affected */
  totalAffected: number;
  /** Whether semantic RAG explanation was used */
  ragExplanationUsed: boolean;
  /** Optional AI narrative of impact */
  explanation?: string;
  sources?: RAGSourceCitation[];
}

export interface ArchitectureOverviewResponse {
  repositoryId: string;
  repositoryName: string;
  /** Language distribution: { TypeScript: 45, Python: 12, ... } */
  languageDistribution: Record<string, number>;
  totalFiles: number;
  totalSymbols: number;
  totalDependencies: number;
  internalDependencyCount: number;
  externalDependencyCount: number;
  /** Top-level directories detected from file paths */
  topDirectories: Array<{ directory: string; fileCount: number }>;
  /** Most referenced external packages */
  topExternalPackages: Array<{ package: string; count: number }>;
  /** Top symbol kinds: { function: 120, class: 30, ... } */
  symbolKindDistribution: Record<string, number>;
}

// ─── Interactive Dependency Graph & Visual Topology Engine ───────────────────

export type GraphNodeType = 'file' | 'symbol' | 'module' | 'package';
export type GraphEdgeType = 'imports' | 'defines' | 'calls' | 'depends_on';

export interface GraphNodeMetrics {
  inDegree: number;
  outDegree: number;
  linesCount?: number;
  symbolKind?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  group: string;
  path?: string;
  metrics: GraphNodeMetrics;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
  weight: number;
}

export interface CircularDependencyCycle {
  cycle: string[];
  length: number;
}

export interface GraphTopologyMetrics {
  totalNodes: number;
  totalEdges: number;
  fileNodeCount: number;
  symbolNodeCount: number;
  packageNodeCount: number;
  moduleNodeCount: number;
  density: number;
  hubNodes: GraphNode[];
  circularDependencies: CircularDependencyCycle[];
}

export interface RepositoryGraphResponse {
  repositoryId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  metrics: GraphTopologyMetrics;
}

export interface GraphQueryOptions {
  depth?: number;
  nodeType?: GraphNodeType | 'all';
  limit?: number;
  filter?: string;
}

// ─── Automated Onboarding Blueprint & Guided Tour Engine ───────────────────

export interface BlueprintEntryPoint {
  path: string;
  name: string;
  type: 'entry_point' | 'configuration' | 'schema' | 'core_logic';
  description: string;
}

export interface BlueprintTourStep {
  stepNumber: number;
  title: string;
  targetFile: string;
  symbolName?: string;
  description: string;
  keyTakeaway: string;
}

export interface BlueprintSection {
  title: string;
  category: 'frontend' | 'api' | 'domain_logic' | 'data_layer' | 'configuration';
  files: string[];
  summary: string;
}

export interface BlueprintQuickstart {
  prerequisites: string[];
  setupCommands: string[];
  keyEnvironmentVars: string[];
  devServerCommand: string;
}

export type OnboardingStartHereCategory =
  'bootstrap' | 'core_logic' | 'data_model' | 'api_gateway' | 'ui';

export interface OnboardingStartHereFile {
  path: string;
  name: string;
  category: OnboardingStartHereCategory;
  reason: string;
  fanInCount: number;
}

export type OnboardingExplorationCategory = 'architecture' | 'setup' | 'health_fix' | 'code_flow';

export type OnboardingExplorationActionType =
  'view_file' | 'open_graph' | 'explain_code' | 'investigate_ai' | 'view_remediation';

export interface OnboardingExplorationTask {
  taskId: string;
  title: string;
  category: OnboardingExplorationCategory;
  description: string;
  targetFile?: string;
  actionType: OnboardingExplorationActionType;
}

export interface OnboardingBlueprint {
  repositoryId: string;
  repositoryName: string;
  generatedAt: string;
  summary: string;
  entryPoints: BlueprintEntryPoint[];
  guidedTour: BlueprintTourStep[];
  architecturalSections: BlueprintSection[];
  quickstart: BlueprintQuickstart;
  healthSummary?: {
    healthScore: number;
    grade: string;
    totalFindings: number;
    criticalFindingsCount: number;
  };
  startHereFiles?: OnboardingStartHereFile[];
  firstExplorationTasks?: OnboardingExplorationTask[];
  providerUsed: string;
}

export interface BlueprintStepQARequest {
  stepNumber: number;
  targetFile: string;
  query: string;
  symbolName?: string;
}

export interface BlueprintStepQAResponse {
  stepNumber: number;
  targetFile: string;
  query: string;
  answer: string;
  sources: RAGSourceCitation[];
  providerUsed: string;
}

// ─── Blueprint Share Engine (Sprint 7 Task 3) ──────────────────────────────

export interface BlueprintShareRequest {
  includeQAHistory?: boolean;
  customNotes?: string;
  expiresInDays?: number;
}

export interface BlueprintShareResponse {
  shareToken: string;
  shareUrl: string;
  expiresAt: string;
}

export interface SharedBlueprintQAItem {
  query: string;
  answer: string;
  timestamp: string;
}

export interface SharedBlueprintView {
  repositoryName: string;
  generatedAt: string;
  expiresAt: string;
  summary: string;
  entryPoints: BlueprintEntryPoint[];
  guidedTour: BlueprintTourStep[];
  architecturalSections: BlueprintSection[];
  quickstart: BlueprintQuickstart;
  healthSummary?: {
    healthScore: number;
    grade: string;
    totalFindings: number;
    criticalFindingsCount: number;
  };
  startHereFiles?: OnboardingStartHereFile[];
  firstExplorationTasks?: OnboardingExplorationTask[];
  customNotes?: string;
  qaThreads?: Record<number, SharedBlueprintQAItem[]>;
}

// ─── Architecture Health Engine (Sprint 8 Task 1) ─────────────────────────

export type HealthFindingCategory =
  'circular_dependency' | 'layer_violation' | 'coupling_hotspot' | 'orphan_export';

export type HealthFindingSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface HealthFinding {
  id: string;
  category: HealthFindingCategory;
  severity: HealthFindingSeverity;
  title: string;
  description: string;
  affectedNodeIds: string[];
  affectedFilePaths: string[];
  metrics: {
    fanIn?: number;
    fanOut?: number;
    cycleLength?: number;
    totalDegree?: number;
  };
  penaltyPoints: number;
}

export interface NodeFanMetrics {
  nodeId: string;
  filePath: string;
  fanIn: number;
  fanOut: number;
  totalDegree: number;
}

export interface ArchitectureHealthScoreBreakdown {
  baseScore: number;
  cyclePenalty: number;
  layerViolationPenalty: number;
  hotspotPenalty: number;
  orphanPenalty: number;
  finalScore: number;
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';
}

export interface ArchitectureHealthReport {
  repositoryId: string;
  healthScore: number;
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';
  scoreBreakdown: ArchitectureHealthScoreBreakdown;
  metrics: {
    totalFiles: number;
    totalDependencies: number;
    circularCycleCount: number;
    layerViolationCount: number;
    hotspotCount: number;
    orphanExportCount: number;
  };
  findings: HealthFinding[];
  fanMetrics: NodeFanMetrics[];
  evaluatedAt: string;
}

export interface ArchitectureHealthExplainRequest {
  findingId: string;
  category?: HealthFindingCategory;
  affectedFiles?: string[];
}

export interface ArchitectureHealthExplanationResponse {
  findingId: string;
  category: HealthFindingCategory;
  title: string;
  explanation: string;
  architecturalImpact: string;
  remediationSteps: string[];
  safeFilesToKeep: string[];
  blastRadius: {
    directDependents: string[];
    transitiveDependents: string[];
    blastRadiusScore: number;
  };
  sources: RAGSourceCitation[];
  providerUsed: string;
}

export interface GenerateRefactoringPlanRequest {
  findingId: string;
  category?: HealthFindingCategory;
  affectedFiles?: string[];
}

export interface StructuredRemediationPlan {
  findingId: string;
  category: HealthFindingCategory;
  severity: HealthFindingSeverity;
  title: string;
  targetFile: string;
  problemSummary: string;
  rootCause: string;
  affectedComponents: {
    filesToModify: string[];
    newFilesRequired: string[];
    symbolsInvolved: string[];
  };
  dependencyImpact: {
    directDependencies: string[];
    directDependents: string[];
    reachableBlastRadiusCount: number;
    couplingMetrics: {
      fanIn: number;
      fanOut: number;
    };
  };
  recommendedStrategy: string;
  implementationSteps: Array<{
    stepNumber: number;
    title: string;
    description: string;
    targetFile?: string;
  }>;
  risksAndRegressions: string[];
  testingStrategy: string[];
  verificationChecklist: string[];
  expectedArchitecturalImprovement: {
    penaltyPointsRecovered: number;
    projectedHealthScore: number;
    summary: string;
  };
  evidenceGrounding: {
    evidenceSummary: string;
    hasSufficientEvidence: boolean;
    insufficientEvidenceNotes?: string;
  };
  sources: RAGSourceCitation[];
  providerUsed: string;
}

// ─── Architectural Risk Intelligence & Developer Action Loop (Sprint 8 Task 4) ───

export type RiskImpactLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface RemediationActionPlan {
  findingId: string;
  category: HealthFindingCategory;
  severity: HealthFindingSeverity;
  impactLevel: RiskImpactLevel;
  riskScore: number;
  title: string;
  targetFile: string;
  affectedFiles: string[];
  refactoringPattern: string;
  estimatedHealthImprovement: number;
  projectedHealthScore: number;
  stepByStepRemediation: string[];
}

export interface ArchitecturalRiskIntelligenceResponse {
  repositoryId: string;
  currentHealthScore: number;
  projectedHealthScore: number;
  totalPotentialScoreImprovement: number;
  highestValueFix: RemediationActionPlan | null;
  rankedRemediations: RemediationActionPlan[];
  remediationSummary: {
    totalFindings: number;
    criticalRiskCount: number;
    highRiskCount: number;
    mediumRiskCount: number;
    lowRiskCount: number;
  };
}

export interface RemediationExplainRequest {
  findingId: string;
  targetFile?: string;
}

export interface RemediationExplanationResponse {
  findingId: string;
  targetFile: string;
  refactoringPattern: string;
  explanation: string;
  codeDiffProposal?: string;
  stepByStepInstructions: string[];
  affectedFiles: string[];
  riskScore: number;
  sources: RAGSourceCitation[];
  providerUsed: string;
}

// ─── Architectural Health Timeline & Regression Engine (Sprint 8 Task 5) ───

export type HealthTrendDirection = 'IMPROVED' | 'DEGRADED' | 'STABLE';
export type RegressionSeverity = 'CRITICAL' | 'WARNING' | 'NONE';

export interface ArchitectureHealthPoint {
  analysisId: string;
  commitHash: string | null;
  healthScore: number;
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';
  circularCycleCount: number;
  layerViolationCount: number;
  hotspotCount: number;
  orphanExportCount: number;
  evaluatedAt: string;
}

export interface ArchitectureHealthHistoryResponse {
  repositoryId: string;
  currentHealthScore: number;
  overallTrend: HealthTrendDirection;
  points: ArchitectureHealthPoint[];
}

export interface ArchitectureHealthComparisonResponse {
  repositoryId: string;
  baselineAnalysisId: string;
  currentAnalysisId: string;
  baselineHealthScore: number;
  currentHealthScore: number;
  healthDelta: number;
  trend: HealthTrendDirection;
  isRegressed: boolean;
  regressionSeverity: RegressionSeverity;
  newFindings: HealthFinding[];
  resolvedFindings: HealthFinding[];
  unmodifiedFindings: HealthFinding[];
  scoreBreakdownDelta: {
    baseScoreDelta: number;
    cyclePenaltyDelta: number;
    layerViolationPenaltyDelta: number;
    hotspotPenaltyDelta: number;
    orphanPenaltyDelta: number;
  };
  evaluatedAt: string;
}

// ─── PR Architecture Gatekeeper & Webhook Dashboard Types ───────────────────

export interface RepositoryPRGatekeeperOverview {
  repositoryId: string;
  totalPRAnalyses: number;
  passedCount: number;
  failedCount: number;
  neutralCount: number;
  passRate: number;
  latestAnalysis: PRGatekeeperHistoryItem | null;
  activeRegressionsCount: number;
  latestHealthScore: number | null;
  latestHealthDelta: number | null;
}

export interface PRGatekeeperHistoryItem {
  id: string;
  prNumber: number | null;
  title?: string | null;
  headSha: string | null;
  baseSha: string | null;
  targetRef?: string | null;
  status: string;
  outcome: 'pass' | 'fail' | 'neutral';
  healthScore: number | null;
  scoreDelta: number | null;
  commitHash: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface PRGatekeeperDetailResponse {
  prNumber: number;
  jobId: string;
  headSha: string | null;
  baseSha: string | null;
  status: string;
  snapshot: {
    healthScore: number;
    grade: string;
    totalFiles: number;
    totalDependencies: number;
    circularCycleCount: number;
    layerViolationCount: number;
    hotspotCount: number;
    orphanExportCount: number;
  } | null;
  baseline: {
    analysisJobId: string;
    commitHash: string | null;
    healthScore: number;
    grade: string;
  } | null;
  comparison: ArchitectureHealthComparisonResponse | null;
  policyResult: {
    outcome: 'pass' | 'fail' | 'neutral';
    statusDescription: string;
    reasons: string[];
    healthDelta: number;
    baselineHealthScore: number | null;
    prHealthScore: number;
    isRegressed: boolean;
    newCriticalCount: number;
    newHighCount: number;
    newCircularCyclesCount: number;
    newLayerViolationsCount: number;
    policyOptions?: Record<string, unknown>;
    evaluatedAt: string;
  };

  evaluatedAt: string;
}

export interface WebhookDeliveryLogItem {
  id: string;
  deliveryId: string;
  eventType: string;
  action: string | null;
  repositoryId: string | null;
  githubRepoId: number | null;
  prNumber: number | null;
  headSha: string | null;
  baseSha: string | null;
  sender: string | null;
  status: string;
  ignoredReason: string | null;
  receivedAt: string;
  processedAt: string | null;
}

export interface PRGatekeeperHistoryResponse {
  items: PRGatekeeperHistoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface WebhookDeliveryLogResponse {
  items: WebhookDeliveryLogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RepositoryGatekeeperConfig {
  id: string;
  repositoryId: string;
  enabled: boolean;
  maxScoreDegradation: number;
  blockOnNewCriticalFindings: boolean;
  blockOnNewHighFindings: boolean;
  blockOnNewCircularCycles: boolean;
  blockOnNewLayerViolations: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateGatekeeperConfigInput {
  enabled?: boolean;
  maxScoreDegradation?: number;
  blockOnNewCriticalFindings?: boolean;
  blockOnNewHighFindings?: boolean;
  blockOnNewCircularCycles?: boolean;
  blockOnNewLayerViolations?: boolean;
}

export interface WebhookStatusResponse {
  repositoryId: string;
  isConfigured: boolean;
  webhookUrl: string;
  secretConfigured: boolean;
  subscribedEvents: string[];
  recentDeliveriesCount: number;
  lastDeliveryAt: string | null;
  setupInstructions: {
    title: string;
    payloadUrl: string;
    contentType: string;
    secretNotice: string;
    eventsNotice: string;
  };
}

export type ImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ArchitectureImpact {
  prNumber: number | null;
  jobId: string;
  headSha: string;
  baseSha: string | null;
  overallImpactLevel: ImpactLevel;
  impactReasoning: string[];
  changedFiles: {
    count: number;
    paths: string[];
  };
  affectedComponents: string[];
  affectedModules: string[];
  affectedLayers: string[];
  dependencyImpact: {
    baselineDependenciesCount: number;
    prDependenciesCount: number;
    totalDependencyDelta: number;
    addedEdgesCount: number;
    removedEdgesCount: number;
  };
  newlyIntroducedRisks: {
    totalCount: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    items: HealthFinding[];
  };
  resolvedRisks: {
    totalCount: number;
    items: HealthFinding[];
  };
  baselineComparison: {
    baselineHealthScore: number | null;
    prHealthScore: number;
    scoreDelta: number;
    healthTrend: 'IMPROVED' | 'DEGRADED' | 'STABLE';
    baselineFound: boolean;
  };
  evaluatedAt: string;
}

export interface ArchitectureImpactResponse {
  success: boolean;
  impact: ArchitectureImpact;
}
