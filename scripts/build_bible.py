"""Build data/bible/ from the Smith–Van Dyck Arabic Bible (public domain) via bible.helloao.org.
Usage: python -I build_bible.py <vdv_complete.json> <out_dir>"""
import json, sys, pathlib
src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
d = json.loads(src.read_text(encoding="utf-8"))
books, total = [], 0
for b in d["books"]:
    chapters = []
    for c in b["chapters"]:
        verses = {}
        for item in c["chapter"]["content"]:
            if item.get("type") == "verse":
                text = " ".join(x if isinstance(x, str) else x.get("text", "") for x in item["content"]).strip()
                verses[item["number"]] = text
        chapters.append([verses[n] for n in sorted(verses)])
        total += len(verses)
    (out / f"{b['id']}.json").write_text(json.dumps(chapters, ensure_ascii=False), encoding="utf-8")
    books.append({"id": b["id"], "name": b["name"], "chapters": len(chapters), "testament": "old" if b["order"] <= 39 else "new"})
(out / "books.json").write_text(json.dumps({"source": "ترجمة فان دايك (ملك عام) عبر bible.helloao.org", "books": books}, ensure_ascii=False, indent=1), encoding="utf-8")
assert len(books) == 66
print("books", len(books), "verses", total)
