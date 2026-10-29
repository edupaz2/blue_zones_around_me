#!/usr/bin/env python3
"""Download the SER barrio boundaries and write public/data/madrid/barrios.geojson.

Source: Ayuntamiento de Madrid, layer 13 "Límite de Barrios de la Zona S.E.R."
of the SERVICIO_DE_ESTACIONAMIENTO_REGULADO MapServer. Each feature keeps the
council's barrio code (CODDIS + CODBAR, e.g. 24 = Legazpi), the barrio and
district names, and a district colour. Rings are simplified (~3 m) and rounded
to 5 decimals to keep the file small.

Usage: python3 scripts/build-barrios.py
"""
import json
import re
import urllib.request
from pathlib import Path

URL = (
    "https://sigma.madrid.es/hosted/rest/services/GEOPORTAL/"
    "SERVICIO_DE_ESTACIONAMIENTO_REGULADO/MapServer/13/query"
    "?where=1%3D1&outFields=CODDIS,NOMDIS,CODBAR,NOMBAR&outSR=4326&f=geojson"
)
OUT = Path(__file__).resolve().parent.parent / "public/data/madrid/barrios.geojson"
TOLERANCE = 0.00003  # degrees, ~3 m

# One pastel per district (CODDIS 1..21).
DISTRICT_COLORS = [
    "#8fb8e8", "#f2c46d", "#b6e08f", "#f2a9a9", "#a9d7f2", "#e8e37a", "#a8d08d",
    "#d9b3f2", "#9fd6c2", "#f2b98f", "#c9a9e8", "#f2d27a", "#b3c6f2", "#f2e0a9",
    "#e8b88f", "#f2c0d6", "#a9e0e8", "#d6e08f", "#e8a9c9", "#9fc5a0", "#c6d2e8",
]


def simplify(points, tol):
    """Douglas-Peucker on an open polyline, iterative."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = points[a], points[b]
        dx, dy = bx - ax, by - ay
        norm = (dx * dx + dy * dy) ** 0.5
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            d = (
                abs(dy * (px - ax) - dx * (py - ay)) / norm
                if norm
                else ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            )
            if d > best:
                best, idx = d, i
        if best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(points, keep) if k]


def ring(coords):
    pts = simplify([(x, y) for x, y in coords[:-1]], TOLERANCE)
    if len(pts) < 3:
        return None
    pts = [[round(x, 5), round(y, 5)] for x, y in pts]
    return pts + [pts[0]]


def polygon(rings):
    out = [r for r in (ring(r) for r in rings) if r]
    return out or None


def main():
    with urllib.request.urlopen(URL, timeout=60) as res:
        src = json.load(res)
    features = []
    for f in src["features"]:
        p = f["properties"]
        if not p["CODBAR"] or "no está en la zona" in p["NOMBAR"].lower():
            continue
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        polys = [q for q in (polygon(r) for r in polys) if q]
        if not polys:
            continue
        name = re.sub(r"\s+-\s+a partir del.*$", "", p["NOMBAR"]).strip()
        district = int(p["CODDIS"])
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "code": p["CODDIS"] + p["CODBAR"],
                    "name": name,
                    "district": p["NOMDIS"],
                    "color": DISTRICT_COLORS[(district - 1) % len(DISTRICT_COLORS)],
                },
                "geometry": {"type": "MultiPolygon", "coordinates": polys},
            }
        )
    features.sort(key=lambda f: int(f["properties"]["code"]))
    OUT.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":"))
        + "\n"
    )
    print(f"Wrote {len(features)} barrios to {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
