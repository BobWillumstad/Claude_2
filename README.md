# Drive St. Thomas — a USVI driving game

A first-person, open-top-Jeep drive around **St. Thomas, U.S. Virgin Islands**, in the browser (Three.js, no build step).

Cruise the Charlotte Amalie waterfront on Veterans Drive, climb Crown Mountain Road to Mountain Top, drop down to Magens Bay, and head out Smith Bay Road to the Red Hook ferry. And remember: **in the Virgin Islands we drive on the LEFT.** The game warns you if you drift to the wrong side.

## Play

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(Any static file server works; opening `index.html` directly from disk won't, because browsers block ES modules on `file://`.)

## Controls

| Key | Action |
| --- | --- |
| W / ↑ | Gas |
| S / ↓ | Brake, then reverse |
| A / D, ← / → | Steer |
| Space | Handbrake (slide!) |
| C | Look back |
| H | Honk |
| M | Full island map |
| R | Put the Jeep back on the road |
| N | Sound on/off |
| Esc | Pause |

On touchscreens, on-screen buttons appear.

## What's on the island

- Roads: Veterans Drive (Rte 30), Smith Bay Rd (38), Magens Bay Rd (35), Crown Mountain Rd (33), Skyline Dr (40), Hull Bay Rd (37), Mandahl Rd (42)
- Places: Charlotte Amalie and Fort Christian, Frenchtown, Havensight cruise dock (with a ship), Crown Bay, Cyril E. King Airport, Mountain Top, Drake's Seat, Magens Bay, Hull Bay, Tutu, Smith Bay, Coki Point, Red Hook ferry, Bolongo Bay, Frenchman's Reef
- The map is hand-traced from real coordinates and compressed 1:5 so the whole island is a few minutes' drive. Hills are exaggerated a bit.

## Code layout

| File | What it does |
| --- | --- |
| `src/data/stthomas.js` | All island data: coastline, hills, roads, areas, towns. **Add new islands here.** |
| `src/geo.js` | Projection (lon/lat → meters), polygon math, splines, noise |
| `src/terrain.js` | Heightmap, road carving, terrain mesh |
| `src/roads.js` | Road splines, smoothing, lookup, road meshes |
| `src/world.js` | Sky, ocean, buildings, trees, landmarks, labels |
| `src/car.js` | Jeep physics + cockpit, steering wheel, mirror, gauge |
| `src/hud.js` | Speed, location, keep-left warning, minimap |
| `src/audio.js` | Synthesized engine, horn, splash |
| `style.css` | UI styling, inspired by vi.gov (navy, orange pills, rounded cards) |

## Ideas backlog

- St. John (ferry from Red Hook) and St. Croix (seaplane / ferry)
- Traffic: safari taxis, other cars that keep left
- Missions: taxi fares, deliveries, "beat the ferry" time trials
- Day/night cycle, rain showers, sunsets at Mountain Top
- Radio with island stations
- More landmarks: Skyline Drive overlook, 99 Steps, Coral World, Emancipation Garden
- Goats and iguanas crossing the road
