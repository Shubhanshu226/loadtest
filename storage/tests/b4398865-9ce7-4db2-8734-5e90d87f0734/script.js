import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  // VUs/duration are overridden via CLI flags by the backend runner.
  vus: 1,
  duration: '10s',
};

export default function () {
  const responses = [];
  {
    const res = http.request("POST", "http://localhost:4000/auth/register", "{\n  \"email\": \"user1@example.com\",\n  \"password\": \"password123\",\n  \"name\": \"User 1\"\n}", { headers: {"content-type":"application/json"} });
    responses.push(res);
    check(res, { 'status is 2xx/3xx': (r) => r.status >= 200 && r.status < 400 });
  }
  sleep(1);
  {
    const res = http.request("POST", "http://localhost:4000/auth/login", "{\n  \"email\": \"user1@example.com\",\n  \"password\": \"password123\"\n}", { headers: {"content-type":"application/json"} });
    responses.push(res);
    check(res, { 'status is 2xx/3xx': (r) => r.status >= 200 && r.status < 400 });
  }
  sleep(1);
  {
    const res = http.request("GET", "http://localhost:4000/me", undefined, { headers: {"authorization":"Bearer REPLACE_ME"} });
    responses.push(res);
    check(res, { 'status is 2xx/3xx': (r) => r.status >= 200 && r.status < 400 });
  }
  sleep(1);
  {
    const res = http.request("POST", "http://localhost:4000/todos", "{\n  \"title\": \"Buy milk\"\n}", { headers: {"content-type":"application/json","authorization":"Bearer REPLACE_ME"} });
    responses.push(res);
    check(res, { 'status is 2xx/3xx': (r) => r.status >= 200 && r.status < 400 });
  }
  sleep(1);
  {
    const res = http.request("GET", "http://localhost:4000/todos", undefined, { headers: {"authorization":"Bearer REPLACE_ME"} });
    responses.push(res);
    check(res, { 'status is 2xx/3xx': (r) => r.status >= 200 && r.status < 400 });
  }
  sleep(1);
  {
    const res = http.request("GET", "http://localhost:4000/health", undefined, { headers: {} });
    responses.push(res);
    check(res, { 'status is 2xx/3xx': (r) => r.status >= 200 && r.status < 400 });
  }
  sleep(1);
  {
    const res = http.request("GET", "http://localhost:4000/ping", undefined, { headers: {} });
    responses.push(res);
    check(res, { 'status is 2xx/3xx': (r) => r.status >= 200 && r.status < 400 });
  }
  sleep(1);
  {
    const res = http.request("GET", "http://localhost:4000/slow?ms=200", undefined, { headers: {} });
    responses.push(res);
    check(res, { 'status is 2xx/3xx': (r) => r.status >= 200 && r.status < 400 });
  }
  sleep(1);
  {
    const res = http.request("GET", "http://localhost:4000/payload?kb=64", undefined, { headers: {} });
    responses.push(res);
    check(res, { 'status is 2xx/3xx': (r) => r.status >= 200 && r.status < 400 });
  }
  sleep(1);
  {
    const res = http.request("GET", "http://localhost:4000/error?rate=0.05", undefined, { headers: {} });
    responses.push(res);
    check(res, { 'status is 2xx/3xx': (r) => r.status >= 200 && r.status < 400 });
  }
  sleep(1);
  {
    const res = http.request("GET", "http://localhost:4000/cpu?ms=25", undefined, { headers: {} });
    responses.push(res);
    check(res, { 'status is 2xx/3xx': (r) => r.status >= 200 && r.status < 400 });
  }
  sleep(1);
  {
    const res = http.request("POST", "http://localhost:4000/echo", "{\n  \"hello\": \"world\"\n}", { headers: {"content-type":"application/json"} });
    responses.push(res);
    check(res, { 'status is 2xx/3xx': (r) => r.status >= 200 && r.status < 400 });
  }
  sleep(1);
}
