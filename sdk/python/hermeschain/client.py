import requests

class Client:
    def __init__(self, base_url="https://hermeschain.io", api_key=None):
        self.base = base_url.rstrip("/")
        self.headers = {"X-API-Key": api_key} if api_key else {}

    def status(self):
        return requests.get(f"{self.base}/api/status", headers=self.headers).json()

    def get_balance(self, addr):
        return requests.get(f"{self.base}/api/account/{addr}", headers=self.headers).json().get("balance", "0")

    def get_next_nonce(self, addr):
        return requests.get(f"{self.base}/api/account/{addr}/next-nonce", headers=self.headers).json()["nextNonce"]

    def get_receipt(self, tx_hash):
        r = requests.get(f"{self.base}/api/tx/{tx_hash}", headers=self.headers)
        return r.json() if r.ok else None

    def submit_tx(self, tx):
        return requests.post(f"{self.base}/api/transactions", json=tx, headers=self.headers).json()
