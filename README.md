# Black Belt Building Dome CAD

Interactive architectural reference prepared for Jantz and Black Belt Building
for a 12 ft, class-I, frequency-2 icosahedral hemisphere. The app exposes the
complete centerline dome, every timber and node, orthographic views, gross panel
families, an optional crouch entrance, an unengineered all-wood platform concept,
and the current port-normal spatial-clearance study.

## Current release boundary

- Centerline geometry: verified
- First mortise-and-tenon layout: does not fit; every tested pair overlaps
- Port-normal redesign clearance: verified at a 4.000 in shoulder setback with
  a fixed width-radial roll; strength, retention, and fabrication remain open
- Downloadable Rev 07 PDF: canonical parts, gross faces, panel placement,
  entrance, platform, release gate, and spatial-clearance reference issued
- Fabrication drawings, finished cuts, CNC paths, structural capacity, and
  occupancy approval: not issued

The verified dome contains 26 nodes, 65 member axes, 40 triangular faces, and a
10-node planar decagon boundary. It uses 30 short chords and 35 long chords.
The proposed 1.5 × 1.25 × 0.5 in tenon volumes intersect at every tested H4,
H5, and H6 port pair under the stated common tangent-plane assumption. The
The current Rev 07 study instead places each shoulder face normal to its member axis at
S = 4.000 in. It studies a 1.250 × 0.750 × 0.500 in tenon inside an oversized
1.300 × 0.780 × 0.530 in digital pocket, within a radial slab q = −2.500 to
+0.500 in and two 1.500 in shells split at q = −1.000 in. This is verified
clearance geometry only—not a structural or fabrication release. H4 extends
1.500 in below the base-node datum, so any future detail must coordinate a
recess or raised datum.

A standard pegged mortise-and-tenon detail is unavailable in the modeled
1.500 × 1.500 in dressed stock. Any capture, key, or clamp shown in the study is
spatial exploration only, not a selected retention detail.

Read the full mathematical record in
[`docs/JANTSZ_AUDITED_GEOMETRY_AND_JOINERY.md`](docs/JANTSZ_AUDITED_GEOMETRY_AND_JOINERY.md).
The current printable artifact is
[`public/downloads/black-belt-building-dome-field-reference-rev-07.pdf`](public/downloads/black-belt-building-dome-field-reference-rev-07.pdf).

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The interface separates:

- **Experience:** Dome, Parts, Entry, Site, or Joint
- **View:** 3D, Top, Front, or Side
- **Information:** Layers, selected-part details, project guide, and audit schedules

All dimensions presented as dome size or member length are node-center geometry
unless a future, separately reviewed fabrication release says otherwise.
