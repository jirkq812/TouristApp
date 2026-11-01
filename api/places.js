// Vercel serverová funkce: stáhne místa z OpenStreetMap a Vercel je na týden uloží do cache.
const CITIES = {
  "Praha":{lat:50.0755,lon:14.4378,r:8000},"Brno":{lat:49.1951,lon:16.6068,r:7000},"Ostrava":{lat:49.8209,lon:18.2625,r:7000},
  "Plzeň":{lat:49.7384,lon:13.3736,r:6000},"Liberec":{lat:50.7663,lon:15.0543,r:6000},"Olomouc":{lat:49.5938,lon:17.2509,r:6000},
  "České Budějovice":{lat:48.9745,lon:14.4743,r:6000},"Hradec Králové":{lat:50.2104,lon:15.8327,r:6000},"Pardubice":{lat:50.0343,lon:15.7812,r:7000},
  "Ústí nad Labem":{lat:50.6607,lon:14.0323,r:6000},"Karlovy Vary":{lat:50.2319,lon:12.8720,r:6000},"Jihlava":{lat:49.3961,lon:15.5912,r:6000},
  "Zlín":{lat:49.2265,lon:17.6627,r:6000},"Špindlerův Mlýn":{lat:50.7273,lon:15.6095,r:9000},"Krkonoše":{lat:50.7366,lon:15.7400,r:22000}
};
const CATS = {
  hotel:['["tourism"~"^(hotel|guest_house|hostel|apartment|motel)$"]'],
  restaurant:['["amenity"~"^(restaurant|cafe|pub)$"]'],
  sight:['["historic"]','["tourism"="attraction"]'],
  trail:['["route"~"^(hiking|foot)$"]','["tourism"="viewpoint"]']
};
function describe(t, cat) {
  const p = [];
  if (t.description) p.push(t.description);
  if (cat === "restaurant") { if (t.cuisine) p.push("Kuchyně: " + t.cuisine.replace(/[;_]/g, ", ")); p.push({cafe:"Kavárna",pub:"Hospoda",restaurant:"Restaurace"}[t.amenity] || "Restaurace"); }
  if (cat === "hotel") p.push({hotel:"Hotel",guest_house:"Penzion",hostel:"Hostel",apartment:"Apartmány",motel:"Motel"}[t.tourism] || "Ubytování");
  if (cat === "sight") p.push(t.historic ? "Historická památka (" + t.historic.replace(/_/g, " ") + ")" : "Turistická atrakce");
  if (cat === "trail") {
    if (t.tourism === "viewpoint") p.push("Vyhlídka");
    else { p.push(t.route === "foot" ? "Pěší trasa" : "Turistická trasa"); if (t.colour) p.push("Značení: " + t.colour); if (t.distance) p.push("Délka: " + t.distance + " km"); if (t.from && t.to) p.push(t.from + " → " + t.to); }
  }
  const a = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  if (a) p.push("Adresa: " + a);
  if (t.opening_hours) p.push("Otevřeno: " + t.opening_hours);
  return p.join(" · ");
}
module.exports = async (req, res) => {
  const { city, cat } = req.query;
  const c = CITIES[city];
  if (!c || !CATS[cat]) return res.status(400).json({ error: "bad params" });
  const q = `[out:json][timeout:40];(${CATS[cat].map(f => `nwr(around:${c.r},${c.lat},${c.lon})${f}["name"];`).join("")});out tags center 100;`;
  let json = null;
  for (const url of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 22000);
      const r = await fetch(url, { method: "POST", body: new URLSearchParams({ data: q }), signal: ctl.signal });
      clearTimeout(to);
      if (r.ok) { json = await r.json(); break; }
    } catch (e) {}
  }
  if (!json) return res.status(502).json({ error: "overpass unavailable" });
  const seen = new Set();
  const data = json.elements.map(e => {
    const t = e.tags, la = e.lat ?? (e.center && e.center.lat), lo = e.lon ?? (e.center && e.center.lon);
    if (!la || seen.has(t.name)) return null; seen.add(t.name);
    let img = t.image && /^https?:/.test(t.image) ? t.image : "";
    if (!img && t.wikimedia_commons && t.wikimedia_commons.startsWith("File:")) img = "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(t.wikimedia_commons.slice(5)) + "?width=500";
    return { id: `${e.type}${e.id}`, name: t.name, city, category: cat, description: describe(t, cat), image: img, lat: la, lon: lo, web: t.website || t["contact:website"] || "", osm: true };
  }).filter(Boolean).slice(0, 100);
  if (!data.length) return res.status(200).json([]);
  res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=2592000");
  res.status(200).json(data);
};
