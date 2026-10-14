/* Fluency AI: remember a partner link.
   A visit to any page with ?ref=CODE (partner links open fluencyai.app/r/CODE, which redirects to /?ref=CODE)
   is stored in the browser, in the same form fluency-data.js reads (key "fl_ref", { code, at }), so the
   Store can pass the code on to Selar for 30 days, and one click is reported to /api/referral so the partner
   sees it in their Partner Hub. Nothing about the visitor is sent, only the code. */
(function () {
  try {
    var r = (new URLSearchParams(location.search).get("ref") || "").trim().toUpperCase();
    if (/^[A-Z0-9_-]{3,32}$/.test(r)) {
      localStorage.setItem("fl_ref", JSON.stringify({ code: r, at: Date.now() }));
      // Count the visit for the partner's dashboard, once per browser tab session.
      try {
        if (!sessionStorage.getItem("fl_ref_clicked")) {
          sessionStorage.setItem("fl_ref_clicked", r);
          fetch("/api/referral", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "click", code: r }), keepalive: true }).catch(function () {});
        }
      } catch (e) { /* storage blocked: skip the click count */ }
    }
  } catch (e) { /* private mode: attribution is a nice-to-have, never break the page */ }
})();
