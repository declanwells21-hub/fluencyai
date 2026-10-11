/* Coach and GuideCover components, compiled from the design handoff (tools/dc2js.py). */
FLDC.define("Coach",function(DCLogic){
class Component extends DCLogic {
  renderVals() {
    const MAP = { outfit: "outfit", welcome: "wave", idle: "idle", listening: "listen", thinking: "think", speaking: "talk", happy: "happy", encouraging: "encourage", confused: "confused", cantHear: "cantHear", sad: "sad", surprised: "excited", celebrating: "excited", excited: "excited", wave: "wave" };
    const OUT = { business: "business", tie: "business", pilot: "business", doctor: "doctor", waiter: "waiter" };
    const e = this.props.expression || "idle", state = MAP[e] || e;
    const crop = this.props.crop || "full";
    const auras = { outfit: "rgba(37,215,155,.18)", wave: "rgba(37,215,155,.30)", idle: "rgba(37,215,155,.18)", listen: "rgba(53,221,251,.34)", think: "rgba(122,117,208,.36)", talk: "rgba(34,207,203,.34)", happy: "rgba(37,215,155,.32)", encourage: "rgba(37,215,155,.28)", confused: "rgba(247,178,59,.26)", cantHear: "rgba(255,106,106,.28)", sad: "rgba(122,117,208,.26)", excited: "rgba(37,215,155,.40)" };
    // Brand disc: Fluency teal into ink navy, tinted gently by the AI state.
    const TINT = {
      listen: ["#1FB9C9", "53,221,251"], think: ["#4E5AA8", "122,117,208"], talk: ["#14B3AE", "34,207,203"],
      confused: ["#B98A3A", "247,178,59"], cantHear: ["#B5585E", "255,106,106"], sad: ["#4E5AA8", "122,117,208"]
    };
    const tint = TINT[state] || ["#18A99A", "37,215,155"];
    const auraOn = this.props.aura !== false;
    const frame = this.props.frame || (crop === "full" ? "none" : "circle");
    const circle = frame === "circle";
    const live = state === "listen" || state === "talk";
    const small = crop === "head";
    return {
      state, crop, circle, plain: !circle,
      ar: crop === "head" ? "1/1" : crop === "bust" ? "300/330" : "300/420",
      // smaller figure: head sits comfortably inside the disc, shoulders rest on the bottom edge
      innerW: small ? "86%" : "76%", innerDrop: small ? "-10%" : "-6%",
      character: this.props.character || "dan",
      skin: String(this.props.skin ?? (this.props.character === "mia" ? 2 : 4)),
      hair: this.props.hair || (this.props.character === "mia" ? "bob" : "curls"),
      hairColor: this.props.hairColor || "ink",
      glasses: this.props.glasses || "round",
      age: this.props.age || "teen",
      beard: this.props.beard || "none",
      outfit: OUT[this.props.accessory] || "casual",
      showAura: auraOn,
      auraBg: `radial-gradient(circle at 50% 50%, ${auras[state] || auras.idle} 0%, rgba(4,18,27,0) 68%)`,
      discBg: `radial-gradient(120% 95% at 50% 8%, ${tint[0]} 0%, #0F5462 38%, #0D3346 68%, #0B2233 100%)`,
      dropShadow: small ? "0 4px 10px -4px rgba(4,18,27,.45)" : "0 18px 36px -18px rgba(4,18,27,.65)",
      halo: auraOn && !small,
      glowIn: `rgba(${tint[1]},${live ? .42 : .26})`, glowMid: `rgba(${tint[1]},${live ? .16 : .08})`,
      glowAnim: live ? "flcGlow 2.6s ease-in-out infinite" : "none",
      floatAnim: auraOn && !small ? "flcFloat 5s ease-in-out infinite" : "none",
    };
  }
}

return Component;},function(v,H,T,S,B,L,SA){with(v){return "<div"+" style=\"position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;min-width:24px;min-height:24px;\""+">"+"\n  "+(B(T(function(){return (circle)}))?("\n    "+"<div"+" style=\"position:relative;height:100%;max-width:100%;aspect-ratio:1/1;\""+">"+"\n      "+(B(T(function(){return (halo)}))?("\n        "+"<div"+" data-flc-anim=\"1\""+" style=\""+"position:absolute;inset:-12%;border-radius:50%;background:radial-gradient(circle at 50% 50%, "+SA(T(function(){return (glowIn)}))+" 0%, "+SA(T(function(){return (glowMid)}))+" 42%, rgba(11,34,51,0) 70%);animation:"+SA(T(function(){return (glowAnim)}))+";pointer-events:none;"+"\""+">"+""+"</div>"+"\n      "):"")+"\n      "+"<div"+" style=\""+"position:absolute;inset:0;border-radius:50%;overflow:hidden;background:"+SA(T(function(){return (discBg)}))+";box-shadow:inset 0 1px 0 rgba(255,255,255,.16), inset 0 -18px 28px -10px rgba(4,18,27,.45), "+SA(T(function(){return (dropShadow)}))+";display:flex;align-items:flex-end;justify-content:center;"+"\""+">"+"\n        "+"<div"+" style=\"position:absolute;left:14%;right:14%;top:6%;height:38%;border-radius:50%;background:radial-gradient(ellipse at 50% 30%, rgba(255,255,255,.16) 0%, rgba(255,255,255,0) 70%);pointer-events:none;\""+">"+""+"</div>"+"\n        "+"<div"+" data-flc-anim=\"1\""+" style=\""+"position:relative;width:"+SA(T(function(){return (innerW)}))+";aspect-ratio:300/330;margin-bottom:"+SA(T(function(){return (innerDrop)}))+";animation:"+SA(T(function(){return (floatAnim)}))+";"+"\""+">"+"\n          "+H.imp("fl-coach",{"character":T(function(){return (character)}),"skin":T(function(){return (skin)}),"hair":T(function(){return (hair)}),"hairColor":T(function(){return (hairColor)}),"outfit":T(function(){return (outfit)}),"glasses":T(function(){return (glasses)}),"age":T(function(){return (age)}),"beard":T(function(){return (beard)}),"state":T(function(){return (state)}),"crop":"bust","style":"position:absolute;inset:0;width:100%;height:100%;"},"")+"\n        "+"</div>"+"\n      "+"</div>"+"\n    "+"</div>"+"\n  "):"")+"\n  "+(B(T(function(){return (plain)}))?("\n    "+"<div"+" style=\"position:relative;width:100%;height:100%;display:flex;align-items:flex-end;justify-content:center;clip-path:inset(-40% -40% 0 -40%);\""+">"+"\n      "+(B(T(function(){return (showAura)}))?("\n        "+"<div"+" style=\""+"position:absolute;inset:-4%;border-radius:50%;background:"+SA(T(function(){return (auraBg)}))+";pointer-events:none;transition:background 600ms ease;"+"\""+">"+""+"</div>"+"\n      "):"")+"\n      "+H.imp("fl-coach",{"character":T(function(){return (character)}),"skin":T(function(){return (skin)}),"hair":T(function(){return (hair)}),"hairColor":T(function(){return (hairColor)}),"outfit":T(function(){return (outfit)}),"glasses":T(function(){return (glasses)}),"age":T(function(){return (age)}),"beard":T(function(){return (beard)}),"state":T(function(){return (state)}),"crop":T(function(){return (crop)}),"style":"position:relative;height:100%;width:auto;max-width:100%;aspect-ratio:"+SA(T(function(){return (ar)}))+";"},"")+"\n    "+"</div>"+"\n  "):"")+"</div>";}});
FLDC.define("GuideCover",function(DCLogic){
const ICON = { immigration: "plane", family: "heart-handshake", work: "briefcase", residence: "key-round", citizenship: "landmark", university: "graduation-cap", mastery: "award" };
const HINT = { immigration: "family arriving at a Canadian airport", family: "couple meeting at arrivals", work: "trainee or nurse at work", residence: "keys at a new front door", citizenship: "citizenship ceremony", university: "student on campus", mastery: "speaker presenting" };
const S = (c, f = 1) => ({ c, f });
const FLAGS = {
  de: { dir: "column", s: [S("#000000"), S("#DD0000"), S("#FFCE00")] },
  fr: { dir: "row", s: [S("#002395"), S("#FFFFFF"), S("#ED2939")] },
  ca: { dir: "row", s: [S("#D52B1E"), S("#FFFFFF", 2), S("#D52B1E")] },
  qc: { dir: "row", s: [S("#003DA5", 3), S("#FFFFFF", .5), S("#003DA5", 3)] },
};
class Component extends DCLogic {
  renderVals() {
    const cat = this.props.cat || "residence", lang = this.props.lang || "German";
    const f = FLAGS[this.props.flag] || (lang === "French" ? FLAGS.fr : FLAGS.de), small = !!this.props.small, photo = this.props.mode === "photo";
    return {
      img: !!this.props.src, noImg: !this.props.src, imgSrc: this.props.src || "", alt: (this.props.exam || "Guide") + " " + (this.props.level || "") + " cover",
      leaf: this.props.flag === "ca", photo, art: !photo, stripes: f.s, flagDir: f.dir,
      icon: ICON[cat] || "briefcase", iconSize: small ? 18 : 24, iconBox: small ? "34px" : "48px", chip: small ? "26px" : "34px",
      level: this.props.level || "B1", exam: this.props.exam || "Goethe-Zertifikat", purpose: this.props.purpose || "For residence, study & training", lang,
      levelSize: (this.props.level || "").length > 4 ? (small ? "26px" : "44px") : (small ? "36px" : "60px"),
      slotId: "cover-" + (this.props.guideId || "x"), photoHint: "Drop a photo: " + (HINT[cat] || "the exam's purpose"),
    };
  }
}

return Component;},function(v,H,T,S,B,L,SA){with(v){return (B(T(function(){return (img)}))?("<div"+" style=\"position:relative;width:100%;aspect-ratio:1002/1418;border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 10px 28px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.12);isolation:isolate;\""+">"+"<img"+H.attr("src",T(function(){return (imgSrc)}))+H.attr("alt",T(function(){return (alt)}))+" loading=\"lazy\""+" draggable=\"false\""+" style=\"position:absolute;display:block;max-width:none;width:100%;height:100%;left:0;top:0;object-fit:cover;\""+">"+"</div>"):"")+(B(T(function(){return (noImg)}))?("<div"+" style=\"position:relative;width:100%;aspect-ratio:3/4;border-radius:16px;overflow:hidden;background:linear-gradient(180deg,#0E2A3C 0%,#071824 100%);font-family:var(--font-body);text-align:left;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);isolation:isolate;\""+">"+"\n  "+(B(T(function(){return (art)}))?("\n    "+"<div"+" style=\""+"position:absolute;left:0;right:0;top:0;height:28%;display:flex;flex-direction:"+SA(T(function(){return (flagDir)}))+";"+"\""+">"+"\n      "+(L(T(function(){return (stripes)})).map(function(s,_i){return "<div"+" style=\""+"flex:"+SA(T(function(){return (s.f)}))+";background:"+SA(T(function(){return (s.c)}))+";"+"\""+">"+""+"</div>"}).join(""))+"\n      "+(B(T(function(){return (leaf)}))?("<svg"+" viewBox=\"0 0 100 100\""+" aria-hidden=\"true\""+" style=\"position:absolute;left:50%;top:50%;height:68%;aspect-ratio:1/1;transform:translate(-50%,-50%);\""+">"+"<path"+" fill=\"#D52B1E\""+" d=\"M50 4 58 20 66 16 63 40 78 26 81 34 95 32 89 47 97 51 74 67 78 75 54 71 54 94 46 94 46 71 22 75 26 67 3 51 11 47 5 32 19 34 22 26 37 40 34 16 42 20Z\""+">"+""+"</path>"+"</svg>"):"")+"\n    "+"</div>"+"\n    "+"<div"+" style=\""+"position:absolute;right:9%;top:28%;transform:translateY(-50%);display:grid;place-items:center;width:"+SA(T(function(){return (iconBox)}))+";aspect-ratio:1/1;border-radius:50%;background:#0E2A3C;border:2px solid rgba(255,255,255,.9);color:#fff;box-shadow:0 6px 16px rgba(0,0,0,.35);"+"\""+">"+"\n      "+H.imp("FluencyAIDesignSystem_b0c8f6.Icon",{"name":T(function(){return (icon)}),"size":T(function(){return (iconSize)})},"")+"\n    "+"</div>"+"\n  "):"")+"\n  "+(B(T(function(){return (photo)}))?("\n    "+"<div"+" style=\"position:absolute;inset:0;z-index:0;\""+">"+"<image-slot"+H.attr("id",T(function(){return (slotId)}))+" shape=\"rect\""+H.attr("placeholder",T(function(){return (photoHint)}))+">"+""+"</image-slot>"+"</div>"+"\n    "+"<div"+" style=\"position:absolute;left:0;right:0;bottom:0;height:62%;z-index:1;pointer-events:none;background:linear-gradient(180deg,rgba(4,18,27,0),rgba(4,18,27,.9));\""+">"+""+"</div>"+"\n    "+"<div"+" style=\""+"position:absolute;left:9%;top:8%;z-index:2;display:flex;isolation:isolate;width:"+SA(T(function(){return (chip)}))+";aspect-ratio:3/2;border-radius:4px;overflow:hidden;flex-direction:"+SA(T(function(){return (flagDir)}))+";box-shadow:0 0 0 1px rgba(255,255,255,.4);"+"\""+">"+"\n      "+(L(T(function(){return (stripes)})).map(function(s,_i){return "<div"+" style=\""+"flex:"+SA(T(function(){return (s.f)}))+";background:"+SA(T(function(){return (s.c)}))+";"+"\""+">"+""+"</div>"}).join(""))+"\n      "+(B(T(function(){return (leaf)}))?("<svg"+" viewBox=\"0 0 100 100\""+" aria-hidden=\"true\""+" style=\"position:absolute;left:50%;top:50%;height:72%;aspect-ratio:1/1;transform:translate(-50%,-50%);\""+">"+"<path"+" fill=\"#D52B1E\""+" d=\"M50 4 58 20 66 16 63 40 78 26 81 34 95 32 89 47 97 51 74 67 78 75 54 71 54 94 46 94 46 71 22 75 26 67 3 51 11 47 5 32 19 34 22 26 37 40 34 16 42 20Z\""+">"+""+"</path>"+"</svg>"):"")+"\n    "+"</div>"+"\n  "):"")+"\n  "+"<span"+" style=\"position:absolute;left:9%;top:calc(28% + 12px);z-index:2;font:700 10px/1 var(--font-body);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-300);\""+">"+"20-min guide"+"</span>"+"\n  "+"<div"+" style=\"position:absolute;left:0;right:0;bottom:0;z-index:2;pointer-events:none;display:grid;gap:4px;padding:0 9% 10%;\""+">"+"\n    "+"<span"+" style=\""+"font:800 "+SA(T(function(){return (levelSize)}))+"/.92 var(--font-display);letter-spacing:-.04em;color:#fff;"+"\""+">"+S(T(function(){return (level)}))+"</span>"+"\n    "+"<span"+" style=\"font:700 15px/1.15 var(--font-display);color:#fff;text-wrap:balance;\""+">"+S(T(function(){return (exam)}))+"</span>"+"\n    "+"<span"+" style=\"font:500 12px/1.3 var(--font-body);color:var(--ink-200);text-wrap:balance;\""+">"+S(T(function(){return (purpose)}))+"</span>"+"\n  "+"</div>"+"</div>"):"");}});
