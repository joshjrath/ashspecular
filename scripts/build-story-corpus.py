#!/usr/bin/env python3
"""
Turn a folder of Stories scripts (.docx, as the writers deliver them) into
src/web/stories/corpus.json — what the Story Lab learns from.

    python3 scripts/build-story-corpus.py "<folder of .docx scripts>"

Each script is split the way the writers split it — INTRO, PART 1…n, OUTRO,
whichever header style they used ("PART 3", "[PART 3 — Title]", "Part-3:") —
and kept as sections of paragraphs, with the names said in each section.
Run it again whenever new scripts come in; nothing else needs changing.
"""
import glob
import json
import os
import re
import sys
import zipfile

PLAIN = re.compile(r"^\s*(INTRO|OUTRO|VERDICT/OUTRO|FINAL CASE|PAR[TR]\s*-?\s*(\d+)\s*:?)\s*\.?\s*$", re.I)
BRACK = re.compile(r"^\s*\[(?:SECTION\s*[—-]\s*)?(INTRO|OUTRO|PART\s*(\d+))\s*(?:[—-]\s*([^\]]*))?\]\s*(.*)$", re.I)
ENTITY = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'"}
# Words that start sentences or titles but aren't names.
NOT_NAMES = set("""A An The This That These Those It Its He She They We You I If When Once By At In On For
From With Without After Before During Instead Even Still But And Or So Then Now There Here What Why How Who
Which Nothing None Some Most Every Each Another Other One Two First Second Third Part Intro Outro Maybe
Probably Eventually Because Although While Until Since Unless As Not No Yes Up Out Over Under Into Onto Both
Either Neither All Any More Less Much Many Few Several Everyone Someone Anyone Nobody Somebody Everything
Something Anything Mr Mrs Ms Dr St Season Episode Chapter His Her Their Our My Your Them Him Us Me People
Others Just Only Also Yet Too Very Really Almost Maybe Perhaps Later Soon Instead Meanwhile Sometimes""".split())
CONTRACTION = re.compile(r"^(He|She|They|We|You|I|It|That|There|Who|What|Here|Let|Don|Doesn|Didn|Isn|Wasn|Wouldn|Couldn|Can|Won)['’]\w*$")


def text_of(path):
    if path.lower().endswith(".docx"):
        xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf8")
        out = []
        for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
            t = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p))
            for k, v in ENTITY.items():
                t = t.replace(k, v)
            out.append(t)
        return out
    return open(path, encoding="utf8").read().split("\n")


def title_of(filename):
    name = os.path.splitext(os.path.basename(filename))[0].replace("[SCRIPT] ", "")
    name = re.sub(r"_(4_RULES?_|RETENTION|FINAL|PROPERLY|V\d|\(|\[).*$", "", name)
    name = re.sub(r"_V3_Junpei.*", "", name)
    return name.replace("_", " ").strip()


def names_in(text):
    """Capitalised runs that look like names: Homelander, Black Noir, Hollow Purple."""
    counts = {}
    for m in re.finditer(r"\b([A-Z][a-zA-Z'’-]+(?:\s+(?:of\s+)?[A-Z][a-zA-Z'’-]*){0,3})", text):
        words = [w for w in m.group(1).split() if w not in NOT_NAMES and not CONTRACTION.match(w)]
        if not words:
            continue
        name = " ".join(words).replace("’s", "").replace("'s", "")
        if len(name) < 3:
            continue
        counts[name] = counts.get(name, 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: -kv[1])[:25])


def parse(path):
    title = title_of(path)
    sections = []
    cur = {"name": "INTRO", "label": "", "paras": []}
    for raw in text_of(path):
        line = re.sub(r"^#\S+ ", "", raw.strip().lstrip("*").strip())
        plain = PLAIN.match(line) if len(line) < 30 else None
        brack = BRACK.match(line)
        if plain or brack:
            if cur["paras"]:
                sections.append(cur)
            if brack:
                kind, num, label, rest = brack.group(1).upper(), brack.group(2), (brack.group(3) or "").strip(), brack.group(4).strip()
            else:
                kind, num, label, rest = plain.group(1).upper(), plain.group(2), "", ""
            name = f"PART {int(num)}" if num else ("OUTRO" if ("OUTRO" in kind or "FINAL" in kind) else "INTRO")
            cur = {"name": name, "label": label, "paras": [rest] if rest else []}
        elif line and line.lower().rstrip("?") != title.lower() and not re.fullmatch(r"(INTRO|PART\s*\d+)\.?", line, re.I):
            # Production notes aren't script.
            line = re.sub(r"^\[CLIP NOTE:[^\]]*\]\s*", "", line)
            if line:
                cur["paras"].append(line)
    sections.append(cur)
    out = []
    for s in sections:
        if not s["paras"]:
            continue
        text = " ".join(s["paras"])
        out.append({
            "name": s["name"],
            "label": s["label"],
            "paras": s["paras"],
            "words": len(text.split()),
            "names": names_in(text),
        })
    return {"title": title, "file": os.path.basename(path), "words": sum(s["words"] for s in out), "sections": out}


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    folder = sys.argv[1]
    files = sorted(glob.glob(os.path.join(folder, "**", "*.docx"), recursive=True) + glob.glob(os.path.join(folder, "**", "*.txt"), recursive=True))
    scripts = [parse(f) for f in files]
    scripts = [s for s in scripts if s["words"] > 500]
    here = os.path.dirname(os.path.abspath(__file__))
    target = os.path.join(here, "..", "src", "web", "stories", "corpus.json")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w", encoding="utf8") as f:
        json.dump({"built": len(scripts), "scripts": scripts}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(scripts)} scripts, {sum(s['words'] for s in scripts):,} words → {os.path.relpath(target)}")


if __name__ == "__main__":
    main()
