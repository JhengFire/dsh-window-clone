/**
 * `dsh-separate-window` -- Host half.
 *
 * A "detached window" here is a SECOND copy of the whole Harness GUI, opened as
 * its own operating-system window. Two Harness windows can then be driven side
 * by side -- and because the right-hand panel can be put into full screen, each
 * window can dedicate itself to one piece of work.
 *
 * Why a full copy instead of a single panel: the GUI authenticates its browser
 * with a process launch token that must be exchanged for a cookie at `/`, and
 * that exchange redirects to a bare `/`, so a per-panel URL cannot survive it.
 * A second full GUI needs nothing extra: the Host opens the authenticated root
 * and the window is a working Harness from the first frame.
 *
 * Routes:
 *   GET  /detach/state   what this machine can launch
 *   POST /detach/open    open one more Harness window
 *
 * The packaged desktop shell always loads its own application archive, so
 * "opening a window" means launching the shell executable again -- that is
 * exactly what the user gets from the start menu, and what this route reuses.
 *
 * @module dsh-separate-window/host
 */

import { spawn } from 'node:child_process'
import { accessSync, constants as fsConstants, existsSync } from 'node:fs'
import { platform } from 'node:os'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'

/** Cordis function-plugin name. */
export const name = 'separate-window'

/** The route carrier and the trust fence. Both are required services. */
export const inject = ['webServer', 'connection']

/** Config: only what a second window needs. */
export const Config = z.object({
  /** How the extra window is opened. */
  launch: z.union([z.const('auto'), z.const('shell'), z.const('browser'), z.const('off')]).default('auto'),
  /** Width for the browser-app window; the shell decides its own geometry. */
  windowWidth: z.number().step(1).min(320).default(1200),
  /** Height for the browser-app window. */
  windowHeight: z.number().step(1).min(240).default(900),
})

/** GET: what this machine can launch. */
const STATE_ROUTE = '/detach/state'

/** POST: open one more Harness window. */
const OPEN_ROUTE = '/detach/open'

/**
 * How many duplicate windows this Host has opened, ever.
 *
 * The number names the window ("Harness分身01"), so it must be stable
 * per window and unique across them: a counter incremented at launch does both,
 * and survives a page reload because it lives in the Host process.
 */
let cloneCount = 0

/** Request bodies are tiny JSON objects; anything larger is hostile. */
const MAX_BODY_BYTES = 4 * 1024

/** A JSON response that is never cached: launch results are live facts. */
function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/** 405 with the route's one supported method. */
function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405
  res.setHeader('allow', allow)
  res.end()
}

/**
 * Collect a bounded request body as UTF-8 text.
 * @param req - the incoming request.
 * @returns the body, or null past the ceiling (stream drained).
 */
function readBoundedBody(req) {
  return new Promise(function (resolve) {
    const chunks = []
    let size = 0
    let settled = false
    function settle(value) {
      if (settled) return
      settled = true
      resolve(value)
    }
    function take(chunk) {
      size += chunk.byteLength
      if (size > MAX_BODY_BYTES) {
        if (typeof req.resume === 'function') req.resume()
        settle(null)
        return
      }
      chunks.push(chunk)
    }
    function finish() {
      settle(Buffer.concat(chunks, size).toString('utf8'))
    }
    if (typeof req.on === 'function') {
      req.on('data', take)
      req.on('end', finish)
      req.on('error', function () {
        settle(null)
      })
      return
    }
    if (typeof req[Symbol.asyncIterator] === 'function') {
      ;(async function () {
        try {
          for await (const chunk of req) {
            if (settled) return
            take(chunk)
          }
          finish()
        } catch {
          settle(null)
        }
      })()
      return
    }
    settle(null)
  })
}

/**
 * Whether a file is an executable the current user may run.
 * @param path - the candidate path.
 * @returns whether it is runnable.
 */
function isExecutable(path) {
  try {
    accessSync(path, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * The desktop shell's own executable, when this Host runs inside it.
 *
 * The packaged app reports itself through `DSH_NODE_EXECUTABLE` (the same
 * variable its bash runtime exposes) and `process.execPath` is the same binary
 * when this Host runs inside it. Launching it again is what "open another
 * Harness window" means -- the shell creates a full GUI window of its own.
 *
 * @returns the executable path, or undefined.
 */
function resolveShellExecutable() {
  const candidates = [process.env.DSH_NODE_EXECUTABLE, process.execPath]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate === '') continue
    if (!existsSync(candidate)) continue
    // A plain Node runtime is not the shell and cannot open a GUI window.
    if (/node(\.exe)?$/iu.test(candidate) && !/DeepSeek Harness/iu.test(candidate)) continue
    if (!isExecutable(candidate)) continue
    return candidate
  }
  return undefined
}

/** Paths worth probing for a Chromium-family browser, per platform. */
function browserCandidates() {
  if (platform() === 'win32') {
    const roots = [
      process.env['PROGRAMFILES(X86)'],
      process.env.PROGRAMFILES,
      process.env.PROGRAMW6432,
      process.env.LOCALAPPDATA,
    ].filter(function (root) {
      return typeof root === 'string' && root !== ''
    })
    const out = []
    for (const root of roots) {
      out.push(join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'))
      out.push(join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
    }
    return out
  }
  if (platform() === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ]
  }
  return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge']
}

/** The first browser executable this machine can actually run. */
function resolveBrowserExecutable() {
  for (const candidate of browserCandidates()) {
    if (existsSync(candidate) && isExecutable(candidate)) return candidate
  }
  return undefined
}

/** Spawn a child that must neither outlive nor hold open the Host. */
function launch(command, args, env) {
  if (typeof command !== 'string' || command === '') throw new Error('launch: the executable path is missing')
  const argv = []
  for (const arg of args) {
    if (typeof arg !== 'string') throw new Error('launch: a window argument is not a string')
    argv.push(arg)
  }
  const child = spawn(command, argv, {
    // A second Harness window outlives this one on purpose: closing the first
    // window must not close the work happening in the second.
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    env: env === undefined ? process.env : env,
  })
  child.unref()
  return child
}

/**
 * Mount the routes.
 * @param ctx - plugin context carrying `webServer` and `connection`.
 * @param config - validated {@link Config}.
 */
export function apply(ctx, config) {
  /** Answer an untrusted or unauthenticated request; true when it was rejected. */
  const rejected = function (req, res) {
    const connection = ctx.get('connection')
    const rejection = connection === undefined ? undefined : connection.requestRejection(req)
    if (rejection === undefined) return false
    res.statusCode = rejection
    res.end()
    return true
  }

  /** What this machine can launch, paths included (never sent to the page). */
  const capabilities = function () {
    const mode = config.launch
    const shell = mode === 'off' || mode === 'browser' ? undefined : resolveShellExecutable()
    const browser = mode === 'off' || mode === 'shell' ? undefined : resolveBrowserExecutable()
    return { shell: shell, browser: browser, platform: platform() }
  }

  /** The capability snapshot as the page sees it: availability only, never paths. */
  const wireCapabilities = function () {
    const caps = capabilities()
    const out = { platform: caps.platform }
    if (caps.shell !== undefined) out.shell = { available: true }
    if (caps.browser !== undefined) out.browser = { available: true }
    return out
  }

  ctx.effect(function () {
    return ctx.webServer.register({
      kind: 'exact',
      path: STATE_ROUTE,
      handler: function (req, res) {
        if (rejected(req, res)) return
        if (req.method !== 'GET') {
          sendMethodNotAllowed(res, 'GET')
          return
        }
        sendJson(res, 200, wireCapabilities())
      },
    })
  }, 'separate-window: GET ' + STATE_ROUTE)

  ctx.effect(function () {
    return ctx.webServer.register({
      kind: 'exact',
      path: OPEN_ROUTE,
      handler: async function (req, res) {
        if (rejected(req, res)) return
        if (req.method !== 'POST') {
          sendMethodNotAllowed(res, 'POST')
          return
        }
        // The body carries nothing this Host needs -- an extra window is always
        // "another Harness" -- but it is still read and bounded so a hostile
        // caller cannot stream into the process.
        const text = await readBoundedBody(req)
        // The page may name the window it asks for; anything unreadable simply
        // falls back to the automatic name.
        let requestedName = ''
        if (text !== null && text !== '') {
          try {
            const body = JSON.parse(text)
            if (body !== null && typeof body === 'object' && typeof body.name === 'string') {
              requestedName = body.name.trim().slice(0, 60)
            }
          } catch {
            requestedName = ''
          }
        }
        if (text === null) {
          sendJson(res, 413, { code: 'payload-too-large', message: 'request body is too large' })
          return
        }

        const caps = capabilities()
        const origin = ctx.webServer.getOrigin().replace(/\/+$/u, '')
        const connection = ctx.get('connection')
        const authenticated = connection === undefined ? origin + '/' : connection.authenticatedUrl(origin + '/')

        // A running shell gets a second window by being launched again; a plain
        // web deployment opens the browser in application mode instead.
        // The desktop shell is a SINGLE-INSTANCE application: launching it again
        // only focuses the running window instead of opening a second one, so a
        // browser app window is the only thing that actually gives a user a
        // second, independent Harness on screen.
        const attempts = []
        if (caps.browser !== undefined) attempts.push('browser')
        if (caps.shell !== undefined) attempts.push('shell')

        let result = { ok: false, reason: 'no launcher is available on this machine' }
        for (const mode of attempts) {
          if (mode === 'shell') {
            try {
              // A bare launch is the same invocation the operating system uses
              // for the Start-menu entry: the shell opens its window and this
              // process is not involved in its lifetime.
              launch(caps.shell, [], Object.assign({}, process.env))
              result = { ok: true, mode: 'shell' }
              break
            } catch (error) {
              result = { ok: false, reason: error instanceof Error ? error.message : String(error) }
            }
            continue
          }
          try {
            cloneCount += 1
            const cloneNumber = String(cloneCount).padStart(2, '0')
            const windowName = requestedName !== '' ? requestedName : 'Harness分身' + cloneNumber
            const cloneUrl = new URL(authenticated)
            // The number travels in the fragment so the page can title its own
            // window without the Host ever re-sending a credential.
            cloneUrl.hash = 'dsh-clone-name=' + encodeURIComponent(windowName)
            launch(
              caps.browser,
              ['--app=' + cloneUrl.toString(), '--new-window', '--window-size=' + String(config.windowWidth) + ',' + String(config.windowHeight)],
              Object.assign({}, process.env),
            )
            result = { ok: true, mode: 'browser', name: windowName }
            break
          } catch (error) {
            result = { ok: false, reason: error instanceof Error ? error.message : String(error) }
          }
        }

        if (result.ok !== true) {
          sendJson(res, 503, { code: 'launcher-unavailable', message: result.reason })
          return
        }
        sendJson(res, 200, { ok: true, mode: result.mode })
      },
    })
  }, 'separate-window: POST ' + OPEN_ROUTE)
}
