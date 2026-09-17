# Black Belt Building 3V 5/8 Geometry Intake

**Model:** `WB-DOME-12-8-V3`

**Route:** `/3v`

**Status:** independently verified centerline geometry; physical system open

**Issue:** mathematical reference only—not released for fabrication, structure,
weather enclosure, occupancy, permitting, or assembly

**Printable field companion:**
[`black-belt-building-3v-geometry-field-reference-intake-01.pdf`](../public/downloads/black-belt-building-3v-geometry-field-reference-intake-01.pdf)
packages the independently verified geometry, schedules, source reconciliation,
construction holds, and requests for information for Jantz. It is a geometry +
RFI field reference—not a fabrication drawing, finished-member schedule, or cut
list.

## 1. Separation from the existing 2V reference

The 12 ft 2V hemisphere at `/` remains the default Black Belt Building dome
reference. This document adds a distinct 12 ft 8 in, Class-I frequency-3, 5/8
cap at `/3v`; it does not replace or silently rescale the 2V model.

None of these 2V studies transfers to the 3V option:

- mortise-and-tenon or port-normal joint studies;
- entrance and removed-member study;
- platform or site-placement study;
- panel placement and physical panel detailing;
- Rev 08 PDF; or
- any clearance conclusion.

The 3V route therefore presents only its own centerline mesh, gross triangular
faces, node valences, dimensions, parts, layers, and mathematical audit.
Timber-like prisms and round node markers in the viewport use arbitrary display
thickness; they do not define stock or connector dimensions.

## 2. Independent geometry method

The model begins with a regular icosahedron oriented with a five-fold vertex at
the apex. Every source triangular face is divided into a 3 by 3 Class-I grid.
The new vertices are projected radially onto the circumsphere. The 5/8 cap keeps
the audited upper face band, producing a connected triangulated disk with a
15-edge boundary.

The display is scaled so the greatest horizontal distance between any two of
the 15 boundary-node axes is exactly 152 in:

\[
R=\frac{152}{1.9588641709728285}
 =77.5959876404\text{ in}
\]

The corresponding parent-sphere diameter is 155.191975281 in. This is a
node-center normalization chosen for comparison with the nominal 12 ft 8 in
reference. It does **not** prove an outside-of-frame dimension. Stock thickness,
joint setbacks, frame construction, bevels, and tolerances have not been
modeled.

The five lowest boundary nodes define display elevation zero. The derived
node-center rise from that datum to the apex is 92.152410941 in.

## 3. Canonical topology

| Quantity | Audited value |
| --- | ---: |
| Nodes, \(V\) | 61 |
| Unique member axes, \(E\) | 165 |
| Triangular faces, \(F\) | 105 |
| Boundary nodes / edges, \(B\) | 15 / 15 |
| H4 nodes | 15 |
| H5 nodes | 6 |
| H6 nodes | 40 |
| Face-edge incidences | 315 |

The disk and connection identities close exactly:

\[
V-E+F=61-165+105=1
\]

\[
15(4)+6(5)+40(6)=330=2E
\]

\[
3F=3(105)=315=2E-B
\]

The executable audit additionally requires one connected component, unique
faces, consistent outward winding, edge incidences of one or two, and one
connected closed boundary cycle whose vertices each have boundary degree two.
Euler closure alone is not treated as proof of a triangulated disk.

The last equation is the critical count distinction. **315 is the number of
face-edge incidences**: every triangular face contributes three sides, interior
edges are encountered twice, and each of the 15 boundary edges is encountered
once. The canonical geodesic mesh has **165 unique axes**, not 315.

## 4. Node-center chord families

All values below join one mathematical node center to another. They are not saw
lengths, blank lengths, panel-frame cut lengths, or finished member lengths.

| Class | Count | Radius factor | Node-center chord at this scale |
| --- | ---: | ---: | ---: |
| A | 30 | 0.348615488820338 | 27.051163162 in |
| B | 55 | 0.403548212335198 | 31.313722097 in |
| C | 80 | 0.412411489309850 | 32.001476827 in |
| **Total** | **165** | — | — |

For a different sphere radius \(R\), each chord is its listed factor times
\(R\). A physical schedule would additionally require a selected joint solid,
shoulder datums, tenon or connector depths, stock dimensions, bevels, tolerances,
material condition, and an assembly sequence.

Against the private plan's rounded chord values, the independent residuals are
A −0.011337 in, B +0.001222 in, and C +0.001477 in. A blanket ±0.0015 in claim
is therefore false. These are source-reconciliation differences, not machining
accuracy, cut tolerance, or evidence that a physical system has been verified.

## 5. Gross triangular face families

| Sector family | Face signature | Count | Gross node-center side lengths | B-edge base × altitude to B |
| --- | --- | ---: | --- | --- |
| Pentagon sector | A-A-B | 30 | 27.051163162, 27.051163162, 31.313722097 in | 31.313722097 × 22.059649374 in |
| Hexagon sector | B-C-C | 75 | 31.313722097, 32.001476827, 32.001476827 in | 31.313722097 × 27.909805109 in |
| **Total** | — | **105** | — | — |

These are mathematical face triangles only. They do not include sheathing
overlaps, frame width, kerfs, bevels, edge treatment, openings, drainage,
movement gaps, membranes, or fastening. The labels “pentagon sector” and
“hexagon sector” identify where the triangles occur in the 3V pattern; they do
not describe five-sided or six-sided finished panels. Their listed angles are
planar interior triangle angles, not miter, bevel, compound-saw, or joinery
settings.
For both isosceles families, the only B edge is the declared reference base and
the listed altitude is perpendicular to that B edge. This is gross planar
geometry only, not a panel-cut or fabrication datum.

## 6. Boundary and envelope

The 5/8 boundary is intentionally not planar. Five boundary nodes sit at the
low datum and ten sit 1.237901794 in higher. A real platform, foundation, or
pony wall must resolve that condition; the model does not flatten it.

| Derived centerline dimension | Value |
| --- | ---: |
| Maximum boundary-node pair span | 152.000000000 in |
| Minimum boundary caliper span | 151.042328417 in |
| Boundary elevation ripple | 1.237901794 in |
| Maximum plan span of any retained mesh node | 152.888904539 in |
| Low-boundary datum to apex | 92.152410941 in |

The retained mesh extends farther in plan than the 152 in boundary-node
normalization. Neither value is a finished exterior footprint or site-clearance
dimension.

## 7. Private-plan and release boundary

A commercial plan was supplied privately for a limited factual cross-check of
reported counts, rounded chord labels, and the source platform method. It remains
private. This repository and the `/3v` route do not embed,
redistribute, trace, or reproduce its pages, drawings, artwork, prose,
proprietary shop layouts, or PDF. The public model is generated from the
independent icosahedral construction and audited identities recorded above.

The private reference's reported panel-frame total can reconcile with 315 face
sides, but that numerical agreement is not a released cut schedule, license to
redistribute the plan, or verification of its physical construction details.
It is a different reference system from the 165 unique node-center axes: a
face-by-face panel method duplicates shared boundaries. Doorway-piece allocation
is still unresolved, so neither count is published as a physical cut list.

The reviewed source platform uses metal hardware and therefore does not satisfy
the requested all-wood brief. No replacement member sizing, timber joint,
foundation, anchorage, uplift path, or direct wood-to-concrete connection is
approved by this audit. Those are engineering questions, not geometry outputs.

The following remain explicitly open:

- finished timber and panel dimensions;
- joint solids, hub bodies, retention, tolerances, and machining;
- doorway, pony wall, platform, foundation, and assembly sequence;
- weatherproofing, drainage, durability, and moisture movement;
- acoustic or resonance performance;
- wind, snow, seismic, uplift, impact, connection, and foundation capacity;
- code, permit, egress, fire, accessibility, and occupancy review; and
- fabrication drawings, CNC paths, and field authorization.

Do not buy stock, cut parts, machine joints, assemble, occupy, or scale physical
dimensions from this document or the interactive display. A qualified local
engineer, fabricator, and code authority must review a complete physical design
for the actual site and intended use.
