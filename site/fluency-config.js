/* Fluency: one place for every value the developer must set. Loaded before fl-forms.js / fluency-data.js on every web page.
   Everything marked REQUEST is an owner decision or account the owner has to supply. Empty string = not set yet. */
window.FL_CONFIG = {
  // ---- Brand / contact (SET) ----
  supportEmail: "support@fluencyai.app",
  siteUrl: "https://fluencyai.app",  // From the canonical tags already live. Client to confirm www / non-www.
  partnerLinkBase: "https://fluencyai.app/r/",   // REQUEST: confirm domain + redirect service for /r/CODE → site + ?ref=CODE

  // ---- Forms (waitlist + partner application) ----
  // Any endpoint that accepts JSON POST: Formspree, Make/Zapier webhook, or your own API.
  formsEndpoint: "",                 // Generic fallback. This project routes per type, see formsEndpoints.
  formsEndpoints: { waitlist: "/api/waitlist" },  // Partner applications are added when the Partners page is built.
  // Payload: { type: "waitlist"|"partner", ref, page, at, ...fields }

  // ---- Selar (guides) ----
  selarBase: "https://selar.com/",
  selarRefParam: "ref",              // query param appended to each Selar link; Selar must return it on the order (see HANDOFF.md §4)
  selarWebhookUrl: "",               // REQUEST: your server URL that receives Selar order notifications

  // ---- Partner programme (values shown on site; change here AND in Terms §11 + Partners page) ----
  commission: { guides: 0.2, subscriptions: 0.2, attributionDays: 30, payoutMinimumUSD: 20, refundHoldDays: 14, payoutDay: 15 },

  // ---- App / launch ----
  launchState: "waitlist",           // "waitlist" | "early_access" | "public_launch"  (also a Tweak on Fluency Home v3)
  appStoreUrl: "",                   // REQUEST: App Store listing
  playStoreUrl: "",                  // REQUEST: Google Play listing

  // ---- Analytics / cookies (none installed) ----
  analytics: { provider: "", id: "" }, // REQUEST: if used, add consent banner (see Privacy §7)

  // ---- Backend endpoints the app screens assume (from the DEV notes on screens 22, 45, 46) ----
  api: {
    base: "",                        // REQUEST: API base URL
    guideSsoLink: "/guides/sso-link",     // POST → one-time 60 s sign-in link to open a bought guide on the website
    entitlements: "/entitlements",        // GET  → plan, credits, bought guide ids
    partnerSummary: "/partner/summary",   // GET  → Partner hub data (sales, links, payouts)
  },
};
