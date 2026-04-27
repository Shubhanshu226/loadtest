
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const BASE_URL = "http://localhost:3009";
const RUN_ID = "run";
const EMAIL_TEMPLATE = "user+{{vu}}@example.com";
const DEFAULT_PASSWORD = "Password@123";
const COLLECTION_BEARER_TEMPLATE = "";
const EXTRACTIONS = [{"match":"/Onboarding/i","jsonPath":"$.data.onboarding.mfaToken","var":"mfaToken"},{"match":"/Verify Email/i","jsonPath":"$.data.verifyEmail.authToken","var":"authToken"}];

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
  return s.replace(/\{\{\s*([a-zA-Z0-9_\-]+)\s*\}\}/g, (_, key) => {
    const k = String(key);
    if (k === 'baseUrl' || k === 'baseURL') return ctx.baseUrl;
    if (k === 'runId' || k === 'runID') return ctx.runId;
    if (k === 'iteration') return String(__ITER);
    if (k === 'vu' || k === 'VU') return String(__VU);
    // Prefer dynamic vars (ctx.vars) so any project can define correlation variables.
    if (ctx.vars && ctx.vars[k] != null) return String(ctx.vars[k]);
    if (k === 'email') return ctx.email;
    if (k === 'password') return ctx.password;
    // Unknown keys become empty to avoid invalid URLs like {{foo}}
    return '';
  });
}

function parseMaybeRegex(s) {
  if (typeof s !== 'string') return null;
  const m = /^\/(.*)\/([gimsuy]*)$/.exec(s.trim());
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
    if (/^\d+$/.test(key)) v = v[Number(key)];
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


function flow_default(user, ctx) {

  
  {
    const requestKey = "flow_default :: Onboarding";
    const url = template("{{baseUrl}}{{graphqlPath}}", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      vars: ctx.vars,
    });

    const headers = {"content-type":"application/json","authorization":"Basic {{basicAuthToken}}"};
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
    

    const bodyText = "{\n  \"query\": \"mutation Onboarding($input: OnboardingInput!) { onboarding(input: $input) { success mfaToken } }\",\n  \"variables\": {\n    \"input\": {\n      \"email\": \"{{email}}\",\n      \"password\": \"{{password}}\"\n    }\n  }\n}";
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

    const res = http.request("POST", url, body, {
      headers,
      tags: { api: "flow_default :: Onboarding" },
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


  {
    const requestKey = "flow_default :: Verify Email";
    const url = template("{{baseUrl}}{{graphqlPath}}", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      vars: ctx.vars,
    });

    const headers = {"content-type":"application/json","authorization":"Bearer {{mfaToken}}"};
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
    

    const bodyText = "{\n  \"query\": \"mutation VerifyEmail($input: VerifyOnboardingInput!) { verifyEmail(input: $input) { success nextStep authToken refreshToken userId id xApiKey } }\",\n  \"variables\": {\n    \"input\": {\n      \"otp\": \"00000\",\n      \"guestId\": \"{{guestId}}\"\n    }\n  }\n}";
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

    const res = http.request("POST", url, body, {
      headers,
      tags: { api: "flow_default :: Verify Email" },
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

}


export default function () {
  const user = createUser();
  const ctx = { vars: {} };

  // Run flows sequentially so tokens/ids chain correctly (Auth -> Tasks, etc.)
  flow_default(user, ctx);

  randomSleep();
}
