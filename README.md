# Jantsz Dome CAD

Interactive architectural geometry audit for a 12 ft, class-I, frequency-2
icosahedral hemisphere. The app exposes the complete centerline dome, individual
members, node data, orthographic views, and an exact tenon-volume interference
study.

## Current release boundary

- Centerline geometry: verified
- Proposed mortise-and-tenon layout: rejected
- Fabrication drawings, finished cuts, CNC paths, PDF, and structural capacity:
  not issued

The verified dome contains 26 nodes, 65 member axes, 40 triangular faces, and a
10-node planar decagon boundary. It uses 30 short chords and 35 long chords.
The proposed 1.5 × 1.25 × 0.5 in tenon volumes intersect at every tested H4,
H5, and H6 port pair under the stated common tangent-plane assumption.

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

- **Mode:** Dome or Joint Test
- **View:** 3D, Top, Front, or Side
- **Panels:** Layers, Parts, Geometry, and Specs

All dimensions presented as dome size or member length are node-center geometry
unless a future, separately reviewed fabrication release says otherwise.
