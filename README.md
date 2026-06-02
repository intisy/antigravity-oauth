# plugin-antigravity-auth

Google Antigravity OAuth plugin for OpenCode and Claude Code. Intercepts `fetch()` calls to `generativelanguage.googleapis.com`, transforms them to Antigravity format, and handles auth, quota, recovery, and multi-account rotation.

## Under-the-Hood Architecture

```mermaid
flowchart TD
    %% Environments
    subgraph Claude_Code [Claude Code Environment]
        CC_CLI[Claude CLI]
        CC_PROXY[Standalone Local Proxy Server]
        CC_CLI -->|API Calls (localhost:port)| CC_PROXY
    end

    subgraph OpenCode_Env [OpenCode Environment]
        OC_CLI[OpenCode CLI]
        OC_INTERCEPTOR[Fetch Interceptor Hook]
        OC_CLI -->|Native fetch()| OC_INTERCEPTOR
    end

    %% Shared Core
    subgraph Shared_Core [Plugin Shared Core (src/)]
        TRANSFORMER[Request/Response Transformer]
        AUTH_ROUTER[Auth Header Injector]
        ACCOUNT_MGR[Multi-Account Manager]
        QUOTA_TRACKER[Quota & 429 Tracker]
        OAUTH_FLOW[Localhost OAuth Desktop Flow]
        
        CC_PROXY -->|Raw Request| TRANSFORMER
        OC_INTERCEPTOR -->|Raw Request| TRANSFORMER
        
        TRANSFORMER --> AUTH_ROUTER
        AUTH_ROUTER --> ACCOUNT_MGR
        
        ACCOUNT_MGR <-->|Read/Write Accounts| FILE_STORAGE[(Account Storage .json)]
        ACCOUNT_MGR -->|Select Account| QUOTA_TRACKER
        
        QUOTA_TRACKER -->|Needs Refresh| OAUTH_FLOW
    end

    %% External
    subgraph Google_Services [Google External APIs]
        G_OAUTH[Google OAuth 2.0 API]
        GEMINI_API[Gemini / Antigravity API]
        
        OAUTH_FLOW <-->|Authorize / Tokens| G_OAUTH
        QUOTA_TRACKER -->|Decorated Fetch| GEMINI_API
    end
```

## Structure

- `src/` - Shared core logic (API transforms, OAuth flows, account management)
- `claude/` - Claude Code specific wrappers (standalone proxy server)
- `opencode/` - OpenCode specific wrappers (fetch interception plugin)
- `dist/` - Single compiled output supporting both environments

## License

MIT
