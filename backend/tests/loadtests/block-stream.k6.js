// k6 load test: block-stream
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '60s',
};

export default function () {
  http.get('http://localhost:4000/api/blocks?limit=10');
  sleep(0.1);
}
