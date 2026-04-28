# Encryption at rest (TASK-364)

Mnemonics + private keys (when stored server-side, optional) encrypted with AES-256-GCM keyed by KMS-wrapped MASTER_KEY. KDF for password-encrypted exports: PBKDF2-SHA256, 100k iterations, random 16-byte salt.
