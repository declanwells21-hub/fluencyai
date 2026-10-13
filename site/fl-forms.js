/* Form submit helper. Set window.FL_FORMS_ENDPOINT (or the <meta name="fl-forms-endpoint"> content) to a URL that accepts JSON POSTs
   (Formspree, Make/Zapier webhook, your own API). Until then submissions are kept in localStorage["fl_outbox"] so nothing is lost in testing.
   Payload: { type: "waitlist" | "partner", ref, page, at, ...fields }. Resolves { ok, queued }. */
(() => {
  window.flSubmit = async (type, fields) => {
    const meta = document.querySelector('meta[name="fl-forms-endpoint"]');
    const routes = (window.FL_CONFIG && window.FL_CONFIG.formsEndpoints) || {};
    const url = routes[type] || window.FL_FORMS_ENDPOINT || (window.FL_CONFIG && window.FL_CONFIG.formsEndpoint) || (meta && meta.content) || "";
    // The stored partner link is JSON like {"code":"ANNA","at":1700000000000}; send just the code, and ignore it after 30 days.
    let ref = ""; try { const raw = localStorage.getItem("fl_ref") || ""; try { const o = JSON.parse(raw) || {}; ref = (o.at && Date.now() - o.at > 30 * 864e5) ? "" : String(o.code || ""); } catch (e) { ref = raw; } } catch (e) {}
    let payload = { type, ref, page: location.pathname.split("/").pop(), at: new Date().toISOString(), ...fields };
    const tf = ((window.FL_CONFIG && window.FL_CONFIG.formsTransforms) || {})[type]; if (tf) { try { payload = tf(payload) || payload; } catch (e) {} }
    if (url) {
      try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) }); if (r.ok) return { ok: true, queued: false }; } catch (e) {}
    }
    try { const box = JSON.parse(localStorage.getItem("fl_outbox") || "[]"); box.push(payload); localStorage.setItem("fl_outbox", JSON.stringify(box.slice(-50))); } catch (e) {}
    return { ok: true, queued: true };
  };
})();
