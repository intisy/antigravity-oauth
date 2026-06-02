import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadProxyConfig, type ProxyProviderConfig } from '../core/src/plugin/proxy-config';

export interface ProxyInfo {
  url: string;
  provider: string;
  weight: number;
  latency?: number;
  failures: number;
  lastTested?: number;
}

const HOT_POOL_FILE = path.join(os.homedir(), '.claude', 'cache', 'proxy-hot-pool.json');
const TARGET_POOL_SIZE = 10;
const TEST_URL = 'https://google.com';

export function loadHotPool(): ProxyInfo[] {
  try {
    if (fs.existsSync(HOT_POOL_FILE)) {
      return JSON.parse(fs.readFileSync(HOT_POOL_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load hot pool', e);
  }
  return [];
}

export function saveHotPool(pool: ProxyInfo[]) {
  const dir = path.dirname(HOT_POOL_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(HOT_POOL_FILE, JSON.stringify(pool, null, 2));
}

async function checkHealth(proxyUrl: string): Promise<number | null> {
  const start = Date.now();
  try {
    const res = await fetch(TEST_URL, {
      method: 'HEAD',
      // @ts-ignore - bun specific extension
      proxy: proxyUrl,
      signal: AbortSignal.timeout(5000)
    });
    
    if (res.ok || res.status < 400) {
      return Date.now() - start;
    }
  } catch (e) {

  }
  return null;
}

async function fetchProxyScrape(config: ProxyProviderConfig): Promise<ProxyInfo[]> {
  if (!config.enabled) return [];
  try {
     const res = await fetch('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=all&anonymity=all');
     const text = await res.text();
     return text.split('\n').map(p => p.trim()).filter(p => p).map(p => ({
       url: `http://${p}`, provider: 'proxyscrape', weight: config.weight || 1, failures: 0
     }));
  } catch (e) { return []; }
}

async function fetchWebshare(config: ProxyProviderConfig): Promise<ProxyInfo[]> { return []; }
async function fetchBrightData(config: ProxyProviderConfig): Promise<ProxyInfo[]> { return []; }
async function fetchOxylabs(config: ProxyProviderConfig): Promise<ProxyInfo[]> { return []; }
async function fetchProxifly(config: ProxyProviderConfig): Promise<ProxyInfo[]> { return []; }
async function fetchGeonix(config: ProxyProviderConfig): Promise<ProxyInfo[]> { return []; }
async function fetchLitport(config: ProxyProviderConfig): Promise<ProxyInfo[]> { return []; }
async function fetchIPLocate(config: ProxyProviderConfig): Promise<ProxyInfo[]> { return []; }

export async function runDaemon() {
  console.log('Starting Antigravity Proxy Manager Daemon...');
  

  setInterval(async () => {
    const config = loadProxyConfig();
    if (config.strategy !== 'automatic') return;

    let pool = loadHotPool();
    
    // 1. Prune dead proxies (failures > 3)
    pool = pool.filter(p => p.failures < 3);

    // 2. Health check existing
    for (const proxy of pool) {
      const latency = await checkHealth(proxy.url);
      proxy.lastTested = Date.now();
      if (latency === null) {
        proxy.failures++;
      } else {
        proxy.latency = latency;
        proxy.failures = 0; // reset
      }
    }
    pool = pool.filter(p => p.failures < 3);
    
    // 3. Replenish if needed
    if (pool.length < TARGET_POOL_SIZE) {
       let newProxies: ProxyInfo[] = [];
       
       if (config.providers.webshare?.enabled) newProxies.push(...await fetchWebshare(config.providers.webshare));
       if (config.providers.proxyscrape?.enabled) newProxies.push(...await fetchProxyScrape(config.providers.proxyscrape));
       if (config.providers.brightdata?.enabled) newProxies.push(...await fetchBrightData(config.providers.brightdata));
       if (config.providers.oxylabs?.enabled) newProxies.push(...await fetchOxylabs(config.providers.oxylabs));
       if (config.providers.proxifly?.enabled) newProxies.push(...await fetchProxifly(config.providers.proxifly));
       if (config.providers.geonix?.enabled) newProxies.push(...await fetchGeonix(config.providers.geonix));
       if (config.providers.litport?.enabled) newProxies.push(...await fetchLitport(config.providers.litport));
       if (config.providers.iplocate?.enabled) newProxies.push(...await fetchIPLocate(config.providers.iplocate));
       

       newProxies = newProxies.sort(() => Math.random() - 0.5);
       

       for (const np of newProxies) {
         if (pool.length >= TARGET_POOL_SIZE) break;
         if (!pool.find(p => p.url === np.url)) {
            const latency = await checkHealth(np.url);
            if (latency !== null) {
              np.latency = latency;
              np.lastTested = Date.now();
              pool.push(np);
            }
         }
       }
    }

    // 4. Sort pool by latency relative to provider weight (lower is better)
    pool.sort((a, b) => {
       const scoreA = (a.latency || 9999) / a.weight;
       const scoreB = (b.latency || 9999) / b.weight;
       return scoreA - scoreB;
    });

    saveHotPool(pool);
  }, 60000); 
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('proxy-manager.ts')) {
  runDaemon();
}
