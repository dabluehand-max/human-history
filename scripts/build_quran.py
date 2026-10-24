"""Build data/quran/*.json from Quran.com API v4 downloads (chapters + Uthmani text).
Usage: python -I build_quran.py <raw_dir> <out_dir>"""
import json, sys, pathlib
raw, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
ch = json.loads((raw / "chapters_ar.json").read_text(encoding="utf-8"))["chapters"]
vs = json.loads((raw / "verses_uthmani.json").read_text(encoding="utf-8"))["verses"]
def year_est(order, place):
    """تقدير الأداة: توزيع خطي على ترتيب النزول (المكي 610–622م، المدني 622–632م)."""
    if place == "makkah":
        return round(610 + (order - 1) * 12 / 85)
    return round(622 + (order - 87) * 10 / 27)

surahs = [{
    "id": c["id"], "name": c["name_arabic"], "name_en": c["name_simple"],
    "verses": c["verses_count"], "revelation_order": c["revelation_order"],
    "revelation_place": c["revelation_place"],
    "source": "quran.com API v4 (Tanzil metadata)", "certainty": "قول",
    "year_est": year_est(c["revelation_order"], c["revelation_place"]),
} for c in ch]
assert len(surahs) == 114 and sorted(s["revelation_order"] for s in surahs) == list(range(1, 115))
text = {}
for v in vs:
    s, a = v["verse_key"].split(":")
    text.setdefault(s, []).append(v["text_uthmani"])
assert sum(len(x) for x in text.values()) == 6236
(out / "surahs.json").write_text(json.dumps(surahs, ensure_ascii=False, indent=1), encoding="utf-8")
(out / "text-uthmani.json").write_text(json.dumps(text, ensure_ascii=False), encoding="utf-8")
print("surahs", len(surahs), "verses", sum(len(x) for x in text.values()))
