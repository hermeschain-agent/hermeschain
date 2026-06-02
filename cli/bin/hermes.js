#!/usr/bin/env node
const subcmd = process.argv[2];
const args = process.argv.slice(3);
async function main() {
  switch (subcmd) {
    case "balance": {
      const addr = args[0];
      const r = await fetch(`https://hermeschain.io/api/account/\${addr}`).then(r => r.json());
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case "head": {
      const r = await fetch("https://hermeschain.io/api/chain/latest").then(r => r.json());
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case "status": {
      const r = await fetch("https://hermeschain.io/api/status").then(r => r.json());
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case "--help":
    case "-h":
    default:
      console.log("usage: hermes <balance|head|status> [args]");
  }
}
main().catch(e => { console.error(e); process.exit(1); });
