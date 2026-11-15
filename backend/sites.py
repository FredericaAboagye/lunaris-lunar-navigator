"""Curated candidate lunar south-polar sites.

Coordinates are approximate feature locations (selenographic latitude,
east-positive longitude) intended for comparative exploration. They are
NOT surveyed landing-site coordinates; verify against LRO/LOLA products
before any real use.
"""

SITES = [
    {
        "id": "south-pole",
        "name": "Lunar South Pole",
        "latitude": -89.99,
        "longitude": 0.0,
        "region": "Pole",
        "note": "Geographic pole; local azimuth is degenerate here.",
    },
    {
        "id": "shackleton",
        "name": "Shackleton Crater Rim",
        "latitude": -89.9,
        "longitude": 129.8,
        "region": "Pole",
        "note": "Permanently shadowed interior; elevated rim receives "
                "near-continuous sunlight.",
    },
    {
        "id": "connecting-ridge",
        "name": "Shackleton–de Gerlache Ridge",
        "latitude": -89.45,
        "longitude": 222.7,
        "region": "Pole",
        "note": "Ridge between Shackleton and de Gerlache, a long-studied "
                "high-illumination candidate.",
    },
    {
        "id": "de-gerlache",
        "name": "de Gerlache Rim",
        "latitude": -88.5,
        "longitude": 272.9,
        "region": "Near-pole",
        "note": "Rim of de Gerlache crater.",
    },
    {
        "id": "haworth",
        "name": "Haworth Crater",
        "latitude": -87.5,
        "longitude": 5.0,
        "region": "Near-pole",
        "note": "Large crater with permanently shadowed floor.",
    },
    {
        "id": "faustini",
        "name": "Faustini Crater",
        "latitude": -87.3,
        "longitude": 77.0,
        "region": "Near-pole",
        "note": "Deep crater with permanently shadowed regions.",
    },
    {
        "id": "nobile",
        "name": "Nobile Crater Rim",
        "latitude": -85.2,
        "longitude": 53.3,
        "region": "Mid-south",
        "note": "Candidate region on the Nobile rim.",
    },
    {
        "id": "malapert",
        "name": "Malapert Massif",
        "latitude": -85.9,
        "longitude": 0.0,
        "region": "Mid-south",
        "note": "Massif with near-constant Earth line of sight.",
    },
    {
        "id": "cabeus",
        "name": "Cabeus Crater",
        "latitude": -84.9,
        "longitude": 324.5,
        "region": "Mid-south",
        "note": "Site of the LCROSS impact.",
    },
]
