# Publishing Hermes Wallet to the Chrome Web Store

A start-to-finish checklist. The repo work (icons, manifest, privacy policy,
build) is already done — this is the manual part you do once.

## 0. Prerequisites (all ready in-repo)
- ✅ Icons 16/48/128 (`extension/public/icons/`, wired into `manifest.json`).
- ✅ Manifest v3 with `name`, `version` (1.0.0), `description`, `icons`.
- ✅ Privacy policy (`extension/PRIVACY.md`) — **must be live at a public URL**.
  Publish it at `https://hermeschain.xyz/privacy` (a backend route serves it;
  redeploy the backend so the URL is live) or paste it into any public page.
- ⬜ A Google account to register as a developer.
- ⬜ 1–5 screenshots at 1280×800 (see `docs/extension-store-listing.md`).

## 1. Register as a Chrome Web Store developer (one-time, $5)
1. Go to the **Chrome Web Store Developer Dashboard**:
   https://chrome.google.com/webstore/devconsole
2. Sign in, accept the developer agreement, pay the **one-time $5** fee.
3. (Recommended) Set up a publisher display name.

## 2. Build the production package
```bash
cd extension
node build.mjs
cd dist && zip -r ../hermes-wallet-v1.0.0.zip . && cd ..
# → extension/hermes-wallet-v1.0.0.zip  (this is what you upload)
```
The zip must contain `manifest.json` at its ROOT (it does — we zip the contents
of `dist/`, not the `dist/` folder itself).

## 3. Create the item + upload
1. Dashboard → **Items** → **+ New item**.
2. Upload `hermes-wallet-v1.0.0.zip`. The dashboard validates the manifest.

## 4. Fill out the listing
Use `docs/extension-store-listing.md` for the copy.
- **Store listing**: name, summary, detailed description, category (Productivity),
  language, icon (auto from the 128px), screenshots, optional promo tile.
- **Privacy practices**: add the **privacy policy URL**, the permission
  justifications (storage / host access / content script), declare **no remote
  code**, and the data-usage checkboxes (Hermes collects nothing — tick the
  "not sold / not used for unrelated purposes" certifications and leave the
  data-collection categories unchecked).
- **Distribution**: Public, and the regions you want.

## 5. Submit for review
- Click **Submit for review**.
- **Heads-up:** crypto/wallet extensions get **extra scrutiny** and reviews can
  take from a few days to a few weeks. Common reviewer questions and the honest
  answers:
  - *"Why the broad `https://*/*` content-script host match?"* — to inject the
    `window.hermes` provider so any dapp can _request_ a connection/signature;
    every request is user-approved; the script reads nothing from the page.
    (Same model as MetaMask.) If review pushes back, you can narrow `matches`
    to specific dapp origins.
  - *"Does it execute remote code?"* — No. Everything is bundled.
  - *"What data is collected?"* — None; non-custodial; keys never leave the
    device. Point them at the privacy policy.

## 6. After approval
- The item goes live at `https://chromewebstore.google.com/detail/<id>`.
- To ship updates: bump `version` in `manifest.json`, rebuild, zip, and upload a
  new package under the same item → submit.

## Notes / gotchas
- 16px icon is downscaled from the detailed Hermes logo and may look soft at the
  smallest size; if you want it crisper, hand-make a simplified 16px mark and
  drop it in `extension/public/icons/hermes-16.png`.
- The popup uses bundled OFL pixel fonts (`extension/public/fonts/`, see
  `LICENSE.txt`) — no external font requests, which helps review.
- Firefox/Edge: the same MV3 zip can be submitted to the Edge Add-ons store and
  (with minor manifest tweaks) Firefox AMO later.
