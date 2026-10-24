// قصص إيش ما كان — المرحلة 1: خريطة + خط زمني + القرآن بترتيب النزول
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const yearText = (y) => (y < 0 ? `${-y} ق.م` : `${y} م`);
const inRange = (t, y) => t.from <= y && y <= t.to;
const PLACE_AR = { makkah: "مكية", madinah: "مدنية" };

let DB, SURAHS, TEXT, map, markers = [];

async function load() {
  [DB, SURAHS] = await Promise.all([
    fetch("data/events.json").then((r) => r.json()),
    fetch("data/quran/surahs.json").then((r) => r.json()),
  ]);
  DB.place = Object.fromEntries(DB.places.map((p) => [p.id, p]));
}

// ---------- الخريطة والزمن ----------
function initMap() {
  maplibregl.setRTLTextPlugin("https://cdn.jsdelivr.net/npm/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js", true);
  map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/positron",
    center: [40, 25], zoom: 2.6,
  });
  map.addControl(new maplibregl.NavigationControl(), "top-left");
  map.on("load", () => {
    // أسماء الأماكن بالعربية متى وُجدت
    map.getStyle().layers.filter((l) => l.type === "symbol" && l.layout?.["text-field"])
      .forEach((l) => map.setLayoutProperty(l.id, "text-field", ["coalesce", ["get", "name:ar"], ["get", "name"]]));
    setYear(+$("#year").value);
  });
}

function pin(coords, cls, title, onClick) {
  const el = document.createElement("div");
  el.className = "pin " + cls;
  el.title = title;
  el.onclick = onClick;
  markers.push(new maplibregl.Marker({ element: el }).setLngLat(coords).addTo(map));
}

function setYear(y) {
  $("#year").value = y;
  $("#year-label").textContent = yearText(y);
  markers.forEach((m) => m.remove());
  markers = [];

  const events = DB.events.filter((e) => inRange(e.time, y));
  const world = DB.world.filter((w) => inRange(w.time, y));
  events.forEach((e) => e.places.forEach((pid) => pin(DB.place[pid].coords, "", e.name, () => showEvent(e))));
  world.forEach((w) => pin(DB.place[w.place].coords, "world", w.name, () => showWorld(w)));

  $("#world").innerHTML = world.length
    ? world.map((w) => `<li data-id="${w.id}"><span class="tag" data-c="${w.certainty}">${w.certainty}</span>${esc(w.name)}</li>`).join("")
    : `<li class="muted">لا توجد بيانات لهذه السنة بعد.</li>`;
  $("#world").querySelectorAll("li[data-id]").forEach((li) => (li.onclick = () => showWorld(DB.world.find((w) => w.id === li.dataset.id))));

  if (events[0]) showEvent(events[0]);
  else $("#here").innerHTML = `<h2>${yearText(y)}</h2><p class="muted">لا يوجد حدث مسجّل في هذه السنة بعد. حرّك الخط الزمني إلى 570م أو 610م.</p>`;
}

function claimHTML(c) {
  return `<div class="claim"><span class="tag" data-c="${c.certainty}">${c.certainty}</span>${esc(c.text)}<div class="src">المصدر: ${esc(c.source)}</div></div>`;
}

function showEvent(e) {
  const places = e.places.map((p) => DB.place[p].name).join("، ");
  const quran = (e.quran || []).map((id) => {
    const s = SURAHS[id - 1];
    return `<p>في القرآن: <span class="link" data-surah="${id}">سورة ${s.name}</span>. نزلت في ${s.revelation_place === "makkah" ? "مكة" : "المدينة"} (ترتيبها ${s.revelation_order} في النزول)، وهذا غير مكان الحدث وزمنه.</p>`;
  }).join("");
  $("#here").innerHTML = `
    <h2>${esc(e.name)} ${e.status === "draft" ? '<span class="draft">مسودة قيد المراجعة</span>' : ""}</h2>
    <p><span class="tag" data-c="${e.time.certainty}">${e.time.certainty}</span>${esc(e.time.label)}<br>المكان: ${esc(places)}</p>
    ${quran}${e.claims.map(claimHTML).join("")}`;
  $("#here").querySelectorAll("[data-surah]").forEach((a) => (a.onclick = () => { switchView("quran"); openSurah(+a.dataset.surah); }));
}

function showWorld(w) {
  $("#here").innerHTML = `<h2>${esc(w.name)} <span class="draft">مسودة قيد المراجعة</span></h2>
    <p><span class="tag" data-c="${w.certainty}">${w.certainty}</span>${yearText(w.time.from)} – ${yearText(w.time.to)}<br>المكان: ${esc(DB.place[w.place].name)}</p>
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
      <span class="muted">${PLACE_AR[s.revelation_place]} · ${s.verses} آية</span></li>`).join("");
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
      <span>ترتيب النزول</span><span><span class="tag" data-c="قول">قول</span>${s.revelation_order}</span>
      <span>مكان النزول</span><span><span class="tag" data-c="قول">قول</span>${PLACE_AR[s.revelation_place]}</span>
      <span>زمن النزول</span><span><span class="tag" data-c="غير معروف">غير معروف</span>لم يُحدَّد بالسنة في هذه البيانات</span>
      <span>المصدر</span><span class="muted">${esc(s.source)}</span>
      ${events.map((e) => `<span>يتحدث عن</span><span class="link" data-event="${e.id}">${esc(e.name)} (${esc(e.time.label)})</span>`).join("")}
    </div>
    <div class="ayat">${TEXT[id].map((a, i) => `${esc(a)}<span class="n">﴿${(i + 1).toLocaleString("ar-EG")}﴾</span>`).join(" ")}</div>`;
  r.querySelectorAll("[data-event]").forEach((a) => (a.onclick = () => {
    const e = DB.events.find((x) => x.id === a.dataset.event);
    switchView("map");
    setYear(e.time.to);
    showEvent(e);
  }));
  r.scrollTop = 0;
}

// ---------- التنقل ----------
function switchView(v) {
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("on", el.id === "view-" + v));
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  if (v === "map") map.resize();
}

load().then(() => {
  initMap();
  renderSurahs();
  $("#year").oninput = (e) => setYear(+e.target.value);
  $("#minus").onclick = () => setYear(+$("#year").value - 1);
  $("#plus").onclick = () => setYear(+$("#year").value + 1);
  $("#order").onchange = $("#place").onchange = renderSurahs;
  document.querySelectorAll("nav button").forEach((b) => (b.onclick = () => switchView(b.dataset.view)));
});
