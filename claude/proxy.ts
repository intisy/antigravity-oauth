import http from 'http';
import https from 'https';
import fs from 'fs';
import { fetchAvailableModels } from '../core/src/plugin/quota';
import { loadProxyConfig } from '../core/src/plugin/proxy-config';
import { loadHotPool, saveHotPool } from './proxy-manager';
import { resolveQuotaGroup } from '../core/src/plugin/accounts';
import { HttpsProxyAgent } from 'https-proxy-agent';

let lastNotifiedIndex = -1;
const pendingAlerts: string[] = [];
const PORT = 34567;
const HOST = '127.0.0.1';

function liveModelToQuotaModel(model: string): string {
  const normalized = model.replace(/-(minimal|low|medium|high)$/, '');
  if (!normalized.startsWith('antigravity-')) {
    return `antigravity-${normalized}`;
  }
  return normalized;
}
import { AccountManager } from '../core/src/plugin/accounts';

let accountManager;
let currentAccessToken = null;
let currentAccountEmail = null;
let liveModelsCache: string[] = [];
let liveModelsLastFetched = 0;

const thoughtSignatureMap = new Map<string, { sig: string; ts: number }>();
const THOUGHT_SIG_TTL = 10 * 60 * 1000;

function storeThoughtSignature(toolId: string, signature: string) {
  thoughtSignatureMap.set(toolId, { sig: signature, ts: Date.now() });
  const cutoff = Date.now() - THOUGHT_SIG_TTL;
  for (const [k, v] of thoughtSignatureMap) {
    if (v.ts < cutoff) thoughtSignatureMap.delete(k);
  }
}

function recallThoughtSignature(toolId: string): string | null {
  const entry = thoughtSignatureMap.get(toolId);
  return entry ? entry.sig : null;
}

async function getLiveModels(token: string, projectId: string) {
  if (Date.now() - liveModelsLastFetched < 3600 * 1000 && liveModelsCache.length > 0) {
    return liveModelsCache;
  }
  try {
    const res = await fetchAvailableModels(token, projectId);
    if (res.models) {
      liveModelsCache = Object.keys(res.models);
      liveModelsLastFetched = Date.now();
    }
  } catch (e) {
    console.error("Failed to fetch live models", e.message);
  }
  return liveModelsCache;
}
let tokenExpiresAt = 0;

function logDebug(msg) {
  try {
    fs.appendFileSync('C:\\\\Users\\\\finn\\\\.claude\\\\proxy-debug.log', `[${new Date().toISOString()}] ${msg}\\n`);
  } catch (e) {}
}

async function getAccessToken(requestedModel: string | null = null) {
  if (!accountManager) {
    accountManager = await AccountManager.loadFromDisk();
    console.log("Loaded accounts from disk.");
    
    setInterval(async () => {
      try {
        await accountManager.reloadFromDisk();
      } catch (e) {
        logDebug(`Failed to reload from disk: ${e.message}`);
      }
    }, 10000);
  }

    if (currentAccessToken && Date.now() < tokenExpiresAt) {
      return { token: currentAccessToken, email: currentAccountEmail, account: accountManager.accounts.find(a => a.email === currentAccountEmail), isFallback: false };
    }

    const quotaModel = requestedModel ? liveModelToQuotaModel(requestedModel) : null;
    const isGeminiRequested = requestedModel && requestedModel.includes('gemini');
    
    let account = null;
    let isFallback = false;
    
    if (isGeminiRequested) {
      account = await accountManager.getCurrentOrNextForFamily('gemini', quotaModel, 'sequential');
      isFallback = true; // Always true for gemini models so we mark quota correctly
    } else {
      account = await accountManager.getCurrentOrNextForFamily('claude', quotaModel, 'sequential');
      if (!account) {
        account = await accountManager.getCurrentOrNextForFamily('gemini', quotaModel, 'sequential');
        isFallback = true;
      }
    }
    
    if (!account) {
      throw new Error('All accounts (Claude and Gemini) are exhausted or rate limited!');
    }

    if (account && account.index !== lastNotifiedIndex) {
      if (lastNotifiedIndex !== -1) {
        pendingAlerts.push('?? Rotated to ' + (isFallback ? 'Gemini fallback: ' : '') + '`' + account.email + '`');
      }
      lastNotifiedIndex = account.index;
    }

    return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      client_id: 'YOUR_GOOGLE_CLIENT_ID',
      client_secret: 'YOUR_GOOGLE_CLIENT_SECRET',
      refresh_token: account.parts.refreshToken,
      grant_type: 'refresh_token',
    }).toString();

    const options = {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(body);
            currentAccessToken = parsed.access_token;
            currentAccountEmail = account.email || 'Unknown';
            tokenExpiresAt = Date.now() + (parsed.expires_in * 1000) - 60000;
            resolve({ token: currentAccessToken, email: currentAccountEmail, account: account });
          } catch (e) {
            reject(e);
          }
          } else {
            accountManager.markRateLimitedWithReason(account, isFallback ? "gemini" : "claude", "antigravity", null, "SERVER_ERROR");
     pendingAlerts.push('?? Token refresh failed: `' + account.email + '`'); reject(new Error(`Failed to refresh token: ${res.statusCode} ${body}`));
          }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function translateAnthropicToGemini(anthropic) {
  const gemini: any = { contents: [] };

  if (anthropic.system) {
    gemini.systemInstruction = {
      parts: [{ text: typeof anthropic.system === 'string' ? anthropic.system : JSON.stringify(anthropic.system) }]
    };
  }

  const toolSchemas: Record<string, Set<string>> = {};
  const geminiToAnthropicName = new Map<string, string>();
  
  if (anthropic.tools) {
    for (const t of anthropic.tools) {
      const props = t.input_schema?.properties;
      const normalizedName = t.name.replace(/^[^:]+:/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      geminiToAnthropicName.set(normalizedName, t.name);
      if (props) toolSchemas[normalizedName] = new Set(Object.keys(props));
    }
  }

  if (anthropic.tools) {
    const sanitizeSchema = (schema) => {
      if (!schema || typeof schema !== 'object') return schema;
      if (Array.isArray(schema)) return schema.map(sanitizeSchema);
      
      const cleaned = {};
      const allowedKeys = ['type', 'format', 'description', 'nullable', 'enum', 'properties', 'required', 'items'];
      
      for (const key of Object.keys(schema)) {
        if (allowedKeys.includes(key)) {
          if (key === 'properties' && typeof schema[key] === 'object' && !Array.isArray(schema[key])) {
            cleaned.properties = {};
            for (const propName of Object.keys(schema.properties)) {
              cleaned.properties[propName] = sanitizeSchema(schema.properties[propName]);
            }
          } else if (typeof schema[key] === 'object') {
            cleaned[key] = sanitizeSchema(schema[key]);
          } else {
            cleaned[key] = schema[key];
          }
        }
      }
      if (cleaned.required && (!cleaned.properties || Object.keys(cleaned.properties).length === 0)) {
        delete cleaned.required;
      }
      return cleaned;
    };

    gemini.tools = [{
      functionDeclarations: anthropic.tools.map(t => {
        const geminiName = t.name.replace(/^[^:]+:/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
        return {
          name: geminiName,
          description: t.description || '',
          parameters: sanitizeSchema(t.input_schema)
        };
      })
    }];
    gemini.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
  }

  const toolIdToGeminiName = new Map<string, string>();

  for (const msg of anthropic.messages || []) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts: any[] = [];
    
    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const c of msg.content) {
        if (c.type === 'text') parts.push({ text: c.text });
        if (c.type === 'tool_use') {
          const geminiName = c.name.replace(/^[^:]+:/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
          toolIdToGeminiName.set(c.id, geminiName);
          const fc: any = { name: geminiName, args: c.input };
          const sig = recallThoughtSignature(c.id);
          if (sig) fc.thoughtSignature = sig; // Gemini uses camelCase
          parts.push({ functionCall: fc });
        }
        if (c.type === 'tool_result') {
          const contentText = typeof c.content === 'string' ? c.content : JSON.stringify(c.content);
          const mappedName = toolIdToGeminiName.get(c.tool_use_id) || c.tool_use_id;
          parts.push({ functionResponse: { name: mappedName, response: { content: contentText } } });
        }
      }
    }
    
    gemini.contents.push({ role, parts });
  }
  
  return { gemini, toolSchemas, geminiToAnthropicName };
}

const server = http.createServer((req, res) => {
  logDebug(`${req.method} ${req.url}`);

          if (req.method === 'POST' && (req.url.startsWith('/v1/messages') || req.url.startsWith('/messages'))) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const MAX_ATTEMPTS = accountManager && accountManager.accounts ? Math.max(4, accountManager.accounts.length + 1) : 10;

      async function attemptRequest(attempt: number): Promise<void> {
        try {
          const anthropicPayload = JSON.parse(body);
          let model = anthropicPayload.model || 'sonnet-4.6';

            try {
              const { token, email, account, isFallback } = await getAccessToken(model);


          let actualProjectId = 'galvanized-spot-7zsgc'; // Fallback
          try {
            const loadData = JSON.stringify({
              metadata: {
                ideType: 'IDE_UNSPECIFIED',
                platform: 'PLATFORM_UNSPECIFIED',
              }
            });
            const loadOptions = {
              hostname: 'daily-cloudcode-pa.sandbox.googleapis.com',
              path: '/v1internal:loadCodeAssist',
              method: 'POST',
              headers: {
                'Authorization': "Bearer " + token,
                'Content-Type': 'application/json',
                'User-Agent': 'google-api-nodejs-client/9.15.1',
                'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
                'Client-Metadata': 'ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI'
              }
            };

            const projectIdResult = await new Promise((resolve) => {
              const r = https.request(loadOptions, (rRes) => {
                let b = '';
                rRes.on('data', d => b += d);
                rRes.on('end', () => {
                  logDebug(`loadCodeAssist Status: ${rRes.statusCode}, Body: ${b}`);
                  try {
                    const p = JSON.parse(b);
                    if (p.cloudaicompanionProject) {
                      resolve(typeof p.cloudaicompanionProject === 'string' ? p.cloudaicompanionProject : p.cloudaicompanionProject.id);
                    } else {
                      resolve(null);
                    }
                  } catch (e) {
                    resolve(null);
                  }
                });
              });
              r.on('error', () => resolve(null));
              r.write(loadData);
              r.end();
            });
            
            if (projectIdResult) {
              actualProjectId = projectIdResult;
            }
            } catch (e) {
              logDebug(`loadCodeAssist error: ${e.message}`);
            }


              let availableModels = await getLiveModels(token, actualProjectId);
              if (account && account.rateLimitResetTimes) {
                const nowMs = Date.now();
                availableModels = availableModels.filter(m => {
                  const quotaModel = liveModelToQuotaModel(m);
                  const base = m.includes('gemini') ? 'gemini-antigravity' : 'claude';
                  const modelKey = `${base}:${quotaModel}`;
                  

                  if (account.rateLimitResetTimes[modelKey] > nowMs) return false;
                  if (account.rateLimitResetTimes[base] > nowMs) return false;
                  if (account.rateLimitResetTimes['claude'] > nowMs) return false;
                  
                  return true;
                });
              }
              let requestedModel = anthropicPayload.model || 'sonnet';
            
              if (isFallback) {
                if (lastNotifiedIndex !== -1 && !pendingAlerts.some(a => a.includes('Auto-Fallback'))) {
                   pendingAlerts.push('?? Auto-Fallback: All Claude accounts rate-limited. Switched to Gemini.');
                }
                model = availableModels.find(m => m.includes('gemini-3.1-pro')) || 
                        availableModels.find(m => m.includes('gemini-3')) || 
                        availableModels.find(m => m.includes('gemini-1.5-pro')) || 
                        availableModels.find(m => m.includes('gemini')) || 
                        'antigravity-gemini-3.1-pro';
              } else {
                if (requestedModel.includes('opus')) {
                  model = availableModels.find(m => m.includes('opus')) || 'claude-opus-4-6-thinking';
                } else if (requestedModel.includes('haiku')) {
                  model = availableModels.find(m => m.includes('haiku')) || 
                          availableModels.find(m => m.includes('gemini-3.1-pro')) || 
                          availableModels.find(m => m.includes('gemini-3')) || 
                          availableModels.find(m => m.includes('gemini-1.5-pro')) || 
                          'claude-sonnet-4-6';
                } else {

                  model = availableModels.find(m => m.includes('sonnet')) || 'claude-sonnet-4-6-thinking';
                }
              }

            logDebug(`Using project: ${actualProjectId}, model: ${model}`);
            pendingAlerts.push(`?? Using model: \`${model}\` (account: \`${email}\`)`);

          const { gemini: geminiPayload, toolSchemas, geminiToAnthropicName } = translateAnthropicToGemini(anthropicPayload);

          const wrappedBody = {
            project: actualProjectId,
            model: model,
            request: geminiPayload,
            requestType: 'agent',
            userAgent: 'antigravity',
            requestId: 'agent-' + Date.now()
          };

          const isGemini = model.includes('gemini');
          const targetHostname = isGemini ? 'cloudcode-pa.googleapis.com' : 'daily-cloudcode-pa.sandbox.googleapis.com';

          const options: any = {
            hostname: targetHostname,
            path: `/v1internal:streamGenerateContent?alt=sse`,
            method: 'POST',
            headers: {
              'Authorization': "Bearer " + token,
              'Content-Type': 'application/json',
              'User-Agent': 'antigravity/1.0.0 win32/x64',
            }
          };

          let proxyUrl: string | null = null;
          try {
            const proxyConfig = loadProxyConfig();
            if (proxyConfig.strategy === 'automatic') {
              const hotPool = loadHotPool();
              const proxy = hotPool.find(p => p.failures < 3) || hotPool[0];
              if (proxy) {
                proxyUrl = proxy.url;
                options.agent = new HttpsProxyAgent(proxyUrl);
                logDebug(`[Proxy] Using automatic hot pool proxy: ${proxyUrl}`);
              }
            }
          } catch (e: any) {
            logDebug(`[Proxy] Error loading hot pool proxy: ${e.message}`);
          }

          const proxyReq = https.request(options, (proxyRes) => {
            logDebug(`Google API Status: ${proxyRes.statusCode}`);
            
            if (proxyRes.statusCode !== 200) {
              let errorBody = '';
              proxyRes.on('data', chunk => errorBody += chunk.toString());
              proxyRes.on('end', () => {
                logDebug(`Google API Error Body: ${errorBody}`);

                  let isRateLimited = proxyRes.statusCode === 429 || errorBody.includes('RESOURCE_EXHAUSTED');
                  let isCapacityExhausted = proxyRes.statusCode === 503 || errorBody.includes('MODEL_CAPACITY_EXHAUSTED') || errorBody.includes('UNAVAILABLE');
                  if (!isRateLimited && !isCapacityExhausted) {
                    try {
                      const errJson = JSON.parse(errorBody);
                      if (errJson.error) {
                        if (errJson.error.code === 429) {
                          isRateLimited = true;
                        } else if (errJson.error.code === 503 || errJson.error.status === 'UNAVAILABLE') {
                          isCapacityExhausted = true;
                        }
                      }
                    } catch (e) { }
                  }

                   if (isRateLimited || isCapacityExhausted) {
                    let isProxyIpBan = false;
                    if (isRateLimited) {
                      try {
                        const proxyConfig = loadProxyConfig();
                        if (proxyConfig.strategy === 'automatic' && account && account.cachedQuota) {
                          const family = isFallback ? 'gemini' : 'claude';
                          const quotaGroup = resolveQuotaGroup(family, model);
                          const groupData = account.cachedQuota[quotaGroup];
                          if (groupData && typeof groupData.remainingFraction === 'number') {
                            const remainingFraction = groupData.remainingFraction;

                            if (remainingFraction > 0.6) {
                              isProxyIpBan = true;
                            }
                          }
                        }
                      } catch (e: any) {
                        logDebug(`Error evaluating quota heuristic: ${e.message}`);
                      }
                    }

                    if (isProxyIpBan) {
                      logDebug(`Suspected IP ban for model ${model} (remaining quota is > 60%). Discarding proxy and retrying request without changing account.`);
                      if (proxyUrl) {
                        try {
                          const pool = loadHotPool();
                          const filteredPool = pool.filter(p => p.url !== proxyUrl);
                          saveHotPool(filteredPool);
                          logDebug(`Discarded proxy ${proxyUrl} from hot pool.`);
                        } catch (e: any) {
                          logDebug(`Error discarding proxy: ${e.message}`);
                        }
                      }
                      if (attempt < MAX_ATTEMPTS) {
                        logDebug(`Retrying request (attempt ${attempt + 1}/${MAX_ATTEMPTS})...`);
                        return attemptRequest(attempt + 1);
                      }
                    }

                    const reason = isCapacityExhausted ? "MODEL_CAPACITY_EXHAUSTED" : "QUOTA_EXHAUSTED";

                    let cooldownMs = isCapacityExhausted ? 5 * 60 * 1000 : 30 * 60 * 1000; // 5min for capacity, 30min for quota
                    try {
                      const errJson = JSON.parse(errorBody);
                      const retryDetail = errJson.error?.details?.find((d: any) => d['@type']?.includes('RetryInfo'));
                      if (retryDetail?.retryDelay) {
                        const delaySec = parseInt(retryDetail.retryDelay.replace('s', ''), 10);
                        if (delaySec > 0) cooldownMs = delaySec * 1000;
                      }
                    } catch (e) { }

                    logDebug(`Account ${email} hit ${reason} on model ${model}, cooling down for ${Math.round(cooldownMs / 60000)} mins.`);
                    if (account) {
                      accountManager.markRateLimitedWithReason(account, isFallback ? "gemini" : "claude", "antigravity", liveModelToQuotaModel(model), reason as any, cooldownMs);
                      pendingAlerts.push('?? ' + reason + ' for model `' + model + '`: `' + account.email + '`');
                    }
                    currentAccessToken = null; // Force new account on next attempt

                    if (attempt < MAX_ATTEMPTS) {
                      logDebug(`Retrying with next account (attempt ${attempt + 1}/${MAX_ATTEMPTS})...`);
                      return attemptRequest(attempt + 1);
                    }

                  }


                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  type: "error",
                  error: {
                    type: "invalid_request_error",
                    message: `Google API Error: ${errorBody}`
                  }
                }));
              });
              return;
            }

            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'Access-Control-Allow-Origin': '*'
            });

            const msgId = 'msg_' + Date.now();
            const startEvent = `event: message_start\ndata: {"type": "message_start", "message": { "id": "${msgId}", "role": "assistant", "content": [], "model": "${model}", "stop_reason": null, "stop_sequence": null }}\n\n`;
            res.write(startEvent);

            let buffer = '';
            let textBlockStarted = false;
            let toolBlockStarted = false;
            let blockIndex = 0;
            let hadToolCall = false; // tracks if ANY tool was called in this response

            let pendingThoughtSignature: string | null = null;


            res.write(`event: content_block_start\ndata: {"type": "content_block_start", "index": ${blockIndex}, "content_block": {"type": "text", "text": ""}}\n\n`);
            textBlockStarted = true;
            
            let notification = `> ? **Antigravity Proxy**\n> ?? Account: \`${email}\``;
              if (pendingAlerts.length > 0) {
                notification += '\n>\n> **Alerts:**\n' + pendingAlerts.map(a => '> - ' + a).join('\n');
                pendingAlerts.length = 0; // Clear the queue
              }
            if (anthropicPayload.model !== model) {
              notification += `\n> ?? Mapped model \`${anthropicPayload.model}\` to \`${model}\``;
            }
            notification += `\n\n`;
            
            res.write(`event: content_block_delta\ndata: {"type": "content_block_delta", "index": ${blockIndex}, "delta": {"type": "text_delta", "text": ${JSON.stringify(notification)}}}\n\n`);
            
            proxyRes.on('data', chunk => {
              const chunkStr = chunk.toString();
              logDebug(`Raw Google chunk: ${chunkStr.substring(0, 500)}`);
              buffer += chunkStr;
              
              const lines = buffer.split('\n');
              buffer = lines.pop(); // keep incomplete line
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const dataStr = line.substring(6).trim();
                  if (dataStr === '[DONE]') continue;
                  if (!dataStr) continue;
                  
                  try {
                    const eventData = JSON.parse(dataStr);

                    const payload = eventData.response || eventData;
                    const candidates = payload.candidates || [];
                    if (candidates.length > 0) {
                      const candidate = candidates[0];
                      const parts = candidate.content?.parts || [];
                      
                      for (const part of parts) {

                        if (part.thoughtSignature) {
                          pendingThoughtSignature = part.thoughtSignature;
                        }

                        if (part.text) {
                          if (!textBlockStarted) {
                            res.write(`event: content_block_start\ndata: {"type": "content_block_start", "index": ${blockIndex}, "content_block": {"type": "text", "text": ""}}\n\n`);
                            textBlockStarted = true;
                          }
                          res.write(`event: content_block_delta\ndata: {"type": "content_block_delta", "index": ${blockIndex}, "delta": {"type": "text_delta", "text": ${JSON.stringify(part.text)}}}\n\n`);
                        }
                        
                        if (part.functionCall) {
                          if (!toolBlockStarted) {
                            if (textBlockStarted) {
                              res.write(`event: content_block_stop\ndata: {"type": "content_block_stop", "index": ${blockIndex}}\n\n`);
                              blockIndex++;
                              textBlockStarted = false;
                            }
                            const toolId = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

                            const sig = part.functionCall.thoughtSignature ||
                                        part.functionCall.thought_signature ||
                                        pendingThoughtSignature;
                            if (sig) {
                              storeThoughtSignature(toolId, sig);
                              pendingThoughtSignature = null; // consumed
                            }
                            const anthropicToolName = geminiToAnthropicName.get(part.functionCall.name) || part.functionCall.name;
                            res.write(`event: content_block_start\ndata: {"type": "content_block_start", "index": ${blockIndex}, "content_block": {"type": "tool_use", "id": "${toolId}", "name": "${anthropicToolName}", "input": {}}}\n\n`);
                            toolBlockStarted = true;
                            hadToolCall = true;
                          }
                          

                          // (e.g. Gemini adds "description" to Bash args, which Claude Code rejects)
                          let args = part.functionCall.args || {};
                          const allowedProps = toolSchemas[part.functionCall.name];
                          if (allowedProps && allowedProps.size > 0) {
                            args = Object.fromEntries(
                              Object.entries(args).filter(([k]) => allowedProps.has(k))
                            );
                          }
                          const argsJson = JSON.stringify(args);
                          res.write(`event: content_block_delta\ndata: {"type": "content_block_delta", "index": ${blockIndex}, "delta": {"type": "input_json_delta", "partial_json": ${JSON.stringify(argsJson)}}}\n\n`);
                        }
                      }
                      
                      if (candidate.finishReason) {
                        if (textBlockStarted || toolBlockStarted) {
                          res.write(`event: content_block_stop\ndata: {"type": "content_block_stop", "index": ${blockIndex}}\n\n`);
                        }

                        // Claude Code needs "tool_use" to continue the agentic loop.
                        const stopReason = hadToolCall ? 'tool_use' :
                                           (candidate.finishReason === 'STOP' ? 'end_turn' : 'tool_use');
                        res.write(`event: message_delta\ndata: {"type": "message_delta", "delta": {"stop_reason": "${stopReason}"}}\n\n`);
                        res.write(`event: message_stop\ndata: {"type": "message_stop"}\n\n`);
                        res.end();
                        return;
                      }
                    }
                  } catch (e) {

                  }
                }
              }
            });

            proxyRes.on('end', () => {
              if (!res.writableEnded) {
                res.write(`event: message_stop\ndata: {"type": "message_stop"}\n\n`);
                res.end();
              }
            });
            
            proxyRes.on('error', (err) => {
              logDebug(`Proxy response error: ${err.message}`);
              if (!res.writableEnded) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          });

          proxyReq.on('error', (err) => {
            logDebug(`Proxy request error: ${err.message}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          });

          proxyReq.write(JSON.stringify(wrappedBody));
          proxyReq.end();
          
        } catch (authError) {
          logDebug(`Auth Error: ${authError.message}`);
          if (authError.message.includes("exhausted or rate limited")) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              type: "error",
              error: {
                type: "invalid_request_error",
                message: "Antigravity Proxy: " + authError.message
              }
            }));
          } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: authError.message }));
          }
        }
      } catch (err) {
        logDebug(`Error: ${err.message}`);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message, stack: err.stack }));
      }
      } // end attemptRequest

      attemptRequest(1);
    });
          } else if (req.url.startsWith('/v1/models') || req.url.startsWith('/models')) {

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: "model",
      id: "claude-opus-4-7",
      display_name: "Antigravity Model"
    }));
  } else if (req.method === 'POST' && (req.url.startsWith('/v1/chat/completions') || req.url.startsWith('/v1/complete'))) {

    logDebug(`Redirecting OpenAI-compatible request ${req.url} -> /v1/messages`);
    req.url = '/v1/messages';

    server.emit('request', req, res);
  } else if (req.url === '/' || req.url === '/health' || req.url === '/v1') {

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: "ok", proxy: "antigravity", port: PORT }));
  } else {
    logDebug(`Unhandled route: ${req.method} ${req.url} — returning 404`);
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: "error",
      error: {
        type: "not_found",
        message: `Route not found: ${req.method} ${req.url}. Supported: POST /v1/messages, GET /v1/models`
      }
    }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Antigravity Auth Proxy running on http://${HOST}:${PORT}`);
});


// --- Auto-Shutdown Logic ---

import { exec } from 'child_process';
import os from 'os';


let activeRequests = 0;
const originalListeners = server.listeners('request');
server.removeAllListeners('request');
server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
  activeRequests++;
  res.on('close', () => { activeRequests = Math.max(0, activeRequests - 1); });

  for (const listener of originalListeners) {
    (listener as Function).call(server, req, res);
  }
});

if (os.platform() === 'win32') {
  let emptyChecks = 0;
  setInterval(() => {

    if (activeRequests > 0) {
      emptyChecks = 0;
      return;
    }

    exec('tasklist /FO CSV /NH', { windowsHide: true, timeout: 10000 }, (err, stdout) => {
      if (err) return; // If tasklist fails, skip this check (don't increment)
      const lower = stdout.toLowerCase();
      
      const hasActiveInstance =
        lower.includes('opencode.exe') ||
        lower.includes('claude.exe') ||
        lower.includes('claude code');

      if (!hasActiveInstance) {
        emptyChecks++;
        if (emptyChecks >= 6) { // 90 seconds of no activity (6 × 15s)
          console.log("No active Claude/OpenCode instances detected. Shutting down background proxy.");
          server.close(() => process.exit(0));

          setTimeout(() => process.exit(0), 3000).unref();
        }
      } else {
        emptyChecks = 0;
      }
    });
  }, 15000);
} else if (os.platform() === 'linux' || os.platform() === 'darwin') {
  let emptyChecks = 0;
  setInterval(() => {
    if (activeRequests > 0) {
      emptyChecks = 0;
      return;
    }
    exec('ps aux', { timeout: 5000 }, (err, stdout) => {
      if (err) return;
      const lower = stdout.toLowerCase();
      const hasActiveInstance =
        lower.includes('opencode') ||
        lower.includes('claude');

      if (!hasActiveInstance) {
        emptyChecks++;
        if (emptyChecks >= 6) {
          console.log("No active Claude/OpenCode instances detected. Shutting down background proxy.");
          server.close(() => process.exit(0));
          setTimeout(() => process.exit(0), 3000).unref();
        }
      } else {
        emptyChecks = 0;
      }
    });
  }, 15000);
}

