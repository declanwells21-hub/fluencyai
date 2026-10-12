/* Fluency AI: remember a partner link.
   A visit to any page with ?ref=CODE (partner links open fluencyai.app/r/CODE, which redirects to /?ref=CODE)
   is stored in the browser, in the same form fluency-data.js reads (key "fl_ref", { code, at }), so the
   Store can pass the code on to Selar for 30 days. Local storage only; nothing is sent from here. */
(function () {
  try {
    var r = (new URLSearchParams(location.search).get("ref") || "").trim().toUpperCase();
    if (/^[A-Z0-9_-]{3,32}$/.test(r)) localStorage.setItem("fl_ref", JSON.stringify({ code: r, at: Date.now() }));
  } catch (e) { /* private mode: attribution is a nice-to-have, never break the page */ }
})();
