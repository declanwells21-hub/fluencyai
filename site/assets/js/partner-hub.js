/* PartnerHub page, compiled from the design handoff (Partner Hub live.dc.html) by tools/dc2js.py. */
FLDC.define("PartnerHub",function(DCLogic){
class Component extends DCLogic {
  state = { phase: "loading", data: null, tab: "overview", filter: "all", target: "home", copied: "", err: "" };

  componentDidMount() {
    this._reload = () => this.load();
    window.addEventListener("fl-auth-changed", this._reload);
    this.load();
  }

  // Wait (briefly) for something other scripts provide: the Sign in popup and the data helpers.
  wait(test, ms) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => { const v = test(); if (v) return resolve(v); if (Date.now() - t0 > ms) return resolve(null); setTimeout(tick, 60); };
      tick();
    });
  }

  async load() {
    const auth = await this.wait(() => window.flAuth && window.flAuth.getSession && window.flAuth, 5000);
    const url = window.__SUPABASE_URL, anon = window.__SUPABASE_ANON_KEY;
    if (!auth || !url || !anon) { this.setState({ phase: "unavailable" }); return; }
    const session = await auth.getSession();
    if (!session) { this.setState({ phase: "signed_out", data: null }); return; }
    // Same person, same data: do not flash the loading state again when only the token was refreshed.
    if (this.state.phase !== "ready") this.setState({ phase: "loading" });
    try {
      const res = await fetch(url + "/rest/v1/rpc/fl_my_partner", {
        method: "POST",
        headers: { apikey: anon, Authorization: "Bearer " + session.access_token, "Content-Type": "application/json" },
        body: "{}",
      });
      if (res.status === 401 || res.status === 403) { this.setState({ phase: "signed_out", data: null }); return; }
      if (!res.ok) throw new Error("status " + res.status);
      const data = await res.json();
      this.setState({ phase: "data", data: data });
    } catch (e) {
      this.setState({ phase: "error" });
    }
  }

  // Copy to the clipboard. Some browsers refuse the modern call (or reject it later), so fall back to the old way.
  fallbackCopy(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    } catch (e) { /* nothing more we can do; the link is shown on screen to copy by hand */ }
  }

  copyText(text, key) {
    try {
      const pending = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : null;
      if (pending && pending.catch) pending.catch(() => this.fallbackCopy(text)); else if (!pending) this.fallbackCopy(text);
    } catch (e) { this.fallbackCopy(text); }
    this.setState({ copied: key });
    setTimeout(() => { if (this.state.copied === key) this.setState({ copied: "" }); }, 2200);
  }

  renderVals() {
    const s = this.state, d = s.data;
    const D = window.FluencyData;
    const money = (c) => "$" + (Math.round(c || 0) / 100).toFixed(2);
    const num = (n) => Number(n || 0).toLocaleString("en-US");
    const day = (iso) => { try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); } catch (e) { return ""; } };
    const TONE = { brand: ["rgba(16,184,184,.16)", "var(--teal-200)"], success: ["rgba(37,215,155,.14)", "var(--mint-300)"], danger: ["rgba(255,106,106,.14)", "var(--coral-400)"], warning: ["rgba(247,178,59,.14)", "var(--amber-400)"], neutral: ["rgba(255,255,255,.08)", "var(--ink-200)"] };
    const base = { n16: 16, n20: 20, tabs: [], kpis: [], funnel: [], bars: [], sales: [], saleFilters: [], targets: [], payouts: [], howItems: [],
      vMessage: false, vOverview: false, vSales: false, vLinks: false, vPayouts: false,
      msgTitle: "", msgBody: "", msgHasPill: false, msgPill: "", msgPillBg: "", msgPillFg: "", msgHasAction: false, msgAction: () => {}, msgActionLabel: "", msgIcon: "log-in", msgHasLink: false, msgHasLinkOnly: false, msgLinkHref: "", msgLinkLabel: "",
      greet: "Partner hub", greetSub: "", coachExpr: "happy", footNote: "" };

    // ----- everything except an approved partner is a single message card -----
    const message = (o) => ({ ...base, vMessage: true, greet: o.greet, greetSub: o.sub || "", coachExpr: o.expr || "happy", msgTitle: o.title, msgBody: o.body,
      msgHasPill: !!o.pill, msgPill: o.pill || "", msgPillBg: o.tone ? TONE[o.tone][0] : "", msgPillFg: o.tone ? TONE[o.tone][1] : "",
      msgHasAction: !!o.action, msgAction: o.action || (() => {}), msgActionLabel: o.actionLabel || "", msgIcon: o.icon || "log-in",
      msgHasLink: !!(o.action && o.href), msgHasLinkOnly: !!(!o.action && o.href), msgLinkHref: o.href || "", msgLinkLabel: o.hrefLabel || "" });

    if (s.phase === "loading") return message({ greet: "One moment.", sub: "Opening your partner hub.", title: "Loading your partner hub", body: "This only takes a second." });
    if (s.phase === "unavailable") return message({ greet: "We could not open the hub.", title: "Sign-in is not available right now", body: "Please try again in a little while.", expr: "speaking" });
    if (s.phase === "error") return message({ greet: "That did not load.", title: "We could not load your partner hub", body: "Check your connection and try again.", expr: "speaking", action: () => this.load(), actionLabel: "Try again", icon: "refresh-cw" });
    if (s.phase === "signed_out") return message({ greet: "Welcome to the partner hub.", sub: "Your links, sales and payouts in one place.", title: "Sign in to see your partner hub",
      body: "Use the Fluency AI account that has the same email address you applied with. No account yet? Create one with that email.", action: () => { window.flAuth && window.flAuth.openLogin(); }, actionLabel: "Sign in or create an account", icon: "log-in",
      href: "/partners", hrefLabel: "About the Partner Program" });

    const st = d && d.status;
    if (d && d.email_confirmed === false && st !== "approved") return message({ greet: "One more step.", title: "Confirm your email address", body: "We could not match your account to a partner application because " + d.email + " has not been confirmed yet. Open the confirmation email we sent, then come back.", expr: "speaking" });
    if (st === "none") return message({ greet: "You have not applied yet.", title: "Apply to the Partner Program", body: "We could not find a partner application for " + d.email + ". If you applied with a different email address, sign in with that account instead.", href: "/partners", hrefLabel: "Apply on the Partners page" });
    if (st === "pending") return message({ greet: "Thank you for applying.", sub: "We have your application.", title: "Your application is being reviewed", pill: "Received " + day(d.application && d.application.applied_at), tone: "warning",
      body: "We will email " + d.email + " as soon as it is decided. If you are accepted, your partner hub opens here with your code and your links.", href: "/partners", hrefLabel: "Back to the Partners page" });
    if (st === "rejected") return message({ greet: "Thank you for applying.", title: "We could not offer you a place right now", pill: "Not accepted", tone: "neutral", expr: "speaking",
      body: "You are welcome to apply again later. We are growing the program step by step.", href: "/partners", hrefLabel: "Back to the Partners page" });
    if (st === "paused") return message({ greet: "Your partner account is paused.", title: "Your partner account is on hold", pill: "Paused", tone: "warning", expr: "speaking",
      body: "Your code is not earning right now. Please reply to your welcome email and we will sort it out with you." });

    // ----- approved partner -----
    const p = d.partner, t = d.totals, rules = d.rules || { hold_days: 14, min_payout_cents: 2000 };
    const first = String(p.name || "").trim().split(/\s+/)[0] || "there";
    const rate = Math.round((p.rate || 0.2) * 100);
    const T = [["overview", "Overview", "layout-dashboard"], ["sales", "Sales", "receipt"], ["links", "Links", "link"], ["payouts", "Payouts", "wallet"]];
    const tab = s.tab;
    const pill = (on) => ({ bg: on ? "var(--teal-600)" : "rgba(255,255,255,.05)", bd: on ? "var(--teal-400)" : "rgba(255,255,255,.14)", fg: on ? "#fff" : "var(--ink-200)" });
    const link = (target) => {
      if (!target || target === "home") return "https://fluencyai.app/r/" + p.code;
      if (target === "store" || target === "pricing") return "https://fluencyai.app/r/" + p.code + "/" + target;
      return "https://fluencyai.app/store?ref=" + p.code + "#guide=" + target;
    };
    const homeLink = link("home");
    const greets = {
      overview: ["Hi " + first + ".", t.sales + " credited sale" + (t.sales === 1 ? "" : "s") + " so far, and " + num(t.signups_all) + " account" + (t.signups_all === 1 ? "" : "s") + " created with your code."],
      sales: ["Every sale with your code.", "Each one is held for " + rules.hold_days + " days in case of a refund, then it is ready to pay."],
      links: ["Link the exact page.", "People buy more when the link opens what they asked about."],
      payouts: ["Paid monthly.", "Once you have " + money(rules.min_payout_cents) + " or more ready to pay, after the " + rules.hold_days + "-day refund hold."],
    };
    const KIND = { app_subscription: "App subscription", exam_blueprint: "Exam blueprint" };
    const ST = { held: ["warning", "In hold"], payable: ["brand", "Ready to pay"], paid: ["success", "Paid out"], reversed: ["danger", "Refunded"] };
    const sales = (d.sales || []).map((x) => ({ ...x, date: day(x.at), name: x.product || KIND[x.kind] || "Sale", kindLabel: KIND[x.kind] || x.kind, state: x.state,
      statusLabel: x.state === "held" ? "In hold until " + day(x.eligible_at) : ST[x.state][1], tone: ST[x.state][0] }));
    const shown = sales.filter((x) => s.filter === "all" || x.state === s.filter).map((x) => { const c = TONE[x.tone];
      return { ...x, tbg: c[0], tfg: c[1], grossLabel: money(x.gross_cents), amtColor: x.state === "reversed" ? "var(--ink-500)" : x.state === "paid" ? "var(--mint-300)" : "#fff",
        commissionLabel: x.state === "reversed" ? "$0.00" : money(x.commission_cents) }; });
    const maxClicks = Math.max(1, ...((d.by_day || []).map((x) => x.clicks)));
    const bars = (d.by_day || []).map((x) => ({ h: x.clicks ? Math.max(6, Math.round(x.clicks / maxClicks * 100)) + "%" : "3px", c: x.clicks ? "var(--teal-400)" : "rgba(255,255,255,.12)", title: day(x.day) + ": " + x.clicks + (x.clicks === 1 ? " open" : " opens") }));
    const owed = t.payable_cents, min = rules.min_payout_cents;
    const topClicks = Math.max(1, t.clicks_30d);
    return { ...base,
      tabs: T.map(([v, label, icon]) => ({ label, icon, sel: String(tab === v), bg: tab === v ? "rgba(16,184,184,.16)" : "transparent", fg: tab === v ? "#fff" : "var(--ink-300)", pick: () => this.setState({ tab: v }) })),
      vOverview: tab === "overview", vSales: tab === "sales", vLinks: tab === "links", vPayouts: tab === "payouts",
      greet: greets[tab][0], greetSub: greets[tab][1], coachExpr: tab === "overview" ? "happy" : "speaking",
      code: p.code, codeNote: "You earn " + rate + "% on a referred person's first app subscription and on every exam blueprint sold through your link. Anyone who uses your code or link gets a discount at checkout.",
      homeLink: homeLink.replace("https://", ""), copyHome: () => this.copyText(homeLink, "home"), copyHomeLabel: s.copied === "home" ? "Copied" : "Copy link",
      kpis: [
        { label: "Ready to pay", v: money(owed), note: owed >= min ? "In the next monthly payout" : "Paid monthly from " + money(min), noteColor: "var(--mint-300)" },
        { label: "In the " + rules.hold_days + "-day hold", v: money(t.held_cents), note: "Becomes payable after the refund window", noteColor: "var(--ink-400)" },
        { label: "Accounts created", v: num(t.signups_30d), note: "With your code, last 30 days (" + num(t.signups_all) + " in total)", noteColor: "var(--ink-400)" },
        { label: "Paid out so far", v: money(t.paid_cents), note: t.reversed_cents ? money(t.reversed_cents) + " refunded, not counted" : "All time", noteColor: "var(--ink-400)" },
      ],
      funnel: [
        { label: "People who opened your links", value: num(t.clicks_30d), w: "100%", c: "var(--ink-500)", note: "Last 30 days. Opens are never paid." },
        { label: "Accounts created with your code", value: num(t.signups_30d), w: Math.min(100, Math.max(t.signups_30d ? 6 : 0, t.signups_30d / topClicks * 100)) + "%", c: "var(--teal-400)", note: "Last 30 days." },
        { label: "Sales credited to you", value: num(t.sales), w: Math.min(100, Math.max(t.sales ? 6 : 0, t.sales / topClicks * 100)) + "%", c: "var(--mint-400)", note: "All time. The only things that earn commission." },
      ],
      bars, barsLabel: "Link opens per day for the last 30 days",
      owed: money(owed), payPct: Math.min(100, owed / min * 100) + "%",
      payNote: owed >= min ? "Over the " + money(min) + " minimum, so it goes out in the next monthly payout." : money(min - owed) + " more ready to pay to reach the " + money(min) + " minimum." + (t.held_cents ? " " + money(t.held_cents) + " more is still in the refund hold." : ""),
      payoutTo: "Payouts are arranged by email. Reply to your welcome email to tell us how you would like to be paid.",
      saleFilters: [["all", "All"], ["held", "In hold"], ["payable", "Ready to pay"], ["paid", "Paid out"], ["reversed", "Refunded"]].map(([v, label]) => ({ label, sel: String(s.filter === v), ...pill(s.filter === v), pick: () => this.setState({ filter: v }) })),
      sales: shown, noSales: shown.length === 0,
      noSalesText: sales.length === 0 ? "No sales yet. Share your link and they will appear here. App subscription sales show up once the apps are live." : "Nothing in this view.",
      targets: [{ value: "home", label: "Home page" }, { value: "store", label: "The store" }, { value: "pricing", label: "Pricing" }].concat(D && D.GUIDES ? D.GUIDES.map((g) => ({ value: g.id, label: g.name + " guide" })) : []),
      target: s.target, setTarget: (e) => this.setState({ target: e.target.value, copied: "" }), builtLink: link(s.target).replace("https://", ""),
      copy: () => this.copyText(link(s.target), "built"), copyLabel: s.copied === "built" ? "Copied" : "Copy",
      howItems: [
        { title: "Your code is remembered for 30 days", text: "When someone opens your link, their browser remembers your code. If they buy within 30 days, the sale is credited to you." },
        { title: "Your audience gets a discount", text: "Anyone who comes through your link or uses your code gets a discount at checkout." },
        { title: "App subscriptions", text: rate + "% of the first subscription payment from someone who signed up with your code. Renewals do not earn commission." },
        { title: "Exam blueprints", text: rate + "% of every exam blueprint bought through your link, on the Selar sales page." },
      ],
      payouts: (d.payouts || []).map((x) => ({ id: x.id, date: day(x.at), ref: x.reference || "Paid", amount: money(x.amount_cents) })),
      noPayouts: (d.payouts || []).length === 0, noPayoutsText: "No payouts yet. Payouts are made monthly once you have " + money(min) + " or more ready to pay.",
      footNote: "Numbers update as sales are confirmed. Refunds before payout are taken off. Questions? Reply to your welcome email.",
    };
  }
}

return Component;},function(v,H,T,S,B,L,SA){with(v){return "<div"+" data-fl-page"+" data-screen-label=\"Partner hub\""+" style=\"min-height:100vh;background:#04121B;font-family:var(--font-body);\""+">"+"\n  "+"<header"+" style=\"position:sticky;top:0;z-index:30;padding:12px 16px;background:rgba(4,18,27,.7);backdrop-filter:blur(14px);border-bottom:1px solid rgba(255,255,255,.08);\""+">"+"\n    "+"<div"+" style=\"max-width:1200px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:16px;\""+">"+"\n      "+"<a"+" href=\"/partners\""+" aria-label=\"Fluency Partners\""+" style=\"text-decoration:none;display:flex;align-items:center;gap:10px;\""+">"+H.imp("FluencyAIDesignSystem_b0c8f6.Wordmark",{"size":T(function(){return (n20)}),"tone":"dark"},"")+"<span"+" style=\"font:600 13px/1 var(--font-body);color:var(--ink-400);\""+">"+"Partner hub"+"</span>"+"</a>"+"\n      "+"<div"+" role=\"tablist\""+" style=\"flex:1;display:flex;flex-wrap:wrap;gap:4px;justify-content:center;\""+">"+"\n        "+(L(T(function(){return (tabs)})).map(function(t,_i){return "<button"+" type=\"button\""+" role=\"tab\""+H.attr("aria-selected",T(function(){return (t.sel)}))+" data-fl-click=\""+H.reg(T(function(){return (t.pick)}))+"\""+" style=\""+"display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:999px;border:0;cursor:pointer;font:600 14px/1 var(--font-body);background:"+SA(T(function(){return (t.bg)}))+";color:"+SA(T(function(){return (t.fg)}))+";"+"\""+">"+H.imp("FluencyAIDesignSystem_b0c8f6.Icon",{"name":T(function(){return (t.icon)}),"size":T(function(){return (n16)})},"")+S(T(function(){return (t.label)}))+"</button>"}).join(""))+"\n      "+"</div>"+"\n      "+"<button"+" type=\"button\""+" class=\"js-login-trigger\""+" data-logged-out=\"Sign in\""+" data-logged-in=\"Account\""+" style=\"height:36px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:none;color:var(--ink-200);font:600 13px/1 var(--font-body);cursor:pointer;\""+">"+"Sign in"+"</button>"+"\n    "+"</div>"+"\n  "+"</header>"+"\n\n  "+"<main"+" data-fl-stagger"+" style=\"max-width:1200px;margin:0 auto;padding:28px 24px 80px;display:grid;gap:24px;\""+">"+"\n    "+"<div"+" style=\"display:grid;grid-template-columns:96px minmax(0,1fr);gap:16px;align-items:center;\""+">"+"\n      "+"<div"+" style=\"width:96px;height:96px;\""+">"+H.imp("Coach",{"expression":T(function(){return (coachExpr)}),"character":"mia","frame":"circle","crop":"bust","style":"width:100%;height:100%;"},"")+"</div>"+"\n      "+"<div"+" style=\"justify-self:start;max-width:min(720px,100%);display:grid;gap:4px;padding:14px 18px;border-radius:6px 22px 22px 22px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);\""+">"+"\n        "+"<span"+" style=\"font:700 20px/1.25 var(--font-display);color:#fff;\""+">"+S(T(function(){return (greet)}))+"</span>"+"\n        "+"<span"+" style=\"font:400 16px/1.5 var(--font-body);color:var(--ink-300);\""+">"+S(T(function(){return (greetSub)}))+"</span>"+"\n      "+"</div>"+"\n    "+"</div>"+"\n\n    "+(B(T(function(){return (vMessage)}))?("\n      "+"<div"+" style=\"display:grid;gap:14px;padding:22px;border-radius:24px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);max-width:720px;\""+" role=\"status\""+" aria-live=\"polite\""+">"+"\n        "+"<span"+" style=\"font:700 20px/1.25 var(--font-display);color:#fff;\""+">"+S(T(function(){return (msgTitle)}))+"</span>"+"\n        "+(B(T(function(){return (msgHasPill)}))?("<span"+" style=\""+"justify-self:start;height:26px;display:inline-flex;align-items:center;padding:0 12px;border-radius:999px;font:700 12px/1 var(--font-body);background:"+SA(T(function(){return (msgPillBg)}))+";color:"+SA(T(function(){return (msgPillFg)}))+";"+"\""+">"+S(T(function(){return (msgPill)}))+"</span>"):"")+"\n        "+"<span"+" style=\"font:400 16px/1.55 var(--font-body);color:var(--ink-300);\""+">"+S(T(function(){return (msgBody)}))+"</span>"+"\n        "+(B(T(function(){return (msgHasAction)}))?("<div"+" style=\"display:flex;flex-wrap:wrap;gap:12px;align-items:center;\""+">"+H.imp("FluencyAIDesignSystem_b0c8f6.Button",{"variant":"primary","size":"m","icon":T(function(){return (msgIcon)}),"onClick":T(function(){return (msgAction)})},S(T(function(){return (msgActionLabel)})))+(B(T(function(){return (msgHasLink)}))?("<a"+H.attr("href",T(function(){return (msgLinkHref)}))+" style=\"font:600 15px/1 var(--font-body);\""+">"+S(T(function(){return (msgLinkLabel)}))+"</a>"):"")+"</div>"):"")+"\n        "+(B(T(function(){return (msgHasLinkOnly)}))?("<a"+H.attr("href",T(function(){return (msgLinkHref)}))+" style=\"justify-self:start;font:600 15px/1 var(--font-body);\""+">"+S(T(function(){return (msgLinkLabel)}))+"</a>"):"")+"\n      "+"</div>"+"\n    "):"")+"\n\n    "+(B(T(function(){return (vOverview)}))?("\n      "+"<div"+" style=\"display:grid;gap:14px;padding:22px;border-radius:24px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:16px;\""+">"+"\n        "+"<div"+" style=\"display:grid;gap:6px;\""+">"+"\n          "+"<span"+" style=\"font:600 13px/1.3 var(--font-body);color:var(--ink-400);\""+">"+"Your partner code"+"</span>"+"\n          "+"<span"+" style=\"font:800 32px/1 var(--font-numeric);color:#fff;letter-spacing:.02em;\""+">"+S(T(function(){return (code)}))+"</span>"+"\n          "+"<span"+" style=\"font:500 13px/1.4 var(--font-body);color:var(--ink-300);\""+">"+S(T(function(){return (codeNote)}))+"</span>"+"\n          "+"<code"+" style=\"margin-top:4px;display:block;padding:10px 12px;border-radius:12px;background:rgba(4,18,27,.6);border:1px solid rgba(255,255,255,.12);font:500 14px/1.3 var(--font-mono);color:var(--teal-200);overflow:auto;white-space:nowrap;\""+">"+S(T(function(){return (homeLink)}))+"</code>"+"\n        "+"</div>"+"\n        "+H.imp("FluencyAIDesignSystem_b0c8f6.Button",{"variant":"primary","size":"m","icon":"copy","onClick":T(function(){return (copyHome)})},S(T(function(){return (copyHomeLabel)})))+"\n      "+"</div>"+"\n      "+"<div"+" style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:12px;\""+">"+"\n        "+(L(T(function(){return (kpis)})).map(function(k,_i){return "<div"+" style=\"display:grid;gap:6px;padding:20px;border-radius:20px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);\""+">"+"<span"+" style=\"font:600 13px/1.3 var(--font-body);color:var(--ink-400);\""+">"+S(T(function(){return (k.label)}))+"</span>"+"<span"+" style=\"font:800 32px/1 var(--font-numeric);color:#fff;\""+">"+S(T(function(){return (k.v)}))+"</span>"+"<span"+" style=\""+"font:500 12px/1.35 var(--font-body);color:"+SA(T(function(){return (k.noteColor)}))+";"+"\""+">"+S(T(function(){return (k.note)}))+"</span>"+"</div>"}).join(""))+"\n      "+"</div>"+"\n      "+"<div"+" style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:16px;\""+">"+"\n        "+"<div"+" style=\"display:grid;gap:14px;align-content:start;padding:22px;border-radius:24px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);\""+">"+"\n          "+"<span"+" style=\"font:700 18px/1.2 var(--font-display);color:#fff;\""+">"+"From click to commission"+"</span>"+"\n          "+(L(T(function(){return (funnel)})).map(function(f,_i){return "\n            "+"<div"+" style=\"display:grid;gap:6px;\""+">"+"\n              "+"<div"+" style=\"display:flex;justify-content:space-between;gap:10px;\""+">"+"<span"+" style=\"font:600 14px/1.3 var(--font-body);color:var(--ink-100);\""+">"+S(T(function(){return (f.label)}))+"</span>"+"<span"+" style=\"font:800 16px/1 var(--font-numeric);color:#fff;\""+">"+S(T(function(){return (f.value)}))+"</span>"+"</div>"+"\n              "+"<div"+" style=\"height:8px;border-radius:4px;background:rgba(255,255,255,.06);overflow:hidden;\""+">"+"<div"+" style=\""+"width:"+SA(T(function(){return (f.w)}))+";height:100%;border-radius:4px;background:"+SA(T(function(){return (f.c)}))+";"+"\""+">"+""+"</div>"+"</div>"+"\n              "+"<span"+" style=\"font:500 12px/1.35 var(--font-body);color:var(--ink-400);\""+">"+S(T(function(){return (f.note)}))+"</span>"+"\n            "+"</div>"+"\n          "}).join(""))+"\n        "+"</div>"+"\n        "+"<div"+" style=\"display:grid;gap:12px;align-content:start;padding:22px;border-radius:24px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);\""+">"+"\n          "+"<span"+" style=\"font:700 18px/1.2 var(--font-display);color:#fff;\""+">"+"Next payout"+"</span>"+"\n          "+"<div"+" style=\"display:flex;align-items:baseline;gap:10px;\""+">"+"<span"+" style=\"font:800 40px/1 var(--font-numeric);color:#fff;\""+">"+S(T(function(){return (owed)}))+"</span>"+"<span"+" style=\"font:500 14px/1 var(--font-body);color:var(--ink-300);\""+">"+"ready to pay"+"</span>"+"</div>"+"\n          "+"<div"+" style=\"height:8px;border-radius:4px;background:rgba(255,255,255,.06);overflow:hidden;\""+">"+"<div"+" style=\""+"width:"+SA(T(function(){return (payPct)}))+";height:100%;border-radius:4px;background:var(--mint-400);"+"\""+">"+""+"</div>"+"</div>"+"\n          "+"<span"+" style=\"font:500 13px/1.4 var(--font-body);color:var(--ink-300);\""+">"+S(T(function(){return (payNote)}))+"</span>"+"\n          "+"<span"+" style=\"font:500 13px/1.4 var(--font-body);color:var(--ink-400);\""+">"+S(T(function(){return (payoutTo)}))+"</span>"+"\n        "+"</div>"+"\n      "+"</div>"+"\n      "+"<div"+" style=\"display:grid;gap:12px;padding:22px;border-radius:24px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);\""+">"+"\n        "+"<span"+" style=\"font:700 18px/1.2 var(--font-display);color:#fff;\""+">"+"Link opens, last 30 days"+"</span>"+"\n        "+"<div"+" style=\"display:flex;align-items:flex-end;gap:3px;height:84px;\""+" role=\"img\""+H.attr("aria-label",T(function(){return (barsLabel)}))+">"+"\n          "+(L(T(function(){return (bars)})).map(function(b,_i){return "<div"+H.attr("title",T(function(){return (b.title)}))+" style=\""+"flex:1;min-width:3px;height:"+SA(T(function(){return (b.h)}))+";border-radius:3px 3px 0 0;background:"+SA(T(function(){return (b.c)}))+";"+"\""+">"+""+"</div>"}).join(""))+"\n        "+"</div>"+"\n        "+"<span"+" style=\"font:500 12px/1.35 var(--font-body);color:var(--ink-400);\""+">"+"Opens are for insight only. They are never paid."+"</span>"+"\n      "+"</div>"+"\n    "):"")+"\n\n    "+(B(T(function(){return (vSales)}))?("\n      "+"<div"+" style=\"display:flex;flex-wrap:wrap;gap:6px;\""+">"+"\n        "+(L(T(function(){return (saleFilters)})).map(function(f,_i){return "<button"+" type=\"button\""+" data-fl-click=\""+H.reg(T(function(){return (f.pick)}))+"\""+H.attr("aria-pressed",T(function(){return (f.sel)}))+" style=\""+"height:36px;padding:0 14px;border-radius:999px;cursor:pointer;font:600 13px/1 var(--font-body);background:"+SA(T(function(){return (f.bg)}))+";border:1px solid "+SA(T(function(){return (f.bd)}))+";color:"+SA(T(function(){return (f.fg)}))+";"+"\""+">"+S(T(function(){return (f.label)}))+"</button>"}).join(""))+"\n      "+"</div>"+"\n      "+(B(T(function(){return (noSales)}))?("<div"+" style=\"padding:20px;border-radius:20px;border:1px dashed rgba(255,255,255,.2);font:500 16px/1.5 var(--font-body);color:var(--ink-300);\""+">"+S(T(function(){return (noSalesText)}))+"</div>"):"")+"\n      "+"<div"+" style=\"display:grid;gap:6px;\""+">"+"\n        "+(L(T(function(){return (sales)})).map(function(r,_i){return "\n          "+"<div"+" data-fl-table-row=\"3\""+" style=\"display:grid;grid-template-columns:72px minmax(0,1.4fr) minmax(0,1fr) 64px 84px;gap:12px;align-items:center;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);font:500 14px/1.3 var(--font-body);color:var(--ink-200);\""+">"+"\n            "+"<span"+" data-fl-hide-sm"+" style=\"font:500 13px/1 var(--font-mono);color:var(--ink-400);\""+">"+S(T(function(){return (r.date)}))+"</span>"+"\n            "+"<span"+" style=\"display:grid;gap:3px;\""+">"+"<b"+" style=\"font:700 15px/1.2 var(--font-display);color:#fff;\""+">"+S(T(function(){return (r.name)}))+"</b>"+"<span"+" style=\"font:500 12px/1 var(--font-mono);color:var(--ink-500);\""+">"+S(T(function(){return (r.id)}))+" &middot; "+S(T(function(){return (r.kindLabel)}))+"</span>"+"</span>"+"\n            "+"<span"+" style=\""+"justify-self:start;min-height:24px;display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font:700 11px/1.2 var(--font-body);background:"+SA(T(function(){return (r.tbg)}))+";color:"+SA(T(function(){return (r.tfg)}))+";"+"\""+">"+S(T(function(){return (r.statusLabel)}))+"</span>"+"\n            "+"<span"+" data-fl-hide-sm"+" style=\"text-align:right;\""+">"+S(T(function(){return (r.grossLabel)}))+"</span>"+"\n            "+"<span"+" style=\""+"text-align:right;font:800 15px/1 var(--font-numeric);color:"+SA(T(function(){return (r.amtColor)}))+";"+"\""+">"+S(T(function(){return (r.commissionLabel)}))+"</span>"+"\n          "+"</div>"+"\n        "}).join(""))+"\n      "+"</div>"+"\n    "):"")+"\n\n    "+(B(T(function(){return (vLinks)}))?("\n      "+"<div"+" style=\"display:grid;gap:12px;padding:22px;border-radius:24px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);\""+">"+"\n        "+"<span"+" style=\"font:700 18px/1.2 var(--font-display);color:#fff;\""+">"+"Build a link"+"</span>"+"\n        "+"<div"+" style=\"display:flex;flex-wrap:wrap;gap:10px;align-items:center;\""+">"+"\n          "+"<select"+H.attr("data-fl-value",T(function(){return (target)}))+" data-fl-change=\""+H.reg(T(function(){return (setTarget)}))+"\""+" aria-label=\"Link to\""+" style=\"height:44px;padding:0 12px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(4,18,27,.6);color:#fff;font:500 15px/1 var(--font-body);\""+">"+"\n            "+(L(T(function(){return (targets)})).map(function(t,_i){return "<option"+H.attr("value",T(function(){return (t.value)}))+">"+S(T(function(){return (t.label)}))+"</option>"}).join(""))+"\n          "+"</select>"+"\n          "+"<code"+" style=\"flex:1;min-width:220px;height:44px;display:flex;align-items:center;padding:0 14px;border-radius:14px;background:rgba(4,18,27,.6);border:1px solid rgba(255,255,255,.12);font:500 14px/1 var(--font-mono);color:var(--teal-200);overflow:auto;white-space:nowrap;\""+">"+S(T(function(){return (builtLink)}))+"</code>"+"\n          "+H.imp("FluencyAIDesignSystem_b0c8f6.Button",{"variant":"primary","size":"m","icon":"copy","onClick":T(function(){return (copy)})},S(T(function(){return (copyLabel)})))+"\n        "+"</div>"+"\n      "+"</div>"+"\n      "+"<div"+" style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:12px;\""+">"+"\n        "+(L(T(function(){return (howItems)})).map(function(h,_i){return "\n          "+"<div"+" style=\"display:grid;gap:6px;padding:18px;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);\""+">"+"<b"+" style=\"font:700 15px/1.2 var(--font-display);color:#fff;\""+">"+S(T(function(){return (h.title)}))+"</b>"+"<span"+" style=\"font:500 13px/1.45 var(--font-body);color:var(--ink-300);\""+">"+S(T(function(){return (h.text)}))+"</span>"+"</div>"+"\n        "}).join(""))+"\n      "+"</div>"+"\n    "):"")+"\n\n    "+(B(T(function(){return (vPayouts)}))?("\n      "+(B(T(function(){return (noPayouts)}))?("<div"+" style=\"padding:20px;border-radius:20px;border:1px dashed rgba(255,255,255,.2);font:500 16px/1.5 var(--font-body);color:var(--ink-300);\""+">"+S(T(function(){return (noPayoutsText)}))+"</div>"):"")+"\n      "+"<div"+" style=\"display:grid;gap:6px;\""+">"+"\n        "+(L(T(function(){return (payouts)})).map(function(p,_i){return "\n          "+"<div"+" style=\"display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:center;padding:16px 18px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);\""+">"+"\n            "+"<span"+" style=\"display:grid;gap:4px;\""+">"+"<b"+" style=\"font:700 16px/1.2 var(--font-display);color:#fff;\""+">"+S(T(function(){return (p.date)}))+"</b>"+"<span"+" style=\"font:500 12px/1 var(--font-mono);color:var(--ink-500);\""+">"+S(T(function(){return (p.id)}))+" &middot; "+S(T(function(){return (p.ref)}))+"</span>"+"</span>"+"\n            "+"<span"+" style=\"display:flex;gap:12px;align-items:center;\""+">"+"<span"+" style=\"height:24px;display:inline-flex;align-items:center;padding:0 10px;border-radius:999px;font:700 11px/1 var(--font-body);background:rgba(37,215,155,.14);color:var(--mint-300);\""+">"+"Paid"+"</span>"+"<span"+" style=\"font:800 18px/1 var(--font-numeric);color:#fff;\""+">"+S(T(function(){return (p.amount)}))+"</span>"+"</span>"+"\n          "+"</div>"+"\n        "}).join(""))+"\n      "+"</div>"+"\n    "):"")+"\n\n    "+"<span"+" style=\"font:500 12px/1.5 var(--font-body);color:var(--ink-500);\""+">"+S(T(function(){return (footNote)}))+"</span>"+"\n  "+"</main>"+"</div>";}});
(function(){function go(){FLDC.mount(document.getElementById("app"),"PartnerHub",{});}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",go);else go();})();
