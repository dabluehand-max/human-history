// Human History — خريطة + خط زمني + الشخصيات ومساراتها + مقارنة الروايات + النصوص
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const yearText = (y) => (y < 0 ? `${-y} ق.م` : `${y} م`);
const PLACE_AR = { makkah: "مكية", madinah: "مدنية" };
const CANON_AR = { quran: "القرآن", sahihain: "الصحيحان" };
const WINDOW = 150; // سنوات حول كل تاريخ مقترح
const MIN_YEAR = -7000, MAX_YEAR = 2026;

let DB, SURAHS, PEOPLE, BIBLE, TEXT, FAMILIES = {}, map, markers = [], jmarkers = [], journey = null;
const bibleCache = {};

async function load() {
  [DB, SURAHS, FAMILIES.flood, PEOPLE, BIBLE] = await Promise.all(
    ["data/events.json", "data/quran/surahs.json", "data/families/flood.json", "data/people.json", "data/bible/books.json"]
      .map((u) => fetch(u).then((r) => r.json()))
  );
  PEOPLE = PEOPLE.people;
  DB.place = Object.fromEntries(DB.places.map((p) => [p.id, p]));
}

const eventVisible = (e, y) =>
  e.datings ? e.datings.some((d) => Math.abs(d.year - y) <= WINDOW) : e.time.from <= y && y <= e.time.to;
const tag = (c) => `<span class="tag" data-c="${c}">${c}</span>`;

// ---------- الخريطة والزمن ----------
function initMap() {
  maplibregl.setRTLTextPlugin("https://cdn.jsdelivr.net/npm/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js", true);
  map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/positron",
    center: [40, 30], zoom: 2.6,
  });
  map.addControl(new maplibregl.NavigationControl(), "top-left");
  map.on("load", () => {
    // أسماء الأماكن بالعربية متى وُجدت
    map.getStyle().layers.filter((l) => l.type === "symbol" && l.layout?.["text-field"])
      .forEach((l) => map.setLayoutProperty(l.id, "text-field", ["coalesce", ["get", "name:ar"], ["get", "name"]]));
    map.addSource("journey", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "journey-alt", type: "line", source: "journey", filter: ["==", ["get", "kind"], "alt"],
      paint: { "line-color": "#8a5a1f", "line-width": 1.5, "line-dasharray": [2, 2] } });
    map.addLayer({ id: "journey-path", type: "line", source: "journey", filter: ["==", ["get", "kind"], "path"],
      paint: { "line-color": "#b3412e", "line-width": 3, "line-opacity": 0.8 } });
    route();
  });
}

function renderTicks() {
  const pct = (y) => ((y - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
  const ticks = [];
  DB.events.forEach((e) => (e.datings || [{ year: e.time.from, text: e.name }]).forEach((d) => ticks.push({ y: d.year, t: `${e.name}: ${d.text}`, c: "" })));
  PEOPLE.forEach((p) => ticks.push({ y: p.born, t: p.name, c: "tp" }));
  $("#ticks").innerHTML = ticks.map((k) => `<i class="${k.c}" style="left:${pct(k.y)}%" title="${esc(yearText(k.y) + " — " + k.t)}" data-y="${k.y}"></i>`).join("");
  $("#ticks").querySelectorAll("i").forEach((i) => (i.onclick = () => { closeJourney(); setYear(+i.dataset.y); }));
}

function pin(list, coords, cls, title, onClick, label = "") {
  const el = document.createElement("div");
  el.className = "pin " + cls;
  el.title = title;
  el.textContent = label;
  el.onclick = (ev) => { ev.stopPropagation(); onClick(); };
  list.push(new maplibregl.Marker({ element: el }).setLngLat(coords).addTo(map));
}

function setYear(y) {
  y = Math.max(MIN_YEAR, Math.min(MAX_YEAR, y));
  $("#year").value = y;
  $("#year-label").textContent = yearText(y);
  markers.forEach((m) => m.remove());
  markers = [];

  const world = DB.world.filter((w) => w.time.from <= y && y <= w.time.to);
  world.forEach((w) => pin(markers, DB.place[w.place].coords, "world", w.name, () => showWorld(w)));
  const people = PEOPLE.filter((p) => p.born <= y && y <= p.died);
  const surahs = SURAHS.filter((s) => s.year_est === y);
  $("#world").innerHTML = [
    ...people.map((p) => `<li data-person="${p.id}">${tag(p.yearTag || "تقدير")}<b>${p.name}</b> في عمر ${y - p.born} <span class="muted">(${p.yearNote || "تقدير الأداة"}) ← مساره</span></li>`),
    ...world.map((w) => `<li data-w="${w.id}">${tag(w.certainty)}${esc(w.name)}</li>`),
    ...surahs.map((s) => `<li data-surah="${s.id}">${tag("تقدير")}نزول سورة ${s.name} <span class="muted">(تقدير الأداة)</span></li>`),
  ].join("") || `<li class="muted">لا توجد بيانات لهذه السنة بعد.</li>`;
  $("#world").querySelectorAll("li[data-w]").forEach((li) => (li.onclick = () => showWorld(DB.world.find((w) => w.id === li.dataset.w))));
  $("#world").querySelectorAll("li[data-person]").forEach((li) => (li.onclick = () => go(`#/person/${li.dataset.person}`)));
  $("#world").querySelectorAll("li[data-surah]").forEach((li) => (li.onclick = () => go(`#/text/q/${li.dataset.surah}`)));

  if (journey) return; // المسار يملك اللوحة العلوية
  const events = DB.events.filter((e) => eventVisible(e, y));
  events.forEach((e) => e.places.forEach((pid) => pin(markers, DB.place[pid].coords, "", `${e.name}: ${DB.place[pid].name}`, () => showEvent(e, y))));
  if (events[0]) showEvent(events[0], y);
  else $("#here").innerHTML = `<h2>${yearText(y)}</h2><p class="muted">لا يوجد حدث مسجّل في هذه السنة. اضغط على العلامات تحت الخط الزمني، أو اختر شخصية من تبويب «الشخصيات».</p>`;
}

// ادعاء: وسم + نص + مصدر، والمصدر يفتح النص إن كان قرآنًا أو كتابًا مقدسًا
function claimHTML(c) {
  const badge = c.canon ? `<span class="canon-badge">${CANON_AR[c.canon]}</span>` : "";
  const open = c.quran ? ` <span class="link" data-ref="q/${c.quran}">اقرأ النص</span>`
    : c.bible ? ` <span class="link" data-ref="b/${c.bible.replace(" ", "/")}">اقرأ النص</span>` : "";
  return `<div class="claim${c.canon ? " canon" : ""}">${badge}${tag(c.certainty)}${c.grade ? `<span class="muted">(${esc(c.grade)}) </span>` : ""}${c.estimate ? `<span class="muted">(تقدير الأداة) </span>` : ""}${esc(c.text)}<div class="src">المصدر: ${esc(c.source)}${open}</div></div>`;
}
const wireRefs = (root) => root.querySelectorAll("[data-ref]").forEach((a) => (a.onclick = () => go(`#/text/${a.dataset.ref}`)));

function showEvent(e, y) {
  const places = e.places.map((p) => DB.place[p].name).join("، ");
  const quran = (e.quran || []).map((id) => `<span class="link" data-ref="q/${id}">${SURAHS[id - 1].name}</span>`).join("، ");
  let time = `<p>${tag(e.time.certainty)}${esc(e.time.label)}</p>`;
  if (e.datings) {
    const near = e.datings.reduce((a, b) => (Math.abs(b.year - y) < Math.abs(a.year - y) ? b : a));
    time += `<ol class="datings">${e.datings.map((d, i) => `<li class="${d === near ? "on" : ""}" data-i="${i}">
      <b>${yearText(d.year)}</b> ${tag(d.certainty)}${esc(d.text)}<div class="src">${esc(d.source)}</div></li>`).join("")}</ol>`;
  }
  $("#here").innerHTML = `
    <h2>${esc(e.name)}</h2>${time}
    <p>المكان: ${esc(places)}</p>
    ${quran ? `<p>في القرآن: ${quran}</p>` : ""}
    ${e.family ? `<p><span class="link" data-family="${e.family}">قارن كل روايات القصة ←</span></p>` : ""}
    ${e.claims.map(claimHTML).join("")}`;
  wireRefs($("#here"));
  $("#here").querySelectorAll("[data-family]").forEach((a) => (a.onclick = () => go("#/compare")));
  $("#here").querySelectorAll(".datings li").forEach((li) => (li.onclick = () => {
    const d = e.datings[+li.dataset.i];
    setYear(d.year);
    if (d.place) map.flyTo({ center: DB.place[d.place].coords, zoom: 5 });
  }));
}

function showWorld(w) {
  if (journey) closeJourney(false);
  $("#here").innerHTML = `<h2>${esc(w.name)}</h2>
    <p>${tag(w.certainty)}${yearText(w.time.from)} – ${yearText(w.time.to)} · ${esc(DB.place[w.place].name)}</p>
    ${w.story ? `<p class="story">${esc(w.story)}</p>` : ""}
    <div class="src muted">المصدر: ${esc(w.source)}</div>
    <p><span class="link" id="back-year">← رجوع إلى أحداث السنة</span></p>`;
  $("#back-year").onclick = () => setYear(+$("#year").value);
  map.flyTo({ center: DB.place[w.place].coords, zoom: 4.5 });
}

// ---------- الشخصيات ومساراتها ----------
function renderPeople() {
  $("#people").innerHTML = PEOPLE.map((p) => `<article class="person" data-id="${p.id}">
    <h2>${p.name} <span class="muted">${p.names.filter((n) => n !== p.name).join(" · ")}</span></h2>
    <p>${esc(p.summary)}</p>
    <p class="muted">${p.stations.length} محطة · القصة من نحو ${yearText(p.born)} إلى ${yearText(p.died)} (${p.yearNote || "تقدير الأداة"})</p>
    <button>شاهد مساره على الخريطة ←</button></article>`).join("");
  $("#people").querySelectorAll(".person").forEach((a) => (a.onclick = () => go(`#/person/${a.dataset.id}`)));
}

function openJourney(p, i = 0) {
  journey = p;
  jmarkers.forEach((m) => m.remove());
  jmarkers = [];
  markers.forEach((m) => m.remove());
  markers = [];
  const primary = (s) => s.places.find((x) => x.primary) || s.places[0];
  const features = [{ type: "Feature", properties: { kind: "path" }, geometry: { type: "LineString", coordinates: p.stations.map((s) => primary(s).coords) } }];
  p.stations.forEach((s, k) => {
    const main = primary(s);
    s.places.filter((x) => x !== main).forEach((x) => {
      features.push({ type: "Feature", properties: { kind: "alt" }, geometry: { type: "LineString", coordinates: [main.coords, x.coords] } });
      pin(jmarkers, x.coords, "alt", `${s.title}: ${x.name} (${x.certainty})`, () => go(`#/person/${p.id}/${k + 1}`));
    });
  });
  p.stations.forEach((s, k) => pin(jmarkers, primary(s).coords, "station", s.title, () => go(`#/person/${p.id}/${k + 1}`), String(k + 1)));
  map.getSource("journey").setData({ type: "FeatureCollection", features });
  showStation(i, false);
  const pts = features.flatMap((f) => f.geometry.coordinates);
  map.fitBounds(bounds(pts), { padding: 60, duration: 800 });
}

const bounds = (pts) => [[Math.min(...pts.map((c) => c[0])), Math.min(...pts.map((c) => c[1]))], [Math.max(...pts.map((c) => c[0])), Math.max(...pts.map((c) => c[1]))]];

function showStation(i, fly = true) {
  const p = journey, s = p.stations[i];
  jmarkers.forEach((m) => m.getElement().classList.toggle("on", m.getElement().textContent === String(i + 1)));
  setYear(s.year);
  $("#here").innerHTML = `
    <div class="jhead"><b>مسار ${p.name}</b> <span class="link" id="jclose">إغلاق المسار ✕</span></div>
    <ol class="stations">${p.stations.map((x, k) => `<li class="${k === i ? "on" : ""}" data-k="${k}">${x.title}</li>`).join("")}</ol>
    <h2>${i + 1}. ${esc(s.title)}</h2>
    <p>${tag(p.yearTag || "تقدير")}نحو ${yearText(s.year)}${s.age != null ? ` · عمره ${s.age} سنة` : ""} <span class="muted">(${p.yearNote || "تقدير الأداة"})</span></p>
    <p class="story">${esc(s.text)}</p>
    <h3>أين؟ كل الأقوال</h3>
    ${s.places.map((x, k) => `<div class="claim place${x.primary ? " primary" : ""}" data-pl="${k}">${tag(x.certainty)}<b>${esc(x.name)}</b>: ${esc(x.text)}<div class="src">${esc(x.source)}</div></div>`).join("")}
    <h3>ماذا قالت المصادر؟</h3>
    ${s.claims.map(claimHTML).join("")}
    <div class="jnav">${i > 0 ? `<button data-go="${i - 1}">→ السابق</button>` : "<span></span>"}${i < p.stations.length - 1 ? `<button data-go="${i + 1}">التالي ←</button>` : ""}</div>
    <details><summary>كيف حُسبت السنوات؟</summary>${p.chronology.map(claimHTML).join("")}</details>`;
  wireRefs($("#here"));
  $("#jclose").onclick = () => go("#/map");
  $("#here").querySelectorAll("[data-k]").forEach((li) => (li.onclick = () => go(`#/person/${p.id}/${+li.dataset.k + 1}`)));
  $("#here").querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => go(`#/person/${p.id}/${+b.dataset.go + 1}`)));
  $("#here").querySelectorAll("[data-pl]").forEach((d) => (d.onclick = () => map.flyTo({ center: s.places[+d.dataset.pl].coords, zoom: 7 })));
  $("#panel").scrollTop = 0;
  if (fly) {
    const pts = s.places.map((x) => x.coords);
    if (pts.length === 1) map.flyTo({ center: pts[0], zoom: 6 });
    else map.fitBounds(bounds(pts), { padding: 80, maxZoom: 7 });
  }
}

function closeJourney(refresh = true) {
  if (!journey) return;
  journey = null;
  jmarkers.forEach((m) => m.remove());
  jmarkers = [];
  map.getSource("journey")?.setData({ type: "FeatureCollection", features: [] });
  if (refresh) setYear(+$("#year").value);
}

// ---------- النصوص: القرآن والكتاب المقدس ----------
function renderTextIndex() {
  const src = $("#src").value;
  $("#quran-tools").hidden = src !== "q";
  if (src === "q") {
    const order = $("#order").value, place = $("#place").value;
    const list = SURAHS.filter((s) => !place || s.revelation_place === place)
      .sort((a, b) => (order === "revelation" ? a.revelation_order - b.revelation_order : a.id - b.id));
    $("#count").textContent = `${list.length} سورة`;
    $("#index").innerHTML = list.map((s) => `<li data-ref="q/${s.id}">
      <span>${order === "revelation" ? s.revelation_order : s.id}. ${s.name}</span>
      <span class="muted">${PLACE_AR[s.revelation_place]} · ~${s.year_est}م · ${s.verses} آية</span></li>`).join("");
  } else {
    const books = BIBLE.books.filter((b) => b.testament === src);
    $("#count").textContent = `${books.length} سفرًا`;
    $("#index").innerHTML = books.map((b) => `<li data-ref="b/${b.id}/1"><span>${b.name}</span><span class="muted">${b.chapters} أصحاحًا</span></li>`).join("");
  }
  wireRefs($("#index"));
}

const parseRange = (r) => { const [a, b] = String(r || "").split("-").map(Number); return a ? [a, b || a] : null; };

async function openQuran(id, range) {
  TEXT ||= await fetch("data/quran/text-uthmani.json").then((r) => r.json());
  const s = SURAHS[id - 1];
  const events = DB.events.filter((e) => (e.quran || []).includes(id));
  const people = PEOPLE.filter((p) => p.stations.some((st) => st.claims.some((c) => c.quran && +c.quran.split(":")[0] === id)));
  $("#reader").innerHTML = `<h2>سورة ${s.name}</h2>
    <div class="facts">
      <span>ترتيب المصحف</span><span>${s.id}</span>
      <span>ترتيب النزول</span><span>${tag("قول")}${s.revelation_order}</span>
      <span>مكان النزول</span><span>${tag("قول")}${PLACE_AR[s.revelation_place]}</span>
      <span>زمن النزول</span><span>${tag("تقدير")}نحو ${s.year_est}م <span class="muted">(تقدير الأداة: توزيع خطي على ترتيب النزول، المكي 610–622م والمدني 622–632م)</span></span>
      <span>المصدر</span><span class="muted">${esc(s.source)}</span>
      ${events.map((e) => `<span>يتحدث عن</span><span class="link" data-event="${e.id}">${esc(e.name)}</span>`).join("")}
      ${people.map((p) => `<span>يذكر</span><span class="link" data-person="${p.id}">مسار ${p.name}</span>`).join("")}
    </div>
    <div class="ayat">${TEXT[id].map((a, i) => `<span class="v${range && i + 1 >= range[0] && i + 1 <= range[1] ? " hl" : ""}">${esc(a)}<span class="n">﴿${(i + 1).toLocaleString("ar-EG")}﴾</span></span>`).join(" ")}</div>`;
  $("#reader").querySelectorAll("[data-event]").forEach((a) => (a.onclick = () => {
    const e = DB.events.find((x) => x.id === a.dataset.event);
    const y = e.datings ? e.datings[0].year : e.time.to;
    go("#/map");
    setYear(y);
    showEvent(e, y);
  }));
  $("#reader").querySelectorAll("[data-person]").forEach((a) => (a.onclick = () => go(`#/person/${a.dataset.person}`)));
}

async function openBible(id, ch, range) {
  bibleCache[id] ||= await fetch(`data/bible/${id}.json`).then((r) => r.json());
  const book = BIBLE.books.find((b) => b.id === id), chapters = bibleCache[id];
  ch = Math.min(Math.max(1, ch || 1), chapters.length);
  $("#reader").innerHTML = `<h2>${book.name} ${ch}</h2>
    <p class="muted">${esc(BIBLE.source)}</p>
    <div class="chapters">${chapters.map((_, k) => `<span class="${k + 1 === ch ? "on" : ""}" data-ref="b/${id}/${k + 1}">${k + 1}</span>`).join("")}</div>
    <div class="bible">${chapters[ch - 1].map((v, i) => `<span class="v${range && i + 1 >= range[0] && i + 1 <= range[1] ? " hl" : ""}"><sup>${i + 1}</sup>${esc(v)}</span>`).join(" ")}</div>`;
  wireRefs($("#reader"));
}

async function openText(kind, a, b) {
  if (kind === "b") {
    const [ch, r] = String(b || "1").split(":");
    $("#src").value = BIBLE.books.find((x) => x.id === a)?.testament || "old";
    renderTextIndex();
    await openBible(a, +ch, parseRange(r));
  } else {
    const [s, r] = String(a || "1").split(":");
    $("#src").value = "q";
    renderTextIndex();
    await openQuran(+s || 1, parseRange(r));
  }
  $("#reader").hidden = false;
  const hl = $("#reader .hl");
  if (hl) hl.scrollIntoView({ block: "center" }); else $("#reader").scrollTop = 0;
}

// ---------- المقارنة ----------
const MARK = { y: "✓", n: "—", "~": "◐", "?": "؟" };
function renderCompare(f = FAMILIES.flood) {
  const vs = f.versions;
  const cls = (v, extra = "") => ` class="${extra}${v.canon ? " canon-col" : ""}"`;
  const shared = f.motifs.filter((m) => vs.every((v) => m.v[v.id] === "y")).map((m) => m.name);
  $("#compare").innerHTML = `
    <h2>${esc(f.name)} <span class="muted">Thompson ${esc(f.thompson)}</span></h2>
    <p><b>المشترك بين كل الروايات:</b> ${shared.map(esc).join("، ")}.</p>
    <div class="scroll"><table>
      <thead><tr><th></th>${vs.map((v) => `<th${cls(v)}>${esc(v.name)}<div class="muted">${esc(v.hero)}</div></th>`).join("")}</tr></thead>
      <tbody>
        <tr><th>الموضع</th>${vs.map((v) => `<td${cls(v, "small")}>${esc(v.ref)}</td>`).join("")}</tr>
        <tr><th>زمن التدوين</th>${vs.map((v) => `<td${cls(v, "small")}>${tag(v.written.certainty)}${esc(v.written.text)}</td>`).join("")}</tr>
        ${f.motifs.map((m) => `<tr><th>${esc(m.name)}</th>${vs.map((v) => `<td${cls(v, "mark m-" + ({ "?": "q", "~": "p" }[m.v[v.id]] || m.v[v.id]))} title="${f.legend[m.v[v.id]]}">${MARK[m.v[v.id]]}</td>`).join("")}</tr>`).join("")}
        <tr><th>ما تنفرد به</th>${vs.map((v) => `<td${cls(v, "small")}><ul>${f.unique[v.id].map((u) => `<li>${esc(u)}</li>`).join("")}</ul></td>`).join("")}</tr>
      </tbody>
    </table></div>
    <p class="muted">${Object.entries(f.legend).map(([k, t]) => `${MARK[k]} ${t}`).join(" · ")}</p>
    <h3>قاموس الأسماء المتقابلة</h3>
    ${f.names.map((n) => `<div class="claim">${tag(n.certainty)}<b>${n.names.map(esc).join(" / ")}</b><div class="src">${esc(n.relation)}</div></div>`).join("")}`;
}

// ---------- التنقل: كل شاشة لها رابط ----------
const go = (hash) => (location.hash === hash ? route() : (location.hash = hash));

function showView(v) {
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("on", el.id === "view-" + v));
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  if (v === "map") map.resize();
}

function route() {
  const [, view = "map", a, b, c] = location.hash.split("/");
  // الخريطة لم تجهز بعد: حدث load يستدعي route من جديد
  if (!map.getSource("journey") && !["people", "compare", "text"].includes(view)) return;
  if (view === "person") {
    const p = PEOPLE.find((x) => x.id === a);
    if (!p) return go("#/people");
    showView("map");
    const i = Math.min(p.stations.length - 1, Math.max(0, (+b || 1) - 1));
    if (journey !== p) openJourney(p, i); else showStation(i);
  } else if (view === "text") {
    showView("text");
    openText(a, b, c);
  } else if (view === "people" || view === "compare") {
    showView(view);
  } else {
    showView("map");
    closeJourney();
  }
}

load().then(() => {
  $("#year").min = MIN_YEAR;
  $("#year").max = MAX_YEAR;
  initMap();
  renderTicks();
  renderPeople();
  renderTextIndex();
  renderCompare();
  $("#year").oninput = (e) => { if (journey) history.replaceState(null, "", "#/map"), closeJourney(false); setYear(+e.target.value); };
  $("#minus").onclick = () => setYear(+$("#year").value - 1);
  $("#plus").onclick = () => setYear(+$("#year").value + 1);
  $("#order").onchange = $("#place").onchange = $("#src").onchange = renderTextIndex;
  document.querySelectorAll("nav button").forEach((b) => (b.onclick = () => go("#/" + b.dataset.view)));
  window.onhashchange = route;
});
