/**
 * Popup UI. A thin client over the background service worker (which owns the
 * keys): it never touches private keys, it asks the background to sign and then
 * broadcasts the signed payload to the chain.
 */
import { WALLET_MESSAGE, type WalletRequest, type WalletResponse, type WalletStatus } from '../messages.ts';
import { fetchSnapshot, submitSend, claimFaucet, importAddress, type WalletSnapshot } from '../wallet/api.ts';
import type { SignedSend } from '../crypto/keyring.ts';

const screen = document.getElementById('screen') as HTMLElement;
const lockBtn = document.getElementById('lockBtn') as HTMLButtonElement;
const toastEl = document.getElementById('toast') as HTMLElement;

async function rpc<T = unknown>(request: WalletRequest): Promise<T> {
  const res = (await chrome.runtime.sendMessage({ channel: WALLET_MESSAGE, request })) as WalletResponse<T>;
  if (!res?.ok) throw new Error(res?.error || 'request failed');
  return res.data as T;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(msg: string, kind: 'ok' | 'err' | '' = ''): void {
  toastEl.textContent = msg;
  toastEl.className = kind;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 3200);
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

// ---- Screens ---------------------------------------------------------------

function renderWelcome(): void {
  screen.innerHTML = `
    <div class="col">
      <h2>Welcome to Hermes</h2>
      <p class="muted">A self-custody wallet. Your keys are generated on this device and never leave it.</p>
      <button class="full" id="create">Create a new wallet</button>
      <button class="full ghost" id="import">Import with a recovery phrase</button>
    </div>`;
  screen.querySelector('#create')!.addEventListener('click', renderCreate);
  screen.querySelector('#import')!.addEventListener('click', renderImport);
}

function renderCreate(): void {
  screen.innerHTML = `
    <div class="col">
      <h2>Create wallet</h2>
      <input id="pw" type="password" placeholder="New password (min 8 chars)" />
      <input id="pw2" type="password" placeholder="Confirm password" />
      <button class="full" id="go">Create</button>
      <button class="full ghost" id="back">Back</button>
    </div>`;
  screen.querySelector('#back')!.addEventListener('click', renderWelcome);
  screen.querySelector('#go')!.addEventListener('click', async () => {
    const pw = (screen.querySelector('#pw') as HTMLInputElement).value;
    const pw2 = (screen.querySelector('#pw2') as HTMLInputElement).value;
    if (pw.length < 8) return toast('Password must be at least 8 characters', 'err');
    if (pw !== pw2) return toast('Passwords do not match', 'err');
    try {
      const { mnemonic, account } = await rpc<{ mnemonic: string; account: { address: string } }>({
        type: 'createWallet',
        password: pw,
      });
      importAddress(account.address).catch(() => {});
      renderSeed(mnemonic);
    } catch (e) {
      toast(String((e as Error).message), 'err');
    }
  });
}

function renderSeed(mnemonic: string): void {
  const words = mnemonic.split(' ');
  screen.innerHTML = `
    <div class="col">
      <h2>Your recovery phrase</h2>
      <p class="warn">Write these 12 words down and keep them secret. Anyone with them controls your funds. They are shown only once.</p>
      <div class="seed">${words.map((w, i) => `<span>${i + 1}. ${w}</span>`).join('')}</div>
      <button class="full" id="copy">Copy</button>
      <button class="full" id="done">I've saved it — continue</button>
    </div>`;
  screen.querySelector('#copy')!.addEventListener('click', () => {
    navigator.clipboard.writeText(mnemonic).then(() => toast('Copied', 'ok'));
  });
  screen.querySelector('#done')!.addEventListener('click', renderMain);
}

function renderImport(): void {
  screen.innerHTML = `
    <div class="col">
      <h2>Import wallet</h2>
      <input id="seed" placeholder="12 or 24 word recovery phrase" />
      <input id="pw" type="password" placeholder="New password (min 8 chars)" />
      <button class="full" id="go">Import</button>
      <button class="full ghost" id="back">Back</button>
    </div>`;
  screen.querySelector('#back')!.addEventListener('click', renderWelcome);
  screen.querySelector('#go')!.addEventListener('click', async () => {
    const mnemonic = (screen.querySelector('#seed') as HTMLInputElement).value.trim();
    const pw = (screen.querySelector('#pw') as HTMLInputElement).value;
    if (pw.length < 8) return toast('Password must be at least 8 characters', 'err');
    try {
      const { account } = await rpc<{ account: { address: string } }>({ type: 'importWallet', password: pw, mnemonic });
      importAddress(account.address).catch(() => {});
      toast('Wallet imported', 'ok');
      renderMain();
    } catch (e) {
      toast(String((e as Error).message), 'err');
    }
  });
}

function renderUnlock(): void {
  screen.innerHTML = `
    <div class="col">
      <h2>Unlock</h2>
      <input id="pw" type="password" placeholder="Password" autofocus />
      <button class="full" id="go">Unlock</button>
    </div>`;
  const submit = async () => {
    const pw = (screen.querySelector('#pw') as HTMLInputElement).value;
    try {
      await rpc({ type: 'unlock', password: pw });
      renderMain();
    } catch (e) {
      toast(String((e as Error).message), 'err');
    }
  };
  screen.querySelector('#go')!.addEventListener('click', submit);
  screen.querySelector('#pw')!.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') submit();
  });
}

async function renderMain(): Promise<void> {
  lockBtn.hidden = false;
  const status = await rpc<WalletStatus>({ type: 'getStatus' });
  const address = status.activeAddress;
  if (!address) return renderUnlock();

  screen.innerHTML = `
    <div class="col">
      <div class="card col">
        <span class="muted">Balance</span>
        <span class="balance" id="bal">…</span>
        <span class="addr" id="addr">${address}</span>
        <div class="row">
          <button class="ghost" id="copy">Copy address</button>
          <button class="ghost" id="faucet">Faucet</button>
          <button class="ghost" id="refresh">↻</button>
        </div>
      </div>
      <div class="card col">
        <strong>Send</strong>
        <input id="to" placeholder="Recipient address" />
        <input id="amt" type="number" min="0" step="any" placeholder="Amount" />
        <button class="full" id="send">Sign &amp; send</button>
      </div>
    </div>`;

  const balEl = screen.querySelector('#bal') as HTMLElement;
  let snap: WalletSnapshot | null = null;
  const refresh = async () => {
    balEl.textContent = '…';
    try {
      snap = await fetchSnapshot(address);
      balEl.textContent = fmt(snap.balance);
    } catch {
      balEl.textContent = '—';
    }
  };
  refresh();

  screen.querySelector('#copy')!.addEventListener('click', () =>
    navigator.clipboard.writeText(address).then(() => toast('Address copied', 'ok')),
  );
  screen.querySelector('#refresh')!.addEventListener('click', refresh);
  screen.querySelector('#faucet')!.addEventListener('click', async () => {
    try {
      await claimFaucet(address);
      toast('Faucet claimed', 'ok');
      setTimeout(refresh, 800);
    } catch (e) {
      toast(String((e as Error).message), 'err');
    }
  });
  screen.querySelector('#send')!.addEventListener('click', async () => {
    const to = (screen.querySelector('#to') as HTMLInputElement).value.trim();
    const amt = (screen.querySelector('#amt') as HTMLInputElement).value.trim();
    if (!to || !amt || Number(amt) <= 0) return toast('Enter a recipient and amount', 'err');
    try {
      if (!snap) snap = await fetchSnapshot(address);
      const signed = await rpc<SignedSend>({ type: 'signTransfer', toAddress: to, amount: amt, nonce: snap.nonce });
      await submitSend(signed);
      toast('Sent', 'ok');
      setTimeout(refresh, 800);
    } catch (e) {
      toast(String((e as Error).message), 'err');
    }
  });
}

lockBtn.addEventListener('click', async () => {
  await rpc({ type: 'lock' });
  lockBtn.hidden = true;
  renderUnlock();
});

async function init(): Promise<void> {
  try {
    const status = await rpc<WalletStatus>({ type: 'getStatus' });
    if (!status.initialized) renderWelcome();
    else if (!status.unlocked) renderUnlock();
    else renderMain();
  } catch (e) {
    screen.innerHTML = `<p class="warn">${String((e as Error).message)}</p>`;
  }
}

init();
