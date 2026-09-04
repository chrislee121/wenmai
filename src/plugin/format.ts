import type { lintVault } from '../lint.js'
import type { writeGraphHtml } from '../graph.js'
import type { reviewVault } from '../review/index.js'
import type { status } from '../store.js'

export function formatStatus(report: Awaited<ReturnType<typeof status>>): string {
  const roots =
    report.sourceRoots
      .map((item) => `${item.readable ? 'ok' : 'missing'} [${item.origin}] ${item.path}`)
      .join('\n') || '(none — pick a workspace, or add extras with wenmai_config)'
  return [
    '文脉 status',
    `Root: ${report.root}`,
    `Initialized: ${report.initialized ? 'yes' : 'no'}`,
    `Pages: ${report.pageCount}`,
    `Raw sources: ${report.rawCount}`,
    `Index updated: ${report.indexUpdated ?? 'n/a'}`,
    'sourceRoots:',
    roots,
  ].join('\n')
}

export function formatLint(report: Awaited<ReturnType<typeof lintVault>>): string {
  const lines = [
    `文脉 lint: ${report.errorCount} errors, ${report.warningCount} warnings, ${report.filesExamined} files.`,
    ...report.diagnostics.slice(0, 20).map((item) => `- ${item.severity.toUpperCase()} ${item.code} ${item.path}: ${item.message}`),
  ]
  if (report.diagnostics.length > 20) lines.push(`... ${report.diagnostics.length - 20} more omitted`)
  return lines.join('\n')
}

export function formatReview(report: Awaited<ReturnType<typeof reviewVault>>): string {
  const lines = [
    `文脉 review: ${report.findingCount} findings, pages ${report.metrics.pageCount}, raw ${report.metrics.rawCount}.`,
    `duplicates ${report.metrics.duplicatePairs}, stale ${report.metrics.stalePageCount}, expired ${report.metrics.expiredPageCount}, orphans ${report.metrics.orphanRatio.toFixed(2)}.`,
    `blindSpot: ${report.blindSpot}`,
  ]
  if (report.truncationNote) lines.push(report.truncationNote)
  for (const item of report.findings.slice(0, 20)) {
    lines.push(`- ${item.severity.toUpperCase()} ${item.kind} ${item.id} ${item.paths.join(' | ')}: ${item.reason}`)
  }
  if (report.findings.length > 20) lines.push(`... ${report.findings.length - 20} more omitted`)
  return lines.join('\n')
}

export function formatGraph(report: Awaited<ReturnType<typeof writeGraphHtml>>): string {
  const hubs = report.hubs.map((item) => `- ${item.label} (${item.degree})`).join('\n') || '(none)'
  return [
    '文脉 graph',
    `File: ${report.htmlPath}`,
    `Compiled pages: ${report.pageCount}, workspace articles: ${report.articleCount}`,
    `Nodes: ${report.nodeCount}, edges: ${report.edgeCount}${report.truncated ? ' (article scan capped at 600)' : ''}`,
    'Hubs:',
    hubs,
    'Open the HTML file in a browser for the interactive map.',
  ].join('\n')
}
