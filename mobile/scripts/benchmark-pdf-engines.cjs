#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

const REPORT_VERSION = 1;
const DEFAULT_PACKAGE = 'com.adriantinoco.krumer';
const MAX_RATIO = 1.5;
const MIN_FIRST_PAGE_SAMPLES = 3;
const MIN_INTERACTION_SAMPLES = 5;
const METRIC_MARKER = '[Krumer PDF] metric';

function usage() {
  console.log(`PDF engine benchmark

Capture a development log and an optional Android snapshot:
  node scripts/benchmark-pdf-engines.cjs --engine native --out native.json
  node scripts/benchmark-pdf-engines.cjs --engine webview --out webview.json

Record the Android WebView compositor layer used by an A/B run:
  node scripts/benchmark-pdf-engines.cjs --engine webview --layer none --out layer-none.json
  node scripts/benchmark-pdf-engines.cjs --engine webview --layer hardware --out layer-hardware.json

Parse an exported logcat file without a connected device:
  node scripts/benchmark-pdf-engines.cjs --engine webview --log webview.log --out webview.json

Compare two reports (native first, WebView second):
  node scripts/benchmark-pdf-engines.cjs --compare native.json webview.json
`);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) {
      if (!Array.isArray(result._)) result._ = [];
      result._.push(argument);
      continue;
    }
    const key = argument.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function numberFrom(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function percentile(values, fraction) {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function average(values) {
  const filtered = values.filter(finite);
  if (!filtered.length) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function metricSamples(metrics, event, field) {
  return metrics
    .filter((metric) => metric.event === event)
    .map((metric) => numberFrom(metric[field]))
    .filter((value) => value !== null);
}

function metricStrings(metrics, event, field) {
  return metrics
    .filter((metric) => metric.event === event)
    .map((metric) => metric[field])
    .filter((value) => typeof value === 'string');
}

function parseMetricLines(text) {
  const metrics = [];
  const malformed = [];
  for (const line of text.split(/\r?\n/)) {
    const markerIndex = line.indexOf(METRIC_MARKER);
    if (markerIndex < 0) continue;
    const jsonStart = line.indexOf('{', markerIndex + METRIC_MARKER.length);
    if (jsonStart < 0) {
      malformed.push(line.trim());
      continue;
    }
    try {
      const metric = JSON.parse(line.slice(jsonStart));
      if (metric && typeof metric === 'object' && typeof metric.event === 'string') metrics.push(metric);
      else malformed.push(line.trim());
    } catch {
      malformed.push(line.trim());
    }
  }
  return { malformed, metrics };
}

function summariseMetrics(metrics) {
  const firstPage = metricSamples(metrics, 'reader:first-page-ready', 'elapsedMs');
  const pageReady = metricSamples(metrics, 'reader:page-ready', 'latencyMs');
  const scaleReady = metricSamples(metrics, 'reader:scale-ready', 'latencyMs');
  const scaleGestures = metricSamples(metrics, 'reader:scale-ready', 'gestureMs');
  const runtimeOpen = metricSamples(metrics, 'web:runtime-open', 'elapsedMs');
  const rangeBytes = metricSamples(metrics, 'web:runtime-open', 'rangeBytes');
  const rangeRequests = metricSamples(metrics, 'web:runtime-open', 'rangeRequests');
  const rangeRejected = metricSamples(metrics, 'web:runtime-open', 'rangeRejected');
  const rangeTimeouts = metricSamples(metrics, 'web:runtime-open', 'rangeTimeouts');
  const androidLayerTypes = [...new Set(metricStrings(
    metrics,
    'web:runtime-open',
    'androidLayerType',
  ))];

  return {
    firstPageMs: {
      count: firstPage.length,
      mean: average(firstPage),
      p50: percentile(firstPage, 0.5),
      p95: percentile(firstPage, 0.95),
    },
    pageLatencyMs: {
      count: pageReady.length,
      mean: average(pageReady),
      p50: percentile(pageReady, 0.5),
      p95: percentile(pageReady, 0.95),
    },
    scaleLatencyMs: {
      count: scaleReady.length,
      mean: average(scaleReady),
      p50: percentile(scaleReady, 0.5),
      p95: percentile(scaleReady, 0.95),
    },
    scaleGestureMs: {
      count: scaleGestures.length,
      mean: average(scaleGestures),
      p50: percentile(scaleGestures, 0.5),
      p95: percentile(scaleGestures, 0.95),
    },
    webRuntime: {
      firstPageMs: {
        count: runtimeOpen.length,
        mean: average(runtimeOpen),
        p50: percentile(runtimeOpen, 0.5),
        p95: percentile(runtimeOpen, 0.95),
      },
      rangeBytes: average(rangeBytes),
      rangeRejected: average(rangeRejected),
      rangeRequests: average(rangeRequests),
      rangeTimeouts: average(rangeTimeouts),
      androidLayerType: androidLayerTypes.length === 1 ? androidLayerTypes[0] : null,
      androidLayerTypes,
    },
    stability: {
      metricCount: metrics.length,
      errors: metrics.filter((metric) => /error|failed|oom|anr/i.test(metric.event)).length,
    },
  };
}

function runAdb(adb, argumentsList) {
  return execFileSync(adb, argumentsList, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function parsePssKb(text) {
  const match = text.match(/TOTAL\s+PSS:\s*([\d,]+)/i) || text.match(/^\s*TOTAL\s+([\d,]+)/im);
  return match ? numberFrom(match[1]) : null;
}

function parseCpuPercent(text, packageName) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^\\s*([\\d.]+)%.*${escaped}(?:\\s|$)`, 'im'));
  return match ? numberFrom(match[1]) : null;
}

function parseTemperatureCelsius(text) {
  const match = text.match(/temperature:\s*(-?[\d.]+)/i);
  const raw = match ? numberFrom(match[1]) : null;
  return raw === null ? null : raw > 100 ? raw / 10 : raw;
}

function captureDeviceSnapshot(adb, packageName) {
  const snapshot = { adb, packageName, pssKb: null, cpuPercent: null, temperatureC: null, warnings: [] };
  try {
    const pid = runAdb(adb, ['shell', 'pidof', packageName]).trim();
    if (!pid) snapshot.warnings.push('The package is not running; memory and CPU are unavailable.');
    const meminfo = runAdb(adb, ['shell', 'dumpsys', 'meminfo', packageName]);
    snapshot.pssKb = parsePssKb(meminfo);
    const cpuinfo = runAdb(adb, ['shell', 'dumpsys', 'cpuinfo']);
    snapshot.cpuPercent = parseCpuPercent(cpuinfo, packageName);
    const battery = runAdb(adb, ['shell', 'dumpsys', 'battery']);
    snapshot.temperatureC = parseTemperatureCelsius(battery);
  } catch (error) {
    snapshot.warnings.push(error instanceof Error ? error.message : String(error));
  }
  return snapshot;
}

function stabilityFromLog(text) {
  return {
    anr: /ANR in|Application Not Responding/i.test(text),
    crash: /FATAL EXCEPTION|Fatal signal/i.test(text),
    oom: /OutOfMemoryError|Failed to allocate/i.test(text),
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function captureReport(args) {
  const packageName = typeof args.package === 'string' ? args.package : DEFAULT_PACKAGE;
  const engine = args.engine === 'native' || args.engine === 'webview' ? args.engine : 'unknown';
  const requestedLayer = args.layer === 'none' || args.layer === 'hardware' ? args.layer : null;
  if (args.layer && !requestedLayer) {
    throw new Error('Android layer must be "none" or "hardware".');
  }
  if (requestedLayer && engine !== 'webview') {
    throw new Error('--layer is only valid with --engine webview.');
  }
  let logText = '';
  let source = 'adb logcat';
  if (typeof args.log === 'string') {
    if (args.log === '-') {
      logText = fs.readFileSync(0, 'utf8');
      source = 'stdin';
    } else {
      logText = fs.readFileSync(args.log, 'utf8');
      source = args.log;
    }
  } else {
    const adb = typeof args.adb === 'string' ? args.adb : 'adb';
    logText = runAdb(adb, ['logcat', '-d', '-v', 'brief']);
  }
  const parsed = parseMetricLines(logText);
  const summary = summariseMetrics(parsed.metrics);
  const observedLayer = summary.webRuntime.androidLayerType;
  const configurationWarnings = [];
  if (requestedLayer && observedLayer && requestedLayer !== observedLayer) {
    configurationWarnings.push(
      `Requested layer ${requestedLayer}, but runtime metrics reported ${observedLayer}.`,
    );
  }
  if (requestedLayer && !observedLayer) {
    configurationWarnings.push('No runtime metric confirmed the requested Android layer.');
  }
  if (summary.webRuntime.androidLayerTypes.length > 1) {
    configurationWarnings.push('The log contains mixed Android layer types; repeat with a clean logcat.');
  }
  const report = {
    schemaVersion: REPORT_VERSION,
    capturedAt: new Date().toISOString(),
    packageName,
    engine,
    androidLayerType: observedLayer,
    requestedAndroidLayerType: requestedLayer,
    configurationWarnings,
    source,
    metrics: parsed.metrics,
    malformedMetricLines: parsed.malformed.length,
    summary,
    stability: stabilityFromLog(logText),
    snapshot: null,
    manualChecklist: [
      'Persistence: close at page N and reopen at page N.',
      'Rotation: portrait/landscape preserves page and zoom.',
      'Links: internal and external links remain functional.',
      'Bookmarks and notes: create, reopen and navigate to both.',
      'Scroll/paginated: traverse at least 100 pages and repeat the memory snapshot.',
      'Android layer A/B: repeat the same route with none and hardware; do not change the default without evidence.',
      'No visible OOM, ANR, crash or continuous PSS growth.',
    ],
  };
  if (!args.log || args.snapshot) {
    const adb = typeof args.adb === 'string' ? args.adb : 'adb';
    report.snapshot = captureDeviceSnapshot(adb, packageName);
  }
  const output = typeof args.out === 'string' ? args.out : null;
  if (output) writeJson(output, report);
  console.log(JSON.stringify(report, null, 2));
  return report;
}

function readReport(filePath) {
  const report = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!report || report.schemaVersion !== REPORT_VERSION || !report.summary) {
    throw new Error(`Invalid PDF benchmark report: ${filePath}`);
  }
  return report;
}

function ratio(candidate, baseline) {
  if (!finite(candidate) || !finite(baseline) || baseline <= 0) return null;
  return candidate / baseline;
}

function compareReports(nativeReport, webReport) {
  const comparisons = [];
  const add = (name, nativeValue, webValue) => {
    const value = ratio(webValue, nativeValue);
    comparisons.push({
      metric: name,
      native: nativeValue ?? null,
      webview: webValue ?? null,
      ratio: value,
      limit: MAX_RATIO,
      pass: value === null ? null : value <= MAX_RATIO,
    });
  };
  add('firstPageMs.p50', nativeReport.summary.firstPageMs.p50, webReport.summary.firstPageMs.p50);
  add('firstPageMs.p95', nativeReport.summary.firstPageMs.p95, webReport.summary.firstPageMs.p95);
  add('pageLatencyMs.p50', nativeReport.summary.pageLatencyMs.p50, webReport.summary.pageLatencyMs.p50);
  add('pageLatencyMs.p95', nativeReport.summary.pageLatencyMs.p95, webReport.summary.pageLatencyMs.p95);
  add('scaleLatencyMs.p50', nativeReport.summary.scaleLatencyMs.p50, webReport.summary.scaleLatencyMs.p50);
  add('scaleLatencyMs.p95', nativeReport.summary.scaleLatencyMs.p95, webReport.summary.scaleLatencyMs.p95);
  add('pssKb', nativeReport.snapshot?.pssKb, webReport.snapshot?.pssKb);
  add('cpuPercent', nativeReport.snapshot?.cpuPercent, webReport.snapshot?.cpuPercent);
  const nativeTemperature = nativeReport.snapshot?.temperatureC;
  const webTemperature = webReport.snapshot?.temperatureC;
  const temperatureDelta = finite(nativeTemperature) && finite(webTemperature)
    ? webTemperature - nativeTemperature : null;
  comparisons.push({
    metric: 'temperatureDeltaC',
    native: nativeTemperature ?? null,
    webview: webTemperature ?? null,
    delta: temperatureDelta,
    limit: 5,
    pass: temperatureDelta === null ? null : temperatureDelta <= 5,
  });

  const stability = {
    native: nativeReport.stability,
    webview: webReport.stability,
    pass: [nativeReport.stability, webReport.stability]
      .every((value) => !value.anr && !value.crash && !value.oom),
  };
  const measured = comparisons.filter((comparison) => comparison.pass !== null);
  const failed = comparisons.filter((comparison) => comparison.pass === false);
  const sampleGate = Boolean(
    nativeReport.snapshot?.pssKb
    && webReport.snapshot?.pssKb
    && nativeReport.summary.firstPageMs.count >= MIN_FIRST_PAGE_SAMPLES
    && webReport.summary.firstPageMs.count >= MIN_FIRST_PAGE_SAMPLES
    && nativeReport.summary.pageLatencyMs.count >= MIN_INTERACTION_SAMPLES
    && webReport.summary.pageLatencyMs.count >= MIN_INTERACTION_SAMPLES
    && nativeReport.summary.scaleLatencyMs.count >= MIN_INTERACTION_SAMPLES
    && webReport.summary.scaleLatencyMs.count >= MIN_INTERACTION_SAMPLES,
  );
  const decision = failed.length || !stability.pass
    ? 'keep-webview-experimental'
    : !sampleGate
      ? 'insufficient-measurements'
      : 'eligible-for-pilot';
  const result = {
    schemaVersion: REPORT_VERSION,
    comparedAt: new Date().toISOString(),
    native: { source: nativeReport.source, engine: nativeReport.engine },
    webview: { source: webReport.source, engine: webReport.engine },
    criteria: {
      maxWebviewRatio: MAX_RATIO,
      measuredMetrics: measured.length,
      sampleGate,
      minimumSamples: {
        firstPage: MIN_FIRST_PAGE_SAMPLES,
        interaction: MIN_INTERACTION_SAMPLES,
      },
      requiredManualChecks: nativeReport.manualChecklist,
    },
    comparisons,
    stability,
    decision,
    reason: decision === 'eligible-for-pilot'
      ? 'WebView is within the initial 1.5x measured budget; keep native rollback available.'
      : decision === 'keep-webview-experimental'
        ? 'A measured budget or stability check failed; do not make WebView the default.'
        : 'Capture more comparable samples on the same device before deciding.',
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.h) {
    usage();
    return;
  }
  if (args.compare) {
    const paths = [args.compare, ...(Array.isArray(args._) ? args._ : [])];
    if (paths.length < 2) throw new Error('Use --compare native.json webview.json.');
    compareReports(readReport(paths[0]), readReport(paths[1]));
    return;
  }
  captureReport(args);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
