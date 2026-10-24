// Human History — خريطة + خط زمني + القرآن بترتيب النزول + مقارنة الروايات
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const yearText = (y) => (y < 0 ? `${-y} ق.م` : `${y} م`);
const PLACE_AR = { makkah: "مكية", madinah: "مدنية" };
const CANON_AR = { quran: "القرآن", sahihain: "الصحيحان" };
const WINDOW = 150; // سنوات حول كل تاريخ مقترح
const MIN_YEAR = -7000, MAX_YEAR = 2026;

let DB, SURAHS, TEXT, FAMILIES = {}, map, markers = [];

async function load() {
  [DB, SURAHS, FAMILIES.flood] = await Promise.all(
    ["data/events.json", "data/quran/surahs.json", "data/families/flood.json"].map((u) => fetch(u).then((r) => r.json()))
  );
  DB.place = Object.fromEntries(DB.places.map((p) => [p.id, p]));
}

// حدث بمدى زمني، أو حدث بتواريخ مقترحة متعددة
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
    setYear(+$("#year").value);
  });
}

function renderTicks() {
  const pct = (y) => ((y - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
  const ticks = [];
  DB.events.forEach((e) => (e.datings || [{ year: e.time.from, text: e.name }]).forEach((d) => ticks.push({ y: d.year, t: `${e.name}: ${d.text}` })));
  $("#ticks").innerHTML = ticks.map((k) => `<i style="left:${pct(k.y)}%" title="${esc(yearText(k.y) + " — " + k.t)}" data-y="${k.y}"></i>`).join("");
  $("#ticks").querySelectorAll("i").forEach((i) => (i.onclick = () => setYear(+i.dataset.y)));
}

function pin(coords, cls, title, onClick) {
  const el = document.createElement("div");
  el.className = "pin " + cls;
  el.title = title;
  el.onclick = onClick;
  markers.push(new maplibregl.Marker({ element: el }).setLngLat(coords).addTo(map));
}

function setYear(y) {
  y = Math.max(MIN_YEAR, Math.min(MAX_YEAR, y));
  $("#year").value = y;
  $("#year-label").textContent = yearText(y);
  markers.forEach((m) => m.remove());
  markers = [];

  const events = DB.events.filter((e) => eventVisible(e, y));
  const world = DB.world.filter((w) => w.time.from <= y && y <= w.time.to);
  events.forEach((e) => e.places.forEach((pid) => pin(DB.place[pid].coords, "", `${e.name}: ${DB.place[pid].name}`, () => showEvent(e, y))));
  world.forEach((w) => pin(DB.place[w.place].coords, "world", w.name, () => showWorld(w)));

  const surahs = SURAHS.filter((s) => s.year_est === y);
  $("#world").innerHTML = [
    ...world.map((w, i) => `<li data-w="${DB.world.indexOf(w)}">${tag(w.certainty)}${esc(w.name)}</li>`),
    ...surahs.map((s) => `<li data-surah="${s.id}">${tag("تقدير")}نزول سورة ${s.name} <span class="muted">(تقدير الأداة)</span></li>`),
  ].join("") || `<li class="muted">لا توجد بيانات لهذه السنة بعد.</li>`;
  $("#world").querySelectorAll("li[data-w]").forEach((li) => (li.onclick = () => showWorld(DB.world[+li.dataset.w])));
  $("#world").querySelectorAll("li[data-surah]").forEach((li) => (li.onclick = () => { switchView("quran"); openSurah(+li.dataset.surah); }));

  if (events[0]) showEvent(events[0], y);
  else $("#here").innerHTML = `<h2>${yearText(y)}</h2><p class="muted">لا يوجد حدث مسجّل في هذه السنة. اضغط على العلامات تحت الخط الزمني للانتقال إلى حدث.</p>`;
}

function claimHTML(c) {
  const badge = c.canon ? `<span class="canon-badge">${CANON_AR[c.canon]}</span>` : "";
  return `<div class="claim${c.canon ? " canon" : ""}">${badge}${tag(c.certainty)}${c.grade ? `<span class="muted">(${esc(c.grade)}) </span>` : ""}${esc(c.text)}<div class="src">المصدر: ${esc(c.source)}</div></div>`;
}

function showEvent(e, y) {
  const places = e.places.map((p) => DB.place[p].name).join("، ");
  const quran = (e.quran || []).map((id) => `<span class="link" data-surah="${id}">${SURAHS[id - 1].name}</span>`).join("، ");
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
  $("#here").querySelectorAll("[data-surah]").forEach((a) => (a.onclick = () => { switchView("quran"); openSurah(+a.dataset.surah); }));
  $("#here").querySelectorAll("[data-family]").forEach((a) => (a.onclick = () => switchView("compare")));
  $("#here").querySelectorAll(".datings li").forEach((li) => (li.onclick = () => {
    const d = e.datings[+li.dataset.i];
    setYear(d.year);
    if (d.place) map.flyTo({ center: DB.place[d.place].coords, zoom: 5 });
  }));
}

function showWorld(w) {
  $("#here").innerHTML = `<h2>${esc(w.name)}</h2>
    <p>${tag(w.certainty)}${yearText(w.time.from)} – ${yearText(w.time.to)}<br>المكان: ${esc(DB.place[w.place].name)}</p>
    <div class="claim"><div class="src">المصدر: ${esc(w.source)}</div></div>`;
  map.flyTo({ center: DB.place[w.place].coords, zoom: 4 });
}

// ---------- القرآن ----------
function renderSurahs() {
  const order = $("#order").value, place = $("#place").value;
  const list = SURAHS.filter((s) => !place || s.revelation_place === place)
    .sort((a, b) => (order === "revelation" ? a.revelation_order - b.revelation_order : a.id - b.id));
  $("#count").textContent = `${list.length} سورة`;
  $("#surahs").innerHTML = list.map((s) => `<li data-id="${s.id}">
      <span>${order === "revelation" ? s.revelation_order : s.id}. ${s.name}</span>
      <span class="muted">${PLACE_AR[s.revelation_place]} · ~${s.year_est}م · ${s.verses} آية</span></li>`).join("");
  $("#surahs").querySelectorAll("li").forEach((li) => (li.onclick = () => openSurah(+li.dataset.id)));
}

async function openSurah(id) {
  TEXT ||= await fetch("data/quran/text-uthmani.json").then((r) => r.json());
  const s = SURAHS[id - 1];
  const events = DB.events.filter((e) => (e.quran || []).includes(id));
  $("#surahs").querySelectorAll("li").forEach((li) => li.classList.toggle("on", +li.dataset.id === id));
  const r = $("#reader");
  r.hidden = false;
  r.innerHTML = `<h2>سورة ${s.name}</h2>
    <div class="facts">
      <span>ترتيب المصحف</span><span>${s.id}</span>
      <span>ترتيب النزول</span><span>${tag("قول")}${s.revelation_order}</span>
      <span>مكان النزول</span><span>${tag("قول")}${PLACE_AR[s.revelation_place]}</span>
      <span>زمن النزول</span><span>${tag("تقدير")}نحو ${s.year_est}م <span class="muted">(تقدير الأداة: توزيع خطي على ترتيب النزول، المكي 610–622م والمدني 622–632م)</span></span>
      <span>المصدر</span><span class="muted">${esc(s.source)}</span>
      ${events.map((e) => `<span>يتحدث عن</span><span class="link" data-event="${e.id}">${esc(e.name)}${e.time.label && !e.datings ? ` (${esc(e.time.label)})` : ""}</span>`).join("")}
    </div>
    <div class="ayat">${TEXT[id].map((a, i) => `${esc(a)}<span class="n">﴿${(i + 1).toLocaleString("ar-EG")}﴾</span>`).join(" ")}</div>`;
  r.querySelectorAll("[data-event]").forEach((a) => (a.onclick = () => {
    const e = DB.events.find((x) => x.id === a.dataset.event);
    const y = e.datings ? e.datings[0].year : e.time.to;
    switchView("map");
    setYear(y);
    showEvent(e, y);
  }));
  r.scrollTop = 0;
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

// ---------- التنقل ----------
function switchView(v) {
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("on", el.id === "view-" + v));
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  if (v === "map") map.resize();
}

load().then(() => {
  $("#year").min = MIN_YEAR;
  $("#year").max = MAX_YEAR;
  initMap();
  renderTicks();
  renderSurahs();
  renderCompare();
  $("#year").oninput = (e) => setYear(+e.target.value);
  $("#minus").onclick = () => setYear(+$("#year").value - 1);
  $("#plus").onclick = () => setYear(+$("#year").value + 1);
  $("#order").onchange = $("#place").onchange = renderSurahs;
  document.querySelectorAll("nav button").forEach((b) => (b.onclick = () => switchView(b.dataset.view)));
});
