# Consent copy update — 2026-10-06

Signup, guest entry and the before-answer consent prompt use a single checkbox
sentence: “I have read and agree to the Terms of Use & Community Rules and
Privacy Policy.” Both policy names link to their corresponding pages. Removed the
separate “Read our…” links and the duplicate statement about display names and
answers. Consent enforcement and the accepted terms version are unchanged.

## Published

- Cloudflare Worker version: `ae3f03ab-7ca0-4d41-899e-970fd46b3d23`
- Expo Go production update, runtime `exposdk:57.0.0`, Android and iOS:
  `2428cd2c-93fc-4838-b829-52940c8e48b2`
- Installed app production update, runtime `1.0.0`, Android and iOS:
  `72bdb624-7b45-4d0f-9688-8b6c8a566b05`

Mobile lint and TypeScript checks, Worker syntax, Cloudflare dry run, and Git
whitespace checks passed. A fresh production page fetch confirmed all three web
consent controls include both links and omit the redundant copy. Functional
tests and device interaction checks were not run.

No Supabase migration was needed.
