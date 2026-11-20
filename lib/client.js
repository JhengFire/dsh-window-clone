// SPDX-License-Identifier: MIT
(() => {
  "use strict";
  const ID = "dsh-window-clone";
  try {
    window.__ModuleLoader__.load({
      id: ID,
      factory: (require) => {
        const react = require("react");
        const NS = "separate-window";
        const OPEN_ROUTE = "detach/open";
        const SECTION_ID = "separate-window";
        const SECTION_ORDER = 60;
        const STORE_KEY = "dsh-separate-window.names";

        const zh = {
          title: "独立窗口",
          intro: "再开一份完整的 Harness。两个窗口各自独立操作，右侧面板还能单独全屏。",
          nameLabel: "窗口名称",
          nameHint: "留空则自动命名，例如 Harness分身01",
          create: "创建窗口",
          creating: "正在打开…",
          failed: "无法打开窗口",
          history: "已创建的窗口",
          empty: "还没有创建过窗口。"
        };
        const en = {
          title: "Separate windows",
          intro: "Open a second full Harness. The two windows work independently, and a panel can go full screen in either one.",
          nameLabel: "Window name",
          nameHint: "Leave empty to name it automatically, e.g. Harness clone 01",
          create: "Create window",
          creating: "Opening…",
          failed: "The window could not be opened",
          history: "Windows you created",
          empty: "No window has been created yet."
        };

        const STYLE_ID = "dsh-separate-window-style";
        const CSS = [
          ".dsh-sw-page{display:flex;flex-direction:column;gap:10px;max-width:560px;padding:4px 0 24px}",
          ".dsh-sw-intro{margin:0 0 4px;line-height:1.6;color:var(--dsw-alias-label-secondary,#646a73)}",
          ".dsh-sw-field{display:flex;flex-direction:column;gap:6px}",
          ".dsh-sw-label{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329)}",
          ".dsh-sw-input{height:34px;padding:0 10px;border:1px solid var(--dsw-alias-separator,rgba(0,0,0,.16));border-radius:8px;background:var(--dsw-alias-bg-l1,#fff);color:var(--dsw-alias-label-primary,#1f2329);font:inherit}",
          ".dsh-sw-hint{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary,#646a73)}",
          ".dsh-sw-create{align-self:flex-start;height:34px;padding:0 16px;border:0;border-radius:8px;background:var(--dsw-alias-brand-primary,#3b6cff);color:#fff;font-weight:600;cursor:pointer}",
          ".dsh-sw-create:disabled{opacity:.5;cursor:default}",
          ".dsh-sw-warn{margin:0;font-size:12px;color:var(--dsw-alias-danger-primary,#d93026)}",
          ".dsh-sw-h3{margin:12px 0 0;font-size:13px;font-weight:600}",
          ".dsh-sw-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}",
          ".dsh-sw-item{padding:6px 10px;border-radius:6px;background:var(--dsw-alias-bg-l2,rgba(0,0,0,.03));font-size:13px}"
        ].join("");

        function installStyles() {
          if (typeof document === "undefined") return;
          if (document.getElementById(STYLE_ID) !== null) return;
          const style = document.createElement("style");
          style.id = STYLE_ID;
          style.textContent = CSS;
          document.head.append(style);
        }

        function route(path) {
          if (typeof window === "undefined") return path;
          return window.location.origin + "/" + path;
        }

        async function post(path, payload) {
          let response;
          try {
            response = await fetch(route(path), {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload === undefined ? {} : payload)
            });
          } catch (error) {
            return { ok: false, message: "the Host is unreachable" };
          }
          try {
            const envelope = await response.json();
            if (typeof envelope !== "object" || envelope === null) {
              return { ok: false, message: "the Host returned no answer" };
            }
            return envelope;
          } catch (error) {
            return { ok: false, message: "the Host returned no answer" };
          }
        }

        function readNames() {
          try {
            const raw = window.localStorage.getItem(STORE_KEY);
            if (raw === null) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter((name) => typeof name === "string").slice(0, 20);
          } catch (error) {
            return [];
          }
        }

        function rememberName(name) {
          try {
            const next = [name].concat(readNames().filter((existing) => existing !== name)).slice(0, 20);
            window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
            return next;
          } catch (error) {
            return readNames();
          }
        }

        function Section(props) {
          const t = props.t;
          const nameState = react.useState("");
          const busyState = react.useState(false);
          const errorState = react.useState("");
          const historyState = react.useState(readNames);
          const name = nameState[0];
          const setName = nameState[1];
          const busy = busyState[0];
          const setBusy = busyState[1];
          const error = errorState[0];
          const setError = errorState[1];
          const history = historyState[0];
          const setHistory = historyState[1];

          function create() {
            if (busy) return;
            setBusy(true);
            setError("");
            const wanted = name.trim();
            post(OPEN_ROUTE, { name: wanted === "" ? undefined : wanted }).then((envelope) => {
              setBusy(false);
              if (envelope.ok !== true) {
                setError(typeof envelope.message === "string" ? envelope.message : t("failed"));
                return;
              }
              const created = typeof envelope.name === "string" ? envelope.name : wanted;
              if (created !== "") setHistory(rememberName(created));
              setName("");
            });
          }

          function row(children) {
            return react.createElement("div", { className: "dsh-sw-field" }, children);
          }

          const children = [
            react.createElement("p", { key: "intro", className: "dsh-sw-intro" }, t("intro")),
            row(react.createElement("label", { className: "dsh-sw-label", htmlFor: "dsh-sw-name" }, t("nameLabel"))),
            row(
              react.createElement("input", {
                id: "dsh-sw-name",
                className: "dsh-sw-input",
                type: "text",
                value: name,
                maxLength: 60,
                placeholder: "Harness分身01",
                disabled: busy,
                onChange: (event) => setName(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === "Enter") create();
                }
              })
            ),
            row(react.createElement("p", { className: "dsh-sw-hint" }, t("nameHint"))),
            row(
              react.createElement(
                "button",
                { type: "button", className: "dsh-sw-create", disabled: busy, onClick: create },
                busy ? t("creating") : t("create")
              )
            ),
            error === "" ? null : row(react.createElement("p", { className: "dsh-sw-warn", role: "alert" }, error)),
            react.createElement("h3", { key: "h3", className: "dsh-sw-h3" }, t("history")),
            history.length === 0
              ? react.createElement("p", { key: "empty", className: "dsh-sw-hint" }, t("empty"))
              : react.createElement(
                  "ul",
                  { key: "list", className: "dsh-sw-list" },
                  history.map((entry) => react.createElement("li", { key: entry, className: "dsh-sw-item" }, entry))
                )
          ];

          return react.createElement("div", { className: "dsh-sw-page" }, children);
        }

        function installCloneTitle() {
          if (typeof document === "undefined" || typeof window === "undefined") return undefined;
          const raw = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("dsh-clone-name");
          if (raw === null || raw === "") return undefined;
          let title = "";
          try {
            title = decodeURIComponent(raw);
          } catch (error) {
            title = raw;
          }
          if (title === "") return undefined;
          const set = () => {
            if (document.title !== title) document.title = title;
          };
          set();
          if (typeof MutationObserver === "undefined") return undefined;
          const observer = new MutationObserver(set);
          const head = document.querySelector("head");
          if (head !== null) observer.observe(head, { childList: true, subtree: true, characterData: true });
          return () => observer.disconnect();
        }

        function apply(ctx) {
          ctx.effect(() => ctx.locale.register(NS, { zh: zh, en: en }), "separate-window: dictionaries");
          ctx.effect(() => installStyles(), "separate-window: stylesheet");
          ctx.effect(() => installCloneTitle(), "separate-window: clone title");
          ctx.slots.inject("settings.section", () =>
            ctx.slots.register(
              {
                name: "settings.section",
                id: SECTION_ID,
                order: SECTION_ORDER,
                label: () => ctx.locale.bind(NS)("title"),
                locale: NS
              },
              Section
            )
          );
        }

        const plugin = { Section: Section, apply: apply, inject: ["slots", "locale"] };
        try {
          if (typeof module !== "undefined" && module && "exports" in module) module.exports = plugin;
        } catch (error) {
          /* a host without a module object still receives the returned plugin */
        }
        return plugin;
      }
    });
  } catch (error) {
    if (!/duplicate/i.test(String(error))) throw error;
  }
})();