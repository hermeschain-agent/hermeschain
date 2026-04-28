# Cookie security flags (TASK-361)

All cookies set with: `HttpOnly; Secure; SameSite=Strict; Path=/`. Session cookies regenerate ID on login (TASK-362). No long-lived cookies — sessions expire after 24h idle.
