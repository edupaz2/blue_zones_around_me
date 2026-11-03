#!/usr/bin/env python3
"""Download the Barcelona barri boundaries and write public/data/barcelona/barrios.geojson.

Source: Ajuntament de Barcelona, open data dataset "Unitats administratives de la
ciutat de Barcelona" (20170706-districtes-barris, CC BY 4.0). The GeoJSON resource
is a ZIP with the polygons in ETRS89 / UTM 31N (EPSG:25831); the 73 BARRI features
are converted to WGS84, simplified (~3 m) and rounded to 5 decimals. Each feature
keeps the barri code (01..73), its name, its district name, and a district colour,
in the same shape as the Madrid file.

Usage: python3 scripts/build-barris.py
"""
import importlib.util
import io
import json
import math
import sys
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
CKAN = "https://opendata-ajuntament.barcelona.cat/data/api/3/action/package_show?id=20170706-districtes-barris"
OUT = HERE.parent / "public/data/barcelona/barrios.geojson"
TOLERANCE = 0.00003  # degrees, ~3 m

# One pastel per district (CODI_UA 01..10).
DISTRICT_COLORS = [
    "#8fb8e8", "#f2c46d", "#b6e08f", "#f2a9a9", "#a9d7f2",
    "#e8e37a", "#d9b3f2", "#9fd6c2", "#f2b98f", "#c9a9e8",
]

sys.dont_write_bytecode = True  # keep the loaded sibling script from leaving a __pycache__

# Reuse the Douglas-Peucker simplifier of the Madrid script (hyphenated file name, so load by path).
_spec = importlib.util.spec_from_file_location("build_barrios", HERE / "build-barrios.py")
_barrios = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_barrios)
simplify = _barrios.simplify

# GRS80 / UTM zone 31N (central meridian 3 E), inverse transverse Mercator (Krueger series).
A, F = 6378137.0, 1 / 298.257222101
K0, X0, LON0 = 0.9996, 500000.0, math.radians(3)
N = F / (2 - F)
RECT = A / (1 + N) * (1 + N**2 / 4 + N**4 / 64)
BETA = (
    N / 2 - 2 * N**2 / 3 + 37 * N**3 / 96,
    N**2 / 48 + N**3 / 15,
    17 * N**3 / 480,
)
DELTA = (
    2 * N - 2 * N**2 / 3 - 2 * N**3,
    7 * N**2 / 3 - 8 * N**3 / 5,
    56 * N**3 / 15,
)


def to_wgs84(easting, northing):
    xi = northing / (K0 * RECT)
    eta = (easting - X0) / (K0 * RECT)
    xi_p = xi - sum(b * math.sin(2 * (j + 1) * xi) * math.cosh(2 * (j + 1) * eta) for j, b in enumerate(BETA))
    eta_p = eta - sum(b * math.cos(2 * (j + 1) * xi) * math.sinh(2 * (j + 1) * eta) for j, b in enumerate(BETA))
    chi = math.asin(math.sin(xi_p) / math.cosh(eta_p))
    lat = chi + sum(d * math.sin(2 * (j + 1) * chi) for j, d in enumerate(DELTA))
    lon = LON0 + math.atan2(math.sinh(eta_p), math.cos(xi_p))
    return math.degrees(lon), math.degrees(lat)


def ring(coords):
    pts = simplify([to_wgs84(x, y) for x, y in coords[:-1]], TOLERANCE)
    if len(pts) < 3:
        return None
    pts = [[round(x, 5), round(y, 5)] for x, y in pts]
    return pts + [pts[0]]


def polygon(rings):
    out = [r for r in (ring(r) for r in rings) if r]
    return out or None


def fetch_polygons():
    with urllib.request.urlopen(CKAN, timeout=60) as res:
        resources = json.load(res)["result"]["resources"]
    url = next(r["url"] for r in resources if r["format"].lower() == "geojson")
    with urllib.request.urlopen(url, timeout=120) as res:
        zf = zipfile.ZipFile(io.BytesIO(res.read()))
    name = next(n for n in zf.namelist() if n.endswith("UNITATS_ADM_POLIGONS.json"))
    return json.loads(zf.read(name).decode("utf-8"))


def main():
    src = fetch_polygons()
    crs = src.get("crs", {}).get("properties", {}).get("name", "")
    if not crs.endswith("25831"):
        raise SystemExit(f"Unexpected CRS {crs!r}; this script converts EPSG:25831 only")
    feats = src["features"]
    districts = {f["properties"]["CODI_UA"]: f["properties"]["NOM"] for f in feats if f["properties"]["TIPUS_UA"] == "DISTRICTE"}
    features = []
    for f in feats:
        p = f["properties"]
        if p["TIPUS_UA"] != "BARRI":
            continue
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        polys = [q for q in (polygon(r) for r in polys) if q]
        if not polys:
            continue
        district = p["DISTRICTE"]
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "code": p["CODI_UA"],
                    "name": p["NOM"],
                    "district": districts[district],
                    "color": DISTRICT_COLORS[(int(district) - 1) % len(DISTRICT_COLORS)],
                },
                "geometry": {"type": "MultiPolygon", "coordinates": polys},
            }
        )
    features.sort(key=lambda f: int(f["properties"]["code"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")) + "\n"
    )
    print(f"Wrote {len(features)} barris to {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
