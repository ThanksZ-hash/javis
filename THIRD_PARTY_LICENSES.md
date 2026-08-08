# Third-Party Licenses

## LibreDWG (GPLv3) — `bin/dwgread`

`bin/dwgread` bundled in this repository is a binary build of **LibreDWG**
(https://www.gnu.org/software/libredwg/), licensed under the
**GNU General Public License v3.0 (GPLv3)**.

It is used by `lib/dwg.ts` to convert `.dwg` files to `.dxf` in the
`/api/infer-metadata` serverless function (see `next.config.ts`,
`outputFileTracingIncludes`).

### Source code availability

- Upstream source: https://gitlab.gnu.org/gnu/libredwg
- The exact cross-compilation steps used to produce this repository's
  `bin/dwgread` (target: static-ish Linux binary built from an
  `amazonlinux:2` container for Vercel compatibility) are **not currently
  documented anywhere in this codebase** — no Dockerfile, build script, or
  log entry recording the process was found as of 2026-08-07.
  **빌드 방법 별도 문서화 필요.** Until that is added, anyone needing the
  corresponding source/build recipe should rebuild from the upstream
  LibreDWG source per GPLv3 §6, using the same LibreDWG version as the
  bundled binary (version not yet recorded — TODO: capture `dwgread
  --version` output here).

### GPLv3 compliance note

Because `bin/dwgread` is invoked as a separate process (`spawn`, not linked
into the Node.js process), this project treats it as "mere aggregation" /
independent program invocation rather than a combined work. This repo does
not currently ship or link LibreDWG source or object code beyond this one
binary. If this binary is distributed (e.g., as part of a Vercel deployment
artifact or otherwise made available to third parties), GPLv3 requires that
corresponding source (or a written offer for it) be made available. This
has **not yet been verified with counsel** — flagging as an open item.
