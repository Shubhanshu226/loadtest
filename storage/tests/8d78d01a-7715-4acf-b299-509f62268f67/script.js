
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = "http://localhost:3009";
const RUN_ID = "run";
const EMAIL_TEMPLATE = "user+{{runId}}+{{vu}}+{{iteration}}@example.com";
const DEFAULT_PASSWORD = "ChangeMe123!";
const COLLECTION_BEARER_TEMPLATE = "Bearer {{accessToken}}";

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
    if (k === 'email') return ctx.email;
    if (k === 'password') return ctx.password;
    if (k === 'accessToken' || k === 'token') return ctx.accessToken || '';
    if (k === 'taskId' || k === 'todoId') return ctx.taskId || '';
    // Unknown keys become empty to avoid invalid URLs like {{foo}}
    return '';
  });
}

function createUser() {
  return {
    email: template(EMAIL_TEMPLATE, {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: '',
      password: '',
      accessToken: '',
      taskId: '',
    }),
    password: DEFAULT_PASSWORD,
  };
}


function Auth(user, ctx) {

  
  {
    const url = template("{{baseUrl}}/auth/register", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      accessToken: ctx.accessToken,
      taskId: ctx.taskId,
    });

    const headers = {"content-type":"application/json"};
    for (const k in headers) {
      headers[k] = template(headers[k], {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        accessToken: ctx.accessToken,
        taskId: ctx.taskId,
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
        accessToken: ctx.accessToken,
        taskId: ctx.taskId,
      });
      // If it looks like JSON, send as-is (string). k6 will set it as request body.
      body = rendered;
    }

    const res = http.request("POST", url, body, { headers, tags: { name: "Auth :: Register (optional per iteration)" } });
    check(res, { 'status ok': (r) => r.status >= 200 && r.status < 400 });

    
    // ignore; register may be optional in some collections
    
  }
  randomSleep();


  {
    const url = template("{{baseUrl}}/auth/login", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      accessToken: ctx.accessToken,
      taskId: ctx.taskId,
    });

    const headers = {"content-type":"application/json"};
    for (const k in headers) {
      headers[k] = template(headers[k], {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        accessToken: ctx.accessToken,
        taskId: ctx.taskId,
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
        accessToken: ctx.accessToken,
        taskId: ctx.taskId,
      });
      // If it looks like JSON, send as-is (string). k6 will set it as request body.
      body = rendered;
    }

    const res = http.request("POST", url, body, { headers, tags: { name: "Auth :: Login (sets accessToken)" } });
    check(res, { 'status ok': (r) => r.status >= 200 && r.status < 400 });

    ctx.accessToken = res.json('accessToken') || res.json('token') || res.json('access_token') || ctx.accessToken;
    
    
  }
  randomSleep();

}


function Tasks(user, ctx) {

  
  {
    const url = template("{{baseUrl}}/tasks", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      accessToken: ctx.accessToken,
      taskId: ctx.taskId,
    });

    const headers = {};
    for (const k in headers) {
      headers[k] = template(headers[k], {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        accessToken: ctx.accessToken,
        taskId: ctx.taskId,
      });
    }

    // Apply collection-level bearer auth if present and request doesn't disable auth
    if (!headers['authorization'] && COLLECTION_BEARER_TEMPLATE) {
      headers['authorization'] = template(COLLECTION_BEARER_TEMPLATE, {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        accessToken: ctx.accessToken,
        taskId: ctx.taskId,
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
        accessToken: ctx.accessToken,
        taskId: ctx.taskId,
      });
      // If it looks like JSON, send as-is (string). k6 will set it as request body.
      body = rendered;
    }

    const res = http.request("GET", url, body, { headers, tags: { name: "Tasks :: List" } });
    check(res, { 'status ok': (r) => r.status >= 200 && r.status < 400 });

    
    
    
  }
  randomSleep();


  {
    const url = template("{{baseUrl}}/tasks", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      accessToken: ctx.accessToken,
      taskId: ctx.taskId,
    });

    const headers = {"content-type":"application/json"};
    for (const k in headers) {
      headers[k] = template(headers[k], {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        accessToken: ctx.accessToken,
        taskId: ctx.taskId,
      });
    }

    // Apply collection-level bearer auth if present and request doesn't disable auth
    if (!headers['authorization'] && COLLECTION_BEARER_TEMPLATE) {
      headers['authorization'] = template(COLLECTION_BEARER_TEMPLATE, {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        accessToken: ctx.accessToken,
        taskId: ctx.taskId,
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
        accessToken: ctx.accessToken,
        taskId: ctx.taskId,
      });
      // If it looks like JSON, send as-is (string). k6 will set it as request body.
      body = rendered;
    }

    const res = http.request("POST", url, body, { headers, tags: { name: "Tasks :: Create (sets taskId)" } });
    check(res, { 'status ok': (r) => r.status >= 200 && r.status < 400 });

    
    
    ctx.taskId = res.json('_id') || res.json('id') || (res.json('todo') && res.json('todo').id) || ctx.taskId;
  }
  randomSleep();


  {
    const url = template("{{baseUrl}}/tasks/{{taskId}}/done", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      accessToken: ctx.accessToken,
      taskId: ctx.taskId,
    });

    const headers = {};
    for (const k in headers) {
      headers[k] = template(headers[k], {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        accessToken: ctx.accessToken,
        taskId: ctx.taskId,
      });
    }

    // Apply collection-level bearer auth if present and request doesn't disable auth
    if (!headers['authorization'] && COLLECTION_BEARER_TEMPLATE) {
      headers['authorization'] = template(COLLECTION_BEARER_TEMPLATE, {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        accessToken: ctx.accessToken,
        taskId: ctx.taskId,
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
        accessToken: ctx.accessToken,
        taskId: ctx.taskId,
      });
      // If it looks like JSON, send as-is (string). k6 will set it as request body.
      body = rendered;
    }

    const res = http.request("PATCH", url, body, { headers, tags: { name: "Tasks :: Toggle Done" } });
    check(res, { 'status ok': (r) => r.status >= 200 && r.status < 400 });

    
    
    
  }
  randomSleep();

}


export default function () {
  const user = createUser();
  const ctx = { accessToken: null, taskId: null };

  // Run flows sequentially so tokens/ids chain correctly (Auth -> Tasks, etc.)
  Auth(user, ctx);
  Tasks(user, ctx);

  randomSleep();
}
