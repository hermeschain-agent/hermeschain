// k6 load test: history-lookup
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '60s',
};

export default function () {
  http.get('http://localhost:4000/api/account/' + __VU + '/history?limit=50');
  sleep(0.1);
}
