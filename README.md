# dsh-window-clone

English · [简体中文](README.zh-CN.md)

[![license](https://img.shields.io/github/license/JhengFire/dsh-window-clone)](LICENSE) [![release](https://img.shields.io/github/v/release/JhengFire/dsh-window-clone)](https://github.com/JhengFire/dsh-window-clone/releases)

**Open a second view of DeepSeek Harness and work in two places at once.**

`dsh-window-clone` is a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that turns "open another full Harness" into one click. Type a window name in Settings, press **Create window**, and a separate Harness window appears — already signed in, independent of the original, with a title you chose. Both windows drive the same Harness — same sessions, same workspace, live — and each keeps its own panel layout, so each can put a different panel into full screen and stay there.

```
dsh plugin --profile web add git+https://github.com/JhengFire/dsh-window-clone.git
```

---

## Why this exists

Working in DSH often means watching two things at once: a long task running while you read a document, or code in one place and reference material in another. Switching panels back and forth inside one window means losing your place every time.

A second window removes the switching: one window on the files, one on the terminal, both live on the same conversation.

## What you get

1. Open **Settings → Separate windows**.
2. Type a name — or leave it empty.
3. Press **Create window**.

A new window opens, titled with the name you typed — or `Harness clone 01`, `Harness clone 02`, … when you left it blank. It is already signed in, it is not a child of the window you opened it from, and closing either window leaves the other alone.

Every window is a full Harness. Put the files panel in one and the terminal in the other, then full-screen each panel, and you have two focused workspaces instead of one crowded one.

## Features

- **Custom window names** — the title is yours to choose, so the taskbar says what each window is for
- **A real separate window** — an app window with no address bar, draggable to a second monitor
- **Live in both windows** — sessions, messages and the workspace stay in sync as you work
- **Per-window panel layout** — each window keeps its own arrangement, and can full-screen a different panel
- **Already signed in** — the new window opens as an authenticated session without a second login
- **Creation history** — the settings page remembers the windows you have created
- **English and 简体中文**

Panel full screen is DSH's own control, at the top-right corner of the right-hand panel; this plugin does not add another.

## Install

```bash
dsh plugin --profile web add git+https://github.com/JhengFire/dsh-window-clone.git
dsh web
```

From a local checkout:

```bash
dsh plugin --profile web add ./dsh-window-clone
```

Restart Harness (or run `dsh web` again) and open Settings — **Separate windows** appears between *Market* and *MCP*.

## How it works

A browser page cannot open an operating-system window, so the plugin splits the work across the two halves every DSH plugin has.

**Host half** (`lib/index.mjs`) owns the two routes and the launcher:

| Route | Purpose |
| --- | --- |
| `POST /detach/open` | Start one Harness window; returns the window name |
| `GET /detach/state` | Report which launchers this machine has |

The window is a newly spawned process, not an iframe:

```js
spawn(shellExe, [], { detached: true, stdio: 'ignore' }).unref()
```

`detached` plus `unref` is what makes the new window independent of its parent. When no shell executable can be found, the launcher falls back to Chrome or Edge in `--app=` mode, which is also a chromeless window.

**Authentication** is the Host's own flow. The window opens the address carrying the process launch token (`connection.authenticatedUrl()`), exchanged for a session cookie on arrival — so the window is signed in from its first frame, not a login page.

**The window title** travels in the URL fragment (`#dsh-clone-name=…`), because a fragment is never sent to the server and survives the sign-in redirect that would otherwise discard a query string. The page reads it and re-asserts the title whenever the document head changes, so Harness cannot silently rename the window later.

**Browser half** (`lib/client.js`) contributes the settings page through the `settings.section` seat and is written in the same bundle shape as every shipped client plugin: an IIFE in strict mode, one `window.__ModuleLoader__.load({ id, factory })` registration, and `module.exports` assigned inside the factory.

## Requirements

- DeepSeek Harness desktop 0.2.x
- Windows, macOS or Linux
- Chrome or Edge — fallback path only

## One Harness, many windows

**Every window is a view of one Harness — by design.**

This is the point, not a limitation. All windows are connected to the same Harness instance, so everything stays in sync:

- **Sessions and messages** — a turn started in one window appears in the other as it streams
- **The workspace** — files, terminals and browser panels reflect one state
- **Settings, presets, plugins** — changed once, current everywhere
- **Panel layout per window** — each window keeps its own panel arrangement, because the layout is view state, not Harness state

So a window is not a copy of your work; it is another place to look at and act on the same work. Open one window on the file tree and another on the terminal, full-screen each panel, and the two windows show different slices of one running conversation — start something in either and watch it from the other.

## Scope

**One Harness instance, one machine.** The plugin opens windows on the Host that serves it; it does not coordinate windows across machines.

**A native window per panel is not possible here.** The desktop shell, `deepseek-harness.exe`, is a packaged Electron app that always loads its own `app.asar` and ignores an external application path — handed one, it exits immediately, which was verified directly. So this plugin duplicates the whole Harness instead and pairs it with DSH's built-in full screen, which reaches the same practical result: one thing per window.

## Troubleshoot

**No *Separate windows* in Settings.** The client bundle did not load. Hard-reload the GUI (`Ctrl+Shift+R`) so the browser drops any cached bundle from a previous version; if it persists, check the browser console for `client-modules` errors naming this package.

**The window opens but shows a sign-in page.** The launch token did not reach the window. `GET /detach/state` reports whether a launcher was found; if it lists neither `shell` nor `browser`, no launcher is available on this machine.

**The title is wrong.** Some browser app-mode builds let the page overwrite the window title. Details in the issues tab.

## Develop

The plugin is plain Node.js and React with no build step.

```bash
node --check lib/index.mjs
node --check lib/client.js
```

`lib/index.mjs` is the Host half and must stay ESM. `lib/client.js` is a classic browser script loaded by the module loader, not an ES module — it is not imported by Node.

## License

[MIT](LICENSE)