#!/usr/bin/env python3
"""Generate the non-fabrication Jantsz geometry audit PDF."""

from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    KeepTogether,
    Flowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "jantsz-v2-dome-geometry-audit-rev-06.pdf"
PUBLIC = ROOT / "public" / "downloads" / OUT.name

CREAM = colors.HexColor("#F3F0E6")
INK = colors.HexColor("#15231A")
DEEP = colors.HexColor("#07110B")
GREEN = colors.HexColor("#42644C")
GREEN_PALE = colors.HexColor("#D9E4D8")
AMBER = colors.HexColor("#C98B3D")
AMBER_PALE = colors.HexColor("#F0DFC5")
RED = colors.HexColor("#A33C2E")
RED_PALE = colors.HexColor("#F3D9D3")
GRAY = colors.HexColor("#5B665E")
LINE = colors.HexColor("#AEB9AF")
WHITE = colors.white


def register_fonts() -> tuple[str, str, str]:
    avenir = Path("/System/Library/Fonts/Avenir Next.ttc")
    mono = Path("/System/Library/Fonts/SFNSMono.ttf")
    try:
        pdfmetrics.registerFont(TTFont("AvenirNext", str(avenir), subfontIndex=0))
        pdfmetrics.registerFont(TTFont("AvenirNextDemi", str(avenir), subfontIndex=3))
        sans, bold = "AvenirNext", "AvenirNextDemi"
    except Exception:
        sans, bold = "Helvetica", "Helvetica-Bold"
    try:
        pdfmetrics.registerFont(TTFont("SFMono", str(mono)))
        mono_name = "SFMono"
    except Exception:
        mono_name = "Courier"
    return sans, bold, mono_name


SANS, BOLD, MONO = register_fonts()


def load_model() -> dict:
    result = subprocess.run(
        ["node", "--experimental-strip-types", str(ROOT / "scripts" / "export_pdf_data.mjs")],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


MODEL = load_model()
VERTEX_BY_ID = {item["id"]: item for item in MODEL["vertices"]}


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="Eyebrow", fontName=BOLD, fontSize=7.5, leading=9.5, textColor=GREEN,
    spaceAfter=5, tracking=1.5, uppercase=True,
))
styles.add(ParagraphStyle(
    name="Display", fontName=BOLD, fontSize=27, leading=29, textColor=INK,
    spaceAfter=10,
))
styles.add(ParagraphStyle(
    name="Deck", fontName=SANS, fontSize=11.5, leading=16, textColor=GRAY,
    spaceAfter=11,
))
styles.add(ParagraphStyle(
    name="H1A", fontName=BOLD, fontSize=18, leading=21, textColor=INK,
    spaceBefore=2, spaceAfter=9,
))
styles.add(ParagraphStyle(
    name="H2A", fontName=BOLD, fontSize=11, leading=13, textColor=INK,
    spaceBefore=8, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="BodyA", fontName=SANS, fontSize=8.4, leading=11.3, textColor=INK,
    spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="SmallA", fontName=SANS, fontSize=7.3, leading=9.5, textColor=GRAY,
    spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="MonoA", fontName=MONO, fontSize=7.3, leading=9.7, textColor=INK,
    spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="WhiteSmall", fontName=BOLD, fontSize=7.4, leading=9.2, textColor=WHITE,
))
styles.add(ParagraphStyle(
    name="Warn", fontName=BOLD, fontSize=8.2, leading=10.8, textColor=RED,
    spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="TableCell", fontName=SANS, fontSize=7.1, leading=9.2, textColor=INK,
))
styles.add(ParagraphStyle(
    name="TableCellMono", fontName=MONO, fontSize=6.8, leading=8.8, textColor=INK,
))
styles.add(ParagraphStyle(
    name="TableHead", fontName=BOLD, fontSize=6.8, leading=8, textColor=WHITE,
))


def P(text: str, style: str = "BodyA") -> Paragraph:
    return Paragraph(text, styles[style])


def table(data, widths, header=True, alignments=None, compact=False):
    converted = []
    for r_index, row in enumerate(data):
        converted_row = []
        for cell in row:
            if isinstance(cell, Paragraph):
                converted_row.append(cell)
            else:
                name = "TableHead" if header and r_index == 0 else ("TableCellMono" if compact else "TableCell")
                converted_row.append(P(str(cell), name))
        converted.append(converted_row)
    t = Table(converted, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("BACKGROUND", (0, 1 if header else 0), (-1, -1), CREAM),
    ]
    if header:
        commands.append(("BACKGROUND", (0, 0), (-1, 0), INK))
    if alignments:
        for index, alignment in enumerate(alignments):
            commands.append(("ALIGN", (index, 1 if header else 0), (index, -1), alignment))
    t.setStyle(TableStyle(commands))
    return t


class DrawingBlock(Flowable):
    def __init__(self, kind: str, width: float, height: float):
        super().__init__()
        self.kind = kind
        self.width = width
        self.height = height

    def wrap(self, available_width, available_height):
        return self.width, self.height

    def drawOn(self, canv, x, y, _sW=0):
        if self.kind == "plan":
            draw_plan(canv, x, y, self.width, self.height)
        elif self.kind == "elevation":
            draw_elevation(canv, x, y, self.width, self.height)
        elif self.kind == "tenon":
            draw_tenon(canv, x, y, self.width, self.height)
        elif self.kind == "redesign":
            draw_redesign(canv, x, y, self.width, self.height)


def draw_frame(c, x, y, w, h, label):
    c.saveState()
    c.setFillColor(colors.white)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.rect(x, y, w, h, fill=1, stroke=1)
    c.setFillColor(INK)
    c.setFont(BOLD, 7)
    c.drawString(x + 8, y + h - 12, label)
    c.restoreState()


def projected_bounds(points):
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), max(xs), min(ys), max(ys)


def transform_points(points, x, y, w, h, pad=24):
    min_x, max_x, min_y, max_y = projected_bounds(points)
    scale = min((w - 2 * pad) / (max_x - min_x), (h - 2 * pad) / (max_y - min_y))
    return [
        (x + w / 2 + (px - (min_x + max_x) / 2) * scale,
         y + h / 2 + (py - (min_y + max_y) / 2) * scale)
        for px, py in points
    ], scale


def draw_plan(c, x, y, w, h):
    draw_frame(c, x, y, w, h, "A-101  PLAN · NODE CENTERLINES")
    raw = [(v["position"][0], v["position"][2]) for v in MODEL["vertices"]]
    mapped, scale = transform_points(raw, x, y, w, h, 28)
    lookup = {v["id"]: mapped[index] for index, v in enumerate(MODEL["vertices"])}
    c.saveState()
    c.setLineWidth(0.55)
    for edge in MODEL["edges"]:
        c.setStrokeColor(AMBER if edge["type"] == "S" else GREEN)
        c.line(*lookup[edge["start"]], *lookup[edge["end"]])
    for vertex in MODEL["vertices"]:
        px, py = lookup[vertex["id"]]
        c.setFillColor(RED if vertex["isBase"] else INK)
        c.circle(px, py, 1.7 if vertex["isBase"] else 1.2, fill=1, stroke=0)
    # V019 and V024 are the audited opposite base-node pair on the plan's
    # vertical diameter. The left/right silhouette is only 136.952 in at this
    # +18 degree datum, so it must not be labeled as the 144 in node diameter.
    top_x, top_y = lookup["V019"]
    bottom_x, bottom_y = lookup["V024"]
    dim_x = x + w - 9
    c.setStrokeColor(INK)
    c.setLineWidth(0.45)
    c.line(top_x, top_y, dim_x, top_y)
    c.line(bottom_x, bottom_y, dim_x, bottom_y)
    c.line(dim_x, bottom_y, dim_x, top_y)
    c.line(dim_x - 3, top_y, dim_x + 3, top_y)
    c.line(dim_x - 3, bottom_y, dim_x + 3, bottom_y)
    c.setFillColor(INK)
    c.setFont(MONO, 6.5)
    c.saveState()
    c.translate(dim_x - 4, (top_y + bottom_y) / 2)
    c.rotate(90)
    c.drawCentredString(0, 0, "144.000 IN · V019 TO V024")
    c.restoreState()
    c.setFont(SANS, 6.4)
    c.setFillColor(GRAY)
    c.drawRightString(x + w - 8, y + 18, "V017 datum: +18° from +X")
    c.restoreState()


def draw_elevation(c, x, y, w, h):
    draw_frame(c, x, y, w, h, "A-201  FRONT ELEVATION · NODE CENTERLINES")
    raw = [(v["position"][0], v["position"][1]) for v in MODEL["vertices"]]
    mapped, scale = transform_points(raw, x, y, w, h, 28)
    lookup = {v["id"]: mapped[index] for index, v in enumerate(MODEL["vertices"])}
    c.saveState()
    for edge in MODEL["edges"]:
        c.setStrokeColor(AMBER if edge["type"] == "S" else GREEN)
        c.setLineWidth(0.55)
        c.line(*lookup[edge["start"]], *lookup[edge["end"]])
    for vertex in MODEL["vertices"]:
        px, py = lookup[vertex["id"]]
        c.setFillColor(RED if vertex["isBase"] else INK)
        c.circle(px, py, 1.4, fill=1, stroke=0)
    base_y = min(py for _, py in mapped)
    peak_y = max(py for _, py in mapped)
    dim_x = x + w - 13
    c.setStrokeColor(INK)
    c.setLineWidth(0.45)
    c.line(dim_x, base_y, dim_x, peak_y)
    c.line(dim_x - 3, base_y, dim_x + 3, base_y)
    c.line(dim_x - 3, peak_y, dim_x + 3, peak_y)
    c.saveState()
    c.translate(dim_x - 4, (base_y + peak_y) / 2)
    c.rotate(90)
    c.setFillColor(INK)
    c.setFont(MONO, 6.5)
    c.drawCentredString(0, 0, "72.000 IN · NODE-CENTER PEAK")
    c.restoreState()
    c.setFillColor(GRAY)
    c.setFont(SANS, 6.4)
    c.drawString(x + 8, y + 7, "Base node plane: Y = 0.000 in")
    c.restoreState()


def draw_tenon(c, x, y, w, h):
    draw_frame(c, x, y, w, h, "J-301  PROPOSED TENON LAYOUT · INTERFERENCE STUDY")
    c.saveState()
    cx, cy = x + w * 0.5, y + h * 0.48
    c.setStrokeColor(RED)
    c.setFillColor(RED_PALE)
    c.circle(cx, cy, 27, fill=1, stroke=1)
    for index in range(6):
        angle = math.radians(index * 60 + 30)
        dx, dy = math.cos(angle), math.sin(angle)
        c.saveState()
        c.translate(cx + dx * 38, cy + dy * 38)
        c.rotate(index * 60 + 30)
        c.setFillColor(AMBER_PALE)
        c.setStrokeColor(AMBER)
        c.rect(-7, -8, 50, 16, fill=1, stroke=1)
        c.setFillColor(colors.Color(0.64, 0.12, 0.08, alpha=0.62))
        c.rect(-28, -5, 31, 10, fill=1, stroke=0)
        c.restoreState()
    c.setFillColor(RED)
    c.circle(cx, cy, 4, fill=1, stroke=0)
    c.setFont(BOLD, 7)
    c.drawCentredString(cx, y + 16, "RED VOLUMES OVERLAP · FIRST LAYOUT DOES NOT FIT")
    c.setFont(SANS, 6.5)
    c.setFillColor(GRAY)
    c.drawCentredString(cx, y + 7, "Schematic explanation; exact result is from oriented-box intersection tests.")
    c.restoreState()


def draw_redesign(c, x, y, w, h):
    draw_frame(c, x, y, w, h, "J-302  PORT-NORMAL HUB ENVELOPE · CLEARANCE STUDY")
    envelope = MODEL["redesign"]["hubEnvelope"]
    q_min = -envelope["radialInboard"]
    q_max = envelope["radialOutboard"]
    q_split = envelope["radialSplit"]
    slab_left = x + 30
    slab_right = x + w - 30
    slab_bottom = y + 42
    slab_top = y + h - 34
    q_scale = (slab_right - slab_left) / (q_max - q_min)
    split_x = slab_left + (q_split - q_min) * q_scale
    c.saveState()
    c.setFillColor(GREEN_PALE)
    c.setStrokeColor(GREEN)
    c.rect(slab_left, slab_bottom, split_x - slab_left, slab_top - slab_bottom, fill=1, stroke=1)
    c.setFillColor(AMBER_PALE)
    c.setStrokeColor(AMBER)
    c.rect(split_x, slab_bottom, slab_right - split_x, slab_top - slab_bottom, fill=1, stroke=1)
    c.setStrokeColor(INK)
    c.setDash(3, 2)
    c.line(split_x, slab_bottom, split_x, slab_top)
    c.setDash()
    c.setFillColor(INK)
    c.setFont(BOLD, 6.6)
    c.drawCentredString((slab_left + split_x) / 2, slab_top - 12, "INNER SHELL · 1.500 IN")
    c.drawCentredString((split_x + slab_right) / 2, slab_top - 12, "OUTER SHELL · 1.500 IN")

    cy = slab_bottom + (slab_top - slab_bottom) * 0.43
    c.saveState()
    c.translate(slab_right - 8, cy)
    c.rotate(22)
    c.setStrokeColor(INK)
    c.setLineWidth(0.65)
    c.line(-94, 0, 54, 0)
    c.setFillColor(colors.HexColor("#DDBD87"))
    c.setStrokeColor(AMBER)
    c.rect(0, -9, 58, 18, fill=1, stroke=1)
    c.setFillColor(GREEN_PALE)
    c.setStrokeColor(GREEN)
    c.rect(-30, -5, 30, 10, fill=1, stroke=1)
    c.setStrokeColor(RED)
    c.setLineWidth(1.2)
    c.line(0, -15, 0, 15)
    c.restoreState()
    c.setFillColor(INK)
    c.setFont(BOLD, 6.2)
    c.drawRightString(x + w - 10, y + h - 16, "SHOULDER FACE NORMAL TO MEMBER AXIS")
    c.setFont(SANS, 6.0)
    c.drawRightString(x + w - 10, y + h - 26, "TENON + OVERSIZED POCKET ENVELOPE")

    dim_y = y + 24
    c.setStrokeColor(INK)
    c.setLineWidth(0.45)
    c.line(slab_left, dim_y, slab_right, dim_y)
    for px in [slab_left, split_x, slab_right]:
        c.line(px, dim_y - 3, px, dim_y + 3)
    c.setFillColor(INK)
    c.setFont(MONO, 6.5)
    c.drawString(slab_left - 8, dim_y + 4, f"q {q_min:+.3f}")
    c.drawCentredString(split_x, dim_y + 4, f"q {q_split:+.3f}")
    c.drawRightString(slab_right + 8, dim_y + 4, f"q {q_max:+.3f}")
    c.setFillColor(RED)
    c.setFont(BOLD, 6.7)
    c.drawCentredString(x + w / 2, y + 8, "SCHEMATIC DATUM RELATIONSHIP · NOT A JOINT DETAIL")
    c.restoreState()


def header_footer(c: canvas.Canvas, doc):
    page = c.getPageNumber()
    width, height = letter
    c.saveState()
    c.setFillColor(RED)
    c.rect(0, height - 18, width, 18, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(BOLD, 6.5)
    c.drawCentredString(width / 2, height - 12, "GEOMETRY REFERENCE ONLY · NOT FOR FABRICATION, STRUCTURAL, OR OCCUPANCY USE")
    c.setStrokeColor(LINE)
    c.setLineWidth(0.4)
    c.line(doc.leftMargin, 30, width - doc.rightMargin, 30)
    c.setFillColor(GRAY)
    c.setFont(SANS, 6.3)
    c.drawString(doc.leftMargin, 19, "Finished cuts, connections, tolerances, CNC data, and structural capacity are WITHHELD.")
    c.setFont(MONO, 6.3)
    c.drawRightString(width - doc.rightMargin, 19, f"WB-DOME-12-V2 · REV 06 · {page:02d}/06")
    c.restoreState()


def status_band(label, value, tone):
    bg, fg = (GREEN_PALE, GREEN) if tone == "pass" else (RED_PALE, RED)
    t = Table([[P(label, "TableCell"), P(value, "Warn" if tone != "pass" else "H2A")]], colWidths=[1.9 * inch, 4.8 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.6, fg),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def build_story():
    story = []

    story += [
        Spacer(1, 4),
        P("JANTSZ / 12 FT V2 DOME", "Eyebrow"),
        P("Geometry + clearance audit", "Display"),
        P("A mathematical record of the dome axes, member classes, node families, the failed first tenon layout, and the port-normal redesign clearance model.", "Deck"),
        status_band("DOME GEOMETRY", "CENTERLINE GEOMETRY VERIFIED", "pass"),
        Spacer(1, 7),
        status_band("OLD JOINT FIT", "FIRST TENON LAYOUT DOES NOT FIT", "fail"),
        Spacer(1, 11),
        P("What this means", "H1A"),
        P("The dome mathematics are intact. The supplied tenon dimensions and former 3 in hub comparison envelope do not fit together: every tested pair of untrimmed tenon volumes intersects on the installed H4, H5, and H6 axes. That result applies to the old layout only; it does not invalidate the dome geometry and it is not a load test.", "BodyA"),
        P("Do not order material, lay out joints, cut stock, machine hubs, set jigs, assemble, occupy, or scale from this review PDF.", "Warn"),
        Spacer(1, 4),
        P("Verified / withheld", "H1A"),
        table([
            ["VERIFIED IN THIS AUDIT", "WITHHELD UNTIL A FABRICATION RELEASE"],
            ["Topology, node coordinates and axes; two node-center chord classes; node valence and endpoint incidence; old-layout interference; defined port-normal redesign clearance model.", "Released finished or blank timber lengths; structural connection capacity; retention; mortise fit and tolerances; hub layup; CNC and jig data; loads, anchorage, foundation, openings, code and occupancy."],
        ], [3.35 * inch, 3.35 * inch]),
        Spacer(1, 10),
        P("Key node-center dimensions", "H1A"),
        table([
            ["PARAMETER", "AUDITED VALUE", "MEANING"],
            ["Sphere radius", "72.000 in", "Center to mathematical node sphere"],
            ["Base diameter", "144.000 in", "Opposite base nodes; not outside timber"],
            ["Peak height", "72.000 in", "Base node plane to apex node"],
            ["Base", "Regular decagon", "10 coplanar boundary nodes / 10 straight chords"],
        ], [1.55 * inch, 1.55 * inch, 3.6 * inch]),
        Spacer(1, 8),
        P("This downloadable document is a geometry and clearance audit—not a cut list, shop drawing, blueprint, permit set, structural design, or permission to fabricate.", "SmallA"),
        PageBreak(),
    ]

    story += [
        P("SHEET 02 / CANONICAL MODEL", "Eyebrow"),
        P("Plan and elevation", "H1A"),
        P("All lines terminate at mathematical node centers. Decimal precision records the computational model; it does not assert shop tolerance.", "Deck"),
        DrawingBlock("plan", 3.25 * inch, 3.05 * inch),
        Spacer(1, 9),
        DrawingBlock("elevation", 3.25 * inch, 3.05 * inch),
        Spacer(1, -3),
        P("Coordinate datum", "H2A"),
        P("+Y is vertical. The base lies in the XZ plane at Y = 0. Base node V017 is +18° from +X and is located at (68.476069, 0.000000, 22.249224) in.", "BodyA"),
        PageBreak(),
    ]

    story += [
        P("SHEET 03 / AXES AND INCIDENCE", "Eyebrow"),
        P("Member and node schedule", "H1A"),
        P("These counts describe the complete class-I frequency-2 icosahedral hemisphere generated by radial projection and an equatorial cut.", "Deck"),
        table([
            ["MODEL ITEM", "COUNT", "CHECK"],
            ["Nodes V", "26", "10 base / 16 above base"],
            ["Member axes E", "65", "130 directed endpoints"],
            ["Triangular faces F", "40", "V − E + F = 1"],
            ["Base boundary", "10", "Planar regular decagon"],
        ], [2.15 * inch, 1.0 * inch, 3.55 * inch]),
        Spacer(1, 9),
        P("Two node-center chord classes", "H2A"),
        table([
            ["CLASS", "COUNT", "CHORD FACTOR", "NODE-CENTER CHORD", "ROLE"],
            ["Short", "30", "0.5465330578 R", "39.3503802 in", "Shell"],
            ["Long", "35", "0.6180339887 R", "44.4984472 in", "Shell + 10 base edges"],
        ], [0.8 * inch, 0.65 * inch, 1.45 * inch, 1.35 * inch, 2.45 * inch], compact=True),
        Spacer(1, 9),
        P("Node valence families—not machining templates", "H2A"),
        table([
            ["FAMILY", "COUNT", "INCIDENT MEMBER AXES", "LOCATION / LIMIT"],
            ["H4", "10", "1 short + 3 long", "Base; 5 positive / 5 reflected installed stars"],
            ["H5", "6", "5 short", "Apex + upper ring"],
            ["H6", "10", "2 short + 4 long", "Intermediate ring"],
        ], [0.75 * inch, 0.65 * inch, 1.75 * inch, 3.55 * inch]),
        Spacer(1, 9),
        P("Endpoint-pair groups", "H2A"),
        table([
            ["MEMBER", "ENDPOINTS", "COUNT", "CENTERLINE"],
            ["Short", "H5–H6", "20", "39.3503802 in"],
            ["Short", "H4–H5", "10", "39.3503802 in"],
            ["Long", "H6–H6", "15", "44.4984472 in"],
            ["Long", "H4–H6", "10", "44.4984472 in"],
            ["Long", "H4–H4", "10", "44.4984472 in"],
        ], [1.1 * inch, 1.2 * inch, 0.8 * inch, 3.6 * inch], compact=True),
        Spacer(1, 8),
        P("Audit identities", "H2A"),
        P("V − E + F = 26 − 65 + 40 = 1 &nbsp;&nbsp;·&nbsp;&nbsp; 2E = 130 = 10(4) + 6(5) + 10(6)", "MonoA"),
        P("Chord-axis equations: L<sub>ij</sub> = ||C<sub>j</sub> − C<sub>i</sub>|| and u<sub>ij</sub> = (C<sub>j</sub> − C<sub>i</sub>) / L<sub>ij</sub>. Short central angle 31.7174744° / tangent slope 15.8587372°; long central angle 36.0000000° / tangent slope 18.0000000°.", "SmallA"),
        P("Finished-length equations remain: L<sub>shoulder</sub> = L<sub>ij</sub> − s<sub>i</sub> − s<sub>j</sub>; L<sub>tip-to-tip</sub> = L<sub>shoulder</sub> + t<sub>i</sub> + t<sub>j</sub>. Page 06 evaluates the current CAD candidate at S = 4.000 in and t = 1.250 in, but no fabrication length is released.", "SmallA"),
        PageBreak(),
    ]

    collisions = MODEL["collisionAudits"][0]["byValence"]
    collision_rows = [["INSTALLED FAMILY", "PAIR RESULT / HUB", "INSTALLATIONS", "TESTED ROLLS"]]
    for value in [4, 5, 6]:
        summary = next(item for item in collisions if item["valence"] == value)
        installs = {4: 10, 5: 6, 6: 10}[value]
        collision_rows.append([f"H{value}", f"{summary['collisionsPerHub']} / {summary['pairsPerHub']} intersect", str(installs), "0° and 90°"])
    short_setback = next(item for item in MODEL["tangentSetbacks"] if item["type"] == "S")
    long_setback = next(item for item in MODEL["tangentSetbacks"] if item["type"] == "L")
    story += [
        P("SHEET 04 / PROPOSED TENON TEST", "Eyebrow"),
        P("What failed—and what did not", "H1A"),
        P("The proposed tenons overlap. The dome centerline geometry does not fail. The test below evaluates simplified, untrimmed oriented boxes at the stated common tangent-plane offset; it does not define a hub solid or connection capacity.", "Deck"),
        DrawingBlock("tenon", 3.2 * inch, 2.45 * inch),
        Spacer(1, 9),
        P("Withdrawn concept inputs used only for this interference test", "H2A"),
        table([
            ["INPUT", "VALUE", "BOUNDARY"],
            ["Common tangent-plane apothem", "1.500 in", "Equal computational offset"],
            ["Tenon test volume", "1.5 L × 1.25 W × 0.5 T in", "Untrimmed oriented box"],
            ["Supplied envelope reference", "3 in across / 2 in radial", "Not a derived closed hub solid"],
            ["Short / long setback", f"{short_setback['setback']:.7f} / {long_setback['setback']:.7f} in", "Computational tangent-face value"],
        ], [2.0 * inch, 1.8 * inch, 2.9 * inch], compact=True),
        Spacer(1, 9),
        table(collision_rows, [1.25 * inch, 2.0 * inch, 1.25 * inch, 2.2 * inch], compact=True),
        Spacer(1, 8),
        P("Result", "H2A"),
        P("Every tested local pair intersects at the stated equal offset in both tested 90° rolls. This proves interference for those proposed test volumes only. No hub was clipped, mortise subtracted, clearance applied, cutter radius modeled, ligament or grain checked, wedge inserted, assembly path evaluated, or structural load applied.", "BodyA"),
        P("Required before fabrication CAD resumes", "H2A"),
        P("Confirm actual dressed stock and moisture; species, grade, defects and grain; choose a hub and joint family; define retention and demountability; set ligament criteria, exterior/drainage/finish/adhesive, site loads, openings, anchorage, foundation, occupancy and tooling. Then complete exact solid collision, ligament, grain and assembly-access review, prototype/test evidence, structural review, and an explicit fabrication release.", "BodyA"),
        PageBreak(),
    ]

    redesign = MODEL["redesign"]
    redesign_config = redesign["configuration"]
    redesign_tenon = redesign_config["tenon"]
    redesign_pocket = redesign["pocketEnvelope"]
    redesign_hub = redesign["hubEnvelope"]
    story += [
        P("SHEET 05 / PORT-NORMAL CLEARANCE", "Eyebrow"),
        P("Redesign clearance model", "H1A"),
        P("This is the after-model for spatial review: each shoulder face is normal to its member axis at one fixed setback. It is not a selected or capacity-checked connection.", "Deck"),
        status_band("CLEARANCE AUDIT", redesign["status"], "pass"),
        Spacer(1, 7),
        DrawingBlock("redesign", 6.7 * inch, 1.9 * inch),
        Spacer(1, 5),
        P("Defined digital envelope", "H2A"),
        table([
            ["INPUT", "VALUE", "AUDIT MEANING"],
            ["Shoulder faces", f"Axis-normal at S = {redesign_config['shoulderSetback']:.3f} in", "One fixed axial datum per port"],
            ["Exact convex footprints", " · ".join(f"{family['id']} {family['maximumPlanarDiameter']:.3f}" for family in redesign["bodyFamilies"]) + " in", "Maximum planar diameters"],
            ["Tenon study", f"{redesign_tenon['length']:.3f} × {redesign_tenon['width']:.3f} × {redesign_tenon['thickness']:.3f} in", "Integral volume study only"],
            ["Oversized pocket", f"{redesign_pocket['length']:.3f} × {redesign_pocket['width']:.3f} × {redesign_pocket['thickness']:.3f} in", "Collision envelope; not fit tolerance"],
            ["Radial slab", f"q = {-redesign_hub['radialInboard']:.3f} to +{redesign_hub['radialOutboard']:.3f} in", "Relative to node radial datum"],
            ["Two-shell division", f"q = {redesign_hub['radialSplit']:.3f} in", f"{redesign_hub['innerShellThickness']:.3f} + {redesign_hub['outerShellThickness']:.3f} in shells"],
            ["Member roll", redesign["selectedRoll"], "Fixed study condition"],
            ["H4 base condition", f"{redesign_hub['h4ClosureBelowDatum']:.3f} in below datum", f"{redesign['minimumH4ShoulderBottomRim']:.3f} in rim; recess / raised datum required"],
        ], [1.45 * inch, 2.0 * inch, 3.25 * inch], compact=True),
        Spacer(1, 5),
        P("Computed clearance record", "H2A"),
        table([
            ["CHECK", "RESULT", "MINIMUM SEPARATION"],
            ["Oversized pocket pairs", f"{redesign['sampledPocketCollisions']} of {redesign['sampledPairTests']:,} collide", f"{redesign['minimumSampledPocketSeparation']:.6f} in"],
            ["Full 1.5 × 1.5 member pairs", f"{redesign['sampledMemberCollisions']} of {redesign['sampledMemberPairTests']:,} collide", f"{redesign['minimumSampledMemberSeparation']:.6f} in"],
            ["Continuous-roll pocket bound", f"{redesign['continuousRollPocketCollisions']} of {redesign['continuousRollPocketPairTests']} collide", f"{redesign['minimumContinuousRollPocketSeparation']:.6f} in"],
            ["Split through every pocket", "All installed pockets cross q = −1", f"{redesign['minimumPocketSplitPenetration']:.6f} in each side"],
            ["Full shoulder / other faces", "Every 1.5 × 1.5 shoulder fits", f"{redesign['minimumShoulderToOtherFaceClearance']:.6f} in"],
            ["Key relief / center bore", "Clear non-own pocket envelopes", f"{redesign['minimumCrossKeyReliefToOtherPocketSeparation']:.3f} / {redesign['minimumClampBoreToPocketSeparation']:.3f} in"],
        ], [2.35 * inch, 2.2 * inch, 2.15 * inch], compact=True),
        PageBreak(),
        P("SHEET 06 / STUDY EXTENTS + RELEASE GATE", "Eyebrow"),
        P("Dimensional study boundary", "H1A"),
        P("The values below are consequences of the current CAD candidate. They make the model auditable, but they are not permission to cut timber or machine a connection.", "Deck"),
        P("Candidate member extents—not released cuts", "H2A"),
        table([
            ["CLASS", "CENTERLINE", "SHOULDER SPAN", "MODELED TIP-TO-TIP"],
            *[[
                f"{'Short' if item['type'] == 'S' else 'Long'} · {item['count']}",
                f"{item['centerlineLength']:.6f} in",
                f"{item['shoulderLength']:.6f} in",
                f"{item['tipToTipExtent']:.6f} in",
            ] for item in redesign["memberLengthStudy"]],
        ], [1.25 * inch, 1.65 * inch, 1.8 * inch, 2.0 * inch], compact=True),
        Spacer(1, 4),
        P("Connection boundary", "H2A"),
        P("Under TFEC 1-2019's standard wood-peg geometry, a pegged mortise-and-tenon cannot fit the modeled 1.500 × 1.500 in dressed stock. Any capture, cross-key, or clamp geometry is spatial exploration only. Retention, layup, grain, adhesive, fit, assembly, moisture behavior, loads, testing, and engineering remain open.", "BodyA"),
        P('Reference: <link href="https://www.tfguild.org/timber-frame-engineering-council/standards/view/104/download">TFEC 1-2019 Standard for Design of Timber Frame Structures</link>. Project-specific engineering remains required.', "SmallA"),
        P("The PDF records dome geometry plus redesign clearance. It is not a cut list, shop drawing, blueprint, structural design, permit set, or fabrication release.", "Warn"),
        P("Audit trace", "H2A"),
        P("Geometry and old-layout sources: lib/geodesic.ts and lib/joinery.ts. Redesign values and metrics: REDESIGN_STUDY in lib/spec.ts, serialized by scripts/export_pdf_data.mjs. This PDF has no approval or signature block.", "SmallA"),
    ]
    return story


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=letter,
        rightMargin=0.58 * inch,
        leftMargin=0.58 * inch,
        topMargin=0.43 * inch,
        bottomMargin=0.55 * inch,
        title="Jantsz 12 ft V2 Dome — Geometry and Clearance Audit",
        author="Whole Body / Geometry and Clearance Audit",
        subject="Non-fabrication geometry and port-normal clearance audit",
        creator="Jantsz Dome CAD",
    )
    doc.build(build_story(), onFirstPage=header_footer, onLaterPages=header_footer)
    PUBLIC.write_bytes(OUT.read_bytes())
    print(OUT)
    print(PUBLIC)


if __name__ == "__main__":
    main()
