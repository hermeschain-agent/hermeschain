class _Builder:
    def __init__(self):
        self.ops = []
    def push(self, v): self.ops.append({"op": "PUSH", "args": [v]}); return self
    def pop(self): self.ops.append({"op": "POP"}); return self
    def add(self): self.ops.append({"op": "ADD"}); return self
    def sub(self): self.ops.append({"op": "SUB"}); return self
    def mul(self): self.ops.append({"op": "MUL"}); return self
    def log(self, topics=None, data=None):
        self.ops.append({"op": "LOG", "args": {"topics": topics or [], "data": data or ""}})
        return self
    def stop(self): self.ops.append({"op": "STOP"}); return self
    def build(self): return list(self.ops)
    def to_tx_data(self):
        import json
        return "vm:" + json.dumps(self.ops)

def vm_program():
    return _Builder()
