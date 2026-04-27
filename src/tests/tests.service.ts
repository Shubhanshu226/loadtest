import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

type TestStatus = 'created' | 'running' | 'completed' | 'failed';

type TestSummary = {
  id: string;
  status: TestStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  vus: number;
  duration: string;
  collectionName?: string;
  error?: string;
  k6Summary?: any;
  perRequestTimings?: Record<
    string,
    { count?: number; avg?: number; p90?: number; p95?: number; max?: number; min?: number }
  >;
  perRequestReport?: Array<{
    api: string;
    count: number;
    errorCount: number;
    errorPct: number;
    avgMs?: number;
    minMs?: number;
    maxMs?: number;
    p50Ms?: number;
    p90Ms?: number;
    p95Ms?: number;
    p99Ms?: number;
    rps?: number;
    bytesReceivedPerSec?: number;
    bytesSentPerSec?: number;
  }>;
  config?: TestConfig;
};

type ExtractRule = {
  // Match request display name / key; can be exact string or regex string like "/Login/i"
  match: string;
  // JSONPath like "$.accessToken" or "$.data.id"
  jsonPath: string;
  // variable name to set (e.g. "accessToken", "taskId")
  var: string;
  // only apply when status is in range (default 200-399)
  statusMin?: number;
  statusMax?: number;
};

type TestConfig = {
  extractions?: ExtractRule[];
};

type CreateTestInput = {
  vus: number;
  duration: string;
  collectionName?: string;
  config?: TestConfig;
};

@Injectable()
export class TestsService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  private baseDir = path.join(process.cwd(), 'storage', 'tests');

  private testDir(testId: string) {
    return path.join(this.baseDir, testId);
  }

  private metaPath(testId: string) {
    return path.join(this.testDir(testId), 'meta.json');
  }

  private async ensureDir(p: string) {
    await mkdir(p, { recursive: true });
  }

  // ===============================
  // CREATE TEST
  // ===============================
  async createTest(collectionJson: any, input: CreateTestInput): Promise<string> {
    const testId = randomUUID();
    const dir = this.testDir(testId);

    await this.ensureDir(dir);

    await writeFile(
      path.join(dir, 'collection.json'),
      JSON.stringify(collectionJson, null, 2),
    );

    const script = this.generateK6Script(collectionJson, input.config);
    this.logger.log('k6_script_generated', { testId, bytes: Buffer.byteLength(script) });

    await writeFile(path.join(dir, 'script.js'), script);

    const meta: TestSummary = {
      id: testId,
      status: 'created',
      createdAt: new Date().toISOString(),
      vus: input.vus,
      duration: input.duration,
      collectionName: input.collectionName,
      config: input.config,
    };

    await writeFile(this.metaPath(testId), JSON.stringify(meta, null, 2));

    return testId;
  }

  // ===============================
  // GET TEST
  // ===============================
  async getTest(testId: string): Promise<TestSummary> {
    const metaPath = this.metaPath(testId);

    let meta: TestSummary;

    try {
      const raw = await readFile(metaPath, 'utf8');
      meta = JSON.parse(raw);
    } catch {
      throw new Error('Test not found');
    }

    const summaryPath = path.join(this.testDir(testId), 'summary.json');
    const perApiPath = path.join(this.testDir(testId), 'per_api_report.json');

    try {
      const summaryRaw = await readFile(summaryPath, 'utf8');
      meta.k6Summary = JSON.parse(summaryRaw);
      meta.perRequestTimings = this.computePerRequestTimings(meta.k6Summary);
      meta.perRequestReport = this.computePerRequestReport(meta.k6Summary);
    } catch {
      // ignore if not ready
    }

    // Preferred: deterministic per-api report written by backend after parsing k6 ndjson metrics
    try {
      const raw = await readFile(perApiPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) meta.perRequestReport = parsed;
      else if (Array.isArray(parsed?.rows)) meta.perRequestReport = parsed.rows;
    } catch {
      // ignore if not ready
    }

    console.log('meta', meta);
    return meta;
  }

  private computePerRequestTimings(summary: any): TestSummary['perRequestTimings'] {
    try {
      // Prefer our custom metric that is guaranteed to be tagged by api
      const m =
        summary?.metrics?.api_req_duration ??
        summary?.metrics?.http_req_duration;
      const sub = m?.submetrics;
      if (!sub || typeof sub !== 'object') return undefined;

      const out: NonNullable<TestSummary['perRequestTimings']> = {};
      for (const [k, v] of Object.entries<any>(sub)) {
        // Key often looks like: "api_req_duration{api:Auth :: Login}" or similar.
        const apiMatch = /\bapi:([^,}]+)\b/.exec(String(k));
        const name = apiMatch ? apiMatch[1] : String(k);
        out[name] = {
          count: v?.values?.count,
          avg: v?.values?.avg,
          min: v?.values?.min,
          max: v?.values?.max,
          p90: v?.values?.['p(90)'] ?? v?.values?.p90,
          p95: v?.values?.['p(95)'] ?? v?.values?.p95,
        };
      }
      return out;
    } catch {
      return undefined;
    }
  }

  private computePerRequestReport(summary: any): TestSummary['perRequestReport'] {
    try {
      const dur = summary?.metrics?.api_req_duration?.submetrics || {};
      const reqs = summary?.metrics?.api_reqs?.submetrics || {};
      const errs = summary?.metrics?.api_errors?.submetrics || {};
      const rx = summary?.metrics?.api_data_received?.submetrics || {};
      const tx = summary?.metrics?.api_data_sent?.submetrics || {};

      const apis = new Set<string>();
      for (const k of Object.keys(dur)) apis.add(this.extractApiFromSubmetricKey(k) ?? k);
      for (const k of Object.keys(reqs)) apis.add(this.extractApiFromSubmetricKey(k) ?? k);
      for (const k of Object.keys(errs)) apis.add(this.extractApiFromSubmetricKey(k) ?? k);

      const rows: NonNullable<TestSummary['perRequestReport']> = [];
      for (const api of apis) {
        const durKey = this.findSubmetricKeyByApi(dur, api);
        const reqKey = this.findSubmetricKeyByApi(reqs, api);
        const errKey = this.findSubmetricKeyByApi(errs, api);
        const rxKey = this.findSubmetricKeyByApi(rx, api);
        const txKey = this.findSubmetricKeyByApi(tx, api);

        const durVals = durKey ? dur[durKey]?.values : undefined;
        const reqVals = reqKey ? reqs[reqKey]?.values : undefined;
        const errVals = errKey ? errs[errKey]?.values : undefined;
        const rxVals = rxKey ? rx[rxKey]?.values : undefined;
        const txVals = txKey ? tx[txKey]?.values : undefined;

        const count = Number(reqVals?.count ?? 0);
        const errorCount = Number(errVals?.count ?? 0);
        const errorPct = count > 0 ? (errorCount / count) * 100 : 0;

        const rps = Number(reqVals?.rate ?? 0);
        const bytesReceivedPerSec = Number(rxVals?.rate ?? 0);
        const bytesSentPerSec = Number(txVals?.rate ?? 0);

        rows.push({
          api,
          count,
          errorCount,
          errorPct,
          avgMs: durVals?.avg,
          minMs: durVals?.min,
          maxMs: durVals?.max,
          p50Ms: durVals?.med,
          p90Ms: durVals?.['p(90)'],
          p95Ms: durVals?.['p(95)'],
          p99Ms: durVals?.['p(99)'],
          rps,
          bytesReceivedPerSec,
          bytesSentPerSec,
        });
      }

      rows.sort((a, b) => b.count - a.count);
      return rows;
    } catch {
      return undefined;
    }
  }

  private extractApiFromSubmetricKey(key: string): string | undefined {
    const m = /\bapi:([^,}]+)\b/.exec(String(key));
    return m ? m[1] : undefined;
  }

  private findSubmetricKeyByApi(submetrics: any, api: string): string | undefined {
    if (!submetrics) return undefined;
    for (const k of Object.keys(submetrics)) {
      const a = this.extractApiFromSubmetricKey(k);
      if (a === api) return k;
    }
    return undefined;
  }

  // ===============================
  // UPDATE STATUS
  // ===============================
  private async updateStatus(testId: string, patch: Partial<TestSummary>) {
    const current = await this.getTest(testId);
    const next = { ...current, ...patch };

    await writeFile(this.metaPath(testId), JSON.stringify(next, null, 2));
  }

  // ===============================
  // RUN TEST
  // ===============================
  async runTest(testId: string): Promise<void> {
    const meta = await this.getTest(testId);

    if (meta.status === 'running') {
      this.logger.warn('test already running', { testId });
      return;
    }

    await this.updateStatus(testId, {
      status: 'running',
      startedAt: new Date().toISOString(),
      error: undefined,
    });

    const dir = this.testDir(testId);
    const scriptPath = path.join(dir, 'script.js');
    const summaryPath = path.join(dir, 'summary.json');
    const logPath = path.join(dir, 'k6.log');
    const metricsPath = path.join(dir, 'metrics.ndjson');

    await new Promise<void>((resolve) => {
      const child = spawn(
        'k6',
        [
          'run',
          '--vus',
          String(meta.vus),
          '--duration',
          meta.duration,
          '--summary-export',
          summaryPath,
          '--out',
          `json=${metricsPath}`,
          scriptPath,
        ],
        { cwd: dir },
      );

      let logs = '';

      child.stdout.on('data', (d) => (logs += d.toString()));
      child.stderr.on('data', (d) => (logs += d.toString()));

      child.on('close', async (code) => {
        await writeFile(logPath, logs);

        if (code === 0) {
          try {
            const report = await this.computePerRequestReportFromNdjson(metricsPath, meta.duration);
            await writeFile(path.join(dir, 'per_api_report.json'), JSON.stringify({ rows: report }, null, 2), 'utf8');
          } catch (e) {
            this.logger.warn('per_api_report_generation_failed', { testId, error: String((e as any)?.message || e) });
          }
        }

        await this.updateStatus(testId, {
          status: code === 0 ? 'completed' : 'failed',
          finishedAt: new Date().toISOString(),
          error: code === 0 ? undefined : `k6 exited with code ${code}`,
        });

        resolve();
      });

      child.on('error', async (err) => {
        await writeFile(logPath, String(err));

        await this.updateStatus(testId, {
          status: 'failed',
          finishedAt: new Date().toISOString(),
          error: `Failed to start k6: ${String(err)}`,
        });

        resolve();
      });
    });
  }

  private parseDurationSeconds(d: string): number {
    const s = String(d || '').trim();
    const m = /^(\d+)(s|m|h)$/.exec(s);
    if (!m) return 0;
    const n = Number(m[1]);
    const unit = m[2];
    if (unit === 's') return n;
    if (unit === 'm') return n * 60;
    if (unit === 'h') return n * 3600;
    return 0;
  }

  private async computePerRequestReportFromNdjson(
    metricsPath: string,
    durationStr: string,
  ): Promise<NonNullable<TestSummary['perRequestReport']>> {
    const seconds = this.parseDurationSeconds(durationStr) || 1;
    const raw = await readFile(metricsPath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);

    type Agg = {
      count: number;
      errorCount: number;
      sum: number;
      min: number;
      max: number;
      samples: number[];
      bytesReceived: number;
      bytesSent: number;
    };
    const byApi = new Map<string, Agg>();
    const ensure = (api: string): Agg => {
      const cur = byApi.get(api);
      if (cur) return cur;
      const a: Agg = { count: 0, errorCount: 0, sum: 0, min: Infinity, max: 0, samples: [], bytesReceived: 0, bytesSent: 0 };
      byApi.set(api, a);
      return a;
    };

    const pushSample = (a: Agg, v: number) => {
      if (!Number.isFinite(v)) return;
      a.sum += v;
      a.min = Math.min(a.min, v);
      a.max = Math.max(a.max, v);
      if (a.samples.length < 5000) a.samples.push(v);
    };

    for (const line of lines) {
      let obj: any;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (obj?.type !== 'Point') continue;
      const metric = String(obj?.metric || '');
      const tags = obj?.data?.tags || {};
      const api = tags.api ? String(tags.api) : null;
      if (!api) continue;

      const a = ensure(api);
      const value = Number(obj?.data?.value ?? 0);

      if (metric === 'api_reqs') a.count += value;
      else if (metric === 'api_errors') a.errorCount += value;
      else if (metric === 'api_data_received') a.bytesReceived += value;
      else if (metric === 'api_data_sent') a.bytesSent += value;
      else if (metric === 'api_req_duration') pushSample(a, value);
    }

    const pct = (arr: number[], p: number) => {
      if (!arr.length) return undefined;
      const a = [...arr].sort((x, y) => x - y);
      const idx = Math.min(a.length - 1, Math.max(0, Math.floor((p / 100) * a.length)));
      return a[idx];
    };

    const rows: NonNullable<TestSummary['perRequestReport']> = [];
    for (const [api, a] of byApi.entries()) {
      const count = Math.round(a.count);
      const errorCount = Math.round(a.errorCount);
      rows.push({
        api,
        count,
        errorCount,
        errorPct: count ? (errorCount / count) * 100 : 0,
        avgMs: count ? a.sum / Math.max(1, a.samples.length || count) : undefined,
        minMs: a.min === Infinity ? undefined : a.min,
        maxMs: a.max || undefined,
        p50Ms: pct(a.samples, 50),
        p90Ms: pct(a.samples, 90),
        p95Ms: pct(a.samples, 95),
        p99Ms: pct(a.samples, 99),
        rps: count / seconds,
        bytesReceivedPerSec: a.bytesReceived / seconds,
        bytesSentPerSec: a.bytesSent / seconds,
      });
    }
    rows.sort((x, y) => y.count - x.count);
    return rows;
  }

  // ===============================
  // SCRIPT GENERATOR (UPGRADED)
  // ===============================
  private generateK6Script(collection: any, config?: TestConfig): string {
    const flows = this.extractFlows(collection);
    const vars = this.extractCollectionVariables(collection);
    const baseUrl = (vars.baseUrl || vars.baseURL || '').trim() || this.detectBaseUrl(collection);
    const runId = (vars.runId || vars.runID || 'run').trim() || 'run';
    const emailTemplate =
      (vars.email || '').trim() || 'user+{{runId}}+{{iteration}}@example.com';
    const password = (vars.password || 'ChangeMe123!').trim() || 'ChangeMe123!';
    const collectionBearer = this.extractCollectionBearerAuthValue(collection);
    const effectiveEmailTemplate = this.ensureVuInEmailTemplate(emailTemplate);
    const extractions = Array.isArray(config?.extractions) ? config!.extractions : [];

    return `
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const BASE_URL = ${JSON.stringify(baseUrl)};
const RUN_ID = ${JSON.stringify(runId)};
const EMAIL_TEMPLATE = ${JSON.stringify(effectiveEmailTemplate)};
const DEFAULT_PASSWORD = ${JSON.stringify(password)};
const COLLECTION_BEARER_TEMPLATE = ${JSON.stringify(collectionBearer || '')};
const COLLECTION_VARS = ${JSON.stringify(vars)};
const EXTRACTIONS = ${JSON.stringify(extractions)};

// Custom metric to always get per-API timings in summary.json
const api_req_duration = new Trend('api_req_duration', true);
const api_reqs = new Counter('api_reqs');
const api_errors = new Counter('api_errors');
const api_data_received = new Counter('api_data_received');
const api_data_sent = new Counter('api_data_sent');

// In-script aggregation for a deterministic JMeter-like report
const __perApi = {};
const __MAX_SAMPLES_PER_API = 2000;

function __ensureApi(key) {
  if (!__perApi[key]) {
    __perApi[key] = {
      count: 0,
      errorCount: 0,
      sum: 0,
      min: null,
      max: null,
      samples: [],
      bytesReceived: 0,
      bytesSent: 0,
    };
  }
  return __perApi[key];
}

function __recordApi(key, res, sentBytes) {
  const a = __ensureApi(key);
  a.count += 1;

  const status = res && typeof res.status === 'number' ? res.status : 0;
  if (status === 0 || status >= 400) a.errorCount += 1;

  const d = res && res.timings ? res.timings.duration : 0;
  a.sum += d;
  a.min = a.min == null ? d : Math.min(a.min, d);
  a.max = a.max == null ? d : Math.max(a.max, d);

  const recvBytes = res && res.body ? res.body.length : 0;
  a.bytesReceived += recvBytes;
  a.bytesSent += sentBytes || 0;

  // reservoir sample (simple cap)
  if (a.samples.length < __MAX_SAMPLES_PER_API) a.samples.push(d);
}

function __pct(arr, p) {
  if (!arr || !arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y);
  const idx = Math.min(a.length - 1, Math.max(0, Math.floor((p / 100) * a.length)));
  return a[idx];
}

export function handleSummary(data) {
  const durMs = data?.state?.testRunDurationMs || null;
  const seconds = durMs ? durMs / 1000 : null;

  const rows = Object.entries(__perApi).map(([api, v]) => {
    const avgMs = v.count ? v.sum / v.count : null;
    const errorPct = v.count ? (v.errorCount / v.count) * 100 : 0;
    const rps = seconds ? v.count / seconds : null;
    const rx = seconds ? v.bytesReceived / seconds : null;
    const tx = seconds ? v.bytesSent / seconds : null;

    return {
      api,
      count: v.count,
      errorCount: v.errorCount,
      errorPct,
      avgMs,
      minMs: v.min,
      maxMs: v.max,
      p50Ms: __pct(v.samples, 50),
      p90Ms: __pct(v.samples, 90),
      p95Ms: __pct(v.samples, 95),
      p99Ms: __pct(v.samples, 99),
      rps,
      bytesReceivedPerSec: rx,
      bytesSentPerSec: tx,
    };
  });

  rows.sort((a, b) => b.count - a.count);

  return {
    'per_api_report.json': JSON.stringify({ rows }, null, 2),
  };
}

function randomSleep() {
  sleep(Math.random() * 2 + 1);
}

function template(str, ctx) {
  if (str == null) return '';
  const s = String(str);
  return s.replace(/\\{\\{\\s*([a-zA-Z0-9_\\-]+)\\s*\\}\\}/g, (_, key) => {
    const k = String(key);
    if (k === 'baseUrl' || k === 'baseURL') return ctx.baseUrl;
    if (k === 'runId' || k === 'runID') return ctx.runId;
    if (k === 'iteration') return String(__ITER);
    if (k === 'vu' || k === 'VU') return String(__VU);
    // Prefer dynamic vars (ctx.vars) so any project can define correlation variables.
    if (ctx.vars && ctx.vars[k] != null) return String(ctx.vars[k]);
    // Keep generated per-user credentials dynamic across VUs/iterations.
    if (k === 'email') return ctx.email;
    if (k === 'password') return ctx.password;
    // Fallback to Postman collection variables included in uploaded JSON.
    if (Object.prototype.hasOwnProperty.call(COLLECTION_VARS, k)) {
      const v = COLLECTION_VARS[k];
      return v == null ? '' : String(v);
    }
    // Unknown keys become empty to avoid invalid URLs like {{foo}}
    return '';
  });
}

function parseMaybeRegex(s) {
  if (typeof s !== 'string') return null;
  const m = /^\\/(.*)\\/([gimsuy]*)$/.exec(s.trim());
  if (!m) return null;
  try {
    return new RegExp(m[1], m[2]);
  } catch {
    return null;
  }
}

function jsonPathGet(obj, path) {
  if (!path || typeof path !== 'string') return undefined;
  let p = path.trim();
  if (p.startsWith('$')) p = p.slice(1);
  if (p.startsWith('.')) p = p.slice(1);
  if (!p) return obj;

  const parts = [];
  let cur = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '.') {
      if (cur) parts.push(cur);
      cur = '';
      continue;
    }
    if (ch === '[') {
      if (cur) parts.push(cur);
      cur = '';
      const end = p.indexOf(']', i);
      if (end === -1) break;
      const inside = p.slice(i + 1, end).trim();
      const unquoted = inside.replace(/^['"]|['"]$/g, '');
      parts.push(unquoted);
      i = end;
      continue;
    }
    cur += ch;
  }
  if (cur) parts.push(cur);

  let v = obj;
  for (const key of parts) {
    if (v == null) return undefined;
    // numeric index
    if (/^\\d+$/.test(key)) v = v[Number(key)];
    else v = v[key];
  }
  return v;
}

function applyExtractions(res, requestKey, ctx) {
  if (!Array.isArray(EXTRACTIONS) || !EXTRACTIONS.length) return;
  const status = res && typeof res.status === 'number' ? res.status : 0;
  let json = null;
  for (const rule of EXTRACTIONS) {
    if (!rule || !rule.match || !rule.var || !rule.jsonPath) continue;
    const statusMin = typeof rule.statusMin === 'number' ? rule.statusMin : 200;
    const statusMax = typeof rule.statusMax === 'number' ? rule.statusMax : 399;
    if (status < statusMin || status > statusMax) continue;

    const rx = parseMaybeRegex(rule.match);
    const ok = rx ? rx.test(requestKey) : String(rule.match) === String(requestKey);
    if (!ok) continue;

    if (json === null) {
      try {
        json = res.json();
      } catch {
        json = undefined;
      }
    }
    const extracted = jsonPathGet(json, rule.jsonPath);
    if (extracted != null) {
      ctx.vars[rule.var] = extracted;
    }
  }
}

function createUser() {
  return {
    email: template(EMAIL_TEMPLATE, {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: '',
      password: '',
      vars: {},
    }),
    password: DEFAULT_PASSWORD,
  };
}

${flows.map((f) => this.generateFlow(f, collectionBearer)).join('\n')}

export default function () {
  const user = createUser();
  const ctx = { vars: {} };

  // Run flows sequentially so tokens/ids chain correctly (Auth -> Tasks, etc.)
  ${flows.map((f) => `${f.name}(user, ctx);`).join('\n  ')}

  randomSleep();
}
`;
  }

  // ===============================
  // FLOW EXTRACTION
  // ===============================
  private extractFlows(collection: any) {
    const flows: any[] = [];

    const walk = (items: any[], parent = 'flow_default') => {
      for (const item of items) {
        if (item.item) {
          walk(item.item, item.name || parent);
        } else if (item.request) {
          let flow = flows.find((f) => f.name === parent);
          if (!flow) {
            flow = { name: this.safeName(parent), requests: [] };
            flows.push(flow);
          }
          flow.requests.push({
            name: String(item.name || item.request?.description || `${item.request?.method || 'GET'} ${this.postmanUrlToString(item.request?.url)}`),
            request: item.request,
          });
        }
      }
    };

    walk(collection.item || []);
    return flows;
  }

  private extractCollectionVariables(collection: any): Record<string, string> {
    const out: Record<string, string> = {};
    const vars = Array.isArray(collection?.variable) ? collection.variable : [];
    for (const v of vars) {
      if (!v?.key) continue;
      out[String(v.key)] = String(v.value ?? '');
    }
    return out;
  }

  private generateFlow(flow: any, collectionBearer?: string): string {
    return `
function ${flow.name}(user, ctx) {

  ${flow.requests.map((r: any) => this.generateRequest(r, collectionBearer, flow.name)).join('\n')}
}
`;
  }

  private generateRequest(rw: any, collectionBearer?: string, flowName?: string): string {
    const r = rw?.request ?? rw;
    const requestName = String(rw?.name || `${r?.method || 'GET'} ${this.postmanUrlToString(r?.url)}`);
    const method = String(r.method || 'GET').toUpperCase();
    const urlRaw = this.postmanUrlToString(r.url);
    const headersObj = this.postmanHeadersToObject(r.header);
    const bodyRaw = r.body?.mode === 'raw' && typeof r.body.raw === 'string' ? r.body.raw : undefined;
    const requestAuthType = String(r?.auth?.type || '').toLowerCase();
    const inheritCollectionAuth = requestAuthType !== 'noauth';

    const isLogin = urlRaw.includes('/login');
    const isRegister = urlRaw.includes('/register');
    const isCreateTask =
      (method === 'POST' && urlRaw.endsWith('/tasks')) ||
      (method === 'POST' && urlRaw.endsWith('/todos'));

    return `
  {
    const requestKey = ${JSON.stringify(`${flowName || 'flow'} :: ${requestName}`)};
    const url = template(${JSON.stringify(urlRaw)}, {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      vars: ctx.vars,
    });

    const headers = ${JSON.stringify(headersObj)};
    for (const k in headers) {
      headers[k] = template(headers[k], {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        vars: ctx.vars,
      });
    }

    // Apply collection-level bearer auth if present and request doesn't disable auth
    ${
      inheritCollectionAuth && collectionBearer
        ? `if (!headers['authorization'] && COLLECTION_BEARER_TEMPLATE) {
      headers['authorization'] = template(COLLECTION_BEARER_TEMPLATE, {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        vars: ctx.vars,
      });
    }`
        : ''
    }

    const bodyText = ${bodyRaw ? JSON.stringify(bodyRaw) : 'null'};
    let body = undefined;
    if (bodyText != null) {
      const rendered = template(bodyText, {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        vars: ctx.vars,
      });
      // If it looks like JSON, send as-is (string). k6 will set it as request body.
      body = rendered;
    }

    const res = http.request(${JSON.stringify(method)}, url, body, {
      headers,
      tags: { api: ${JSON.stringify(`${flowName || 'flow'} :: ${requestName}`)} },
      timeout: '30s',
    });
    api_req_duration.add(res.timings.duration, { api: requestKey });
    api_reqs.add(1, { api: requestKey });
    if (!res || res.status === 0 || res.status >= 400) {
      api_errors.add(1, { api: requestKey });
    }
    try { api_data_received.add((res.body && res.body.length) ? res.body.length : 0, { api: requestKey }); } catch (e) {}
    try { api_data_sent.add((body && body.length) ? body.length : 0, { api: requestKey }); } catch (e) {}
    __recordApi(requestKey, res, (body && body.length) ? body.length : 0);
    check(res, { 'status ok': (r) => r.status >= 200 && r.status < 400 });

    applyExtractions(res, requestKey, ctx);
  }
  randomSleep();
`;
  }

  private extractCollectionBearerAuthValue(collection: any): string | undefined {
    // Postman v2.1: collection.auth.type === 'bearer', collection.auth.bearer is array of { key, value }
    const authType = String(collection?.auth?.type || '').toLowerCase();
    if (authType !== 'bearer') return undefined;
    const bearer = Array.isArray(collection?.auth?.bearer) ? collection.auth.bearer : [];
    const tokenEntry = bearer.find((e: any) => String(e?.key || '').toLowerCase() === 'token');
    const value = tokenEntry?.value;
    if (typeof value !== 'string') return undefined;
    // Postman typically stores just "{{accessToken}}"; we need "Bearer {{accessToken}}"
    const v = value.trim();
    if (!v) return undefined;
    return v.toLowerCase().startsWith('bearer ') ? v : `Bearer ${v}`;
  }

  private ensureVuInEmailTemplate(template: string): string {
    const t = String(template || '').trim();
    if (!t) return 'user+{{runId}}+{{vu}}+{{iteration}}@example.com';
    const hasVu = /\{\{\s*vu\s*\}\}/i.test(t);
    const hasIter = /\{\{\s*iteration\s*\}\}/i.test(t);
    if (hasVu) return t;
    if (hasIter) {
      // Insert vu before iteration to avoid collisions across VUs.
      return t.replace(/\{\{\s*iteration\s*\}\}/i, '{{vu}}+{{iteration}}');
    }
    // If no iteration either, still add vu to make it unique.
    const at = t.indexOf('@');
    if (at > 0) return `${t.slice(0, at)}+{{vu}}${t.slice(at)}`;
    return `${t}+{{vu}}`;
  }

  private safeName(name: string) {
    const cleaned = String(name || '')
      .trim()
      .replace(/[^a-zA-Z0-9]/g, '_');

    const candidate = cleaned.length ? cleaned : 'flow';
    const startsOk = /^[a-zA-Z_]/.test(candidate);
    const safe = startsOk ? candidate : `flow_${candidate}`;

    // Avoid JS reserved keywords that would break parsing (e.g. `default`)
    const reserved = new Set([
      'default',
      'function',
      'export',
      'import',
      'class',
      'return',
      'var',
      'let',
      'const',
      'if',
      'else',
      'for',
      'while',
      'switch',
      'case',
      'try',
      'catch',
      'finally',
      'new',
      'this',
      'null',
      'true',
      'false',
    ]);

    return reserved.has(safe) ? `flow_${safe}` : safe;
  }

  private detectBaseUrl(collection: any): string {
    try {
      const raw = collection?.item?.[0]?.request?.url?.raw;
      if (!raw) return 'http://localhost:4000';
      const u = new URL(raw);
      return u.origin;
    } catch {
      return 'http://localhost:4000';
    }
  }

  private postmanUrlToString(url: any): string {
    if (!url) return '';
    if (typeof url === 'string') return url;
    return url.raw || '';
  }

  private postmanHeadersToObject(header: any): Record<string, string> {
    const out: Record<string, string> = {};
    if (!Array.isArray(header)) return out;
    for (const h of header) {
      if (!h?.key) continue;
      if (h?.disabled) continue;
      out[String(h.key).toLowerCase()] = String(h.value ?? '');
    }
    return out;
  }
}