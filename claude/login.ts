/**
 * Standalone CLI login script for Antigravity OAuth.
 * Invoked by `cc auth login` — shows the full interactive account management menu.
 *
 * Usage: bun run scripts/login.ts
 */

import { authorizeAntigravity, exchangeAntigravity } from "../core/src/antigravity/oauth";
import { startOAuthListener } from "../core/src/plugin/server";
import { loadAccounts as _loadAccounts, saveAccounts as _saveAccounts, type AccountMetadataV3 } from "../core/src/plugin/storage";


async function loadAccounts() {
  syncBeforeRead();
  return _loadAccounts();
}
async function saveAccounts(...args: Parameters<typeof _saveAccounts>) {
  const result = await _saveAccounts(...args);
  syncAfterWrite();
  return result;
}
import { 
  promptProjectId, 
  promptAddAnotherAccount,
  promptLoginMode,
  showProxyMenu,
  promptProxyUrl,
  type ExistingAccountInfo
} from "../core/src/plugin/cli";
import { checkAccountsQuota } from "../core/src/plugin/quota";
import { verifyAccountAccess, markStoredAccountVerificationRequired, clearStoredAccountVerificationRequired, promptAccountIndexForVerification } from "./menu-helpers";
import { PluginClient } from "../core/src/plugin/types";
import { exec } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";


let _syncMod: { syncBeforeRead: () => string; syncAfterWrite: (side?: string) => void } | null = null;
try {
  const hubSyncPath = join(homedir(), ".claude", "repos", "intisy", "claude-hub", "core", "account-sync.js");
  if (existsSync(hubSyncPath)) {
    _syncMod = await import(hubSyncPath);
  }
} catch {}

function syncBeforeRead() { try { _syncMod?.syncBeforeRead(); } catch {} }
function syncAfterWrite() { try { _syncMod?.syncAfterWrite("cc"); } catch {} }


const client: PluginClient = {
  getPluginConfig: () => ({}),
  updatePluginConfig: async () => {},
  log: () => {},
  warn: () => {},
  error: () => {},
};
const providerId = "antigravity";

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      console.log(`\x1b[33mCould not open browser automatically.\x1b[0m`);
      console.log(`Open this URL manually:\n  ${url}\n`);
    }
  });
}

async function addOneAccount(): Promise<boolean> {
  const projectId = await promptProjectId();
  const listener = await startOAuthListener({ timeoutMs: 5 * 60 * 1000 });
  const auth = await authorizeAntigravity(projectId);

  console.log("\n\x1b[36mOpening browser for Google sign-in…\x1b[0m");
  console.log(`If the browser doesn't open, visit:\n  ${auth.url}\n`);
  openBrowser(auth.url);

  let callbackUrl: URL;
  try {
    callbackUrl = await listener.waitForCallback();
  } catch (err) {
    console.error("\x1b[31mOAuth callback timed out or failed.\x1b[0m");
    await listener.close();
    return false;
  }
  await listener.close();

  const code = callbackUrl.searchParams.get("code");
  const state = callbackUrl.searchParams.get("state");

  if (!code || !state) {
    console.error("\x1b[31mMissing code or state in OAuth callback.\x1b[0m");
    return false;
  }

  console.log("\x1b[36mExchanging authorization code…\x1b[0m");
  const result = await exchangeAntigravity(code, state);

  if (result.type === "failed") {
    console.error(`\x1b[31mToken exchange failed: ${result.error}\x1b[0m`);
    return false;
  }

  const existing = await loadAccounts();
  const accounts = existing?.accounts ?? [];

  const duplicate = accounts.findIndex((a) => a.email === result.email);
  if (duplicate >= 0) {
    console.log(`\x1b[33mAccount ${result.email} already exists — updating tokens.\x1b[0m`);
    accounts[duplicate] = {
      ...accounts[duplicate],
      refreshToken: result.refresh,
      projectId: result.projectId,
      lastUsed: Date.now(),
    };
  } else {
    accounts.push({
      email: result.email,
      refreshToken: result.refresh,
      projectId: result.projectId,
      addedAt: Date.now(),
      lastUsed: Date.now(),
    });
  }

  await saveAccounts({
    version: 4,
    accounts,
    activeIndex: existing?.activeIndex ?? 0,
    activeIndexByFamily: existing?.activeIndexByFamily,
  });

  console.log(`\x1b[32m✓ Account ${result.email ?? "(unknown)"} saved successfully!\x1b[0m`);
  return true;
}


function formatWaitTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function getColor(remaining?: number): string {
  if (typeof remaining !== 'number') return '\x1b[0m';
  if (remaining < 0.2) return '\x1b[31m';
  if (remaining < 0.6) return '\x1b[33m';
  return '\x1b[32m';
}

function createProgressBar(remaining?: number, width: number = 20): string {
  if (typeof remaining !== 'number') return '░'.repeat(width) + ' ???';
  const filled = Math.round(remaining * width);
  const empty = width - filled;
  const color = getColor(remaining);
  const bar = `${color}${'█'.repeat(filled)}\x1b[0m${'░'.repeat(empty)}`;
  const pct = `${color}${Math.round(remaining * 100)}%\x1b[0m`.padStart(4 + color.length + '\x1b[0m'.length);
  return `${bar} ${pct}`;
}

function formatReset(resetTime?: string): string {
  if (!resetTime) return '';
  const ms = Date.parse(resetTime) - Date.now();
  if (ms <= 0) return ' (resetting...)';
  
  const hours = ms / (1000 * 60 * 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.floor(hours % 24);
    if (remainingHours > 0) {
      return ` (resets in ${days}d ${remainingHours}h)`;
    }
    return ` (resets in ${days}d)`;
  }
  return ` (resets in ${formatWaitTime(ms)})`;
}

async function main(): Promise<void> {
  console.log("\x1b[1m\x1b[36m⚡🚀 Antigravity Account Login 🚀⚡\x1b[0m\n");

  while (true) {
    const existingStorage = await loadAccounts();
    const accountsData = existingStorage?.accounts ?? [];
    const activeIndex = existingStorage?.activeIndex ?? 0;

    const existingAccounts: ExistingAccountInfo[] = accountsData.map((acc, idx) => {
      let status: 'active' | 'rate-limited' | 'expired' | 'verification-required' | 'unknown' = 'active';
      const now = Date.now();
      if (acc.verificationRequired) {
        status = 'verification-required';
      } else if (acc.tokenExpired) {
        status = 'expired';
      } else {

        const rateLimits = (acc as any).rateLimitResetTimes;
        if (rateLimits) {
          const isRateLimited = Object.values(rateLimits).some(
            (resetTime) => typeof resetTime === 'number' && (resetTime as number) > now
          );
          if (isRateLimited) {
            status = 'rate-limited';
          }
        }

        if (acc.coolingDownUntil && acc.coolingDownUntil > now) {
          status = 'rate-limited';
        }
      }

      return {
        email: acc.email,
        index: idx,
        addedAt: acc.addedAt,
        lastUsed: acc.lastUsed,
        status,
        isCurrentAccount: idx === activeIndex,
        enabled: acc.enabled !== false,
      };
    });

    const menuResult = await promptLoginMode(existingAccounts);

    if (menuResult.mode === "cancel") {
      break;
    }

    if (menuResult.mode === "add") {
      if (menuResult.deleteAccountIndex !== undefined) {
        const idx = menuResult.deleteAccountIndex;
        const acc = accountsData[idx];
        if (acc) {
          accountsData.splice(idx, 1);
          let newActiveIndex = activeIndex;
          if (activeIndex === idx) newActiveIndex = 0;
          else if (activeIndex > idx) newActiveIndex--;
          
          await saveAccounts({
            ...existingStorage!,
            accounts: accountsData,
            activeIndex: newActiveIndex,
          });
          console.log(`\nDeleted account ${acc.email || idx + 1}.\n`);
        }
        continue;
      }
      
      if (menuResult.refreshAccountIndex !== undefined) {
        console.log("\n\x1b[36mRe-authenticating account...\x1b[0m");
      }
      
      const ok = await addOneAccount();
      if (ok) {
        while (await promptAddAnotherAccount(accountsData.length + 1)) {
          await addOneAccount();
        }
      }
      continue;
    }

    if (menuResult.mode === "fresh") {
      if (menuResult.deleteAll) {
        await saveAccounts({ version: 4, accounts: [], activeIndex: 0 });
        console.log("\n\x1b[32m✓ All accounts deleted.\x1b[0m\n");
      }
      continue;
    }

    if (menuResult.mode === "check") {
      console.log("\n📊 Checking quotas for all accounts...\n");
      const results = await checkAccountsQuota(accountsData, client, providerId);
      let storageUpdated = false;
      
      for (const res of results) {
        const label = res.email || `Account ${res.index + 1}`;
        const disabledStr = res.disabled ? " (disabled)" : "";
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`  ${label}${disabledStr}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        
        if (res.status === "error") {
          console.log(`  ❌ Error: ${res.error}\n`);
          continue;
        }

        const hasGeminiCli = res.geminiCliQuota && res.geminiCliQuota.models.length > 0;
        console.log(`\n  ┌─ Gemini CLI Quota`);
        if (!hasGeminiCli) {
          console.log(`  │  └─ ${res.geminiCliQuota?.error || "No Gemini CLI quota available"}`);
        } else {
          const models = res.geminiCliQuota!.models;
          models.forEach((model, idx) => {
            const connector = idx === models.length - 1 ? "└─" : "├─";
            const bar = createProgressBar(model.remainingFraction);
            const reset = formatReset(model.resetTime);
            console.log(`  │  ${connector} ${model.modelId.padEnd(29)} ${bar}${reset}`);
          });
        }

        const hasAntigravity = res.quota && Object.keys(res.quota.groups).length > 0;
        console.log(`  │`);
        console.log(`  └─ Antigravity Quota`);
        if (!hasAntigravity) {
          console.log(`     └─ ${res.quota?.error || "No quota information available"}`);
        } else {
          const groups = res.quota!.groups;
          const groupEntries = [
            { name: "Claude", data: groups.claude },
            { name: "Gemini 3 Pro", data: groups["gemini-pro"] },
            { name: "Gemini 3 Flash", data: groups["gemini-flash"] },
          ].filter(g => g.data);
          
          groupEntries.forEach((g, idx) => {
            const connector = idx === groupEntries.length - 1 ? "└─" : "├─";
            const bar = createProgressBar(g.data!.remainingFraction);
            const reset = formatReset(g.data!.resetTime);
            console.log(`     ${connector} ${g.name.padEnd(29)} ${bar}${reset}`);
          });
        }
        console.log("");

        if (res.quota?.groups || res.updatedAccount) {
          const acc = accountsData[res.index];
          if (acc) {
            accountsData[res.index] = {
              ...acc,
              ...(res.updatedAccount || {}),
              cachedQuota: res.quota?.groups,
              cachedQuotaUpdatedAt: Date.now(),
            };
            storageUpdated = true;
          }
        }
      }
      
      if (storageUpdated && existingStorage) {
        await saveAccounts({ ...existingStorage, accounts: accountsData });
      }
      continue;
    }

    if (menuResult.mode === "manage") {
      if (menuResult.toggleAccountIndex !== undefined) {
        const acc = accountsData[menuResult.toggleAccountIndex];
        if (acc && existingStorage) {
          acc.enabled = acc.enabled === false;
          await saveAccounts({ ...existingStorage, accounts: accountsData });
          console.log(`\nAccount ${acc.email || menuResult.toggleAccountIndex + 1} ${acc.enabled ? 'enabled' : 'disabled'}.\n`);
        }
      }
      continue;
    }

    if (menuResult.mode === "proxies") {
      const { loadProxyConfig, saveProxyConfig } = await import("../core/src/plugin/proxy-config");
      const { select } = await import("../core/src/plugin/ui/select");
      
      const config = loadProxyConfig();
      const strategy = await select<ProxyStrategy | "back">([
        { label: `Automatic${config.strategy === 'automatic' ? ' (current)' : ''}`, value: 'automatic', hint: 'Uses background hot-pool from multiple providers', color: 'cyan' },
        { label: `Manual${config.strategy === 'manual' ? ' (current)' : ''}`, value: 'manual', hint: 'Uses manually added proxies per account', color: 'cyan' },
        { label: `Disabled${config.strategy === 'disabled' ? ' (current)' : ''}`, value: 'disabled', hint: 'Direct connection', color: 'cyan' },
        { label: '', value: 'back', separator: true },
        { label: 'Back', value: 'back', color: 'yellow' }
      ], { message: 'Select Global Proxy Strategy', clearScreen: true });

      if (strategy && strategy !== 'back') {
         config.strategy = strategy as ProxyStrategy;
         saveProxyConfig(config);
         console.log(`\n✓ Proxy strategy updated to: ${strategy}\n`);
      }
      continue;
    }

    if (menuResult.mode === "proxy_providers") {
      const { loadProxyConfig, saveProxyConfig } = await import("../core/src/plugin/proxy-config");
      const { select } = await import("../core/src/plugin/ui/select");
      
      while (true) {
        const config = loadProxyConfig();
        const providerItems = Object.entries(config.providers).map(([name, p]: [string, any]) => ({
          label: name + (p.enabled ? " [\x1b[32mON\x1b[0m]" : " [\x1b[31mOFF\x1b[0m]"),
          hint: p.apiKey ? "(Key Set)" : "(No Key)",
          value: name
        }));
        
        providerItems.push({ label: "", value: "back", separator: true } as any);
        providerItems.push({ label: "Back", value: "back", color: "yellow" } as any);

        const chosenProvider = await select<string>(providerItems, { message: "Select a Provider to configure", clearScreen: true });
        if (!chosenProvider || chosenProvider === "back") break;

        const prov = config.providers[chosenProvider];
        if (prov) {
          const action = await select<string>([
            { label: prov.enabled ? "Disable Provider" : "Enable Provider", value: "toggle" },
            { label: "Set API Key / Proxy List URL", value: "setkey" },
            { label: "Back", value: "back", color: "yellow" }
          ], { message: `Configure ${chosenProvider}`, clearScreen: true });

          if (action === "toggle") {
            prov.enabled = !prov.enabled;
            saveProxyConfig(config);
          } else if (action === "setkey") {
            const readline = await import("readline");
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            const newKey = await new Promise<string>(resolve => rl.question('Enter API Key or URL for ' + chosenProvider + ' (leave empty to cancel): ', resolve));
            rl.close();
            if (newKey && newKey.trim()) {
              prov.apiKey = newKey.trim();
              saveProxyConfig(config);
            }
          }
        }
      }
      continue;
    }

    if (menuResult.mode === "verify" || menuResult.mode === "verify-all") {
      const verifyAll = menuResult.mode === "verify-all" || menuResult.verifyAll === true;

      if (verifyAll) {
        if (accountsData.length === 0) {
          console.log("\nNo accounts available to verify.\n");
          continue;
        }

        console.log(`\nChecking verification status for ${accountsData.length} account(s)...\n`);
        let okCount = 0, blockedCount = 0, errorCount = 0;
        let storageUpdated = false;
        const blockedResults: Array<{ label: string; message: string; verifyUrl?: string }> = [];

        for (let i = 0; i < accountsData.length; i++) {
          const account = accountsData[i];
          if (!account) continue;

          const label = account.email || `Account ${i + 1}`;
          process.stdout.write(`- [${i + 1}/${accountsData.length}] ${label} ... `);

          const verification = await verifyAccountAccess(account, client, providerId);
          if (verification.status === "ok") {
            const { changed } = clearStoredAccountVerificationRequired(account, true);
            if (changed) storageUpdated = true;
            okCount += 1;
            console.log("ok");
            continue;
          }

          if (verification.status === "blocked") {
            const changed = markStoredAccountVerificationRequired(
              account,
              verification.message,
              verification.verifyUrl,
            );
            if (changed) storageUpdated = true;
            blockedCount += 1;
            console.log("needs verification");
            blockedResults.push({
              label,
              message: verification.message,
              verifyUrl: verification.verifyUrl ?? account.verificationUrl,
            });
            continue;
          }

          errorCount += 1;
          console.log(`error (${verification.message})`);
        }

        if (storageUpdated && existingStorage) {
          await saveAccounts({ ...existingStorage, accounts: accountsData });
        }

        console.log(`\nVerification summary: ${okCount} ready, ${blockedCount} need verification, ${errorCount} errors.`);
        if (blockedResults.length > 0) {
          console.log("\nAccounts needing verification:");
          for (const result of blockedResults) {
            console.log(`\n- ${result.label}\n  ${result.message}\n  URL: ${result.verifyUrl || "not provided by API response"}`);
          }
          console.log("");
        } else console.log("");
        continue;
      }

      let verifyAccountIndex = menuResult.verifyAccountIndex;
      if (verifyAccountIndex === undefined) {
        verifyAccountIndex = await promptAccountIndexForVerification(existingAccounts);
      }

      if (verifyAccountIndex === undefined) {
        console.log("\nVerification cancelled.\n");
        continue;
      }

      const account = accountsData[verifyAccountIndex];
      if (!account) {
        console.log(`\nAccount ${verifyAccountIndex + 1} not found.\n`);
        continue;
      }

      const label = account.email || `Account ${verifyAccountIndex + 1}`;
      console.log(`\nChecking verification status for ${label}...\n`);
      const verification = await verifyAccountAccess(account, client, providerId);

      if (verification.status === "ok") {
        const { changed, wasVerificationRequired } = clearStoredAccountVerificationRequired(account, true);
        if (changed && existingStorage) {
          await saveAccounts({ ...existingStorage, accounts: accountsData });
        }
        console.log(`✓ ${label} is ready for requests${wasVerificationRequired ? ' and has been re-enabled' : ''}.\n`);
        continue;
      }

      if (verification.status === "blocked") {
        const changed = markStoredAccountVerificationRequired(
          account,
          verification.message,
          verification.verifyUrl,
        );
        if (changed && existingStorage) {
          await saveAccounts({ ...existingStorage, accounts: accountsData });
        }
        console.log(`\n⚠️  Verification Required for ${label}`);
        console.log(`\n${verification.message}`);
        console.log(`\nPlease visit this URL to verify your account:\n  ${verification.verifyUrl ?? account.verificationUrl}\n`);
        continue;
      }

      console.log(`\n❌ Error verifying account: ${verification.message}\n`);
    }
  }
}

main().catch((err) => {
  console.error("\x1b[31mFatal error:\x1b[0m", err);
  process.exit(1);
});



