#!/usr/bin/env python3
"""Download the parking meter locations and write public/data/madrid/parquimetros.geojson.

Source: Ayuntamiento de Madrid, layer 5 "Parquímetros" of the
SERVICIO_DE_ESTACIONAMIENTO_REGULADO MapServer (about 4,750 points, served
2,000 per request). Only the coordinates are kept (5 decimals, ~1 m), as one MultiPoint.

Usage: python3 scripts/build-parquimetros.py
"""
import json
import urllib.request
from pathlib import Path

BASE = (
    "https://sigma.madrid.es/hosted/rest/services/GEOPORTAL/"
    "SERVICIO_DE_ESTACIONAMIENTO_REGULADO/MapServer/5/query"
    "?where=1%3D1&outFields=OBJECTID&orderByFields=OBJECTID&outSR=4326&f=geojson"
)
PAGE = 2000
OUT = Path(__file__).resolve().parent.parent / "public/data/madrid/parquimetros.geojson"


def fetch(offset):
    url = f"{BASE}&resultOffset={offset}&resultRecordCount={PAGE}"
    with urllib.request.urlopen(url, timeout=60) as res:
        return json.load(res)["features"]


def main():
    points, offset = [], 0
    while True:
        page = fetch(offset)
        points += [f["geometry"]["coordinates"] for f in page if f.get("geometry")]
        if len(page) < PAGE:
            break
        offset += PAGE
    # A single MultiPoint feature keeps the file small (no per-point JSON overhead).
    feature = {
        "type": "Feature",
        "properties": {},
        "geometry": {
            "type": "MultiPoint",
            "coordinates": [[round(x, 5), round(y, 5)] for x, y in points],
        },
    }
    OUT.write_text(
        json.dumps({"type": "FeatureCollection", "features": [feature]}, separators=(",", ":"))
        + "\n"
    )
    print(f"Wrote {len(points)} parking meters to {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
