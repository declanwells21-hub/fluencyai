/* Form submit helper. Set window.FL_FORMS_ENDPOINT (or the <meta name="fl-forms-endpoint"> content) to a URL that accepts JSON POSTs
   (Formspree, Make/Zapier webhook, your own API). Until then submissions are kept in localStorage["fl_outbox"] so nothing is lost in testing.
   Payload: { type: "waitlist" | "partner", ref, page, at, ...fields }. Resolves { ok, queued }. */
(() => {
  window.flSubmit = async (type, fields) => {
    const meta = document.querySelector('meta[name="fl-forms-endpoint"]');
    const routes = (window.FL_CONFIG && window.FL_CONFIG.formsEndpoints) || {};
    const url = routes[type] || window.FL_FORMS_ENDPOINT || (window.FL_CONFIG && window.FL_CONFIG.formsEndpoint) || (meta && meta.content) || "";
    let ref = ""; try { ref = localStorage.getItem("fl_ref") || ""; } catch (e) {}
    const payload = { type, ref, page: location.pathname.split("/").pop(), at: new Date().toISOString(), ...fields };
    if (url) {
      try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) }); if (r.ok) return { ok: true, queued: false }; } catch (e) {}
    }
    try { const box = JSON.parse(localStorage.getItem("fl_outbox") || "[]"); box.push(payload); localStorage.setItem("fl_outbox", JSON.stringify(box.slice(-50))); } catch (e) {}
    return { ok: true, queued: true };
  };
})();
