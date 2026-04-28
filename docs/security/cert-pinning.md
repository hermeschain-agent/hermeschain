# Cert Pinning

Mobile clients (planned) can pin Hermeschain TLS certificate fingerprints
to defend against rogue/compromised CA issuance.

## Current pin set

Live cert chain SHA-256 fingerprints (placeholder; auto-generated when
real cert exists):

```
# Primary (active)
sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=

# Backup (rolled in 30d before primary expires)
sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=
```

To extract from a live cert:

```bash
echo | openssl s_client -servername hermeschain.io -connect hermeschain.io:443 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl rsa -pubin -outform der 2>/dev/null \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

## Rotation cadence

- Backup pin added 30 days before primary cert expires
- Primary cert renewed via Let's Encrypt monthly
- Old primary pin removed 30 days after cert renewal

## Mobile client API

```kotlin
// Android
val pinner = CertificatePinner.Builder()
  .add("hermeschain.io", "sha256/AAAAA...")
  .add("hermeschain.io", "sha256/BBBBB...")
  .build()
```

```swift
// iOS — TrustKit
TrustKit.initSharedInstance(withConfiguration: [
  kTSKPinnedDomains: [
    "hermeschain.io": [
      kTSKPublicKeyHashes: ["AAAAA...", "BBBBB..."]
    ]
  ]
])
```

## What if pinning fails

Mobile client should:
1. Block the request
2. Log the failed pin (locally)
3. Show user a warning with manual override (signed disclosure)

Do NOT silently fail open.
