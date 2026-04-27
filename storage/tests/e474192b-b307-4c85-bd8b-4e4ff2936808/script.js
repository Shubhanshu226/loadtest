
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = 'http://localhost:4000';

function randomSleep() {
  sleep(Math.random() * 2 + 1);
}

function createUser() {
  return {
    email: `user_${__VU}_${__ITER}@test.com`,
    password: 'password123'
  };
}


function Auth___Todo_flow(user) {
  let token = null;

  
  {
    const res = http.post(`http://localhost:4000/auth/register`, {
  "email": "user1@example.com",
  "password": "password123",
  "name": "User 1"
});
    check(res, { 'status ok': r => r.status < 400 });

    
  }
  randomSleep();

}


function Auth___Todo_flow(user) {
  let token = null;

  
  {
    const res = http.post(`http://localhost:4000/auth/login`, {
  "email": "user1@example.com",
  "password": "password123"
});
    check(res, { 'status ok': r => r.status < 400 });

    token = res.json('token');
  }
  randomSleep();

}


function Auth___Todo_flow(user) {
  let token = null;

  
  {
    const res = http.get(`http://localhost:4000/me`, null);
    check(res, { 'status ok': r => r.status < 400 });

    
  }
  randomSleep();

}


function Auth___Todo_flow(user) {
  let token = null;

  
  {
    const res = http.post(`http://localhost:4000/todos`, {
  "title": "Buy milk"
});
    check(res, { 'status ok': r => r.status < 400 });

    
  }
  randomSleep();

}


function Auth___Todo_flow(user) {
  let token = null;

  
  {
    const res = http.get(`http://localhost:4000/todos`, null);
    check(res, { 'status ok': r => r.status < 400 });

    
  }
  randomSleep();

}


function Utilities(user) {
  let token = null;

  
  {
    const res = http.get(`http://localhost:4000/health`, null);
    check(res, { 'status ok': r => r.status < 400 });

    
  }
  randomSleep();


  {
    const res = http.get(`http://localhost:4000/ping`, null);
    check(res, { 'status ok': r => r.status < 400 });

    
  }
  randomSleep();


  {
    const res = http.get(`http://localhost:4000/slow?ms=200`, null);
    check(res, { 'status ok': r => r.status < 400 });

    
  }
  randomSleep();


  {
    const res = http.get(`http://localhost:4000/payload?kb=64`, null);
    check(res, { 'status ok': r => r.status < 400 });

    
  }
  randomSleep();


  {
    const res = http.get(`http://localhost:4000/error?rate=0.05`, null);
    check(res, { 'status ok': r => r.status < 400 });

    
  }
  randomSleep();


  {
    const res = http.get(`http://localhost:4000/cpu?ms=25`, null);
    check(res, { 'status ok': r => r.status < 400 });

    
  }
  randomSleep();


  {
    const res = http.post(`http://localhost:4000/echo`, {
  "hello": "world"
});
    check(res, { 'status ok': r => r.status < 400 });

    
  }
  randomSleep();

}


export default function () {
  const user = createUser();
  const rand = Math.random();

  if (rand < 0.16666666666666666) { Auth___Todo_flow(user); }
if (rand < 0.3333333333333333) { Auth___Todo_flow(user); }
if (rand < 0.5) { Auth___Todo_flow(user); }
if (rand < 0.6666666666666666) { Auth___Todo_flow(user); }
if (rand < 0.8333333333333333) { Auth___Todo_flow(user); }
if (rand < 0.9999999999999999) { Utilities(user); }

  randomSleep();
}
