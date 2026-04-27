
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = "http://localhost:3009";
const RUN_ID = "run";
const EMAIL_TEMPLATE = "user+{{runId}}+{{vu}}+{{iteration}}@example.com";
const DEFAULT_PASSWORD = "ChangeMe123!";
const COLLECTION_BEARER_TEMPLATE = "Bearer {{accessToken}}";
const EXTRACTIONS = [{"match":"/Auth :: Login/i","jsonPath":"$.accessToken","var":"accessToken"},{"match":"/Tasks :: Create/i","jsonPath":"$._id","var":"taskId"}];

// Custom metric to always get per-API timings in summary.json
const api_req_duration = new Trend('api_req_duration', true);

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


function Auth(user, ctx) {

  
  {
    const requestKey = "Auth :: Register (optional per iteration)";
    const url = template("{{baseUrl}}/auth/register", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      vars: ctx.vars,
    });

    const headers = {"content-type":"application/json"};
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
    

    const bodyText = "{\n  \"email\": \"{{email}}\",\n  \"password\": \"{{password}}\"\n}";
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
      tags: { api: "Auth :: Register (optional per iteration)" },
      timeout: '30s',
    });
    api_req_duration.add(res.timings.duration, { api: requestKey });
    check(res, { 'status ok': (r) => r.status >= 200 && r.status < 400 });

    applyExtractions(res, requestKey, ctx);
  }
  randomSleep();


  {
    const requestKey = "Auth :: Login (sets accessToken)";
    const url = template("{{baseUrl}}/auth/login", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      vars: ctx.vars,
    });

    const headers = {"content-type":"application/json"};
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
    

    const bodyText = "{\n  \"email\": \"{{email}}\",\n  \"password\": \"{{password}}\"\n}";
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
      tags: { api: "Auth :: Login (sets accessToken)" },
      timeout: '30s',
    });
    api_req_duration.add(res.timings.duration, { api: requestKey });
    check(res, { 'status ok': (r) => r.status >= 200 && r.status < 400 });

    applyExtractions(res, requestKey, ctx);
  }
  randomSleep();

}


function Tasks(user, ctx) {

  
  {
    const requestKey = "Tasks :: List";
    const url = template("{{baseUrl}}/tasks", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      vars: ctx.vars,
    });

    const headers = {};
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
    if (!headers['authorization'] && COLLECTION_BEARER_TEMPLATE) {
      headers['authorization'] = template(COLLECTION_BEARER_TEMPLATE, {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        vars: ctx.vars,
      });
    }

    const bodyText = null;
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

    const res = http.request("GET", url, body, {
      headers,
      tags: { api: "Tasks :: List" },
      timeout: '30s',
    });
    api_req_duration.add(res.timings.duration, { api: requestKey });
    check(res, { 'status ok': (r) => r.status >= 200 && r.status < 400 });

    applyExtractions(res, requestKey, ctx);
  }
  randomSleep();


  {
    const requestKey = "Tasks :: Create (sets taskId)";
    const url = template("{{baseUrl}}/tasks", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      vars: ctx.vars,
    });

    const headers = {"content-type":"application/json"};
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
    if (!headers['authorization'] && COLLECTION_BEARER_TEMPLATE) {
      headers['authorization'] = template(COLLECTION_BEARER_TEMPLATE, {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        vars: ctx.vars,
      });
    }

    const bodyText = "{\n  \"title\": \"Task {{runId}} #{{iteration}}\"\n}";
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
      tags: { api: "Tasks :: Create (sets taskId)" },
      timeout: '30s',
    });
    api_req_duration.add(res.timings.duration, { api: requestKey });
    check(res, { 'status ok': (r) => r.status >= 200 && r.status < 400 });

    applyExtractions(res, requestKey, ctx);
  }
  randomSleep();


  {
    const requestKey = "Tasks :: Toggle Done";
    const url = template("{{baseUrl}}/tasks/{{taskId}}/done", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      vars: ctx.vars,
    });

    const headers = {};
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
    if (!headers['authorization'] && COLLECTION_BEARER_TEMPLATE) {
      headers['authorization'] = template(COLLECTION_BEARER_TEMPLATE, {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        vars: ctx.vars,
      });
    }

    const bodyText = null;
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

    const res = http.request("PATCH", url, body, {
      headers,
      tags: { api: "Tasks :: Toggle Done" },
      timeout: '30s',
    });
    api_req_duration.add(res.timings.duration, { api: requestKey });
    check(res, { 'status ok': (r) => r.status >= 200 && r.status < 400 });

    applyExtractions(res, requestKey, ctx);
  }
  randomSleep();

}


export default function () {
  const user = createUser();
  const ctx = { vars: {} };

  // Run flows sequentially so tokens/ids chain correctly (Auth -> Tasks, etc.)
  Auth(user, ctx);
  Tasks(user, ctx);

  randomSleep();
}
