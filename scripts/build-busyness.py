#!/usr/bin/env python3
"""Estimate how busy the blue (SER "AZUL") zones usually are, per barrio, weekday and hour.

Writes public/data/madrid/busyness.json from the council's parking ticket files
(datos.madrid.es dataset 300470, one ZIP of ~1 GB of CSV per quarter, CC BY 4.0).

Method
- Every AZUL ticket reserves [fecha_inicio, fecha_fin). The overlap with each
  clock hour is added to a (barrio, weekday, hour) bucket as occupied minutes.
- occupancy = occupied minutes / (days of that weekday seen x blue spaces x 60),
  capped at 1; availability = 100 x (1 - occupancy).
- Blue spaces per barrio come from public/data/madrid/stretches.json (visitor
  stretches), assigned to barrios by point-in-polygon on barrios.geojson.
- Hours when the city-wide ticket volume is below 5% of its busiest hour are
  stored as null: the zone is not regulated then, so "availability" is meaningless.
- Tickets undercount parked cars (e.g. zero-emission and exempt vehicles may not
  buy one) and may overstate stays that end early, so treat the result as a
  relative, historic indication, not a live count.

Usage:
  python3 scripts/build-busyness.py [ticket.zip|URL ...]
With no arguments the four newest quarterly ZIPs listed by CKAN are downloaded
into a scratch folder (several hundred MB; needs network). Pure standard library.
"""
import io
import json
import sys
import tempfile
import urllib.request
import zipfile
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public/data/madrid"
CKAN = "https://datos.madrid.es/api/3/action/package_show?id=300470-0-ser-uso-parquimetros"
QUARTERS = 4
MIN_SPACES = 20  # barrios with fewer blue spaces are too small for a stable ratio
REGULATED_SHARE = 0.05

_day_cache = {}


def day_info(s):
    """'YYYY-MM-DD' -> (ordinal, weekday Mon=0)."""
    info = _day_cache.get(s)
    if info is None:
        d = date(int(s[0:4]), int(s[5:7]), int(s[8:10]))
        info = _day_cache[s] = (d.toordinal(), d.weekday())
    return info


def minute_of(s):
    """Absolute minute index of 'YYYY-MM-DD HH:MM:SS' (local time)."""
    ordinal, _ = day_info(s[:10])
    return ordinal * 1440 + int(s[11:13]) * 60 + int(s[14:16])


def process(path):
    """One quarterly ZIP -> (occupied minutes per (code, weekday, hour), days seen per weekday)."""
    occ = defaultdict(int)
    days = set()
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        with z.open(name) as raw:
            f = io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace", newline="")
            head = f.readline().rstrip("\r\n").split(";")
            i_start, i_end = head.index("fecha_inicio"), head.index("fecha_fin")
            i_dis, i_bar = head.index("cod_distrito"), head.index("cod_barrio")
            i_zone = head.index("tipo_zona")
            for line in f:
                p = line.split(";")
                if len(p) < 12 or p[i_zone] != "AZUL":
                    continue
                try:
                    start, end = minute_of(p[i_start]), minute_of(p[i_end])
                    code = str(int(p[i_dis])) + str(int(p[i_bar]))
                    ordinal, wd = day_info(p[i_start][:10])
                except (ValueError, IndexError):
                    continue
                if end <= start or end - start > 600:
                    continue
                days.add((ordinal, wd))
                t = start
                while t < end:
                    nxt = min(end, (t // 60 + 1) * 60)
                    day, rem = divmod(t, 1440)
                    occ[(code, date.fromordinal(day).weekday(), rem // 60)] += nxt - t
                    t = nxt
    return dict(occ), sorted(days)


def in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def load_barrios():
    out = []
    for f in json.load(open(DATA / "barrios.geojson"))["features"]:
        polys = f["geometry"]["coordinates"]
        xs = [c[0] for poly in polys for c in poly[0]]
        ys = [c[1] for poly in polys for c in poly[0]]
        out.append((f["properties"], polys, (min(xs), min(ys), max(xs), max(ys))))
    return out


def barrio_at(barrios, lng, lat):
    for props, polys, (x0, y0, x1, y1) in barrios:
        if not (x0 <= lng <= x1 and y0 <= lat <= y1):
            continue
        for poly in polys:
            if in_ring(lng, lat, poly[0]) and not any(in_ring(lng, lat, h) for h in poly[1:]):
                return props["code"]
    return None


def resolve(arg, tmp):
    if not arg.startswith("http"):
        return arg
    dest = Path(tmp) / arg.rsplit("/", 1)[-1]
    if not dest.exists():
        print(f"Downloading {arg}", flush=True)
        urllib.request.urlretrieve(arg, dest)
    return str(dest)


def default_sources():
    with urllib.request.urlopen(CKAN, timeout=60) as res:
        resources = json.load(res)["result"]["resources"]
    quarterly = [r for r in resources if "trimestre" in r["url"].lower()]
    quarterly.sort(key=lambda r: r.get("created") or "", reverse=True)
    return [r["url"] for r in quarterly[:QUARTERS]]


def main():
    sources = sys.argv[1:] or default_sources()
    with tempfile.TemporaryDirectory() as tmp:
        paths = [resolve(s, tmp) for s in sources]
        print(f"Processing {len(paths)} files", flush=True)
        with ProcessPoolExecutor(max_workers=min(len(paths), 4)) as pool:
            results = list(pool.map(process, paths))

    occ = defaultdict(int)
    days = set()
    for o, d in results:
        for k, v in o.items():
            occ[k] += v
        days.update(d)
    ndays = [sum(1 for _, wd in days if wd == w) for w in range(7)]

    barrios = load_barrios()
    names = {p["code"]: p["name"] for p, _, _ in barrios}
    spaces = defaultdict(int)
    for s in json.load(open(DATA / "stretches.json"))["items"]:
        if s["kind"] == "visitor":
            code = barrio_at(barrios, s["lng"], s["lat"])
            if code:
                spaces[code] += s["spaces"]

    city = defaultdict(int)
    for (_, wd, h), v in occ.items():
        city[(wd, h)] += v
    peak = max((v / ndays[wd] for (wd, _), v in city.items() if ndays[wd]), default=0)
    regulated = {
        (wd, h)
        for wd in range(7)
        for h in range(24)
        if ndays[wd] and city[(wd, h)] / ndays[wd] >= REGULATED_SHARE * peak
    }

    out_barrios = {}
    for code, n in sorted(spaces.items(), key=lambda kv: int(kv[0])):
        if n < MIN_SPACES:
            continue
        avail = []
        for wd in range(7):
            row = []
            for h in range(24):
                if (wd, h) not in regulated:
                    row.append(None)
                    continue
                use = min(1.0, occ.get((code, wd, h), 0) / (ndays[wd] * n * 60))
                row.append(round(100 * (1 - use)))
            avail.append(row)
        out_barrios[code] = {"name": names.get(code, code), "spaces": n, "avail": avail}

    by_zone = {}
    for c in json.load(open(DATA / "candidates.json"))["items"]:
        code = barrio_at(barrios, c["target"]["lng"], c["target"]["lat"])
        if code in out_barrios:
            by_zone[c["id"]] = code

    out = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "days": {"from": min(d for d, _ in days), "to": max(d for d, _ in days)},
        "barrios": out_barrios,
        "byZone": by_zone,
    }
    out["days"] = {
        "from": date.fromordinal(out["days"]["from"]).isoformat(),
        "to": date.fromordinal(out["days"]["to"]).isoformat(),
    }
    target = DATA / "busyness.json"
    target.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(
        f"Wrote {len(out_barrios)} barrios, {len(by_zone)}/275 zones to {target} "
        f"({target.stat().st_size} bytes); {sum(ndays)} days"
    )


if __name__ == "__main__":
    main()
