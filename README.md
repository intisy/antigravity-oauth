# antigravity-auth

Google Antigravity OAuth plugin for OpenCode and Claude Code. Intercepts `fetch()` calls to `generativelanguage.googleapis.com`, transforms them to Antigravity format, and handles auth, quota, recovery, and multi-account rotation.

## Architecture

```mermaid
flowchart TD
    CC[Claude Code] -->|API Request| PROXY[Proxy Server]
    OC[OpenCode] -->|API Request| INTERCEPTOR[Fetch Interceptor]
    PROXY -->|transform| CORE[Shared Core Logic]
    INTERCEPTOR -->|transform| CORE
    CORE -->|OAuth/Refresh| GAPI[Google Auth API]
    CORE -->|Route via Account| GEMINI[Google Gemini API]
    CORE <-->|Account Sync| ACCOUNTS[Account Storage]
```

## Structure

- `src/` - Shared core logic (API transforms, OAuth flows, account management)
- `claude/` - Claude Code specific wrappers (standalone proxy server)
- `opencode/` - OpenCode specific wrappers (fetch interception plugin)
- `dist/` - Single compiled output supporting both environments

## License

MIT
