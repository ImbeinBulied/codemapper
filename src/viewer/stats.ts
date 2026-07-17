/**
 * Stats computation utilities for the codemapper viewer dashboard.
 * Extracted into its own module so it can be unit-tested without DOM dependencies.
 */

import type { ProjectStats, GraphProperties, GitStatsData, LanguageStat } from './state.js';

const LANG_COLORS: Record<string, string> = {
  typescript: '#3178c6',
  javascript: '#f7df1e',
  rust: '#dea584',
  python: '#3572a5',
  go: '#00add8',
  java: '#b07219',
  csharp: '#178600',
  swift: '#f05138',
  php: '#4f5b93',
};

export function getLangColor(lang: string): string {
  return LANG_COLORS[lang.toLowerCase()] || '#8b949e';
}

/**
 * Detect programming language from a file extension.
 */
function detectLanguage(ext: string): string {
  const e = ext.toLowerCase();
  if (/^[jt]sx?$|^mjs$/.test(e)) return 'typescript';
  if (e === 'py') return 'python';
  if (e === 'rs') return 'rust';
  if (e === 'go') return 'go';
  if (e === 'java') return 'java';
  if (e === 'cs') return 'csharp';
  if (e === 'swift') return 'swift';
  if (e === 'php') return 'php';
  return 'other';
}

/**
 * Compute project stats, graph properties, and git stats from the raw API data.
 * Pure function — no DOM side effects.
 */
export function computeStatsFromData(data: any): {
  projectStats: ProjectStats;
  graphProperties: GraphProperties;
  gitStats: GitStatsData | null;
} {
  const nodes = data.graph?.nodes || [];
  const edges = data.graph?.edges || [];
  const stats = data.stats || { files: 0, functions: 0, classes: 0, imports: 0 };
  const analytics = data.analytics;
  const cyclesData = data.cycles || [];
  const gitData = data.git;
  const cycleCount = data.cycleCount ?? cyclesData.length;

  // --- Project Stats ---
  const langCounts = new Map<string, number>();
  for (const n of nodes) {
    if (n.kind !== 'file') continue;
    const ext = (n.id.split('.').pop() || '').toLowerCase();
    const lang = detectLanguage(ext);
    langCounts.set(lang, (langCounts.get(lang) || 0) + 1);
  }

  const totalFiles = stats.files || 0;
  const languages: LanguageStat[] = Array.from(langCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      percentage: totalFiles > 0 ? Math.round((count / totalFiles) * 100) : 0,
    }));

  const depCount = nodes.filter((n: any) => n.kind === 'module').length;

  // Normalize metrics to a consistent array of { id, ...metric } objects
  const metricsEntries: Array<{ id: string; [key: string]: any }> = [];
  if (analytics?.metrics) {
    const raw = analytics.metrics;
    if (Array.isArray(raw)) {
      for (const [id, m] of raw) {
        metricsEntries.push({ id, ...m });
      }
    } else {
      for (const [id, m] of raw.entries()) {
        metricsEntries.push({ id, ...m });
      }
    }
  }

  let totalLoc = 0;
  for (const entry of metricsEntries) {
    totalLoc += entry.loc || 0;
  }

  const ps: ProjectStats = {
    languages,
    fileCount: stats.files || 0,
    functionCount: stats.functions || 0,
    classCount: stats.classes || 0,
    importCount: stats.imports || 0,
    totalLoc,
    dependencyCount: depCount,
  };

  // --- Graph Properties ---
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const maxPossibleEdges = nodeCount * (nodeCount - 1);
  const density = maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;

  // Use normalized metrics entries
  const avgFanIn =
    metricsEntries.length > 0
      ? metricsEntries.reduce((sum: number, m: any) => sum + (m.fanIn || 0), 0) / metricsEntries.length
      : 0;
  const avgFanOut =
    metricsEntries.length > 0
      ? metricsEntries.reduce((sum: number, m: any) => sum + (m.fanOut || 0), 0) / metricsEntries.length
      : 0;
  const avgInstability =
    metricsEntries.length > 0
      ? metricsEntries.reduce((sum: number, m: any) => sum + (m.instability || 0), 0) / metricsEntries.length
      : 0;

  let low = 0,
    medium = 0,
    high = 0;
  for (const m of metricsEntries) {
    const inst = m.instability || 0;
    if (inst < 0.33) low++;
    else if (inst < 0.66) medium++;
    else high++;
  }

  const gp: GraphProperties = {
    nodeCount,
    edgeCount,
    cycleCount,
    density,
    avgFanIn,
    avgFanOut,
    avgInstability,
    instabilityDistribution: { low, medium, high },
  };

  // --- Git Stats ---
  let gs: GitStatsData | null = null;
  if (gitData && Object.keys(gitData).length > 0) {
    const gitEntries = Object.entries(gitData) as Array<
      [string, { lastModified?: string; author?: string; churn?: number }]
    >;

    const churnValues = gitEntries.map(([, g]) => g.churn || 0);
    const totalCommits = churnValues.length > 0 ? Math.max(...churnValues) : 0;

    const dates = gitEntries
      .map(([, g]) => g.lastModified)
      .filter(Boolean)
      .sort();
    const timeRange =
      dates.length >= 2
        ? `${dates[0]!.slice(0, 10)} – ${dates[dates.length - 1]!.slice(0, 10)}`
        : dates.length === 1
          ? dates[0]!.slice(0, 10)
          : 'N/A';

    const topChurned = gitEntries
      .filter(([, g]) => (g.churn || 0) > 0)
      .sort(([, a], [, b]) => (b.churn || 0) - (a.churn || 0))
      .slice(0, 10)
      .map(([id, g]) => ({
        path: id.replace(/^file:/, ''),
        churn: g.churn || 0,
      }));

    const hotFiles = metricsEntries
      .filter((m: any) => (m.heat || 0) > 0)
      .sort((a: any, b: any) => b.heat - a.heat)
      .slice(0, 10)
      .map((m: any) => ({
        path: (m.id || '').replace(/^file:/, ''),
        score: m.heat,
      }));

    gs = {
      totalCommits,
      timeRange,
      topChurnedFiles: topChurned,
      hotFiles,
    };
  }

  return { projectStats: ps, graphProperties: gp, gitStats: gs };
}
