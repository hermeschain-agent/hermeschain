"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestId = requestId;
const crypto_1 = require("crypto");
function requestId(req, res, next) {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
        ? incoming
        : (0, crypto_1.randomUUID)();
    req.id = id;
    res.setHeader('X-Request-ID', id);
    next();
}
//# sourceMappingURL=requestId.js.map