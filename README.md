# Jantsz Dome CAD

Interactive architectural geometry audit for a 12 ft, class-I, frequency-2
icosahedral hemisphere. The app exposes the complete centerline dome, individual
members, node data, orthographic views, the failed first tenon layout, a tested
port-normal spatial-clearance redesign study, and an optional unengineered
platform concept.

## Current release boundary

- Centerline geometry: verified
- First mortise-and-tenon layout: does not fit; every tested pair overlaps
- Port-normal redesign clearance: verified at a 4.000 in shoulder setback with
  a fixed width-radial roll; strength, retention, and fabrication remain open
- Downloadable PDF: non-fabrication geometry and clearance audit issued
- Fabrication drawings, finished cuts, CNC paths, structural capacity, and
  occupancy approval: not issued

The verified dome contains 26 nodes, 65 member axes, 40 triangular faces, and a
10-node planar decagon boundary. It uses 30 short chords and 35 long chords.
The proposed 1.5 × 1.25 × 0.5 in tenon volumes intersect at every tested H4,
H5, and H6 port pair under the stated common tangent-plane assumption. The
Rev 06 redesign instead places each shoulder face normal to its member axis at
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

- **Mode:** Dome, Redesign, or Old Issue
- **View:** 3D, Top, Front, or Side
- **Panels:** Layers, Parts, Geometry, and Specs

All dimensions presented as dome size or member length are node-center geometry
unless a future, separately reviewed fabrication release says otherwise.
