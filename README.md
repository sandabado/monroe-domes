# Black Belt Building Dome CAD

Interactive architectural reference prepared for Jantz and Black Belt Building.
The existing 12 ft Class-I frequency-2 hemisphere remains the default at `/`.
A separate 12 ft 8 in Class-I frequency-3, 5/8 reference is available at `/3v`.

The two models are intentionally isolated. The 2V entrance, platform, site,
joinery, clearance study, and Rev 08 PDF do not transfer to the 3V option. The 3V
route currently exposes independently generated centerline geometry, individual
member axes, hubs, gross face families, orthographic views, parts, and an audit.

## Current release boundary

### Default 2V reference (`/`)

- Centerline geometry: verified
- First mortise-and-tenon layout: does not fit; every tested pair overlaps
- Port-normal redesign clearance: verified at a 4.000 in shoulder setback with
  a fixed width-radial roll; strength, retention, and fabrication remain open
- Downloadable Rev 08 PDF: 2V canonical parts, gross faces, panel placement,
  entrance, platform, release gate, and spatial-clearance reference issued
- Fabrication drawings, finished cuts, CNC paths, structural capacity, and
  occupancy approval: not issued

The verified dome contains 26 nodes, 65 member axes, 40 triangular faces, and a
10-node planar decagon boundary. It uses 30 short chords and 35 long chords.
The proposed 1.5 × 1.25 × 0.5 in tenon volumes intersect at every tested H4,
H5, and H6 port pair under the stated common tangent-plane assumption. The
current Rev 08 study instead places each shoulder face normal to its member axis
at S = 4.000 in. It studies a 1.250 × 0.750 × 0.500 in tenon inside an
oversized 1.300 × 0.780 × 0.530 in digital pocket, within a radial slab q =
−2.500 to +0.500 in and two 1.500 in shells split at q = −1.000 in. This is
verified clearance geometry only—not a structural or fabrication release. H4
extends 1.500 in below the base-node datum, so any future detail must coordinate
a recess or raised datum.

The stated dimensions do not establish a TFEC-standard tension-loaded wood-peg
detail within the modeled 1.500 × 1.500 in dressed stock. Rev 08 therefore
specifies no peg. Other mortise-and-tenon or retention concepts require their
own engineering and test evidence. Any capture, key, or clamp shown in the
study is spatial exploration only, not a selected retention detail.

Read the full mathematical record in
[`docs/JANTSZ_AUDITED_GEOMETRY_AND_JOINERY.md`](docs/JANTSZ_AUDITED_GEOMETRY_AND_JOINERY.md).
The current printable artifact applies to the 2V reference only:
[`public/downloads/black-belt-building-dome-field-reference-rev-08.pdf`](public/downloads/black-belt-building-dome-field-reference-rev-08.pdf).

### Separate 3V 5/8 reference (`/3v`)

The independently generated 3V cap contains 61 nodes, 165 unique member axes,
105 triangular faces, and a 15-edge nonplanar boundary. Its three node-center
chord families are A × 30, B × 55, and C × 80. Hub valences are H4 × 15, H5 ×
6, and H6 × 40. The two gross face families are A-A-B × 30 and B-C-C × 75.

The number **315** is `3 × 105`: it counts triangular face-edge incidences, or
three panel-frame sides per face. It is not the number of unique geodesic axes;
that number is **165**. The 3V route does not issue finished cut lengths,
joinery, an entrance, a pony wall, a platform, weather details, or structural
capacity.

The commercial plan supplied privately for comparison remains private. No plan
pages, artwork, prose, proprietary shop layouts, or plan PDF are embedded or
redistributed by this project. Read the independent derivation and exact scope
in [`docs/3V_5_8_GEOMETRY_INTAKE.md`](docs/3V_5_8_GEOMETRY_INTAKE.md).

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

- `http://localhost:3000/` — default 2V reference
- `http://localhost:3000/3v` — separate 3V 5/8 geometry reference

## Verification

```bash
npm run typecheck
npm run lint
npm run test:geometry
npm test
npm run build
```

The default 2V interface separates:

- **Experience:** Dome, Parts, Entry, Site, or Joint
- **View:** 3D, Top, Front, or Side
- **Information:** Layers, selected-part details, project guide, and audit schedules

All dimensions presented as dome size or member length are node-center geometry
unless a future, separately reviewed fabrication release says otherwise.
