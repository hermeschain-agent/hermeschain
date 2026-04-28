"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNewsletterRouter = createNewsletterRouter;
const express_1 = require("express");
const db_1 = require("../database/db");
/**
 * Newsletter signup (TASK-486).
 *
 * POST /api/newsletter           — { email, source? } — store + ACK
 * POST /api/newsletter/unsubscribe — { email }
 *
 * Storage only. No actual email send (forward to Mailchimp/Buttondown
 * out-of-band via cron or webhook later). Email field validated as
 * a basic shape; no MX check.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function createNewsletterRouter() {
    const router = (0, express_1.Router)();
    router.post('/', async (req, res) => {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const source = String(req.body?.source || 'web').slice(0, 64);
        if (!EMAIL_RE.test(email) || email.length > 320) {
            return res.status(400).json({ error: 'invalid email' });
        }
        try {
            await db_1.db.query(`INSERT INTO newsletter_subscribers (email, source)
         VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET unsubscribed_at = NULL`, [email, source]);
            res.json({ subscribed: true });
        }
        catch (err) {
            res.status(500).json({ error: err?.message || 'store failed' });
        }
    });
    router.post('/unsubscribe', async (req, res) => {
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!EMAIL_RE.test(email))
            return res.status(400).json({ error: 'invalid email' });
        try {
            await db_1.db.query(`UPDATE newsletter_subscribers SET unsubscribed_at = CURRENT_TIMESTAMP WHERE email = $1`, [email]);
            res.json({ unsubscribed: true });
        }
        catch (err) {
            res.status(500).json({ error: err?.message || 'update failed' });
        }
    });
    return router;
}
//# sourceMappingURL=newsletter.js.map