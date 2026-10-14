# Meaning Check

An open-source browser extension to understand public replies: meaning first, then tone and original-text evidence. MIT licensed; bring your own model API. [中文](README.md).

## Version 0.3.0

New in 0.3: inline cards under each reply, multiple independent tasks, a two-task queue, loading timers, collapse and per-card cancellation, and settings shortcuts beside replies. Implemented: icons, persistent reply buttons, toolbar popup, onboarding, Chinese / English interface, independent localized analysis, nine official providers and custom APIs, site / path management, X / Reddit threads and selected text on custom sites. The existing DeepSeek key migrates locally. Saved and successfully tested connections are separate states.

Automated checks load the actual extension in an isolated browser with mocked websites and APIs. They do not prove live provider quality. See documentation/tests.md for results. Dia reload to 0.3.0, the settings entry, and live X inline loading / missing-context fallback were checked. Live multi-card use and provider results still need acceptance. No real inference was requested in this round; agent-recorded calls: 0.

## Load and use

Open `chrome://extensions` in Dia / Chrome. For an existing install, reload Meaning Check and confirm 0.3.0. For a new developer install, enable Developer mode, choose Load unpacked and select `.output/chrome-mv3`. Refresh the web page after reloading. Pin Meaning Check from the browser's Extensions menu if supported.

Click Extension settings beside a reply, or its toolbar icon → Extension settings → Model connections. The browser Details page manages the extension; Extension options there opens the same settings page. Add a provider, model and your API key, then save. Edit → Test connection makes one model request and may incur API fees. Saving, hovering, selecting a model and the clearly labeled free static example do not call inference. Installation / first upgrade opens the guide once; it stays accessible from Settings and the popup.

In Languages, set interface and analysis languages independently. Automatic analysis uses the full browser language; common languages and custom locale codes are available. Quotes stay in their original language. Existing results are not automatically recalculated.

Refresh X / Reddit and click Check meaning under a public reply. Missing context waits for your choice. Custom sites use selected text followed by optional background confirmation and Analyze. Several cards can stay open and scroll with the page. Up to two tasks run at once; others queue. Collapsing keeps a task running; closing cancels only that card. Navigating or pausing cancels affected tasks and cleans up owned temporary tabs.

Websites lets you add, edit, disable and delete HTTPS origins and path globs. Any matching path enables the site; * matches any characters. Default Reddit entries cover both www.reddit.com and reddit.com. New origins need browser permission. API endpoints accept HTTPS or local HTTP on localhost / 127.0.0.1. Changing an endpoint requires a new key.

Text only: images / GIFs are not read. Invalid quotes or incomplete model output are rejected. No account, business server, analysis history, reply generation or sending. Keys stay in protected local extension storage and are not accessible to websites.

## Development

Node 24 and pnpm 10. `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm zip`. The unpacked extension is `.output/chrome-mv3`; the install archive is `.output/meaning-check-0.3.0-chrome.zip`. Root LICENSE is copied automatically. Edit public/icon.svg and use `pnpm icons` to regenerate PNGs.

Checks: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, `pnpm check:package`. Install the test browser with `pnpm exec playwright install chromium` or set `MEANING_CHECK_CHROMIUM` to an official test executable. Tests use a disposable isolated browser profile.

Provider IDs, conditions and official sources: documentation/models.md. Product, design, architecture and verification are documented in documentation/ and DESIGN.md. No remote repository or store release has been created.
