# Section 06 — Frontend / HUD Specs (TASK-216..265)

50 tasks. New panels (tx detail, block detail, account, mempool live tail, reorg history, validator board, quorum ticker, VM trace viewer, contract storage, event log, peer map, wallet/HD address tree, send form, token grid, faucet button, address book, name registry browse), theme variants + picker, agent reasoning panel, cost ticker, SSE robustness (reconnect, channel selector, replay), keyboard shortcuts + cmd-k palette, search bars + autocomplete + deep-link, prefs storage, notifications, embed/PWA/mobile, charts/a11y polish.

**Preconditions used throughout:**
- Frontend root: [frontend/src/App.tsx](frontend/src/App.tsx).
- HUD state: [frontend/src/useHermesDockState.ts](frontend/src/useHermesDockState.ts).
- Theme: [frontend/src/useTheme.ts](frontend/src/useTheme.ts).
- Styles: [frontend/src/index.css](frontend/src/index.css).

---

### TASK-216 — Tx detail modal

**Section:** hud
**Effort:** M
**Depends on:** TASK-160
**Type:** new-file

**Goal**
Click any tx hash → modal showing full tx data, status, gas, decoded logs.

**Files**
- new: `frontend/src/components/TxDetailModal.tsx`.
- edit: App.tsx — render conditionally on `selectedTxHash`.

**Implementation sketch**
- Fetch from `/api/tx/:hash?decodeLogs=true`.
- Show: from, to, value, gas, status, logs table.

**Acceptance**
- [ ] Modal opens on click; data loads.

**Verification**
- Click in HUD.

---

### TASK-217 — Block detail drawer

**Section:** hud
**Effort:** M
**Depends on:** TASK-159
**Type:** new-file

**Goal**
Side drawer with full block info + receipts list.

**Files**
- new: `frontend/src/components/BlockDetailDrawer.tsx`.

**Implementation sketch**
- Slide-in from right.
- Fetch `/api/blocks/:height?include=receipts`.

**Acceptance**
- [ ] Drawer renders correctly.

**Verification**
- Click block height in HUD.

---

### TASK-218 — Account detail panel

**Section:** hud
**Effort:** S
**Depends on:** TASK-058
**Type:** new-file

**Goal**
Panel with balance, nonce, history, name (if registered), tags.

**Files**
- new: `frontend/src/components/AccountDetail.tsx`.

**Acceptance**
- [ ] Panel renders.

**Verification**
- Navigate to /account/:addr.

---

### TASK-219 — Mempool live-tail panel

**Section:** hud
**Effort:** M
**Depends on:** TASK-048
**Type:** new-file

**Goal**
SSE-backed live list of pending txs with auto-scroll.

**Files**
- new: `frontend/src/components/MempoolPanel.tsx`.

**Acceptance**
- [ ] New tx appears in real time.

**Verification**
- Submit tx, observe.

---

### TASK-220 — Reorg history widget

**Section:** hud
**Effort:** S
**Depends on:** TASK-060
**Type:** new-file

**Goal**
Sidebar widget listing recent reorg events with depth + age.

**Files**
- new: `frontend/src/components/ReorgWidget.tsx`.

**Acceptance**
- [ ] Lists last 10.

**Verification**
- Trigger reorg.

---

### TASK-221 — Validator board with rotating producer indicator

**Section:** hud
**Effort:** M
**Depends on:** TASK-157
**Type:** new-file

**Goal**
Grid of validators with avatar, stake, blocks_produced, uptime; current producer pulses.

**Files**
- new: `frontend/src/components/ValidatorBoard.tsx`.

**Acceptance**
- [ ] Producer pulses on each new block.

**Verification**
- Watch over multiple blocks.

---

### TASK-222 — Quorum-vote live ticker

**Section:** hud
**Effort:** S
**Depends on:** TASK-014
**Type:** new-file

**Goal**
Per-block list of who approved / rejected, animated as votes land.

**Files**
- new: `frontend/src/components/QuorumTicker.tsx`.

**Acceptance**
- [ ] Votes appear in order.

**Verification**
- Multi-validator sim.

---

### TASK-223 — VM execution trace viewer

**Section:** hud
**Effort:** M
**Depends on:** TASK-083
**Type:** new-file

**Goal**
Tx detail modal extension: toggle "Show trace" → step-by-step opcode + stack viewer.

**Files**
- new: `frontend/src/components/VmTraceView.tsx`.

**Acceptance**
- [ ] Renders trace from /api/tx/:hash/trace.

**Verification**
- Pick a VM tx.

---

### TASK-224 — Contract storage browser

**Section:** hud
**Effort:** S
**Depends on:** TASK-100
**Type:** new-file

**Goal**
Read /api/contract/:addr/storage; show key/value table with prefix filter.

**Files**
- new: component.

**Acceptance**
- [ ] Filter works.

**Verification**
- Navigate to deployed contract.

---

### TASK-225 — Event log viewer with topic filter

**Section:** hud
**Effort:** S
**Depends on:** TASK-024
**Type:** new-file

**Goal**
Filtered view of /api/chain/logs.

**Files**
- new: component.

**Acceptance**
- [ ] Filter applies.

**Verification**
- Trigger logs, filter.

---

### TASK-226 — Gas-price chart last 1000 blocks

**Section:** hud
**Effort:** M
**Depends on:** TASK-050
**Type:** new-file

**Goal**
Line chart from /api/chain/gas-stats.

**Files**
- new: `frontend/src/charts/GasPriceChart.tsx`.
- add dep: `recharts` or similar.

**Acceptance**
- [ ] Chart renders.

**Verification**
- Visual.

---

### TASK-227 — Block-time chart

**Section:** hud
**Effort:** S
**Depends on:** TASK-052
**Type:** new-file

**Goal**
Histogram from /api/chain/block-times.

**Files**
- new: chart.

**Acceptance**
- [ ] Renders.

**Verification**
- Visual.

---

### TASK-228 — TPS sparkline in header

**Section:** hud
**Effort:** S
**Depends on:** TASK-051
**Type:** edit

**Goal**
Tiny sparkline next to TPS chip.

**Files**
- edit: App.tsx header chips.

**Acceptance**
- [ ] Sparkline updates.

**Verification**
- Visual.

---

### TASK-229 — Network peer map (graph view)

**Section:** hud
**Effort:** L
**Depends on:** TASK-005
**Type:** new-file

**Goal**
Force-directed graph of known peers with edges showing chainHeight delta.

**Files**
- new: component.
- add dep: `react-force-graph`.

**Acceptance**
- [ ] Graph renders with peers.

**Verification**
- Visual.

---

### TASK-230 — Peer latency table

**Section:** hud
**Effort:** S
**Depends on:** TASK-005
**Type:** new-file

**Goal**
Sortable table of peers + last-seen + RTT.

**Files**
- new: component.

**Acceptance**
- [ ] Sort works.

**Verification**
- Visual.

---

### TASK-231 — Wallet panel: HD address tree

**Section:** hud
**Effort:** M
**Depends on:** TASK-106
**Type:** new-file

**Goal**
Tree of derived addresses (m/44'/9999'/0'/0/0..N) with balance per leaf.

**Files**
- new: component.

**Acceptance**
- [ ] Tree expands; balances shown.

**Verification**
- Visual.

---

### TASK-232 — Send-tx form with gas estimator

**Section:** hud
**Effort:** M
**Depends on:** TASK-056
**Type:** new-file

**Goal**
To-address + amount + auto gas estimate via /api/tx/estimate-gas.

**Files**
- new: component.

**Acceptance**
- [ ] Estimate appears as user types.

**Verification**
- UI test.

---

### TASK-233 — Token balance grid

**Section:** hud
**Effort:** S
**Depends on:** TASK-118
**Type:** new-file

**Goal**
Grid of token holdings per active wallet.

**Files**
- new: component.

**Acceptance**
- [ ] Grid populated.

**Verification**
- Visual.

---

### TASK-234 — Approve / transfer modal

**Section:** hud
**Effort:** S
**Depends on:** TASK-119
**Type:** new-file

**Goal**
Modal for token approve + transferFrom flow.

**Files**
- new: component.

**Acceptance**
- [ ] Both actions work.

**Verification**
- E2E.

---

### TASK-235 — Faucet button + cooldown timer

**Section:** hud
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
One-click drip with countdown if cooldown active.

**Files**
- new: component.

**Acceptance**
- [ ] Disabled during cooldown.

**Verification**
- Click + wait.

---

### TASK-236 — Address book panel

**Section:** hud
**Effort:** S
**Depends on:** TASK-117
**Type:** new-file

**Goal**
List + add/edit/delete contacts.

**Files**
- new: component.

**Acceptance**
- [ ] CRUD works.

**Verification**
- UI test.

---

### TASK-237 — Name registry browse

**Section:** hud
**Effort:** S
**Depends on:** TASK-112
**Type:** new-file

**Goal**
Searchable list of registered names.

**Files**
- new: component.

**Acceptance**
- [ ] Search works.

**Verification**
- UI test.

---

### TASK-238 — Theme: high-contrast variant

**Section:** hud
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
A11y theme: black bg, white text, no antialiasing softening.

**Files**
- edit: index.css — add `[data-theme='high-contrast']` block.
- edit: useTheme.ts — accept this theme.

**Acceptance**
- [ ] Toggling shows variant.

**Verification**
- Visual.

---

### TASK-239 — Theme: amber CRT variant

**Section:** hud
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Retro amber phosphor look.

**Files**
- edit: same as TASK-238.

**Acceptance**
- [ ] Variant applied.

**Verification**
- Visual.

---

### TASK-240 — Theme picker dropdown

**Section:** hud
**Effort:** S
**Depends on:** TASK-238, TASK-239
**Type:** edit

**Goal**
Replace the binary toggle with a dropdown listing all themes.

**Files**
- edit: header.

**Acceptance**
- [ ] Picker switches themes.

**Verification**
- UI.

---

### TASK-241 — Compact mode

**Section:** hud
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Toggle that reduces padding, font size, row height for dense displays.

**Files**
- edit: index.css + useTheme.

**Acceptance**
- [ ] Compact applied.

**Verification**
- Visual.

---

### TASK-242 — Stage agent reasoning panel

**Section:** hud
**Effort:** M
**Depends on:** TASK-188
**Type:** new-file

**Goal**
Real-time tool-call chain with collapsible nesting.

**Files**
- new: component.

**Acceptance**
- [ ] Tool calls render hierarchically.

**Verification**
- Visual during agent run.

---

### TASK-243 — Per-task progress bar in HUD

**Section:** hud
**Effort:** S
**Depends on:** TASK-183
**Type:** edit

**Goal**
Bar showing actual vs estimated minutes.

**Files**
- edit: existing task card.

**Acceptance**
- [ ] Bar updates.

**Verification**
- Visual.

---

### TASK-244 — Cost ticker (today's spend)

**Section:** hud
**Effort:** S
**Depends on:** TASK-189
**Type:** edit

**Goal**
Header chip showing $ today.

**Files**
- edit: header.

**Acceptance**
- [ ] Updates as tasks complete.

**Verification**
- Visual.

---

### TASK-245 — SSE reconnect with exponential backoff

**Section:** hud
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
On disconnect, retry: 1s, 2s, 4s, 8s, capped at 30s.

**Files**
- edit: SSE wiring in useHermesDockState.

**Acceptance**
- [ ] Reconnects after drop.

**Verification**
- Kill backend briefly.

---

### TASK-246 — SSE channel selector

**Section:** hud
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
UI to subscribe only to channels of interest.

**Files**
- new: component.

**Acceptance**
- [ ] Toggling reduces traffic.

**Verification**
- Network tab.

---

### TASK-247 — Keyboard shortcuts overlay (?)

**Section:** hud
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Press `?` → modal listing all shortcuts.

**Files**
- new: component.

**Acceptance**
- [ ] Modal shows on press.

**Verification**
- Press.

---

### TASK-248 — Command palette cmd-k

**Section:** hud
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Cmd-K opens fuzzy search over all routes + actions.

**Files**
- new: component.
- add dep: `cmdk`.

**Acceptance**
- [ ] Palette opens; search works.

**Verification**
- Press.

---

### TASK-249 — Block search bar

**Section:** hud
**Effort:** S
**Depends on:** TASK-153
**Type:** new-file

**Goal**
Header bar to jump to any block.

**Files**
- new: component.

**Acceptance**
- [ ] Search jumps to block.

**Verification**
- Type + enter.

---

### TASK-250 — Address search with autocomplete

**Section:** hud
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Header search; autocompletes from address book + recent.

**Files**
- new: component.

**Acceptance**
- [ ] Suggestions appear.

**Verification**
- Type.

---

### TASK-251 — Tx hash paste auto-route

**Section:** hud
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Paste tx hash anywhere → auto-open detail modal.

**Files**
- edit: global paste handler.

**Acceptance**
- [ ] Paste opens modal.

**Verification**
- Paste known hash.

---

### TASK-252 — URL deep-link state restore

**Section:** hud
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
Selected block / tx / account encoded in URL hash so refresh preserves view.

**Files**
- edit: state hooks to read/write URL.

**Acceptance**
- [ ] Refresh keeps view.

**Verification**
- Open, refresh.

---

### TASK-253 — Shareable view URLs preserve filters

**Section:** hud
**Effort:** S
**Depends on:** TASK-252
**Type:** edit

**Goal**
Filters (e.g. log topic, block range) included in URL.

**Files**
- edit: filter components.

**Acceptance**
- [ ] Sharing URL reproduces filtered view.

**Verification**
- Share + open in fresh window.

---

### TASK-254 — Local hud preferences in localStorage

**Section:** hud
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Theme, compact mode, channel selections persist.

**Files**
- edit: useTheme + state hooks.

**Acceptance**
- [ ] Refresh keeps prefs.

**Verification**
- Refresh.

---

### TASK-255 — Server-synced HUD prefs per API key

**Section:** hud
**Effort:** M
**Depends on:** TASK-254
**Type:** new-file

**Goal**
For logged-in users, sync prefs to server (covered by API key).

**Files**
- new: `GET/PUT /api/prefs`.
- new migration `user_prefs(api_key_hash PK, prefs_json)`.

**Acceptance**
- [ ] Cross-device sync.

**Verification**
- Two browsers.

---

### TASK-256 — Toast notifications for own-wallet activity

**Section:** hud
**Effort:** S
**Depends on:** TASK-172
**Type:** new-file

**Goal**
When a tx involving your wallet lands, show toast.

**Files**
- new: component.

**Acceptance**
- [ ] Toast appears.

**Verification**
- Self-tx.

---

### TASK-257 — Browser push notification opt-in

**Section:** hud
**Effort:** S
**Depends on:** TASK-256
**Type:** new-file

**Goal**
Same trigger but via Notification API.

**Files**
- edit: same component, add Notification.requestPermission flow.

**Acceptance**
- [ ] Push notification fires.

**Verification**
- Permit + trigger.

---

### TASK-258 — Embed-mode iframe

**Section:** hud
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
`?embed=true` query strips chrome for iframe embedding.

**Files**
- edit: App.tsx.

**Acceptance**
- [ ] Embed view = no chrome.

**Verification**
- Visit with param.

---

### TASK-259 — Mobile-responsive collapse

**Section:** hud
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
Below 768px: collapse sidebar, stack panels.

**Files**
- edit: index.css.

**Acceptance**
- [ ] Layout adapts.

**Verification**
- Resize browser.

---

### TASK-260 — PWA manifest + offline shell

**Section:** hud
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Installable PWA.

**Files**
- new: `frontend/public/manifest.webmanifest`.
- edit: index.html.

**Acceptance**
- [ ] Installable.

**Verification**
- Chrome install icon.

---

### TASK-261 — Service worker for static assets

**Section:** hud
**Effort:** S
**Depends on:** TASK-260
**Type:** new-file

**Goal**
Cache static assets for offline shell.

**Files**
- new: `frontend/public/sw.js`.

**Acceptance**
- [ ] Offline → shell still loads.

**Verification**
- DevTools offline mode.

---

### TASK-262 — Reusable chart component

**Section:** hud
**Effort:** S
**Depends on:** TASK-226
**Type:** new-file

**Goal**
Single `<TimeChart>` component used by all chart panels.

**Files**
- new: component.

**Acceptance**
- [ ] Used in 3+ panels.

**Verification**
- Inspect.

---

### TASK-263 — A11y pass: aria-labels everywhere

**Section:** hud
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
Every button/link gets descriptive aria-label.

**Files**
- edit: across components.

**Acceptance**
- [ ] axe-core scan: 0 errors.

**Verification**
- Run axe.

---

### TASK-264 — Keyboard-trap audit on modals

**Section:** hud
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Tab key cycles within modal; Escape closes.

**Files**
- edit: modal components.

**Acceptance**
- [ ] Trap correct.

**Verification**
- Tab through.

---

### TASK-265 — Focus-visible styling pass

**Section:** hud
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
:focus-visible ring on all interactives.

**Files**
- edit: index.css.

**Acceptance**
- [ ] Tab navigation shows rings.

**Verification**
- Tab around.

---

## Summary

50 tasks: 32 small, 17 medium, 1 large. Visible-progress cluster (most produce immediate UI value).
