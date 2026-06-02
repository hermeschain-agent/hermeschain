// k6 load test: tx-flood
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '60s',
};

export default function () {
  http.post('http://localhost:4000/api/transactions', JSON.stringify({}), { headers: { 'content-type': 'application/json' }});
  sleep(0.1);
}
