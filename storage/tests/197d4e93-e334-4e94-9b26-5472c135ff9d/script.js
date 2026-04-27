
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = "http://localhost:3000";
const RUN_ID = "run";
const EMAIL_TEMPLATE = "user+{{runId}}+{{iteration}}@example.com";
const DEFAULT_PASSWORD = "ChangeMe123!";

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


function Auth(user) {
  let accessToken = null;
  let taskId = null;

  
  {
    const url = template("{{baseUrl}}/auth/register", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      accessToken,
      taskId,
    });

    const headers = {"content-type":"application/json"};
    for (const k in headers) {
      headers[k] = template(headers[k], {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        accessToken,
        taskId,
      });
    }

    const bodyText = "{\n  \"email\": \"{{email}}\",\n  \"password\": \"{{password}}\"\n}";
    let body = undefined;
    if (bodyText != null) {
      const rendered = template(bodyText, {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        accessToken,
        taskId,
      });
      // If it looks like JSON, send as-is (string). k6 will set it as request body.
      body = rendered;
    }

    const res = http.request("POST", url, body, { headers });
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
      accessToken,
      taskId,
    });

    const headers = {"content-type":"application/json"};
    for (const k in headers) {
      headers[k] = template(headers[k], {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        accessToken,
        taskId,
      });
    }

    const bodyText = "{\n  \"email\": \"{{email}}\",\n  \"password\": \"{{password}}\"\n}";
    let body = undefined;
    if (bodyText != null) {
      const rendered = template(bodyText, {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        accessToken,
        taskId,
      });
      // If it looks like JSON, send as-is (string). k6 will set it as request body.
      body = rendered;
    }

    const res = http.request("POST", url, body, { headers });
    check(res, { 'status ok': (r) => r.status >= 200 && r.status < 400 });

    accessToken = res.json('accessToken') || res.json('token') || res.json('access_token');
    
    
  }
  randomSleep();

}


function Tasks(user) {
  let accessToken = null;
  let taskId = null;

  
  {
    const url = template("{{baseUrl}}/tasks", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      accessToken,
      taskId,
    });

    const headers = {};
    for (const k in headers) {
      headers[k] = template(headers[k], {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        accessToken,
        taskId,
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
        accessToken,
        taskId,
      });
      // If it looks like JSON, send as-is (string). k6 will set it as request body.
      body = rendered;
    }

    const res = http.request("GET", url, body, { headers });
    check(res, { 'status ok': (r) => r.status >= 200 && r.status < 400 });

    
    
    
  }
  randomSleep();


  {
    const url = template("{{baseUrl}}/tasks", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      accessToken,
      taskId,
    });

    const headers = {"content-type":"application/json"};
    for (const k in headers) {
      headers[k] = template(headers[k], {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        accessToken,
        taskId,
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
        accessToken,
        taskId,
      });
      // If it looks like JSON, send as-is (string). k6 will set it as request body.
      body = rendered;
    }

    const res = http.request("POST", url, body, { headers });
    check(res, { 'status ok': (r) => r.status >= 200 && r.status < 400 });

    
    
    taskId = res.json('_id') || res.json('id') || (res.json('todo') && res.json('todo').id) || taskId;
  }
  randomSleep();


  {
    const url = template("{{baseUrl}}/tasks/{{taskId}}/done", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      accessToken,
      taskId,
    });

    const headers = {};
    for (const k in headers) {
      headers[k] = template(headers[k], {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        accessToken,
        taskId,
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
        accessToken,
        taskId,
      });
      // If it looks like JSON, send as-is (string). k6 will set it as request body.
      body = rendered;
    }

    const res = http.request("PATCH", url, body, { headers });
    check(res, { 'status ok': (r) => r.status >= 200 && r.status < 400 });

    
    
    
  }
  randomSleep();


  {
    const url = template("{{baseUrl}}/tasks/{{taskId}}", {
      baseUrl: BASE_URL,
      runId: RUN_ID,
      email: user.email,
      password: user.password,
      accessToken,
      taskId,
    });

    const headers = {};
    for (const k in headers) {
      headers[k] = template(headers[k], {
        baseUrl: BASE_URL,
        runId: RUN_ID,
        email: user.email,
        password: user.password,
        accessToken,
        taskId,
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
        accessToken,
        taskId,
      });
      // If it looks like JSON, send as-is (string). k6 will set it as request body.
      body = rendered;
    }

    const res = http.request("DELETE", url, body, { headers });
    check(res, { 'status ok': (r) => r.status >= 200 && r.status < 400 });

    
    
    
  }
  randomSleep();

}


export default function () {
  const user = createUser();
  const rand = Math.random();

  if (rand < 0.5) { Auth(user); }
if (rand < 1) { Tasks(user); }

  randomSleep();
}
