/* PATCHED COPY for the Exam Blueprints sales page. Added to the original engine: moving legs (el.walkTo(on, dir)),
   a gentle weight shift at rest, and the states walk, read and stretch. Also added: a side-on (profile) body drawn in the same
   style (el.face("side", dir) / el.face("front")), running (el.runTo(on)) and sitting with swinging legs (el.sitOn(on)).
   The front-facing characters are unchanged.
   Human touches: the arm that is not in use rests folded and drifts slightly, foot tapping (el.tapTo(on)),
   and the states watch, laugh, surprise, clap and tuck.
   Fluency coaches — Dan & Mia. One self-contained web component.
   <fl-coach character="dan|mia" skin="1-6" hair="curls|short|bob|bun" hair-color="ink|brown|auburn" outfit="casual|doctor|business|waiter" state="idle"></fl-coach>
   el.play(state) · el.sequence([[state, ms], …]) · el.setSpeech(0..1) · el.speak(text, {lang, rate, then}) · el.lookAt(x, y) · el.blink()
   States: idle outfit talk listen think happy confused cantHear sad excited wave encourage */
(() => {
  if (customElements.get("fl-coach")) return;
  const V = (v, f) => `var(--${v},${f})`;
  const K = {
    ink: V("ink-900", "#0B2233"), ink8: V("ink-800", "#153345"), mouth: V("ink-950", "#04121B"), ink2: V("ink-200", "#D8E4EA"), ink1: V("ink-100", "#EDF3F6"),
    teal: V("teal-500", "#10B8B8"), teal4: V("teal-400", "#22CFCB"), teal7: V("teal-700", "#0E7B7E"), mint: V("mint-400", "#25D79B"), mint1: V("mint-100", "#C2F7E4"), mint2: V("mint-200", "#8CEECB"),
    indigo: V("indigo-500", "#5B55B8"), coral: V("coral-400", "#FF6A6A"), amber: V("amber-400", "#F7B23B"), white: "#fff",
  };
  const SKINS = [["#F3CDB0", "#DDAE8D"], ["#E3AE87", "#CB9068"], ["#C98B62", "#B0744D"], ["#9C6A47", "#835537"], ["#7A4B2E", "#643C23"], ["#5A3520", "#47291A"]];
  const HAIRC = { ink: K.ink, brown: "#5B3A26", auburn: "#8A3F24" };
  const OUTFIT = {
    casual: { top: K.teal, sleeve: K.teal, trim: K.teal7, legs: K.ink8, shoe: "#fff" },
    doctor: { top: "#fff", sleeve: "#fff", trim: K.ink2, legs: K.ink8, shoe: K.ink8 },
    business: { top: K.ink8, sleeve: K.ink8, trim: K.mouth, legs: K.ink8, shoe: K.mouth },
    waiter: { top: "#fff", sleeve: "#fff", trim: K.ink2, legs: K.mouth, shoe: K.mouth },
  };
  const outfitDetail = (o) => ({
    casual: `<path d="M130,200 L150,238 L170,200 Z" fill="${K.mint1}"/><path d="M130,200 L150,238 M170,200 L150,238 M150,238 L150,312" stroke="${K.teal7}" stroke-width="4" stroke-linecap="round"/><rect x="94" y="310" width="112" height="16" rx="8" fill="${K.teal7}"/>`,
    doctor: `<path d="M128,200 L150,250 L172,200 Z" fill="${K.mint2}"/><path d="M128,200 L146,262 L146,326 M172,200 L154,262 L154,326" stroke="${K.ink2}" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path d="M134,206 C126,240 134,262 150,264 C166,262 174,240 166,206" stroke="${K.ink8}" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="150" cy="268" r="7" fill="${K.teal}" stroke="${K.ink8}" stroke-width="3"/>
      <rect x="168" y="276" width="22" height="18" rx="4" fill="${K.ink1}"/><path d="M174,276 v-6" stroke="${K.teal}" stroke-width="4" stroke-linecap="round"/>`,
    business: `<path d="M130,200 L150,246 L170,200 Z" fill="#fff"/><path d="M146,206 L154,206 L157,236 L150,248 L143,236 Z" fill="${K.teal}"/><path d="M130,200 L150,262 L170,200" stroke="${K.mouth}" stroke-width="4" fill="none" stroke-linejoin="round"/><circle cx="150" cy="284" r="4" fill="${K.mouth}"/>`,
    waiter: `<path d="M130,200 L150,226 L170,200 Z" fill="${K.ink2}"/><path d="M142,206 L150,214 L158,206 L158,222 L150,214 L142,222 Z" fill="${K.mouth}"/><path d="M112,250 L188,250 L192,346 L108,346 Z" fill="${K.mouth}"/><path d="M120,250 L126,206 M180,250 L174,206" stroke="${K.mouth}" stroke-width="5" stroke-linecap="round"/><rect x="128" y="270" width="44" height="20" rx="4" fill="${K.ink8}"/>`,
  }[o] || "");
  const hairBack = (h, c) => h === "bob" ? `<path d="M70,128 C66,58 108,26 150,26 C194,26 236,58 230,128 L234,196 C234,208 222,212 212,208 L202,202 L202,140 L98,140 L98,202 L88,208 C78,212 66,208 66,196 Z" fill="${c}"/>`
    : h === "bun" ? `<circle cx="150" cy="30" r="30" fill="${c}"/>` : "";
  const hairFront = (h, c) => ({
    curls: `<path d="M80,118 C74,62 112,34 150,34 C190,34 228,60 222,118 C214,98 202,88 186,84 C172,96 146,98 120,90 C104,96 90,106 80,118 Z" fill="${c}"/>
      <circle cx="104" cy="62" r="20" fill="${c}"/><circle cx="132" cy="44" r="22" fill="${c}"/><circle cx="166" cy="42" r="22" fill="${c}"/><circle cx="196" cy="58" r="20" fill="${c}"/>
      <path d="M138,30 C156,24 176,30 184,46 C168,44 152,48 140,58 C132,48 132,36 138,30 Z" fill="${K.teal4}"/>`,
    short: `<path d="M78,112 C76,66 108,42 150,42 C192,42 224,66 222,112 C218,98 210,86 200,80 L100,80 C90,86 82,98 78,112 Z" fill="${c}"/><path d="M96,82 C100,56 126,44 150,44 C176,44 200,56 204,82 Z" fill="${c}"/>
      <path d="M150,44 C170,44 188,52 196,66 C178,62 162,64 148,72 C142,62 142,50 150,44 Z" fill="${K.teal4}"/>`,
    bob: `<path d="M76,116 C78,60 114,36 150,36 C188,36 222,60 224,116 C206,96 184,86 158,88 C134,78 102,88 76,116 Z" fill="${c}"/>
      <path d="M120,44 C138,40 156,46 166,62 C150,58 134,60 118,70 C112,60 112,50 120,44 Z" fill="${K.teal4}"/>
      <path d="M188,62 a12,10 0 1 1 8,16 l-6,8 l0,-9 a12,10 0 0 1 -2,-15 Z" fill="${K.mint}"/>`,
    bun: `<path d="M78,110 C76,62 110,40 150,40 C190,40 224,62 222,110 C210,88 188,76 150,78 C112,76 90,88 78,110 Z" fill="${c}"/><rect x="128" y="50" width="44" height="10" rx="5" fill="${K.teal4}"/>`,
  }[h] || "");

  const FING = {
    relax: ["M-6.5,16 L-7.5,25", "M-2.2,18 L-2.6,28", "M2.2,18 L2.6,28", "M6.5,16 L7.5,24", "M-9,6 L-15,14"],
    open: ["M-6.5,16 L-12.5,29", "M-2.2,18 L-4,33", "M2.2,18 L4,33", "M6.5,16 L11.5,28", "M-9,7 L-20,9"],
    point: ["M-6.5,16 L-6.5,21", "M2.2,18 L3,22", "M6.5,16 L7,20", "M-2.2,18 L-3,37", "M-9,7 L-14,15"],
    thumb: ["M-6,15 L-6,19", "M-2,16 L-2,20", "M2,16 L2,20", "M6,15 L6,19", "M-9,9 L-9.5,28"],
    scratch: ["M-6.5,16 Q-10,23 -6,28", "M-2.2,18 Q-4.5,26 -0.5,30", "M2.2,18 Q2.5,26 5.5,28", "M6.5,16 Q9,22 8.5,26", "M-9,6 L-14,12"],
    cup: ["M-6.5,16 L-8,30", "M-2.2,18 L-2.6,33", "M2.2,18 L2.8,33", "M6.5,16 L8,29", "M-9,7 L-16,13"],
    fist: ["M-6.5,15 L-6.5,18", "M-2.2,16 L-2.2,19", "M2.2,16 L2.2,19", "M6.5,15 L6.5,18", "M-9,8 L-5,15"],
  };
  const hand = (s, sk, leg) => `<g data-p="h${s}-pocket" style="display:none"><path d="M-16,-3 Q0,3 16,-3 L15,13 Q0,16 -15,13 Z" fill="${leg}"/><path d="M-16,-3 Q0,3 16,-3" stroke="rgba(4,18,27,.35)" stroke-width="2.5" fill="none" stroke-linecap="round"/><ellipse cx="${s === "L" ? -11 : -11}" cy="0" rx="4.5" ry="6" fill="${sk[0]}"/></g>` + Object.entries(FING).map(([k, fs]) => `<g data-p="h${s}-${k}" style="display:${k === "relax" ? "" : "none"}">${fs.map((d) => `<path d="${d}" stroke="${sk[1]}" stroke-width="7.4" stroke-linecap="round" fill="none"/><path d="${d}" stroke="${sk[0]}" stroke-width="5.2" stroke-linecap="round" fill="none"/>`).join("")}<ellipse cx="0" cy="${k === "thumb" ? 10 : 10.5}" rx="${k === "thumb" ? 11.5 : 10.5}" ry="${k === "thumb" ? 10 : 11}" fill="${sk[0]}"/>${k === "thumb" ? `<path d="M-5,15 h11" stroke="${sk[1]}" stroke-width="2.4" stroke-linecap="round"/>` : ""}</g>`).join("");
  const SIDE = (o) => {
    const sk = o.sk, hc = o.hc, of = o.of, id = o.id + "s";
    const sleeveF = of.sleeve === K.teal ? K.teal7 : of.sleeve;
    const hairB = o.hair === "bob" ? `<path d="M100,112 C88,150 92,184 110,196 C124,206 136,200 140,188 L142,120 Z" fill="${hc}"/>` : "";
    const hairF = ({
      curls: `<path d="M92,116 C86,62 118,34 154,34 C188,34 208,58 208,94 C198,82 186,78 172,78 C150,92 122,92 102,104 Z" fill="${hc}"/><circle cx="104" cy="66" r="20" fill="${hc}"/><circle cx="132" cy="46" r="22" fill="${hc}"/><circle cx="166" cy="44" r="22" fill="${hc}"/><circle cx="194" cy="62" r="18" fill="${hc}"/><circle cx="96" cy="94" r="15" fill="${hc}"/><path d="M142,32 C160,26 180,34 188,50 C172,46 156,50 144,62 C136,52 136,40 142,32 Z" fill="${K.teal4}"/>`,
      short: `<path d="M92,116 C88,66 120,42 156,42 C190,42 210,62 208,94 C200,84 188,80 174,80 C150,86 122,88 100,104 Z" fill="${hc}"/><path d="M150,42 C170,42 190,52 198,66 C180,62 164,64 150,72 C144,62 144,50 150,42 Z" fill="${K.teal4}"/>`,
      bob: `<path d="M92,116 C90,60 122,34 156,34 C190,34 210,58 208,96 C198,86 184,82 166,84 C140,78 112,88 92,116 Z" fill="${hc}"/><path d="M168,60 C190,64 206,76 208,96 C196,88 184,86 170,88 Z" fill="${hc}"/><path d="M122,42 C140,38 158,44 168,60 C152,56 136,58 120,68 C114,58 114,48 122,42 Z" fill="${K.teal4}"/><path d="M122,68 a11,9 0 1 1 7,14 l-5,7 l0,-8 a11,9 0 0 1 -2,-13 Z" fill="${K.mint}"/>`,
      bun: `<circle cx="112" cy="46" r="26" fill="${hc}"/><path d="M92,112 C90,64 120,40 156,40 C190,40 210,60 208,94 C198,84 186,80 172,80 C148,84 122,88 100,104 Z" fill="${hc}"/><rect x="132" y="48" width="40" height="9" rx="4.5" fill="${K.teal4}"/>`,
    })[o.hair] || "";
    const arm = (s, col) => `<g data-p="s_arm${s}"><path d="M150,222 L150,268" stroke="${col}" stroke-width="26" stroke-linecap="round" fill="none"/>
        <g data-p="s_elb${s}"><path d="M150,268 L150,314" stroke="${col}" stroke-width="26" stroke-linecap="round" fill="none"/><ellipse cx="151" cy="326" rx="11" ry="12.5" fill="${sk[0]}"/><ellipse cx="160" cy="320" rx="4.5" ry="7.5" fill="${sk[0]}" transform="rotate(-24,160,320)"/></g></g>`;
    const leg = (s) => `<g data-p="s_leg${s}"><rect x="136" y="300" width="28" height="58" rx="14" fill="${of.legs}"/>
        <g data-p="s_knee${s}"><rect x="136" y="342" width="28" height="58" rx="14" fill="${of.legs}"/>
          <g data-p="s_shoe${s}"><rect x="132" y="384" width="52" height="22" rx="11" fill="${of.shoe}"/><rect x="132" y="398" width="52" height="8" rx="4" fill="${K.ink2}"/></g></g></g>`;
    return `<g data-p="sideRoot" style="display:none">
      <defs><clipPath id="${id}E"><ellipse cx="178" cy="122" rx="13" ry="17"/></clipPath></defs>
      ${leg("F")}${leg("N")}
      <g data-p="s_body">
        ${arm("F", sleeveF)}
        <g data-p="s_torso">
          <path d="M110,222 C110,208 124,200 140,200 L160,200 C176,200 190,208 190,222 L192,312 C192,320 186,326 178,326 L122,326 C114,326 108,320 108,312 Z" fill="${of.top}"/>
          <path d="M182,208 L182,314" stroke="${K.teal7}" stroke-width="4" stroke-linecap="round"/>
          <path d="M150,200 L174,226 L182,206" stroke="${K.teal7}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <rect x="108" y="310" width="84" height="16" rx="8" fill="${K.teal7}"/>
        </g>
        <rect x="138" y="182" width="26" height="30" fill="${sk[1]}"/>
        <g data-p="s_head">
          ${hairB}
          <ellipse cx="150" cy="120" rx="62" ry="72" fill="${sk[0]}"/><ellipse cx="170" cy="134" rx="38" ry="50" fill="${sk[0]}"/><ellipse cx="180" cy="170" rx="24" ry="15" fill="${sk[0]}"/><circle cx="207" cy="137" r="9" fill="${sk[0]}"/>
          <circle cx="108" cy="130" r="13" fill="${sk[0]}"/><circle cx="108" cy="130" r="6" fill="${sk[1]}"/>
          <ellipse cx="166" cy="153" rx="9" ry="5" fill="${K.coral}" opacity=".3"/>
          <g clip-path="url(#${id}E)"><ellipse cx="178" cy="122" rx="13" ry="17" fill="#fff"/>
            <g data-p="s_pup"><g transform="translate(182,124)"><circle r="9.4" fill="${K.ink}"/><circle r="5.4" fill="${K.mouth}"/><circle cx="-3.3" cy="-3.9" r="3.3" fill="#fff"/><circle cx="3" cy="3.3" r="1.5" fill="#fff"/></g></g>
            <g data-p="s_lid"><rect x="160" y="70" width="40" height="42" fill="${sk[0]}"/><path d="M162,112 Q178,117 196,112" stroke="${sk[1]}" stroke-width="3" fill="none"/></g></g>
          ${o.lash ? `<g data-p="s_lash"><path d="M190,113 l7,-5 M186,107 l4,-8" stroke="${K.ink}" stroke-width="3.6" stroke-linecap="round"/></g>` : ""}
          <g data-p="s_brow"><path d="M-13,2 Q0,-5 13,2" stroke="${hc}" stroke-width="7" stroke-linecap="round" fill="none"/></g>
          <path data-p="s_mline" stroke="${K.ink}" stroke-width="5" stroke-linecap="round" fill="none"/>
          <ellipse data-p="s_mfill" cx="190" cy="165" rx="9" ry="4" fill="${K.mouth}" style="display:none"/>
          ${hairF}
        </g>
        ${arm("N", of.sleeve)}
      </g>
    </g>`;
  };
  const SVG = (o) => `<svg viewBox="${o.vb}" preserveAspectRatio="xMidYMax meet" overflow="visible" aria-hidden="true">
    <defs>
      <clipPath id="${o.id}eL"><ellipse cx="122" cy="128" rx="15" ry="18"/></clipPath>
      <clipPath id="${o.id}eR"><ellipse cx="178" cy="128" rx="15" ry="18"/></clipPath>
      <clipPath id="${o.id}m"><path data-p="mclip"/></clipPath>
    </defs>
    <ellipse data-p="shadow" cx="150" cy="406" rx="70" ry="9" fill="${K.ink}" opacity=".12"/>
    <g data-p="stage"><g data-p="root">
      <g data-p="legL"><rect x="118" y="300" width="28" height="94" rx="14" fill="${o.of.legs}"/><rect x="104" y="384" width="46" height="22" rx="11" fill="${o.of.shoe}"/><rect x="104" y="398" width="46" height="8" rx="4" fill="${K.ink2}"/></g>
      <g data-p="legR"><rect x="154" y="300" width="28" height="94" rx="14" fill="${o.of.legs}"/><rect x="150" y="384" width="46" height="22" rx="11" fill="${o.of.shoe}"/><rect x="150" y="398" width="46" height="8" rx="4" fill="${K.ink2}"/></g>
      <g data-p="upper">
        <path d="M100,222 C100,208 112,200 126,200 L174,200 C188,200 200,208 200,222 L206,312 C206,320 200,326 192,326 L108,326 C100,326 94,320 94,312 Z" fill="${o.of.top}"/>
        ${o.of.top === "#fff" ? `<path d="M100,222 C100,208 112,200 126,200 L174,200 C188,200 200,208 200,222 L206,312 C206,320 200,326 192,326 L108,326 C100,326 94,320 94,312 Z" fill="none" stroke="${K.ink2}" stroke-width="3"/>` : ""}
        ${outfitDetail(o.outfit)}
        <g data-p="head">
          ${hairBack(o.hair, o.hc)}
          <rect x="138" y="182" width="24" height="26" fill="${o.sk[1]}"/>
          <circle cx="78" cy="128" r="13" fill="${o.sk[0]}"/><circle cx="222" cy="128" r="13" fill="${o.sk[0]}"/>
          <circle cx="78" cy="128" r="6" fill="${o.sk[1]}"/><circle cx="222" cy="128" r="6" fill="${o.sk[1]}"/>
          <ellipse cx="150" cy="120" rx="72" ry="76" fill="${o.sk[0]}"/>
          ${hairFront(o.hair, o.hc)}
          <ellipse cx="114" cy="156" rx="9" ry="5" fill="${K.coral}" opacity=".3"/><ellipse cx="186" cy="156" rx="9" ry="5" fill="${K.coral}" opacity=".3"/>
          ${["L", "R"].map((s) => { const x = s === "L" ? 122 : 178; return `
          <g clip-path="url(#${o.id}e${s})">
            <ellipse cx="${x}" cy="128" rx="15" ry="18" fill="#fff"/>
            <g data-p="pup${s}"><g transform="translate(${x},130)"><circle r="9.4" fill="${K.ink}"/><circle r="5.4" fill="${K.mouth}"/><circle cx="-3.3" cy="-3.9" r="3.3" fill="#fff"/><circle cx="3" cy="3.3" r="1.5" fill="#fff"/></g></g>
            <ellipse data-p="low${s}" cx="${x}" cy="165" rx="24" ry="20" fill="${o.sk[0]}"/>
            <g data-p="lid${s}"><rect x="${x - 17}" y="76" width="34" height="38" fill="${o.sk[0]}"/><path d="M${x - 17},112 Q${x},116 ${x + 17},112" stroke="${o.sk[1]}" stroke-width="3" fill="none"/></g>
          </g>
          ${o.lash ? `<g data-p="lash${s}"><path d="M${x + (s === "L" ? -12 : 12)},${117} l${s === "L" ? -7 : 7},-6 M${x + (s === "L" ? -7 : 7)},${112} l${s === "L" ? -4 : 4},-8" stroke="${K.ink}" stroke-width="3.6" stroke-linecap="round"/></g>` : ""}
          <g data-p="brow${s}"><path d="M-14,2 Q0,-5 14,2" stroke="${o.hc}" stroke-width="7" stroke-linecap="round" fill="none"/></g>`; }).join("")}
          <path d="M146,146 Q150,154 156,146" stroke="${o.sk[1]}" stroke-width="5" stroke-linecap="round" fill="none"/>
          <path data-p="mfill" fill="${K.mouth}"/>
          <g clip-path="url(#${o.id}m)"><rect data-p="teeth" x="120" y="150" width="60" height="9" fill="#fff"/><ellipse data-p="tongue" cx="150" cy="182" rx="11" ry="6" fill="${K.coral}"/></g>
          <path data-p="mline" stroke="${K.ink}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" fill="none"/>
        </g>
        ${["L", "R"].map((s) => `<path data-p="arm${s}" stroke="${o.of.sleeve}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          
          <g data-p="hand${s}">${hand(s, o.sk, o.of.legs)}</g>`).join("")}
      </g>
    </g>
    ${SIDE(o)}</g>
  </svg>`;

  const R = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
  const TEMPO = { fast: [480, 0.64], med: [170, 0.74], slow: [52, 0.9] };
  const BASE = { ry: 0, rsx: 1, rsy: 1, zoom: 1, lean: 0, bob: 0, hr: 0, hx: 0, hy: 0, lx: 0, ly: 0, lid: 0, smile: 0, curve: .5, open: 0, blY: 0, blR: 0, brY: 0, brR: 0, aL: 17, eL: 112, aR: 17, eR: 112 };
  const ARMS = {
    rest: { aL: 8, eL: 10, aR: 8, eR: 10 }, pocket: { aL: 7, eL: 16, aR: 7, eR: 16 }, clasp: { aL: 17, eL: 112, aR: 17, eR: 112 }, hold: { aL: 14, eL: 96, aR: 9, eR: 22 }, open: { aL: 24, eL: -24, aR: 24, eR: -24, hL: "open", hR: "open" },
    thinkR: { aR: 14, eR: 168, hR: "point" }, thinkL: { aL: -20, eL: 74 },
    palmR: { aR: 28, eR: -80, hR: "open" }, palmL: { aL: 28, eL: -80, hL: "open" }, spread: { aL: 32, eL: -70, aR: 32, eR: -70, hL: "open", hR: "open" },
    chestR: { aR: 10, eR: 118, hR: "cup" }, countR: { aR: 20, eR: -150, hR: "point" }, headR: { aR: 156, eR: -14, hR: "scratch" },
    thumbR: { aR: 18, eR: -150, hR: "thumb" }, up: { aL: 155, eL: -12, aR: 155, eR: -12, hL: "open", hR: "open" }, waveR: { aR: 128, eR: -45, hR: "open" },
    frontL: { aL: 20, eL: 96, hL: "open" }, frontR: { aR: 20, eR: 96, hR: "open" }, sideL: { aL: 32, eL: -66, hL: "open" }, sideR: { aR: 32, eR: -66, hR: "open" },
    shrug: { aL: 22, eL: -64, aR: 22, eR: -64, hL: "open", hR: "open" }, stretch: { aL: 168, eL: -2, aR: 168, eR: -2, hL: "open", hR: "open" },
    pump: { aL: 26, eL: -118, aR: 26, eR: -118, hL: "fist", hR: "fist" },
    earR: { aR: 130, eR: -50, hR: "cup" },
  };
  const STATES = {
    idle: { tempo: "slow", pose: { ...ARMS.clasp, curve: .55 }, gap: [1800, 3600], beats: [
      () => { const sd = pick([-1, 1]); return { ms: R(1600, 2600), p: { ...ARMS.clasp, lean: sd * 1.4, hr: -sd * 2, hx: sd * 1.5, lx: sd * 3 } }; },
      () => ({ ms: R(1800, 2800), p: { ...ARMS.pocket, ly: R(-1, 1) } }),
      () => ({ ms: R(1400, 2200), p: { ...ARMS.hold, hL: "relax", hr: 2 } }),
      () => ({ ms: 700, p: { aR: 22, eR: 74, hR: "open", aL: 17, eL: 112, hr: -2, brY: -3 }, then: { ms: R(900, 1300), p: { aR: 20, eR: 82, hR: "open", aL: 17, eL: 112 } } }),
      () => ({ ms: R(1200, 2000), p: { ...ARMS.chestR, aL: 10, eL: 30, ly: -1, curve: .7 } }),
    ] },
    talk: { tempo: "med", pose: { aL: 12, eL: 40, aR: 12, eR: 40, blY: -2, brY: -2, curve: .45 }, gap: [250, 700], talk: true, gest: true, beats: [
      () => ({ ms: 520, p: { ...ARMS.sideR, ...ARMS.frontL, hr: -3, hx: 2, lean: 1, brY: -5 }, then: { ms: R(500, 800), p: { ...ARMS.sideR, ...ARMS.frontL, aR: 36, eR: -58, hr: -3, hx: 2, lean: 1 } } }),
      () => ({ ms: 520, p: { ...ARMS.sideL, ...ARMS.frontR, hr: 3, hx: -2, lean: -1, blY: -5 }, then: { ms: R(500, 800), p: { ...ARMS.sideL, ...ARMS.frontR, aL: 36, eL: -58, hr: 3, hx: -2, lean: -1 } } }),
      () => ({ ms: 480, p: { ...ARMS.frontL, ...ARMS.frontR, hy: 2 }, then: { ms: 560, p: { ...ARMS.sideL, ...ARMS.sideR, blY: -6, brY: -6, lean: 1 }, then: { ms: R(400, 700), p: { ...ARMS.sideL, ...ARMS.sideR, aL: 28, aR: 28 } } } }),
      () => ({ ms: 460, p: { ...ARMS.countR, aL: 14, eL: 50, hr: 4, brY: -6 }, then: { ms: 300, p: { ...ARMS.countR, aR: 24, aL: 14, eL: 50, hr: 4 }, then: { ms: 300, p: { ...ARMS.countR, aL: 14, eL: 50, hr: 4 } } } }),
      () => ({ ms: 500, p: { ...ARMS.chestR, ...ARMS.sideL, hy: 2, curve: .7 }, then: { ms: R(500, 800), p: { ...ARMS.chestR, ...ARMS.sideL } } }),
      () => ({ ms: R(700, 1100), p: { aL: 12, eL: 40, aR: 12, eR: 40 } }),
    ] },
    listen: { tempo: "slow", pose: { aL: 12, eL: 106, aR: 13, eR: 98, hr: 4, hx: 2, lean: -1, blY: -4, brY: -4, smile: .34, curve: .95, open: .08, ly: -1 }, gap: [700, 1600], beats: [
      () => ({ ms: 520, p: { hy: 3, hr: 5 }, then: { ms: 520, p: { hy: 0, hr: 4 }, then: { ms: 520, p: { hy: 3, hr: 5 }, then: { ms: 640, p: { hy: 0 } } } } }),
      () => ({ ms: 420, p: { smile: .55, open: .32, curve: 1, hy: -2, blY: -7, brY: -7, lean: -2 }, tempo: "med", then: { ms: R(700, 1000), p: { smile: .5, open: .22, curve: 1, hy: 2, blY: -6, brY: -6 }, then: { ms: 600, p: { hy: 0 } } } }),
      () => ({ ms: R(1600, 2200), p: { zoom: 1.03, lean: 1.5, hr: 6, hy: 2 }, then: { ms: 700, p: { zoom: 1.03, lean: 1.5, hr: 6, hy: 5 }, then: { ms: 800, p: { zoom: 1.02, hr: 5, hy: 1 } } } }),
      () => { const s = pick([-1, 1]); return { ms: R(1200, 1800), p: { hr: s * 3 + 3, lx: s, aL: 14, aR: 15 } }; },
    ] },
    think: { tempo: "slow", pose: { ...ARMS.thinkR, ...ARMS.thinkL, hr: 6, hy: 4, hx: 2, lx: 4, ly: -5, blY: -2, brY: -9, brR: 7, curve: .05 }, gap: [1600, 3000], beats: [
      () => ({ ms: R(1800, 2600), p: { lx: -4, ly: -5, hr: 3, blY: -8, blR: -6, brY: -2, brR: 0 } }),
      () => ({ ms: 320, p: { eR: 160 }, tempo: "med", then: { ms: 320, p: { eR: 170 }, tempo: "med", then: { ms: 320, p: { eR: 160 }, tempo: "med", then: { ms: 320, p: { eR: 168 }, tempo: "med" } } } }),
      () => ({ ms: R(1200, 1800), p: { lx: 5, ly: -2, hr: 8, curve: -.15 } }),
    ] },
    outfit: { tempo: "slow", pose: { ...ARMS.pocket, hy: 5, hr: -5, hx: -1, lx: -2, ly: 6, blY: 2, blR: 7, brY: 2, brR: -7, curve: .3, smile: .08 }, gap: [900, 1800], beats: [
      () => ({ ms: 700, p: { aR: 30, eR: 150, hR: "cup", aL: 7, eL: 16, hL: "relax", hy: 6, hr: 4, lx: 4, ly: 6, blY: 2, blR: 7, brY: 2, brR: -7, curve: .25 }, then: { ms: 260, p: { aR: 34, eR: 142, hR: "cup", aL: 7, eL: 16, hL: "relax", hy: 6, hr: 4, lx: 4, ly: 6, blY: 2, blR: 7, brY: 2, brR: -7 }, tempo: "med", then: { ms: 260, p: { aR: 29, eR: 152, hR: "cup", aL: 7, eL: 16, hL: "relax", hy: 6, hr: 4, lx: 4, ly: 6, blY: 2, blR: 7, brY: 2, brR: -7 }, tempo: "med", then: { ms: R(700, 1000), p: { aR: 30, eR: 148, hR: "cup", aL: 7, eL: 16, hL: "relax", hy: 5, hr: 3, lx: 3, ly: 5, blY: 2, blR: 7, brY: 2, brR: -7, smile: .2, curve: .6 } } } } }),
      () => ({ ms: 700, p: { aL: 8, eL: 104, hL: "open", aR: 7, eR: 16, hR: "relax", hy: 7, hr: -4, lx: -3, ly: 6, blY: 2, blR: 7, brY: 2, brR: -7 }, then: { ms: 900, p: { aL: 2, eL: 70, hL: "open", aR: 7, eR: 16, hR: "relax", hy: 7, hr: -5, lx: -3, ly: 6, blY: 2, blR: 7, brY: 2, brR: -7 }, then: { ms: 700, p: { aL: 8, eL: 104, hL: "open", aR: 7, eR: 16, hR: "relax", hy: 6, hr: -4, lx: -2, ly: 6, blY: 2, blR: 7, brY: 2, brR: -7 } } } }),
      () => ({ ms: 650, p: { aL: 14, eL: 116, hL: "cup", aR: 7, eR: 16, hR: "relax", hy: 4, hr: -7, lx: -5, ly: 3, blY: 2, blR: 7, brY: 2, brR: -7 }, then: { ms: 240, p: { aL: 16, eL: 108, hL: "cup", aR: 7, eR: 16, hR: "relax", hy: 4, hr: -7, lx: -5, ly: 3 }, tempo: "med", then: { ms: R(800, 1100), p: { aL: 14, eL: 114, hL: "cup", aR: 7, eR: 16, hR: "relax", hy: 4, hr: -7, lx: -5, ly: 3, smile: .15 } } } }),
      () => { const d = pick([-1, 1]); return { ms: R(1200, 1700), p: { bkL: 1, bkR: 1, aL: 14, eL: 84, aR: 14, eR: 84, lean: d * 2, hr: d * 6, hx: d * 2, hy: 5, lx: d * 5, ly: 5, blY: 2, blR: 7, brY: 2, brR: -7 } }; },
    ] },
    happy: { tempo: "med", pose: { ...ARMS.open, smile: .5, curve: 1, open: .55, blY: -6, brY: -6, ly: -1 }, gap: [1000, 2000], beats: [
      () => ({ ms: 160, p: { rsy: .92, rsx: 1.05, ry: 3, aL: 20, eL: 10, aR: 20, eR: 10, smile: .8 }, tempo: "fast", then: { ms: 260, p: { ...ARMS.stretch, ry: -26, rsy: 1.05, rsx: .97, lid: .62, smile: 1, open: .9, hy: -3, blY: -9, brY: -9 }, tempo: "fast", then: { ms: 220, p: { ...ARMS.stretch, aL: 158, aR: 158, ry: 0, rsy: .93, rsx: 1.05, lid: .62, smile: 1, open: .8 }, tempo: "fast", then: { ms: 420, p: { ...ARMS.open, ry: 0 } } } } }),
      () => ({ ms: 170, p: { ry: -10, rsy: 1.03 }, tempo: "fast", then: { ms: 200, p: { ry: 0, rsy: .96, rsx: 1.03 }, tempo: "fast" } }),
      () => { const s = pick([-1, 1]); return { ms: R(700, 1100), p: { hr: s * 5, lean: s } }; },
    ] },
    confused: { tempo: "med", pose: { aL: 10, eL: 24, aR: 10, eR: 24, hr: -5, blY: -9, blR: -12, brY: 3, brR: 10, curve: -.25, open: .06 }, gap: [500, 1100], beats: [
      () => ({ ms: R(900, 1300), p: { lx: -5, ly: -1, hr: -9, hx: -4 }, then: { ms: R(900, 1300), p: { lx: 5, ly: -1, hr: 5, hx: 3, blY: 2, blR: 8, brY: -9, brR: -10 } } }),
      () => ({ ms: 380, p: { ...ARMS.shrug, hy: -4, bob: -3, open: .14, curve: -.4, blY: -10, brY: -10 }, then: { ms: R(700, 1000), p: { ...ARMS.shrug, aL: 26, aR: 26, hy: -4, bob: -3, open: .14, curve: -.4, blY: -10, brY: -10 }, then: { ms: 500, p: {} } } }),
      () => ({ ms: 420, p: { ...ARMS.frontR, aR: 24, eR: 120, hR: "cup", aL: 10, eL: 24, ly: 2, hr: -3 }, then: { ms: R(900, 1300), p: { aR: 22, eR: 124, hR: "cup", lx: -3, ly: 3 } } }),
      () => ({ ms: 460, p: { ...ARMS.headR, hr: -8, lx: -3, ly: -2 }, then: { ms: R(900, 1200), p: { ...ARMS.headR, hr: -8, lx: 3, ly: -3, scratch: 1 }, then: { ms: 520, p: {} } } }),
    ] },
    cantHear: { tempo: "med", pose: { ...ARMS.earR, hr: 8, hx: 3, lean: 2, lx: 4, blY: -4, blR: -12, brY: -4, brR: 12, curve: -.5, open: .06 }, gap: [1000, 2000], beats: [
      () => ({ ms: R(1400, 2000), p: { zoom: 1.03, hr: 11, hx: 5, lean: 3, lx: 5 }, tempo: "slow" }),
      () => ({ ms: R(1200, 1600), p: { lx: 0, ly: 1, hr: 3, blR: -17, brR: 17, curve: -.7 } }),
      () => ({ ms: 260, p: { hr: 4 }, then: { ms: 260, p: { hr: 11 }, then: { ms: 300, p: { hr: 6 } } } }),
    ] },
    sad: { tempo: "slow", pose: { aL: 3, eL: 4, aR: 3, eR: 4, hr: -3, hy: 9, lean: -2, blY: -1, blR: -16, brY: -1, brR: 16, lid: .34, ly: 3, curve: -.8, rsy: .985 }, gap: [2600, 4200], beats: [
      () => ({ ms: 1000, p: { rsy: 1.01, hy: 4 }, then: { ms: 1600, p: { rsy: .975, hy: 12 } } }),
      () => ({ ms: R(1800, 2400), p: { lx: -3, ly: 4, hr: -6 } }),
    ] },
    excited: { tempo: "fast", pose: { ...ARMS.pump, smile: 1, lid: .62, curve: 1, open: .8, blY: -9, brY: -9 }, gap: [180, 420], beats: [
      () => ({ ms: 150, p: { rsy: .9, rsx: 1.06, ry: 3, aL: 24, eL: 12, aR: 24, eR: 12, hL: "fist", hR: "fist" }, then: { ms: 260, p: { ...ARMS.stretch, ry: -36, rsy: 1.06, rsx: .96, hy: -4, open: 1 }, then: { ms: 220, p: { ...ARMS.stretch, aL: 160, aR: 160, ry: 0, rsy: .92, rsx: 1.06 }, then: { ms: 200, p: { ...ARMS.pump } } } } }),
      () => ({ ms: 150, p: { ...ARMS.pump, aR: 40, eR: -128, hr: 4, ry: -4 }, then: { ms: 150, p: { ...ARMS.pump, aL: 40, eL: -128, hr: -4, ry: 0 }, then: { ms: 150, p: { ...ARMS.pump, aR: 40, eR: -128, hr: 4, ry: -4 }, then: { ms: 170, p: { ...ARMS.pump } } } } }),
      () => { const s = pick([-1, 1]); return { ms: 200, p: { ...ARMS.pump, lean: s * 4, hr: s * 7, rsx: 1.02 }, then: { ms: 200, p: { ...ARMS.pump, lean: -s * 4, hr: -s * 7 }, then: { ms: 220, p: { ...ARMS.pump } } } }; },
    ] },
    wave: { tempo: "med", pose: { ...ARMS.waveR, smile: .35, curve: .9, open: .3, blY: -5, brY: -5, hr: -4 }, gap: [600, 1200], talk: "hi", beats: [
      () => ({ ms: 180, p: { eR: -20 }, tempo: "fast", then: { ms: 180, p: { eR: -62 }, tempo: "fast", then: { ms: 180, p: { eR: -20 }, tempo: "fast", then: { ms: 180, p: { eR: -62 }, tempo: "fast" } } } }),
    ] },
    encourage: { tempo: "med", pose: { ...ARMS.thumbR, smile: .3, curve: .9, open: .2, blY: -4, brY: -4, lean: 2, hr: 4 }, gap: [1400, 2600], beats: [
      () => ({ ms: 220, p: { hy: 4 }, then: { ms: 220, p: { hy: -1 }, then: { ms: 220, p: { hy: 4 }, then: { ms: 260, p: { hy: 0 } } } } }),
      () => ({ ms: 220, p: { eR: -140, aR: 24 }, tempo: "fast", then: { ms: 300, p: { eR: -150, aR: 18 } } }),
    ] },
    walk: { tempo: "med", pose: { ...ARMS.rest, smile: .3, curve: .8, open: .08, blY: -3, brY: -3 }, gap: [900, 1600], beats: [
      () => ({ ms: R(700, 1200), p: { lx: R(-3, 3), ly: R(-1, 1) } }),
    ] },
    read: { tempo: "slow", pose: { aL: 22, eL: 108, aR: 22, eR: 108, hy: 7, hr: -2, ly: 5, blY: 2, brY: 1, curve: .45, smile: .08, lean: 1 }, gap: [900, 1800], beats: [
      () => ({ ms: R(900, 1300), p: { lx: -4, ly: 5, hy: 7 }, then: { ms: R(900, 1300), p: { lx: 4, ly: 5, hy: 7 } } }),
      () => ({ ms: 260, p: { aR: 34, eR: 96, hy: 6 }, then: { ms: 340, p: { aR: 22, eR: 108, hy: 7 } } }),
      () => ({ ms: 420, p: { hy: 3, ly: 3, blY: -3, brY: -3, hr: 2 }, then: { ms: 700, p: { hy: 7, ly: 5 } } }),
    ] },
    watch: { tempo: "slow", pose: { aR: 24, eR: 128, hR: "relax", hy: 5, ly: 5, lx: 3, hr: 3, brR: 6, blR: -6, curve: -.1, blY: 1 }, gap: [800, 1500], beats: [
      () => ({ ms: 420, p: { aR: 20, eR: 122, hy: 7, hr: 6, ly: 6 }, then: { ms: 800, p: { aR: 24, eR: 128, hy: 3, ly: 2, hr: -4, lx: -3, brY: -6, blY: -6, open: .1 } } }),
      () => ({ ms: 300, p: { hr: 8, hx: 2 }, then: { ms: 300, p: { hr: -6, hx: -2 }, then: { ms: 300, p: { hr: 6 } } } }),
    ] },
    laugh: { tempo: "fast", pose: { aL: 18, eL: 110, aR: 14, eR: 96, hR: "relax", hy: -3, hr: -6, smile: 1, open: .95, curve: 1, lid: .55, blY: -8, brY: -8, rsy: 1.01 }, gap: [500, 900], beats: [
      () => ({ ms: 500, p: { hr: -9, hy: -5, open: 1 } }),
      () => ({ ms: 500, p: { hr: -3, hy: -1, open: .8 } }),
    ] },
    surprise: { tempo: "fast", pose: { aL: 32, eL: -34, aR: 32, eR: -34, hL: "open", hR: "open", hy: -6, hr: -2, open: .75, curve: .1, smile: 0, blY: -14, brY: -14, rsy: 1.02, lean: -3, ry: -4 }, gap: [1200, 2000], beats: [
      () => ({ ms: 400, p: { rsy: 1.04, hy: -8, ry: -7 }, then: { ms: 700, p: { hy: -5 } } }),
    ] },
    clap: { tempo: "fast", pose: { aL: 24, eL: 84, aR: 24, eR: 84, hL: "open", hR: "open", smile: .9, curve: 1, open: .5, blY: -6, brY: -6 }, gap: [100, 200], beats: [
      () => ({ ms: 140, p: { aL: 20, aR: 20, eL: 66, eR: 66 }, tempo: "fast", then: { ms: 140, p: { aL: 30, aR: 30, eL: 100, eR: 100 }, tempo: "fast", then: { ms: 140, p: { aL: 20, aR: 20, eL: 66, eR: 66 }, tempo: "fast", then: { ms: 140, p: { aL: 30, aR: 30, eL: 100, eR: 100 }, tempo: "fast" } } } }),
    ] },
    tuck: { tempo: "slow", pose: { ...ARMS.earR, hr: 6, hx: 2, hy: 2, lx: -3, smile: .45, curve: .8, blY: -3 }, gap: [900, 1600], beats: [
      () => ({ ms: 700, p: { aR: 134, eR: -46, hr: 9, lx: -4, smile: .6 } }),
      () => ({ ms: 800, p: { hr: 4, ly: -1, smile: .5 } }),
    ] },
    stretch: { tempo: "med", pose: { ...ARMS.stretch, hy: -2, open: .35, smile: .5, curve: .9, blY: -5, brY: -5, rsy: 1.03 }, gap: [700, 1200], beats: [
      () => ({ ms: 700, p: { ...ARMS.stretch, lean: 5, hr: 3, rsy: 1.04 } }),
      () => ({ ms: 700, p: { ...ARMS.stretch, lean: -5, hr: -3, rsy: 1.04 } }),
    ] },
  };
  const CLAMP = { open: [0, 1], lid: [0, 1], smile: [0, 1], lx: [-6, 6], ly: [-6, 6], rsx: [.85, 1.15], rsy: [.85, 1.15], zoom: [.9, 1.12], };
  const GLAD = ["happy", "excited", "encourage", "wave"], DOWN = ["confused", "think", "sad", "listen", "cantHear"];
  const syl = (w) => Math.max(1, (w.toLowerCase().match(/[aeiouyáéíóúàèìòùâêîôûäëïöüãõœæ]+/g) || [1]).length);
  let UID = 0;

  class FlCoach extends HTMLElement {
    static get observedAttributes() { return ["character", "skin", "hair", "hair-color", "outfit", "state", "crop"]; }
    constructor() {
      super(); this.attachShadow({ mode: "open" }); this.id_ = "k" + UID++;
      this.cur = { ...BASE }; this.vel = {}; for (const k in BASE) this.vel[k] = 0;
      this.state = "idle"; this.over = null; this.nextBeat = 0; this.blinkT = -1; this.nextBlink = 1600; this.look = { x: 0, y: 0, next: 0 };
      this.env = 0; this.pulses = []; this.babbleAt = 0; this.ext = null; this.extAt = -1e9; this.seq = []; this.walk = false; this.walkAmt = 0; this.phase = 0; this.wdir = 1; this.view = "front"; this.viewTo = "front"; this.sx = 1; this.faceDir = 1; this.faceTo = 1; this.run = false; this.sit = false; this.sitAmt = 0; this.tap = false; this.seed = Math.random() * 100; this.sa = null; this.sT = 0; this.stT = 0; this.stN = "hang";
      this.t0 = performance.now(); this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches; this.visible = true;
      this._tick = this._tick.bind(this);
    }
    connectedCallback() { this._build(); this.io = new IntersectionObserver((e) => { this.visible = e[0].isIntersecting; this._run(); }); this.io.observe(this); this._run(); }
    disconnectedCallback() { this.io && this.io.disconnect(); cancelAnimationFrame(this.raf); this.raf = 0; this.seq.forEach(clearTimeout); }
    attributeChangedCallback(n, o, v) { if (n === "state") { if (v && v !== this.state) this.play(v); return; } if (this.isConnected && o !== v) this._build(); }
    _build() {
      const ch = this.getAttribute("character") === "mia" ? "mia" : "dan";
      const skin = SKINS[Math.min(5, Math.max(0, (parseInt(this.getAttribute("skin")) || (ch === "mia" ? 2 : 4)) - 1))];
      let hair = this.getAttribute("hair") || (ch === "mia" ? "bob" : "curls");
      const outfit = OUTFIT[this.getAttribute("outfit")] ? this.getAttribute("outfit") : "casual";
      const crop = this.getAttribute("crop"), vb = crop === "head" ? "44 8 212 212" : crop === "bust" ? "0 0 300 330" : "0 0 300 420", ar = crop === "head" ? "1/1" : crop === "bust" ? "300/330" : "300/420";
      const o = { vb, id: this.id_, sk: skin, hair, hc: HAIRC[this.getAttribute("hair-color")] || K.ink, lash: ch === "mia", outfit, of: OUTFIT[outfit] };
      this.shadowRoot.innerHTML = `<style>:host{display:block;position:relative;width:100%;max-height:100%;aspect-ratio:${ar};overflow:visible}svg{display:block;width:100%;height:100%;overflow:visible}</style>${SVG(o)}`;
      this.$ = {}; this.shadowRoot.querySelectorAll("[data-p]").forEach((n) => (this.$[n.dataset.p] = n)); this._bkL = this._bkR = false; this._hpL = this._hpR = null; this.$["hL-relax"].style.display = this.$["hR-relax"].style.display = "none";
      this._render(0, this._now());
    }
    _run() { if (!this.raf && this.visible && this.isConnected) { this.last = performance.now(); this.raf = requestAnimationFrame(this._tick); } }
    _now() { return performance.now() - this.t0; }
    play(state, keep) {
      if (!STATES[state]) return; if (!keep) { this.seq.forEach(clearTimeout); this.seq = []; }
      const prev = this.state; if (state === prev) return;
      this.state = state; this.over = null; this.nextBeat = this._now() + R(500, 1100);
      if (this.getAttribute("state") !== state) this.setAttribute("state", state);
      this.vel.rsy -= .7;
      if (DOWN.includes(prev) && GLAD.includes(state)) this._ov({ ms: 360, p: { lid: 0, blY: -11, brY: -11, hy: -6, open: .25, curve: .3 }, tempo: "fast" });
      this.dispatchEvent(new CustomEvent("coach:state", { detail: { state, prev }, bubbles: true, composed: true }));
    }
    sequence(steps) { this.seq.forEach(clearTimeout); this.seq = []; let t = 0; steps.forEach(([s, ms]) => { this.seq.push(setTimeout(() => this.play(s, true), t)); t += ms || 0; }); }
    setSpeech(l) { this.ext = Math.max(0, Math.min(1, l)); this.extAt = this._now(); }
    lookAt(x, y) { this.look = { x: x * 5, y: y * 5, next: this._now() + 2500 }; }
    blink() { this.blinkT = 0; }
    walkTo(on, dir) { this.walk = !!on; if (dir) this.wdir = dir > 0 ? 1 : -1; }
    runTo(on) { this.run = !!on; }
    tapTo(on) { this.tap = !!on; }
    sitOn(on) { this.sit = !!on; }
    face(view, dir) { this.viewTo = view === "side" ? "side" : "front"; if (dir) this.faceTo = dir > 0 ? 1 : -1; if (this.reduced) { this.view = this.viewTo; this.faceDir = this.faceTo; this.sx = this.view === "side" ? this.faceDir : 1; this._applyView(); } }
    _applyView() { if (this.$ && this.$.root) { this.$.root.style.display = this.view === "side" ? "none" : ""; this.$.sideRoot.style.display = this.view === "side" ? "" : "none"; } }
    speak(text, opts = {}) {
      const ss = window.speechSynthesis; if (!ss) return Promise.resolve();
      return new Promise((res) => {
        ss.cancel(); const u = new SpeechSynthesisUtterance(text); let bd = false;
        if (opts.lang) u.lang = opts.lang; u.rate = opts.rate || 1; u.pitch = this.getAttribute("character") === "mia" ? 1.12 : .95;
        u.onstart = () => { this.play("talk"); this.tts = true; this.ttsAt = this._now(); };
        u.onboundary = (e) => { if (e.name && e.name !== "word") return; bd = true; const w = text.slice(e.charIndex).split(/\s/)[0] || "a"; const n = syl(w), d = 170 / u.rate, t = this._now(); for (let i = 0; i < n; i++) this.pulses.push({ t: t + i * d, d: d * .9, a: R(.55, 1) }); };
        u.onend = u.onerror = () => { this.tts = false; this.pulses = []; this.play(opts.then || "idle"); res(); };
        this._bd = () => bd; ss.speak(u);
      });
    }
    _ov(b) { this.over = { p: b.p, tempo: b.tempo, end: this._now() + b.ms, then: b.then }; }
    _babble(now, sc) { let t = Math.max(now, this.babbleAt); const n = Math.max(1, Math.round(R(2, 6) * sc)); for (let w = 0; w < n; w++) { const k = Math.ceil(R(.5, 3)); for (let i = 0; i < k; i++) { const d = R(120, 200); this.pulses.push({ t, d, a: R(.5, 1) }); t += d; } t += R(40, 110); } this.babbleAt = t + (sc < 1 ? R(1400, 2000) : R(250, 700)); }
    _tick(ts) {
      this.raf = 0; if (!this.visible || !this.isConnected || !this.$) return;
      const dt = Math.min(.05, (ts - this.last) / 1000); this.last = ts; const now = this._now(), T = now / 1000, st = STATES[this.state];
      if (this.over && now > this.over.end) { const th = this.over.then; this.over = null; if (th) this._ov(th); else this.nextBeat = now + R(st.gap[0], st.gap[1]); }
      if (!this.over && now > this.nextBeat && !this.reduced) this._ov(pick(st.beats)());
      const tg = { ...BASE, ...st.pose, ...(this.over ? this.over.p : {}) };
      this.hands = { L: tg.hL || "relax", R: tg.hR || "relax" }; delete tg.hL; delete tg.hR;
      this.back = { L: !!tg.bkL, R: !!tg.bkR }; delete tg.bkL; delete tg.bkR;
      if (tg.scratch) tg.eR += Math.sin(T * 16) * 8; delete tg.scratch;
      const [k, z] = TEMPO[(this.over && this.over.tempo) || st.tempo];
      const br = Math.sin(T * Math.PI * 2 * .4), amp = this.reduced ? .3 : 1;
      tg.rsy += br * .006 * amp; tg.bob += -br * 1 * amp; tg.aL += br * 1.2 * amp; tg.aR += br * 1.2 * amp;
      this.walkAmt += ((this.walk && !this.reduced ? 1 : 0) - this.walkAmt) * Math.min(1, dt * 6);
      this.phase += dt * Math.PI * 2 * 1.15 * (.2 + .8 * this.walkAmt);
      const wk = this.walkAmt;
      const rn = this.run ? 1 : 0;
      if (wk > .01) { const sp = Math.sin(this.phase); tg.bob += -Math.abs(sp) * (3.2 + 4 * rn) * wk; tg.lean += this.wdir * (2.4 + 4 * rn) * wk; tg.hr += sp * 1.6 * wk; tg.aL += sp * (12 + 14 * rn) * wk; tg.aR -= sp * (12 + 14 * rn) * wk; }
      // turning between front and side: squash to nothing, swap bodies, open up again
      if (this.view !== this.viewTo || (this.viewTo === "side" && this.faceDir !== this.faceTo)) {
        this.sx += (0 - this.sx) * Math.min(1, dt * 16);
        if (Math.abs(this.sx) < .08) { this.view = this.viewTo; this.faceDir = this.faceTo; this._applyView(); }
      } else { this.sx += ((this.view === "side" ? this.faceDir : 1) - this.sx) * Math.min(1, dt * 12); }
      this.sitAmt += ((this.sit && !this.reduced ? 1 : 0) - this.sitAmt) * Math.min(1, dt * 5);
      const nz = (s, a, b) => Math.sin(T * a + s) * .6 + Math.sin(T * b + s * 2.1) * .4, sd = this.seed;
      if (!this.reduced) { tg.aL += nz(sd, .83, .31) * 1.3; tg.eL += nz(sd + 5, .61, .27) * 3.4; tg.aR += nz(sd + 11, .77, .29) * 1.3; tg.eR += nz(sd + 17, .57, .23) * 3.4; }
      if (this.state === "laugh" && !this.reduced) { tg.bob += Math.sin(T * 19) * 2.2; tg.rsy += Math.sin(T * 19) * .012; tg.hr += Math.sin(T * 9.5) * 3; }
      this.phase += dt * Math.PI * 2 * .6 * rn * wk;
      if (now > this.look.next && this.state !== "listen") this.look = { x: R(-1.5, 1.5), y: R(-1, 1), next: now + R(900, 3000) };
      tg.lx += this.look.x; tg.ly += this.look.y;
      let env = 0;
      if (this.ext != null && now - this.extAt < 400) env = this.ext;
      else if (st.talk) {
        if ((!this.tts && now > this.babbleAt) || (this.tts && this._bd && !this._bd() && now - this.ttsAt > 500 && now > this.babbleAt)) this._babble(now, st.talk === "hi" ? .5 : 1);
        this.pulses = this.pulses.filter((p) => now < p.t + p.d + 60);
        for (const p of this.pulses) if (now >= p.t && now < p.t + p.d) env = Math.max(env, p.a * Math.sin(Math.PI * (now - p.t) / p.d));
      }
      this.env += (env - this.env) * Math.min(1, dt * (env > this.env ? 36 : 16));
      tg.open = Math.max(tg.open, this.env * .85); tg.hy += -this.env * 1.6; tg.hr += this.env * 1.2;
      if (st.gest) { if (tg.aR > 16) tg.eR += this.env * 6 * Math.sign(tg.eR || 1); if (tg.aL > 16) tg.eL += this.env * 6 * Math.sign(tg.eL || 1); }
      const n = Math.max(1, Math.ceil(dt / .006)), h = dt / n;
      for (const key in tg) {
        let kk = k, zz = z;
        if (key === "open") { kk = 1300; zz = .95; } else if (key === "lx" || key === "ly") { kk = 600; zz = .9; } else if (key === "smile" || key === "curve") { kk = Math.max(k, 150); zz = .95; }
        else if (key === "lid") { kk = Math.max(k, 150); zz = 1; }
        const c = 2 * zz * Math.sqrt(kk), g = tg[key]; let x = this.cur[key], v = this.vel[key];
        for (let i = 0; i < n; i++) { v = (v + kk * (g - x) * h) / (1 + c * h); x += v * h; }
        if (!isFinite(x) || !isFinite(v)) { x = g; v = 0; }
        const L = CLAMP[key]; if (L) { if (x < L[0]) { x = L[0]; v = 0; } else if (x > L[1]) { x = L[1]; v = 0; } }
        this.cur[key] = x; this.vel[key] = v;
      }
      let blink = 0;
      if (this.blinkT < 0 && now > this.nextBlink) { this.blinkT = 0; this.dbl = Math.random() < .2; this.nextBlink = now + R(2400, 5400); }
      if (this.blinkT >= 0) { this.blinkT += dt * 1000; const b = this.blinkT; blink = b < 60 ? b / 60 : b < 90 ? 1 : b < 190 ? 1 - (b - 90) / 100 : 0; if (b >= 190) { this.blinkT = -1; if (this.dbl) { this.dbl = false; this.nextBlink = now + 140; } } }
      this._render(Math.max(this.cur.lid, blink), now);
      this.raf = requestAnimationFrame(this._tick);
    }
    _renderSide(c, $, f, lid, now) {
      const wk = this.walkAmt || 0, rn = this.run ? 1 : 0, ph = this.phase || 0, T = now / 1000, rest = 1 - wk;
      const st = this.state, env = this.env || 0, talk = st === "talk" || st === "wave", listen = st === "listen" || st === "think";
      const dt = Math.min(.05, Math.max(0, (now - (this.sT || now)) / 1000)); this.sT = now;
      const A = (24 + 18 * rn) * wk, K2 = (46 + 46 * rn) * wk, tap = this.tap ? Math.max(0, Math.sin(T * 13)) * 13 : 0;
      const leg = (p, tag, sgn) => {
        const s = Math.sin(p), th = -A * s + sgn * 3 * rest + sgn * Math.sin(T / 1.9) * 1.2 * rest, k = K2 * Math.pow(Math.max(0, Math.cos(p)), 1.2);
        $["s_leg" + tag].setAttribute("transform", `rotate(${f(th)},150,306)`);
        $["s_knee" + tag].setAttribute("transform", `rotate(${f(k)},150,352)`);
        $["s_shoe" + tag].setAttribute("transform", `${tag === "N" && tap ? `rotate(${f(tap)},182,402) ` : ""}rotate(${f(-(th + k) * .7)},150,398)`);
      };
      leg(ph, "N", -1); leg(ph + Math.PI, "F", 1);
      const bobW = -(1 + Math.cos(2 * ph)) / 2 * (3 + 5 * rn) * wk;
      $.s_body.setAttribute("transform", `translate(0,${f(c.bob * .6 + bobW)})`);
      $.s_torso.setAttribute("transform", `rotate(${f((3 + 6 * rn) * wk + c.lean * .5 * rest)},150,326)`);
      // the arm that is not busy stays folded or rests; its pose changes now and then and it drifts like a person's
      if (now > this.stT) { this.stT = now + 6500 + Math.random() * 5000; this.stN = ["hang", "hip", "fold"][Math.floor(Math.random() * 3)]; }
      const NEAR = { hang: [3, -10], hip: [30, -118], fold: [-6, -98], chin: [-38, -124] }, FAR = [-4, -94];
      const tn = talk ? [-(10 + env * 30), -(50 + env * 35)] : listen ? NEAR.chin : NEAR[this.stN] || NEAR.hang;
      const sa = this.sa || (this.sa = { an: tn[0], bn: tn[1], af: FAR[0], bf: FAR[1] }), kk = 1 - Math.exp(-dt * (talk ? 14 : 6));
      sa.an += (tn[0] - sa.an) * kk; sa.bn += (tn[1] - sa.bn) * kk; sa.af += (FAR[0] - sa.af) * kk; sa.bf += (FAR[1] - sa.bf) * kk;
      const nz = (s, a, b) => Math.sin(T * a + s) * .6 + Math.sin(T * b + s * 2.1) * .4, sd = this.seed || 0, sw = (26 + 20 * rn) * wk;
      const an = sa.an * rest + sw * Math.sin(ph) + nz(sd, .8, .3) * 1.4 * rest;
      const bn = sa.bn * rest - (16 + 70 * rn + 14 * Math.max(0, -Math.sin(ph))) * wk + nz(sd + 4, .6, .25) * 2.6 * rest;
      const af = sa.af * rest - sw * Math.sin(ph) + nz(sd + 9, .7, .28) * 1.2 * rest;
      const bf = sa.bf * rest - (16 + 70 * rn + 14 * Math.max(0, Math.sin(ph))) * wk + nz(sd + 13, .55, .22) * 2.4 * rest;
      $.s_armN.setAttribute("transform", `rotate(${f(an)},150,222)`); $.s_elbN.setAttribute("transform", `rotate(${f(bn)},150,268)`);
      $.s_armF.setAttribute("transform", `rotate(${f(af)},150,222)`); $.s_elbF.setAttribute("transform", `rotate(${f(bf)},150,268)`);
      $.s_head.setAttribute("transform", `translate(${f(c.hx)},${f(c.hy)}) rotate(${f(c.hr)},150,196)`);
      $.s_pup.setAttribute("transform", `translate(${f(c.lx * .7)},${f(c.ly)})`);
      $.s_lid.setAttribute("transform", `translate(0,${f(lid * 40)})`);
      if ($.s_lash) $.s_lash.setAttribute("transform", `translate(0,${f(lid * 30)})`);
      $.s_brow.setAttribute("transform", `translate(176,${f(98 + c.brY + lid * 3)}) rotate(${f(c.brR * .5)})`);
      const o = c.open, sm = 6 + c.curve * 9 + c.smile * 4;
      if (o > .06) { $.s_mfill.style.display = ""; $.s_mfill.setAttribute("ry", f(3 + o * 11)); $.s_mfill.setAttribute("rx", f(8 + o * 3)); $.s_mline.setAttribute("d", ""); }
      else { $.s_mfill.style.display = "none"; $.s_mline.setAttribute("d", `M174,159 Q189,${f(159 + sm)} 204,156`); }
    }
    _arm(side, a, e) {
      const S = side === "L" ? [108, 216] : [192, 216], sg = side === "L" ? -1 : 1, rad = Math.PI / 180;
      const E = [S[0] + sg * 50 * Math.sin(a * rad), S[1] + 50 * Math.cos(a * rad)], b = a - e;
      const W = [E[0] + sg * 56 * Math.sin(b * rad), E[1] + 56 * Math.cos(b * rad)];
      return { S, E, W, b, sg };
    }
    _render(lid, now) {
      const c = this.cur, $ = this.$, f = (v) => (+v).toFixed(2);
      $.stage.setAttribute("transform", `translate(150,0) scale(${f(this.sx)},1) translate(-150,0)`);
      if (this.view === "side") { this._renderSide(c, $, f, lid, now); return; }
      $.root.setAttribute("transform", `translate(150,${f(405 + c.ry)}) scale(${f(c.rsx * c.zoom)},${f(c.rsy * c.zoom)}) translate(-150,-405)`);
      const j = Math.max(0, -c.ry); $.shadow.setAttribute("transform", `translate(150,406) scale(${f(Math.max(.6, 1 - j * .012) * c.zoom)},1) translate(-150,-406)`);
      $.upper.setAttribute("transform", `translate(0,${f(c.bob)}) rotate(${f(c.lean)},150,320)`);
      $.head.setAttribute("transform", `translate(${f(c.hx)},${f(c.hy)}) rotate(${f(c.hr)},150,196)`);
      for (const s of ["L", "R"]) {
        $["pup" + s].setAttribute("transform", `translate(${f(c.lx)},${f(c.ly)})`);
        $["lid" + s].setAttribute("transform", `translate(0,${f(lid * 38)})`);
        $["low" + s].setAttribute("transform", `translate(0,${f(-c.smile * 22)})`);
        if ($["lash" + s]) $["lash" + s].setAttribute("transform", `translate(0,${f(lid * 28)})`);
        const x = s === "L" ? 122 : 178;
        $["brow" + s].setAttribute("transform", `translate(${x},${f(100 + (s === "L" ? c.blY : c.brY) + lid * 3)}) rotate(${f(s === "L" ? c.blR : c.brR)})`);
        const A = this._arm(s, s === "L" ? c.aL : c.aR, s === "L" ? c.eL : c.eR);
        const k1 = .82, c1 = [A.S[0] + (A.E[0] - A.S[0]) * k1, A.S[1] + (A.E[1] - A.S[1]) * k1], c2 = [A.W[0] + (A.E[0] - A.W[0]) * k1, A.W[1] + (A.E[1] - A.W[1]) * k1];
        const d = `M${f(A.S[0])},${f(A.S[1])} C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(A.W[0])},${f(A.W[1])}`;
        $["arm" + s].setAttribute("d", d);
        $["hand" + s].setAttribute("transform", `translate(${f(A.W[0])},${f(A.W[1])}) rotate(${f(-A.sg * A.b)}) scale(${-A.sg},1)`);
        const bk = !!(this.back && this.back[s]);
        if (this["_bk" + s] !== bk) { const up = $.upper; if (bk) { up.insertBefore($["hand" + s], up.firstChild); up.insertBefore($["arm" + s], up.firstChild); } else { up.appendChild($["arm" + s]); up.appendChild($["hand" + s]); } this["_bk" + s] = bk; }
        const hp = (this.hands && this.hands[s]) || "relax";
        if (this["_hp" + s] !== hp) { if (this["_hp" + s]) $[`h${s}-${this["_hp" + s]}`].style.display = "none"; $[`h${s}-${hp}`].style.display = ""; this["_hp" + s] = hp; }
      }
      if ($.legL) {
        const wk = this.walkAmt || 0, sp = Math.sin(this.phase || 0), sw = Math.sin(now / 1900) * (1 - wk), si = this.sitAmt || 0, ss = Math.sin(now / 480) * 15 * si;
        const lift = (s) => Math.max(0, s) * 11 * wk, jump = Math.max(0, -c.ry) * .45, tp = this.tap ? Math.max(0, Math.sin(now / 77)) * 7 : 0;
        $.legL.setAttribute("transform", `translate(0,${f(-lift(sp) - Math.max(0, sw) * 2.4 - jump)}) rotate(${f(sp * 7 * wk + sw * 1.4 + ss)},132,300)`);
        $.legR.setAttribute("transform", `translate(0,${f(-lift(-sp) - Math.max(0, -sw) * 2.4 - jump - tp)}) rotate(${f(-sp * 7 * wk + sw * 1.4 - ss)},168,300)`);
      }
      // mouth
      const mx = 150, my = 166, w = 34 + c.smile * 8 - c.open * 6, o = c.open, k = c.curve;
      const cy = my - k * 6, ty = my + k * 3 - o * 2, by = my + k * 8 + o * 22 + 1;
      const d = `M${f(mx - w / 2)},${f(cy)} Q${f(mx)},${f(2 * ty - cy)} ${f(mx + w / 2)},${f(cy)} Q${f(mx)},${f(2 * by - cy)} ${f(mx - w / 2)},${f(cy)} Z`;
      $.mfill.setAttribute("d", d); $.mclip.setAttribute("d", d); $.mfill.style.opacity = o > .04 ? 1 : 0;
      $.mline.setAttribute("d", o > .04 ? d : `M${f(mx - w / 2)},${f(cy)} Q${f(mx)},${f(2 * (my + k * 6) - cy)} ${f(mx + w / 2)},${f(cy)}`);
      $.teeth.setAttribute("y", f(ty - 4)); $.teeth.style.opacity = o > .2 && k > .3 ? 1 : 0;
      $.tongue.setAttribute("cy", f(by - 4));
    }
  }
  customElements.define("fl-coach", FlCoach);
})();
