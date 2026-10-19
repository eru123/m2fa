# 2FA Manager (m2fa)

A desktop TOTP authenticator built with Tauri 2, React 19, Vite 8, TypeScript and Rust.

- Import accounts from a text file with one `otpauth://` URI per line (or paste them directly)
- Live codes with **previous**, **current** and **next** windows side by side
- Card mode and list mode, search, and click-to-copy with animated feedback
- Countdown ring per account, honouring each account's own period and algorithm

## Security model

Secrets never touch disk in plaintext:

- Each secret is encrypted with **AES-256-GCM** (random 96-bit nonce per write) before it is written to SQLite, and the ciphertext is cryptographically bound to its account id via AES-GCM associated data — blobs cannot be swapped between rows.
- The encryption key is a random 256-bit master key stored in the **OS credential store** (Windows Credential Manager on Windows, Keychain on macOS, Secret Service on Linux) and is only fetched into memory at runtime — this is the vault.
- SQLite (`m2fa.db` in the app data directory) holds only ciphertext blobs plus non-secret metadata (label, issuer, algorithm, digits, period) and an **HMAC-SHA256 fingerprint keyed with the master key** used for duplicate detection — someone holding the database cannot verify secret guesses offline.
- Import error messages never echo the offending line or parameter values, so secrets can't leak into logs or screenshots through parse failures.
- The webview holds only generated codes and metadata; raw secrets never cross the IPC boundary.
- Content Security Policy is pinned to app-local assets (`default-src 'self'`, with the dev-server websocket allowed for HMR).

## Import format

One URI per line, `#` lines are skipped, duplicates (same secret + label + issuer) are reported rather than re-imported:

```
otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example
otpauth://totp/Heroku?secret=JBSWY3DPEHPK3PXR
otpauth://totp/Acme:backup?secret=JBSWY3DPEHPK3PXU&digits=8&period=60&algorithm=SHA256&issuer=Acme
```

The parser tolerates percent-encoded and raw spaces/colons in labels and a missing `issuer` parameter. See `fixtures/sample-import.txt` for a safe dummy file to test with.

## Development

```bash
pnpm install
pnpm tauri dev      # run the app
pnpm tauri build    # produce installers
cargo test          # RFC 4226/6238 vectors, vault roundtrip, parser cases (run in src-tauri)
```

Requirements: Node 20+, pnpm, Rust (MSVC toolchain on Windows), and the platform webview (WebView2 on Windows).

## Notes

- HOTP (counter-based) URIs are rejected on import with a per-line error; only TOTP is supported.
- `keyring` uses the `windows-native` backend on Windows; macOS/Linux builds need the matching platform feature in `src-tauri/Cargo.toml`.
