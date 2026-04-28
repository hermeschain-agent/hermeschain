// k6 load test: mesh-announce
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '60s',
};

export default function () {
  http.post('http://localhost:4000/api/mesh/announce', JSON.stringify({ peerId: 'lt-' + __VU, url: 'http://x', chainHeight: 0, publicKey: '' }), { headers: { 'content-type': 'application/json' }});
  sleep(0.1);
}
