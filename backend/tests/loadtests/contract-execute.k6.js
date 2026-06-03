// k6 load test: contract-execute
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '60s',
};

export default function () {
  http.post('http://localhost:4000/api/transactions', JSON.stringify({ from: 'a', to: 'a', value: '0', gasPrice: '1', gasLimit: '100000', nonce: __VU, data: 'vm:[{\"op\":\"PUSH\",\"args\":[1]},{\"op\":\"STOP\"}]' }), { headers: { 'content-type': 'application/json' }});
  sleep(0.1);
}
