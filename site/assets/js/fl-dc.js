/* fl-dc: tiny runtime for the design handoff's page templates (compiled by tools/dc2js.py).
   Same semantics as the design runtime: {{ }} bindings, sc-if / sc-for, component imports, setState re-render. */
(function (global) {
  var DEFS = {}, ICONS = global.FL_ICONS || {};
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function T(f) { try { return f(); } catch (e) { return undefined; } }
  function S(v) { return v == null || typeof v === "boolean" ? "" : esc(v); }
  function SA(v) { return v == null ? "" : esc(v); }
  function B(v) { return !!v; }
  function L(v) { return Array.isArray(v) ? v : []; }
  function kebab(s) { return s.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }); }
  function cssObj(str) { var o = {}; String(str || "").split(";").forEach(function (d) { var i = d.indexOf(":"); if (i > 0) o[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }); return o; }
  var HOST = { position: 1, left: 1, right: 1, top: 1, bottom: 1, inset: 1, width: 1, height: 1, "z-index": 1, transform: 1 };
  function hostStyle(style) { var o = cssObj(style), out = []; for (var k in o) if (HOST[k]) out.push(k + ":" + o[k]); return out.join(";"); }

  /* ---------- DOM patching (keeps focus, scroll, hover, CSS transitions) ---------- */
  var tpl = document.createElement("template");
  /* Three-way patch: live DOM (d), new template output (s), previous template output (p).
     Like React, an attribute is only written when the template's value changed, so values set by other
     scripts (e.g. fl-motion moving the page background to its fixed layer) are left alone. */
  function syncAttrs(d, s, p) {
    var isIn = d.tagName === "INPUT", i, n, a;
    if (p) { for (i = p.attributes.length - 1; i >= 0; i--) { n = p.attributes[i].name; if (!s.hasAttribute(n) && !(n === "value" && isIn)) d.removeAttribute(n); } }
    else { for (i = d.attributes.length - 1; i >= 0; i--) { n = d.attributes[i].name; if (!s.hasAttribute(n) && !(n === "value" && isIn)) d.removeAttribute(n); } }
    for (i = 0; i < s.attributes.length; i++) {
      a = s.attributes[i];
      if (a.name === "value" && isIn) { if ((!p || p.getAttribute("value") !== a.value) && (d.type === "range" || d !== document.activeElement) && d.value !== a.value) d.value = a.value; continue; }
      if (p && p.getAttribute(a.name) === a.value) continue;
      if (d.getAttribute(a.name) !== a.value) d.setAttribute(a.name, a.value);
    }
  }
  function syncNode(d, s, p) {
    if (d.nodeType !== s.nodeType || d.nodeName !== s.nodeName) { d.replaceWith(s.cloneNode(true)); return; }
    if (d.nodeType === 3) { if (d.nodeValue !== s.nodeValue && !(p && p.nodeValue === s.nodeValue)) d.nodeValue = s.nodeValue; return; }
    if (d.nodeType !== 1) return;
    if (p && (p.nodeType !== 1 || p.nodeName !== s.nodeName)) p = null;
    syncAttrs(d, s, p);
    var tag = d.nodeName;
    if (tag === "FL-COACH" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (tag === "svg" || tag === "SVG") { if (d.innerHTML !== s.innerHTML) d.innerHTML = s.innerHTML; return; }
    syncKids(d, s, p);
  }
  function syncKids(d, s, p) {
    var dk = d.childNodes, sk = s.childNodes, pk = p ? p.childNodes : null;
    for (var i = 0; i < sk.length; i++) { if (i < dk.length) syncNode(dk[i], sk[i], pk && i < pk.length ? pk[i] : null); else d.appendChild(sk[i].cloneNode(true)); }
    while (dk.length > sk.length) d.removeChild(d.lastChild);
  }
  function morphInner(el, html, prev) { tpl.innerHTML = html; var nu = tpl.content; syncKids(el, nu, prev); return nu.cloneNode(true); }

  /* ---------- base class the page scripts extend ---------- */
  function DCLogic(props) { this.props = props || {}; this.state = this.state || {}; }
  DCLogic.prototype.setState = function (u) {
    var nu = typeof u === "function" ? u(this.state) : u; this.state = Object.assign({}, this.state, nu);
    if (this.__schedule) this.__schedule();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__schedule) this.__schedule(); };

  /* ---------- built-in design-system components ---------- */
  function icon(name, size, strokeWidth, color, style) {
    var n = ICONS[name], svg = "";
    if (n) {
      svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + strokeWidth + '" stroke-linecap="round" stroke-linejoin="round">';
      n.forEach(function (c) { svg += "<" + c[0]; for (var k in c[1]) svg += " " + k + '="' + c[1][k] + '"'; svg += "></" + c[0] + ">"; });
      svg += "</svg>";
    }
    return '<span aria-hidden="true" style="display:inline-flex;width:' + size + "px;height:" + size + "px;color:" + color + ";flex:0 0 auto;" + (style || "") + '">' + svg + "</span>";
  }
  var BUILT = {
    Icon: function (p) { return icon(p.name, p.size == null ? 20 : p.size, p.strokeWidth || 2, p.color || "currentColor", p.style); },
    Wordmark: function (p) {
      var size = p.size == null ? 28 : p.size, dark = p.tone === "dark", ink = dark ? "var(--white)" : "var(--ink-900)";
      return '<span style="display:inline-flex;align-items:baseline;gap:' + size * 0.22 + "px;font:var(--fw-black) " + size + "px/1 var(--font-display);letter-spacing:-.035em;color:" + ink + ';"><span><span style="color:' + (dark ? "var(--teal-400)" : "var(--teal-500)") + '">F</span>luency</span>' +
        (p.showAI === false ? "" : '<span style="font:var(--fw-bold) ' + size * 0.42 + "px/1 var(--font-display);letter-spacing:.08em;color:" + (dark ? "var(--teal-300)" : "var(--teal-600)") + ";transform:translateY(-" + size * 0.22 + 'px)">AI</span>') + "</span>";
    },
    Button: function (p, children, H) {
      var SZ = { s: { h: 36, px: 14, font: "var(--fs-body-s)", icon: 16, gap: 6 }, m: { h: 44, px: 20, font: "var(--fs-body-m)", icon: 18, gap: 8 }, l: { h: 56, px: 28, font: "var(--fs-body-l)", icon: 20, gap: 10 } };
      var VA = { primary: "background:var(--brand);color:var(--text-on-brand);box-shadow:var(--edge-brand), var(--shadow-s);", accent: "background:var(--accent);color:var(--ink-900);box-shadow:var(--edge-mint), var(--shadow-s);", secondary: "background:var(--white);color:var(--brand-ink);box-shadow:var(--edge-neutral);border:1px solid var(--border-subtle);", ghost: "background:transparent;color:var(--text-body);", inverse: "background:rgba(255,255,255,.10);color:var(--white);border:1px solid var(--border-inverse);backdrop-filter:blur(8px);", danger: "background:var(--state-danger);color:var(--white);box-shadow:inset 0 -3px 0 var(--coral-600), var(--shadow-s);" };
      var s = SZ[p.size] || SZ.m, dis = p.disabled;
      var st = "display:inline-flex;align-items:center;justify-content:center;gap:" + s.gap + "px;height:" + s.h + "px;padding:0 " + s.px + "px;" + (p.fullWidth ? "width:100%;" : "") + "font:var(--fw-bold) " + s.font + "/1 var(--font-display);letter-spacing:-.01em;border-radius:var(--radius-button);border:none;cursor:" + (dis ? "not-allowed" : "pointer") + ";transition:transform var(--dur-fast) var(--ease-standard), filter var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);opacity:" + (dis ? 0.45 : 1) + ";" + (VA[p.variant] || VA.primary);
      var ev = p.onClick && !dis ? ' data-fl-click="' + H.reg(p.onClick) + '"' : "";
      return '<button type="' + (p.type || "button") + '" class="fl-press"' + (dis ? " disabled" : "") + ev + ' style="' + st + '">' + (p.icon ? icon(p.icon, s.icon, 2, "currentColor") : "") + children + (p.iconRight ? icon(p.iconRight, s.icon, 2, "currentColor") : "") + "</button>";
    }
  };
  function makeH(host) {
    var H = {
      reg: function (fn) { host.fns.push(fn); return host.fns.length - 1; },
      attr: function (name, v) {
        if (v == null) return ""; var data = /^(aria|data)-/.test(name);
        if (v === false) return data ? " " + name + '="false"' : "";
        if (v === true) return data ? " " + name + '="true"' : " " + name + '=""';
        return " " + name + '="' + esc(v) + '"';
      },
      imp: function (name, props, children) {
        var short = name.split(".").pop();
        if (BUILT[short] && name.indexOf(".") > 0) return BUILT[short](props, children, H);
        if (/^[a-z][a-z0-9]*-[a-z0-9-]+$/.test(name)) {                 // custom element, e.g. fl-coach
          var at = "", st = "";
          for (var k in props) { if (k === "style") { st = hostStyle(props[k]); continue; } var v = props[k]; if (v == null || v === false) continue; at += " " + kebab(k) + '="' + esc(v === true ? "" : v) + '"'; }
          var el = "<" + name + at + "></" + name + ">";
          return st ? '<div class="sc-host-x" style="' + esc(st) + '">' + el + "</div>" : el;
        }
        var d = DEFS[short]; if (!d) return "";
        var Logic = d.cls || (d.cls = d.factory(DCLogic)), inst = new Logic(props), vals = inst.renderVals();
        var html = d.tpl.call(inst, vals, H, T, S, B, L, SA), hs = hostStyle(props.style);
        return '<div class="sc-host"' + (hs ? ' style="' + esc(hs) + '"' : "") + ">" + html + "</div>";
      }
    };
    return H;
  }

  /* ---------- mount a page ---------- */
  var FLDC = { define: function (name, factory, tplFn) { DEFS[name] = { factory: factory, tpl: tplFn }; }, DCLogic: DCLogic };
  FLDC.mount = function (root, name, props) {
    var d = DEFS[name], Logic = d.cls || (d.cls = d.factory(DCLogic)), logic = new Logic(props || {}), host = { fns: [] }, queued = false, mounted = false, prev = null;
    function render() {
      queued = false; host.fns = [];
      var vals = logic.renderVals(), html = d.tpl.call(logic, vals, makeH(host), T, S, B, L, SA);
      prev = morphInner(root, html, prev);
      [].forEach.call(root.querySelectorAll("select[data-fl-value]"), function (s) { var v = s.getAttribute("data-fl-value"); if (s.value !== v) s.value = v; });
      if (mounted && logic.componentDidUpdate) logic.componentDidUpdate();
    }
    logic.__schedule = function () { if (!queued) { queued = true; Promise.resolve().then(render); } };
    function dispatch(type, e, filter) {
      var stopped = false, ev = { type: e.type, target: e.target, key: e.key, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, nativeEvent: e,
        preventDefault: function () { e.preventDefault(); }, stopPropagation: function () { stopped = true; } };
      for (var el = e.target; el && el !== root.parentNode && !stopped; el = el.parentNode) {
        if (el.nodeType !== 1 || !el.hasAttribute("data-fl-" + type)) continue;
        ev.currentTarget = el; var fn = host.fns[+el.getAttribute("data-fl-" + type)]; if (fn) fn(ev);
      }
    }
    root.addEventListener("click", function (e) { dispatch("click", e); });
    root.addEventListener("input", function (e) { if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) dispatch("change", e); });
    root.addEventListener("change", function (e) { if (e.target.tagName === "SELECT") dispatch("change", e); });
    render(); mounted = true;
    if (logic.componentDidMount) logic.componentDidMount();
    window.addEventListener("pagehide", function () { if (logic.componentWillUnmount) logic.componentWillUnmount(); });
    FLDC.instances = FLDC.instances || {}; FLDC.instances[name] = logic;
    return logic;
  };
  global.FLDC = FLDC;
})(window);
