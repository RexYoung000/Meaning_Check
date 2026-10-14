# Meaning Check

An open-source browser extension for understanding public replies: meaning first, then tone and evidence. MIT licensed; bring your own model API key. No account, analysis history or reply sending.

## Status

The original X / DeepSeek POC is implemented. The 2026-10-14 upgrade is documented before implementation: nine providers, bilingual interface, localized analysis, Reddit, site management, icons and onboarding. See documentation/tests.md for actual verification, separate from live model quality.

## Load and use

Use Node 24 and pnpm 10. Run `pnpm install` and `pnpm build`. In Dia / Chrome open `chrome://extensions`, enable Developer mode, choose Load unpacked and select `.output/chrome-mv3`. After rebuilding, reload the extension and refresh your web page. Use the browser Extensions menu to pin Meaning Check if supported.

Open the extension settings, add your own API connection, save, then click Test connection if desired (may incur API charges). Do not share keys in chat. Choose interface and analysis languages independently. Public X / Reddit replies have a Check meaning button; custom sites use selected text. See the built-in guide for a free static example.

Checks: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, `pnpm check:package`. Browser tests load the actual extension with mocked websites and APIs; they do not prove live model quality. Final publishing is the owner's decision.
