
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


function flow_default(user) {
  let token = null;

  
  {
    const res = http.post(`{{baseUrl}}/auth/register`, {
  "email": "{{email}}",
  "password": "{{password}}"
});
    check(res, { 'status ok': r => r.status < 400 });

    
  }
  randomSleep();


  {
    const res = http.post(`{{baseUrl}}/auth/login`, {
  "email": "{{email}}",
  "password": "{{password}}"
});
    check(res, { 'status ok': r => r.status < 400 });

    token = res.json('token');
  }
  randomSleep();


  {
    const res = http.get(`{{baseUrl}}/tasks`, null);
    check(res, { 'status ok': r => r.status < 400 });

    
  }
  randomSleep();


  {
    const res = http.post(`{{baseUrl}}/tasks`, {
  "title": "Task {{runId}} #{{iteration}}"
});
    check(res, { 'status ok': r => r.status < 400 });

    
  }
  randomSleep();


  {
    const res = http.patch(`{{baseUrl}}/tasks/{{taskId}}/done`, null);
    check(res, { 'status ok': r => r.status < 400 });

    
  }
  randomSleep();


  {
    const res = http.delete(`{{baseUrl}}/tasks/{{taskId}}`, null);
    check(res, { 'status ok': r => r.status < 400 });

    
  }
  randomSleep();

}


export default function () {
  const user = createUser();
  const rand = Math.random();

  if (rand < 1) { flow_default(user); }

  randomSleep();
}
