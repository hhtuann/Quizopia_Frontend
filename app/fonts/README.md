# Vendored font files

Downloaded once (2026-11-08) from Google Fonts via the CSS2 API
(`fonts.googleapis.com/css2?family=…:wght@…&display=swap`, latin subset,
`Chrome/120` UA → static woff2 instances) and committed so builds never
fetch `fonts.googleapis.com` / `fonts.gstatic.com` at build time — that
external dependency made CI and Vercel deployments fail
non-deterministically (Next 16 Turbopack `next/font/google` download).

| File | Family | Weight | License | SHA-256 |
|---|---|---|---|---|
| `calistoga-latin-400-normal.woff2` | Calistoga | 400 | SIL OFL 1.1 | `5b0f44a30de7995469b97343d22c34cafadbd5a1dc0d9cc7b9c399be5ac92057` |
| `inter-latin-400-normal.woff2` | Inter | 400 | SIL OFL 1.1 | `8909904ab6c872eb994093482a88a28eca2cd95912d7b6fecd72103b0dc07edc` |
| `inter-latin-500-normal.woff2` | Inter | 500 | SIL OFL 1.1 | `f3779f1efccc4bdcdf9c0a02ab95bf6bd092ed09c48c08cedc725889edd1d19f` |
| `inter-latin-600-normal.woff2` | Inter | 600 | SIL OFL 1.1 | `f9a06e79cd3a2a20951c0f0e28f66dd0e6d3fda73911d640a2125c8fcb78f21a` |
| `inter-latin-700-normal.woff2` | Inter | 700 | SIL OFL 1.1 | `6f56409fd3d64bb85f7d070bce20749db2d66b6d63cec586cc22d1c761be2491` |
| `jetbrains-mono-latin-400-normal.woff2` | JetBrains Mono | 400 | SIL OFL 1.1 | `14425ba9c695763c1547f48a206b7aa60350a33ae23de09f0407877f3fcd89eb` |
| `jetbrains-mono-latin-500-normal.woff2` | JetBrains Mono | 500 | SIL OFL 1.1 | `cb182feeed4d798ff6961d3c79f7026279448fca0676438aaecb21f3fc39553a` |

License text: `OFL.txt` (SIL Open Font License 1.1, Calistoga project copy — identical
text applies to all three families). |

All three families are SIL Open Font License 1.1 (redistribution and
modification permitted); licenses: fonts.google.com/specimen/Calistoga,
/Inter, /JetBrains+Mono.

These are the exact faces `next/font/google` previously emitted for the
`app/layout.tsx` configuration (latin subsets, weights 400; 400/500/600/700;
400/500) — loaded via `next/font/local` with identical CSS variables
(`--font-calistoga`, `--font-inter`, `--font-jetbrains-mono`) and
`display: swap`, so rendering is unchanged.
