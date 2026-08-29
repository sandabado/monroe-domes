#!/usr/bin/env python3
"""Generate the Black Belt Building non-fabrication dome field reference."""

from __future__ import annotations

import json
import hashlib
import math
import re
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
from pypdf import PdfReader, PdfWriter
from pypdf.generic import BooleanObject, DecodedStreamObject, DictionaryObject, NameObject, TextStringObject
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

CREAM = colors.HexColor("#F3F0E6")
INK = colors.HexColor("#15231A")
DEEP = colors.HexColor("#07110B")
GREEN = colors.HexColor("#28573A")
GREEN_PALE = colors.HexColor("#D9E4D8")
AMBER = colors.HexColor("#865817")
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
        pdfmetrics.registerFont(TTFont("AvenirNext", str(avenir), subfontIndex=7))
        pdfmetrics.registerFont(TTFont("AvenirNextDemi", str(avenir), subfontIndex=2))
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


class FieldCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        kwargs.setdefault("initialFontName", SANS)
        kwargs.setdefault("initialFontSize", 10)
        super().__init__(*args, **kwargs)


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
REVISION = MODEL["project"]["revision"]
PAGE_COUNT = 9
SHEETS = (
    ("G-000", "Release cover"),
    ("G-101", "Canonical plan and elevation"),
    ("G-201", "Parts before assembly"),
    ("P-101", "Gross panel families and schedule"),
    ("P-102", "Panel placement map"),
    ("E-101", "Optional entrance study"),
    ("D-101", "Platform plan and section"),
    ("J-301", "Port-normal clearance study"),
    ("R-001", "Release gate and audit trace"),
)
OUTPUT_NAME = f"black-belt-building-dome-field-reference-rev-{REVISION.lower()}.pdf"
OUT = ROOT / "output" / "pdf" / OUTPUT_NAME
PUBLIC = ROOT / "public" / "downloads" / OUTPUT_NAME
MEMBER_BY_PIECE_ID = {item["pieceId"]: item for item in MODEL["members"]}
FACE_BY_ID = {item["id"]: item for item in MODEL["faces"]}
PANEL_BY_FACE_ID = {item["faceId"]: item for item in MODEL["panels"]}
MODEL_DIGEST = hashlib.sha256(
    json.dumps(MODEL, sort_keys=True, separators=(",", ":")).encode("utf-8")
).hexdigest()


def assert_model_contract() -> None:
    counts = MODEL["audit"]["counts"]
    panel_types = {item["type"]: item for item in MODEL["panelConcept"]["types"]}
    entrance = MODEL["entrance"]
    platform = MODEL["platform"]
    assert MODEL["project"]["revision"] == "07"
    assert MODEL["handoff"]["company"] == "Black Belt Building"
    assert (counts["vertices"], counts["edges"], counts["faces"]) == (26, 65, 40)
    assert (counts["struts"]["S"], counts["struts"]["L"]) == (30, 35)
    assert (counts["hubs"]["4"], counts["hubs"]["5"], counts["hubs"]["6"]) == (10, 6, 10)
    assert (panel_types["P1"]["count"], panel_types["P2"]["count"]) == (30, 10)
    assert math.isclose(MODEL["panelConcept"]["grossTotalAreaSquareFeet"], 209.98676505092973, abs_tol=1e-9)
    assert len(entrance["hiddenFaceIds"]) == 6
    assert len(entrance["hiddenMemberPieceIds"]) == 7
    assert entrance["hiddenNodeIds"] == ["V007"]
    assert (entrance["clearWidthInches"], entrance["clearRiseInches"]) == (36, 58)
    assert platform["diameterInches"] == 192
    assert platform["radialApronBeyondDomeNodesInches"] == 24
    assert math.isclose(platform["flatApronInches"], 22.825356391083684, abs_tol=1e-9)


assert_model_contract()


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="Eyebrow", fontName=BOLD, fontSize=9, leading=11, textColor=GREEN,
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
    name="H2A", fontName=BOLD, fontSize=12, leading=14, textColor=INK,
    spaceBefore=8, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="BodyA", fontName=SANS, fontSize=10.5, leading=13.8, textColor=INK,
    spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="SmallA", fontName=SANS, fontSize=9.5, leading=11.8, textColor=GRAY,
    spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="MonoA", fontName=MONO, fontSize=9.5, leading=11.8, textColor=INK,
    spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="WhiteSmall", fontName=BOLD, fontSize=9, leading=10.5, textColor=WHITE,
))
styles.add(ParagraphStyle(
    name="Warn", fontName=BOLD, fontSize=9.8, leading=12.2, textColor=RED,
    spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="TableCell", fontName=SANS, fontSize=9.5, leading=11.2, textColor=INK,
))
styles.add(ParagraphStyle(
    name="TableCellMono", fontName=MONO, fontSize=9.5, leading=11.0, textColor=INK,
))
styles.add(ParagraphStyle(
    name="TableHead", fontName=BOLD, fontSize=9.5, leading=11.0, textColor=WHITE,
))
styles.add(ParagraphStyle(
    name="Caption", fontName=SANS, fontSize=9.4, leading=11.6, textColor=GRAY,
    spaceBefore=3, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="DenseCell", fontName=MONO, fontSize=9, leading=9.2, textColor=INK,
))
styles.add(ParagraphStyle(
    name="DenseHead", fontName=BOLD, fontSize=9, leading=9.2, textColor=WHITE,
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
    vertical_padding = 2.0 if compact else 5.0
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), vertical_padding),
        ("BOTTOMPADDING", (0, 0), (-1, -1), vertical_padding),
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
        elif self.kind == "cover":
            draw_cover_axon(canv, x, y, self.width, self.height)
        elif self.kind == "panels":
            draw_panel_templates(canv, x, y, self.width, self.height)
        elif self.kind == "face-map":
            draw_face_map(canv, x, y, self.width, self.height)
        elif self.kind == "entrance":
            draw_entrance_study(canv, x, y, self.width, self.height)
        elif self.kind == "platform":
            draw_platform_study(canv, x, y, self.width, self.height)
        elif self.kind == "redesign":
            draw_redesign(canv, x, y, self.width, self.height)


def draw_frame(c, x, y, w, h, label):
    c.saveState()
    c.setFillColor(colors.white)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.rect(x, y, w, h, fill=1, stroke=1)
    c.setFillColor(INK)
    c.setFont(BOLD, 9.5)
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


def project_axon(position):
    px, py, pz = position
    return (0.82 * px - 0.58 * pz, py + 0.26 * px + 0.32 * pz, 0.55 * px + 0.78 * pz)


def draw_member_line(c, start, end, member_type, width=1.0, muted=False):
    if muted:
        c.setStrokeColor(colors.HexColor("#9AA39C"))
        c.setDash()
        c.setLineWidth(max(0.45, width * 0.65))
    elif member_type == "S":
        c.setStrokeColor(AMBER)
        c.setDash(5, 2.5)
        c.setLineWidth(width * 1.15)
    else:
        c.setStrokeColor(GREEN)
        c.setDash()
        c.setLineWidth(width)
    c.line(*start, *end)
    c.setDash()


def draw_legend(c, x, y):
    c.setFont(BOLD, 9)
    c.setFillColor(INK)
    c.drawString(x, y, "MEMBER LEGEND")
    draw_member_line(c, (x + 94, y + 3), (x + 130, y + 3), "S", 1.2)
    c.setFont(SANS, 9)
    c.drawString(x + 136, y, "SHORT")
    draw_member_line(c, (x + 200, y + 3), (x + 236, y + 3), "L", 1.2)
    c.drawString(x + 242, y, "LONG")


def draw_cover_axon(c, x, y, w, h):
    draw_frame(c, x, y, w, h, "G-000  CANONICAL FRAME AXONOMETRIC - NOT TO SCALE")
    projected = [project_axon(item["position"]) for item in MODEL["vertices"]]
    raw = [(item[0], item[1]) for item in projected]
    mapped, _ = transform_points(raw, x, y + 18, w, h - 40, 34)
    lookup = {item["id"]: mapped[index] for index, item in enumerate(MODEL["vertices"])}
    depth = {item["id"]: projected[index][2] for index, item in enumerate(MODEL["vertices"])}
    edges = sorted(MODEL["edges"], key=lambda item: (depth[item["start"]] + depth[item["end"]]) / 2)
    c.saveState()
    for edge in edges:
        draw_member_line(c, lookup[edge["start"]], lookup[edge["end"]], edge["type"], 1.35)
    for vertex in MODEL["vertices"]:
        px, py = lookup[vertex["id"]]
        c.setFillColor(WHITE)
        c.setStrokeColor(RED if vertex["isBase"] else INK)
        c.setLineWidth(1.0)
        if vertex["isBase"]:
            c.rect(px - 2.4, py - 2.4, 4.8, 4.8, fill=1, stroke=1)
        else:
            c.circle(px, py, 2.2, fill=1, stroke=1)
    draw_legend(c, x + 18, y + 14)
    c.restoreState()


def draw_triangle_dimension(c, points, family, quantity, fill, dashed=False):
    path = c.beginPath()
    path.moveTo(*points[0])
    path.lineTo(*points[1])
    path.lineTo(*points[2])
    path.close()
    c.setFillColor(fill)
    c.setStrokeColor(INK)
    c.setLineWidth(1.3)
    c.setDash(5, 2.5) if dashed else c.setDash()
    c.drawPath(path, fill=1, stroke=1)
    c.setDash()
    cx = sum(point[0] for point in points) / 3
    cy = sum(point[1] for point in points) / 3
    base_mid = (
        (points[0][0] + points[1][0]) / 2,
        (points[0][1] + points[1][1]) / 2,
    )
    apex = points[2]
    c.setStrokeColor(GRAY)
    c.setDash(3, 2)
    c.line(apex[0], apex[1], apex[0], cy + 18)
    if cy - 27 > base_mid[1]:
        c.line(apex[0], cy - 27, base_mid[0], base_mid[1])
    c.setDash()
    c.setFillColor(INK)
    c.setFont(BOLD, 12)
    c.drawCentredString(cx, cy - 4, family)
    c.setFont(BOLD, 9.5)
    c.drawCentredString(cx, cy - 17, f"QTY {quantity}")


def draw_panel_templates(c, x, y, w, h):
    draw_frame(c, x, y, w, h, "P-101  GROSS NODE-CENTER FACE FAMILIES - NOT CUT TEMPLATES")
    panel_types = {item["type"]: item for item in MODEL["panelConcept"]["types"]}
    p1 = panel_types["P1"]
    p2 = panel_types["P2"]
    gap = 22
    half = (w - gap - 28) / 2
    left_x = x + 14
    right_x = left_x + half + gap
    base_y = y + 44
    tri_h = min(h - 100, 150)
    p1_base = min(half - 28, tri_h * p1["baseLengthInches"] / p1["grossHeightInches"])
    p2_base = min(half - 28, tri_h * p2["baseLengthInches"] / p2["grossHeightInches"])
    p1_points = [
        (left_x + (half - p1_base) / 2, base_y),
        (left_x + (half + p1_base) / 2, base_y),
        (left_x + half / 2, base_y + tri_h),
    ]
    p2_height = p2_base * math.sqrt(3) / 2
    p2_points = [
        (right_x + (half - p2_base) / 2, base_y),
        (right_x + (half + p2_base) / 2, base_y),
        (right_x + half / 2, base_y + p2_height),
    ]
    draw_triangle_dimension(
        c,
        p1_points,
        "P1 - S-S-L",
        p1["count"],
        AMBER_PALE,
        dashed=True,
    )
    draw_triangle_dimension(
        c,
        p2_points,
        "P2 - L-L-L",
        p2["count"],
        GREEN_PALE,
        dashed=False,
    )
    c.setFillColor(INK)
    c.setFont(MONO, 9)
    c.drawCentredString(left_x + half / 2, y + h - 32, f"SIDES {p1['sideLengthsInches'][0]:.6f} / {p1['sideLengthsInches'][1]:.6f} IN")
    c.drawCentredString(left_x + half / 2, y + h - 44, f"BASE {p1['baseLengthInches']:.6f} · ALT {p1['grossHeightInches']:.6f} IN")
    c.drawCentredString(right_x + half / 2, y + h - 32, f"SIDES {p2['sideLengthsInches'][0]:.6f} IN EACH")
    c.drawCentredString(right_x + half / 2, y + h - 44, f"ALT {p2['grossHeightInches']:.6f} IN")
    c.setFillColor(RED)
    c.setFont(BOLD, 9)
    c.drawCentredString(x + w / 2, y + 18, "GROSS MODEL FACES ONLY - EDGE BUILD-UP, CUTBACKS, JOINTS, GASKETS, AND DRAINAGE ARE UNSET")


def draw_face_map(c, x, y, w, h):
    draw_frame(c, x, y, w, h, "P-102  40-FACE PLAN PLACEMENT MAP - NOT TO SCALE")
    raw = [(item["position"][0], item["position"][2]) for item in MODEL["vertices"]]
    mapped, _ = transform_points(raw, x, y, w, h, 42)
    lookup = {item["id"]: mapped[index] for index, item in enumerate(MODEL["vertices"])}
    hidden_faces = set(MODEL["entrance"]["hiddenFaceIds"])
    label_offsets = {
        "P1-21": (-11, 0),
        "P1-10": (11, 0),
        "P1-20": (-11, 0),
        "P1-13": (11, 0),
    }
    labels = []
    c.saveState()
    for face in MODEL["faces"]:
        panel = PANEL_BY_FACE_ID[face["id"]]
        points = [lookup[vertex_id] for vertex_id in face["vertices"]]
        path = c.beginPath()
        path.moveTo(*points[0])
        path.lineTo(*points[1])
        path.lineTo(*points[2])
        path.close()
        if face["id"] in hidden_faces:
            c.setFillColor(RED_PALE)
            c.setStrokeColor(RED)
            c.setLineWidth(1.4)
            c.setDash()
        elif panel["type"] == "P1":
            c.setFillColor(AMBER_PALE)
            c.setStrokeColor(AMBER)
            c.setLineWidth(0.8)
            c.setDash(4, 2)
        else:
            c.setFillColor(GREEN_PALE)
            c.setStrokeColor(GREEN)
            c.setLineWidth(1.2)
            c.setDash()
        c.drawPath(path, fill=1, stroke=1)
        c.setDash()
        cx = sum(point[0] for point in points) / 3
        cy = sum(point[1] for point in points) / 3
        if face["id"] in hidden_faces:
            c.setStrokeColor(RED)
            c.setLineWidth(0.8)
            min_px = min(point[0] for point in points) + 3
            max_px = max(point[0] for point in points) - 3
            min_py = min(point[1] for point in points) + 3
            max_py = max(point[1] for point in points) - 3
            c.line(min_px, min_py, max_px, max_py)
            c.line(min_px, max_py, max_px, min_py)
        dx, dy = label_offsets.get(panel["pieceId"], (0, 0))
        labels.append((panel["pieceId"], cx + dx, cy + dy, face["id"] in hidden_faces))
    c.setFont(BOLD, 9)
    for label, cx, cy, is_hidden in labels:
        label_width = pdfmetrics.stringWidth(label, BOLD, 9)
        c.setFillColor(WHITE)
        c.rect(cx - label_width / 2 - 2, cy - 6, label_width + 4, 11, fill=1, stroke=0)
        c.setFillColor(RED if is_hidden else INK)
        c.drawCentredString(cx, cy - 3, label)
    c.setFillColor(INK)
    c.setFont(SANS, 9)
    c.drawString(x + 14, y + 16, "P1 = dashed isosceles")
    c.drawString(x + 170, y + 16, "P2 = solid equilateral")
    c.drawString(x + 356, y + 16, "X-MARKED = entrance-view omitted")
    c.restoreState()


def entrance_basis():
    patch_vertex_ids = sorted({vertex_id for face_id in MODEL["entrance"]["hiddenFaceIds"] for vertex_id in FACE_BY_ID[face_id]["vertices"]})
    patch_vertices = [VERTEX_BY_ID[vertex_id]["position"] for vertex_id in patch_vertex_ids]
    radial_x = sum(position[0] for position in patch_vertices) / len(patch_vertices)
    radial_z = sum(position[2] for position in patch_vertices) / len(patch_vertices)
    radial_length = math.hypot(radial_x, radial_z)
    radial = (radial_x / radial_length, radial_z / radial_length)
    tangent = (-radial[1], radial[0])
    return radial, tangent


def draw_entrance_study(c, x, y, w, h):
    draw_frame(c, x, y, w, h, "E-101  OPTIONAL ENTRANCE PATCH + CASSETTE - REPLACEMENT LOAD PATH NOT DESIGNED")
    radial, tangent = entrance_basis()
    raw = []
    depths = []
    for vertex in MODEL["vertices"]:
        px, py, pz = vertex["position"]
        raw.append((px * tangent[0] + pz * tangent[1], py))
        depths.append(px * radial[0] + pz * radial[1])
    min_x, max_x, min_y, max_y = projected_bounds(raw)
    pad = 38
    scale = min((w - 2 * pad) / (max_x - min_x), (h - 2 * pad - 16) / (max_y - min_y))

    def local_map(point):
        return (
            x + w / 2 + (point[0] - (min_x + max_x) / 2) * scale,
            y + h / 2 - 2 + (point[1] - (min_y + max_y) / 2) * scale,
        )

    lookup = {item["id"]: local_map(raw[index]) for index, item in enumerate(MODEL["vertices"])}
    hidden = set(MODEL["entrance"]["hiddenMemberPieceIds"])
    retained = set(MODEL["entrance"]["retainedBoundaryMemberPieceIds"])
    members = sorted(MODEL["members"], key=lambda item: (depths[next(i for i, v in enumerate(MODEL["vertices"]) if v["id"] == item["start"])] + depths[next(i for i, v in enumerate(MODEL["vertices"]) if v["id"] == item["end"])]) / 2)
    c.saveState()
    for member in members:
        start = lookup[member["start"]]
        end = lookup[member["end"]]
        if member["pieceId"] in hidden:
            c.setStrokeColor(RED)
            c.setDash(6, 3)
            c.setLineWidth(2.0)
            c.line(*start, *end)
            c.setDash()
        elif member["pieceId"] in retained:
            c.setStrokeColor(GREEN)
            c.setDash()
            c.setLineWidth(2.1)
            c.line(*start, *end)
        else:
            draw_member_line(c, start, end, member["type"], 0.8, muted=True)

    center_u = 0
    base_v = 0
    outer_w = MODEL["entrance"]["outerWidthInches"]
    outer_h = MODEL["entrance"]["outerHeightInches"]
    clear_w = MODEL["entrance"]["clearWidthInches"]
    clear_h = MODEL["entrance"]["clearRiseInches"]
    outer_left, outer_base = local_map((center_u - outer_w / 2, base_v))
    outer_right, outer_top = local_map((center_u + outer_w / 2, outer_h))
    clear_left, clear_base = local_map((center_u - clear_w / 2, base_v))
    clear_right, clear_top = local_map((center_u + clear_w / 2, clear_h))
    c.setFillColor(colors.Color(0.95, 0.87, 0.73, alpha=0.80))
    c.setStrokeColor(AMBER)
    c.setLineWidth(2.0)
    c.rect(outer_left, outer_base, outer_right - outer_left, outer_top - outer_base, fill=1, stroke=1)
    c.setFillColor(WHITE)
    c.setStrokeColor(INK)
    c.setLineWidth(1.4)
    c.rect(clear_left, clear_base, clear_right - clear_left, clear_top - clear_base, fill=1, stroke=1)
    c.setFillColor(INK)
    c.setFont(BOLD, 9.5)
    c.drawCentredString((clear_left + clear_right) / 2, clear_top - 13, "36 x 58 IN CLEAR")
    c.setFont(SANS, 9)
    c.drawCentredString((clear_left + clear_right) / 2, clear_base + 8, "CROUCH ENTRY")
    hidden_node = lookup[MODEL["entrance"]["hiddenNodeIds"][0]]
    c.setStrokeColor(RED)
    c.setLineWidth(2)
    c.line(hidden_node[0] - 5, hidden_node[1] - 5, hidden_node[0] + 5, hidden_node[1] + 5)
    c.line(hidden_node[0] - 5, hidden_node[1] + 5, hidden_node[0] + 5, hidden_node[1] - 5)
    c.setFillColor(RED)
    c.setFont(BOLD, 9)
    c.drawString(hidden_node[0] + 7, hidden_node[1] + 3, "V007 OMITTED IN VIEW")
    c.setFillColor(INK)
    c.setFont(SANS, 9)
    c.drawString(x + 14, y + 16, "DASHED = omitted canonical members")
    c.drawString(x + 246, y + 16, "HEAVY SOLID = retained patch boundary")
    c.restoreState()


def polygon_x_intersections(vertices, line_y):
    intersections = []
    for index, first in enumerate(vertices):
        second = vertices[(index + 1) % len(vertices)]
        y1, y2 = first[1], second[1]
        if math.isclose(y1, y2):
            continue
        if min(y1, y2) <= line_y < max(y1, y2):
            ratio = (line_y - y1) / (y2 - y1)
            intersections.append(first[0] + ratio * (second[0] - first[0]))
    return sorted(intersections)


def draw_platform_study(c, x, y, w, h):
    draw_frame(c, x, y, w, h, "D-101  192 IN PLATFORM PLAN + SECTION - UNENGINEERED SPATIAL CONCEPT")
    radial, tangent = entrance_basis()
    split = x + w * 0.58
    left = x + 10
    plan_w = split - left - 8
    section_x = split + 10
    section_w = x + w - section_x - 10
    base_positions = [VERTEX_BY_ID[vertex_id]["position"] for vertex_id in MODEL["baseVertexIds"]]

    def local_plan(position, radius_scale=1.0):
        px, _, pz = position
        return ((px * tangent[0] + pz * tangent[1]) * radius_scale,
                -(px * radial[0] + pz * radial[1]) * radius_scale)

    inner = [local_plan(position) for position in base_positions]
    outer = [local_plan(position, MODEL["platform"]["radiusInches"] / MODEL["project"]["radiusInches"]) for position in base_positions]
    raw_bounds = outer + [(-18, -132), (18, -132)]
    min_x, max_x, min_y, max_y = projected_bounds(raw_bounds)
    scale = min((plan_w - 34) / (max_x - min_x), (h - 52) / (max_y - min_y))

    def plan_map(point):
        return (
            left + plan_w / 2 + (point[0] - (min_x + max_x) / 2) * scale,
            y + h / 2 + (point[1] - (min_y + max_y) / 2) * scale,
        )

    c.saveState()
    c.setStrokeColor(colors.HexColor("#B9B3A5"))
    c.setLineWidth(0.45)
    pitch = MODEL["platform"]["deckBoardPitchInches"]
    board_y = math.ceil(min(point[1] for point in outer) / pitch) * pitch
    while board_y <= max(point[1] for point in outer):
        intersections = polygon_x_intersections(outer, board_y)
        if len(intersections) >= 2:
            c.line(*plan_map((intersections[0], board_y)), *plan_map((intersections[-1], board_y)))
        board_y += pitch
    c.setStrokeColor(GREEN)
    c.setLineWidth(1.4)
    for point in outer:
        c.line(*plan_map((0, 0)), *plan_map(point))
    for polygon, stroke, width in [(outer, INK, 2.0), (inner, RED, 1.8)]:
        path = c.beginPath()
        path.moveTo(*plan_map(polygon[0]))
        for point in polygon[1:]:
            path.lineTo(*plan_map(point))
        path.close()
        c.setStrokeColor(stroke)
        c.setLineWidth(width)
        c.drawPath(path, fill=0, stroke=1)
    for point in inner:
        px, py = plan_map(point)
        c.setFillColor(WHITE)
        c.setStrokeColor(RED)
        c.circle(px, py, 2.8, fill=1, stroke=1)
    walkway_top = min(point[1] for point in outer)
    walkway = [(-18, walkway_top), (18, walkway_top), (18, -132), (-18, -132)]
    path = c.beginPath()
    path.moveTo(*plan_map(walkway[0]))
    for point in walkway[1:]:
        path.lineTo(*plan_map(point))
    path.close()
    c.setFillColor(AMBER_PALE)
    c.setStrokeColor(AMBER)
    c.setLineWidth(1.6)
    c.drawPath(path, fill=1, stroke=1)
    for step in range(1, MODEL["platform"]["entryStepCount"] + 1):
        step_y = -132 + step * MODEL["platform"]["entryTreadDepthInches"]
        c.line(*plan_map((-18, step_y)), *plan_map((18, step_y)))
    c.setFillColor(INK)
    c.setFont(BOLD, 9)
    c.drawString(left + 4, y + h - 22, "PLAN - NTS")
    c.setFont(MONO, 9)
    c.drawRightString(left + plan_w - 4, y + h - 22, "192 IN PLATFORM / 144 IN DOME")
    c.setFont(SANS, 9)
    c.drawCentredString(left + plan_w / 2, y + 12, "36 IN APPROACH ALIGNED TO CROUCH ENTRANCE")

    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(split, y + 16, split, y + h - 16)
    ground_y = y + 54
    deck_top_y = y + h * 0.42
    deck_thickness = 12
    frame_depth = 34
    c.setFillColor(CREAM)
    c.setStrokeColor(INK)
    c.rect(section_x + 20, deck_top_y - deck_thickness, section_w - 40, deck_thickness, fill=1, stroke=1)
    c.setFillColor(GREEN_PALE)
    c.rect(section_x + 28, deck_top_y - deck_thickness - frame_depth, section_w - 56, frame_depth, fill=1, stroke=1)
    c.setStrokeColor(GRAY)
    c.line(section_x + 8, ground_y, section_x + section_w - 8, ground_y)
    for support_x in (section_x + 48, section_x + section_w - 48):
        c.setFillColor(AMBER_PALE)
        c.setStrokeColor(AMBER)
        c.rect(support_x - 6, ground_y, 12, deck_top_y - deck_thickness - frame_depth - ground_y, fill=1, stroke=1)
    tread_w = 44
    rise = (deck_top_y - ground_y) / MODEL["platform"]["entryStepCount"]
    for index in range(MODEL["platform"]["entryStepCount"]):
        sx = section_x + 4 + index * 22
        sy = ground_y + (index + 1) * rise
        c.setFillColor(AMBER_PALE)
        c.setStrokeColor(AMBER)
        c.rect(sx, sy - 7, tread_w, 7, fill=1, stroke=1)
    c.setFillColor(INK)
    c.setFont(BOLD, 9)
    c.drawString(section_x + 4, y + h - 22, "SECTION - NTS")
    c.setFont(MONO, 9)
    labels = [
        ("DECK TOP", "19.000 IN"),
        ("CLEAR UNDERSIDE", "12.000 IN"),
        ("FRAME DEPTH", "5.500 IN"),
        ("DECK", "1.500 IN"),
        ("TREAD DEPTH", "10.000 IN"),
    ]
    label_y = y + h - 52
    for label, value in labels:
        c.drawString(section_x + 4, label_y, label)
        c.drawRightString(section_x + section_w - 4, label_y, value)
        label_y -= 17
    c.setFillColor(RED)
    c.setFont(BOLD, 9)
    c.drawString(section_x + 4, y + 22, "FOUNDATION / GUARDS / JOINTS OPEN")
    c.restoreState()


def draw_plan(c, x, y, w, h):
    draw_frame(c, x, y, w, h, "A-101  PLAN - NODE CENTERLINES - NTS")
    raw = [(v["position"][0], v["position"][2]) for v in MODEL["vertices"]]
    mapped, scale = transform_points(raw, x, y, w, h, 28)
    lookup = {v["id"]: mapped[index] for index, v in enumerate(MODEL["vertices"])}
    c.saveState()
    for edge in MODEL["edges"]:
        draw_member_line(c, lookup[edge["start"]], lookup[edge["end"]], edge["type"], 0.75)
    for vertex in MODEL["vertices"]:
        px, py = lookup[vertex["id"]]
        c.setFillColor(RED if vertex["isBase"] else INK)
        if vertex["isBase"]:
            c.rect(px - 1.8, py - 1.8, 3.6, 3.6, fill=1, stroke=0)
        else:
            c.circle(px, py, 1.4, fill=1, stroke=0)
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
    c.setFont(MONO, 9)
    c.saveState()
    c.translate(dim_x - 4, (top_y + bottom_y) / 2)
    c.rotate(90)
    c.drawCentredString(0, 0, "144.000 IN - V019 TO V024")
    c.restoreState()
    c.setFont(SANS, 9)
    c.setFillColor(GRAY)
    c.drawRightString(x + w - 8, y + 18, "V017 DATUM: +18 DEG FROM +X")
    c.restoreState()


def draw_elevation(c, x, y, w, h):
    draw_frame(c, x, y, w, h, "A-201  FRONT ELEVATION - NTS")
    raw = [(v["position"][0], v["position"][1]) for v in MODEL["vertices"]]
    mapped, scale = transform_points(raw, x, y, w, h, 28)
    lookup = {v["id"]: mapped[index] for index, v in enumerate(MODEL["vertices"])}
    c.saveState()
    for edge in MODEL["edges"]:
        draw_member_line(c, lookup[edge["start"]], lookup[edge["end"]], edge["type"], 0.75)
    for vertex in MODEL["vertices"]:
        px, py = lookup[vertex["id"]]
        c.setFillColor(RED if vertex["isBase"] else INK)
        if vertex["isBase"]:
            c.rect(px - 1.8, py - 1.8, 3.6, 3.6, fill=1, stroke=0)
        else:
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
    c.setFont(MONO, 9)
    c.drawCentredString(0, 0, "72.000 IN - NODE-CENTER PEAK")
    c.restoreState()
    c.setFillColor(GRAY)
    c.setFont(SANS, 9)
    c.drawString(x + 8, y + 7, "Base node plane: Y = 0.000 in")
    c.restoreState()


def draw_redesign(c, x, y, w, h):
    draw_frame(c, x, y, w, h, "J-301  PORT-NORMAL HUB ENVELOPE - SPATIAL CLEARANCE ONLY")
    envelope = MODEL["redesign"]["hubEnvelope"]
    q_min = -envelope["radialInboard"]
    q_max = envelope["radialOutboard"]
    q_split = envelope["radialSplit"]
    slab_left = x + 32
    slab_right = x + w - 32
    slab_bottom = y + 58
    slab_top = y + h - 58
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
    c.setFont(BOLD, 9.5)
    c.drawCentredString((slab_left + split_x) / 2, slab_top - 16, "INNER SHELL - 1.500 IN")
    c.drawCentredString((split_x + slab_right) / 2, slab_top - 16, "OUTER SHELL - 1.500 IN")

    cy = slab_bottom + (slab_top - slab_bottom) * 0.20
    c.saveState()
    port_x = slab_left + (slab_right - slab_left) * 0.78
    c.translate(port_x, cy)
    c.rotate(12)
    c.setStrokeColor(INK)
    c.setLineWidth(0.65)
    c.line(-82, 0, 62, 0)
    c.setFillColor(colors.HexColor("#DDBD87"))
    c.setStrokeColor(AMBER)
    c.rect(0, -10, 64, 20, fill=1, stroke=1)
    c.setFillColor(GREEN_PALE)
    c.setStrokeColor(GREEN)
    c.rect(-34, -6, 34, 12, fill=1, stroke=1)
    c.setStrokeColor(RED)
    c.setLineWidth(1.2)
    c.line(0, -15, 0, 15)
    c.restoreState()
    c.setFillColor(INK)
    c.setFont(BOLD, 9)
    c.drawRightString(x + w - 14, y + h - 24, "SHOULDER FACE NORMAL TO MEMBER AXIS")
    c.setFont(SANS, 9)
    c.drawRightString(x + w - 14, y + h - 38, "TENON + OVERSIZED POCKET ENVELOPE")

    dim_y = y + 36
    c.setStrokeColor(INK)
    c.setLineWidth(0.45)
    c.line(slab_left, dim_y, slab_right, dim_y)
    for px in [slab_left, split_x, slab_right]:
        c.line(px, dim_y - 3, px, dim_y + 3)
    c.setFillColor(INK)
    c.setFont(MONO, 9)
    c.drawString(slab_left - 8, dim_y + 4, f"q {q_min:+.3f}")
    c.drawCentredString(split_x, dim_y + 4, f"q {q_split:+.3f}")
    c.drawRightString(slab_right + 8, dim_y + 4, f"q {q_max:+.3f}")
    c.setFillColor(RED)
    c.setFont(BOLD, 9)
    c.drawCentredString(x + w / 2, y + 14, "SCHEMATIC DATUM RELATIONSHIP - NOT A JOINT DETAIL")
    c.restoreState()


def header_footer(c: canvas.Canvas, doc):
    page = c.getPageNumber()
    width, height = letter
    if page <= len(SHEETS):
        sheet_code, sheet_title = SHEETS[page - 1]
    else:
        sheet_code, sheet_title = "OVERFLOW", "Unexpected automatic page break"
    c.saveState()
    bookmark = f"sheet-{page:02d}"
    c.bookmarkPage(bookmark)
    c.addOutlineEntry(f"{sheet_code} - {sheet_title}", bookmark, level=0, closed=False)
    c.setFillColor(DEEP)
    c.rect(doc.leftMargin, height - 34, width - doc.leftMargin - doc.rightMargin, 20, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(BOLD, 9)
    c.drawString(doc.leftMargin + 9, height - 28, "BLACK BELT BUILDING - DOME FIELD REFERENCE")
    c.setFont(MONO, 9)
    c.drawRightString(width - doc.rightMargin - 9, height - 28, f"{sheet_code}  |  REV {REVISION}  |  {page:02d}/{PAGE_COUNT:02d}")
    c.setStrokeColor(RED)
    c.setLineWidth(1.2)
    c.line(doc.leftMargin, height - 39, width - doc.rightMargin, height - 39)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.4)
    c.line(doc.leftMargin, 45, width - doc.rightMargin, 45)
    c.setFillColor(RED)
    c.setFont(BOLD, 9)
    c.drawCentredString(width / 2, 30, "DO NOT ORDER, CUT, MACHINE, ASSEMBLE, OCCUPY, OR SCALE FROM THIS DOCUMENT.")
    c.restoreState()


def status_band(label, value, tone):
    if tone == "pass":
        bg, fg, value_style = GREEN_PALE, GREEN, "H2A"
    elif tone == "study":
        bg, fg, value_style = AMBER_PALE, AMBER, "H2A"
    else:
        bg, fg, value_style = RED_PALE, RED, "Warn"
    t = Table([[P(label, "TableCell"), P(value, value_style)]], colWidths=[1.9 * inch, 4.8 * inch])
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


def dense_table(rows, widths):
    converted = []
    for row_index, row in enumerate(rows):
        converted.append([
            P(str(cell), "DenseHead" if row_index == 0 else "DenseCell")
            for cell in row
        ])
    result = Table(converted, colWidths=widths, repeatRows=1, hAlign="LEFT")
    result.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("BACKGROUND", (0, 1), (-1, -1), CREAM),
        ("GRID", (0, 0), (-1, -1), 0.3, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 0.6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0.6),
    ]))
    return result


def member_inventory_table():
    short = [item for item in MODEL["members"] if item["type"] == "S"]
    long = [item for item in MODEL["members"] if item["type"] == "L"]
    vertices = MODEL["vertices"]
    rows = [["SHORT PIECES", "LONG PIECES", "NODE KITS"]]
    for index in range(max(len(short), len(long), len(vertices))):
        short_text = f"{short[index]['pieceId']}  {short[index]['start']}-{short[index]['end']}" if index < len(short) else ""
        long_text = f"{long[index]['pieceId']}  {long[index]['start']}-{long[index]['end']}" if index < len(long) else ""
        if index < len(vertices):
            vertex = vertices[index]
            location = "BASE" if vertex["isBase"] else "ABOVE"
            node_text = f"{vertex['id']}  H{vertex['valence']}  {location}"
        else:
            node_text = ""
        rows.append([short_text, long_text, node_text])
    return dense_table(rows, [2.05 * inch, 2.15 * inch, 2.5 * inch])


def panel_inventory_table():
    p1 = [item for item in MODEL["panels"] if item["type"] == "P1"]
    p2 = [item for item in MODEL["panels"] if item["type"] == "P2"]
    rows = [["P1 PIECE / FACE / VERTICES", "P2 PIECE / FACE / VERTICES"]]
    for index in range(max(len(p1), len(p2))):
        left = ""
        right = ""
        if index < len(p1):
            item = p1[index]
            left = f"{item['pieceId']}  {item['faceId']}  {'-'.join(item['vertices'])}"
        if index < len(p2):
            item = p2[index]
            right = f"{item['pieceId']}  {item['faceId']}  {'-'.join(item['vertices'])}"
        rows.append([left, right])
    return dense_table(rows, [3.35 * inch, 3.35 * inch])


def build_story():
    story = []
    project = MODEL["project"]
    handoff = MODEL["handoff"]
    panel_types = {item["type"]: item for item in MODEL["panelConcept"]["types"]}
    p1 = panel_types["P1"]
    p2 = panel_types["P2"]
    entrance = MODEL["entrance"]
    platform = MODEL["platform"]
    redesign = MODEL["redesign"]
    redesign_config = redesign["configuration"]
    redesign_tenon = redesign_config["tenon"]
    redesign_pocket = redesign["pocketEnvelope"]
    redesign_hub = redesign["hubEnvelope"]

    story += [
        P(f"PREPARED FOR {handoff['preparedFor'].upper()} / {handoff['company'].upper()}", "Eyebrow"),
        P("12 FT 2V WOOD DOME", "Display"),
        P("Audited geometry + field planning reference", "Deck"),
        DrawingBlock("cover", 6.7 * inch, 3.0 * inch),
        Spacer(1, 10),
        table([
            ["REVIEW LAYER", "STATUS", "BOUNDARY"],
            ["Canonical shell", "VERIFIED", "26 nodes / 65 member axes / 40 faces"],
            ["Gross wood faces", "VERIFIED", "30 P1 + 10 P2 node-center templates"],
            ["Joinery", "SPATIAL CHECK ONLY", "Digital clearance; strength and retention open"],
            ["Entrance + platform", "CONCEPT ONLY", "Replacement load path and foundation open"],
        ], [1.45 * inch, 1.65 * inch, 3.6 * inch], compact=True),
        Spacer(1, 10),
        P("REFERENCE STUDY - NOT FOR FABRICATION, STRUCTURAL, PERMIT, OR OCCUPANCY USE", "Warn"),
        P("Print-optimized and text-searchable. Accessible interactive companion: <link href='https://monroe-domes.vercel.app/'>monroe-domes.vercel.app</link>. This PDF is not represented as PDF/UA tagged.", "SmallA"),
        PageBreak(),
    ]

    drawing_pair = Table([[
        DrawingBlock("plan", 3.25 * inch, 3.55 * inch),
        DrawingBlock("elevation", 3.25 * inch, 3.55 * inch),
    ]], colWidths=[3.35 * inch, 3.35 * inch], hAlign="LEFT")
    drawing_pair.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story += [
        P("G-101 / CANONICAL MODEL", "Eyebrow"),
        P("Plan and elevation", "H1A"),
        P("All linework terminates at mathematical node centers. Dimensions describe the computational axes, not timber outside faces or interior clearances.", "Deck"),
        drawing_pair,
        Spacer(1, 9),
        table([
            ["PARAMETER", "AUDITED VALUE", "MEANING"],
            ["Sphere radius", "72.000 in", "Center to mathematical node sphere"],
            ["Base diameter", "144.000 in", "V019 to V024; opposite base nodes"],
            ["Peak height", "72.000 in", "Base node plane to apex node"],
            ["Base", "Regular decagon", "10 coplanar nodes / 10 boundary chords"],
        ], [1.45 * inch, 1.55 * inch, 3.7 * inch], compact=True),
        Spacer(1, 7),
        P("Checks: V - E + F = 26 - 65 + 40 = 1. Port incidence: 2E = 130 = 10(4) + 6(5) + 10(6). +Y is vertical; the base lies at Y = 0. V017 is +18 DEG from +X at (68.476069, 0.000000, 22.249224) in.", "MonoA"),
        P("FIGURE TEXT EQUIVALENT: The plan is a regular decagonal hemispherical triangulation. The elevation rises from a planar ten-node base to one apex at 72 inches.", "Caption"),
        PageBreak(),
    ]

    story += [
        P("G-201 / PARTS BEFORE ASSEMBLY", "Eyebrow"),
        P("Every timber axis and node kit", "H1A"),
        P("Piece IDs match the interactive model. Every timber length below is node-center geometry only - not a blank, shoulder, tip-to-tip, or cut length.", "Deck"),
        table([
            ["FAMILY", "QTY", "NODE-CENTER AXIS", "INCIDENCE"],
            ["Short S", "30", "39.350380 in", "10 H4-H5 + 20 H5-H6"],
            ["Long L", "35", "44.498447 in", "10 H4-H4 + 10 H4-H6 + 15 H6-H6"],
            ["Node kits", "26", "10 H4 / 6 H5 / 10 H6", "Topology families; not machining templates"],
        ], [1.0 * inch, 0.8 * inch, 1.55 * inch, 3.35 * inch], compact=True),
        Spacer(1, 8),
        member_inventory_table(),
        Spacer(1, 7),
        P("MATERIAL BASIS: Douglas fir, nominal 2 x 2 in, modeled dressed section 1.500 x 1.500 in. Confirm actual stock, moisture, grade, defects, and grain before any fabrication release.", "Warn"),
        PageBreak(),
    ]

    story += [
        P("P-101 / GROSS WOOD FACE SCHEDULE", "Eyebrow"),
        P("Two exact face families", "H1A"),
        P(f"These triangles are derived from the canonical node-center faces. Gross total: {MODEL['panelConcept']['grossTotalAreaSquareInches']:.6f} sq in / {MODEL['panelConcept']['grossTotalAreaSquareFeet']:.6f} sq ft. They are not finished panel cuts or purchase quantities.", "Deck"),
        DrawingBlock("panels", 6.7 * inch, 2.15 * inch),
        Spacer(1, 6),
        table([
            ["TYPE", "QTY", "GROSS SIDES", "ANGLES", "AREA EACH"],
            ["P1 S-S-L", str(p1["count"]), "39.350380 / 39.350380 / 44.498447 in", "55.569012 / 55.569012 / 68.861976 DEG", f"{p1['areaSquareInches']:.6f} sq in"],
            ["P2 L-L-L", str(p2["count"]), "44.498447 in equilateral", "60 / 60 / 60 DEG", f"{p2['areaSquareInches']:.6f} sq in"],
        ], [0.9 * inch, 0.55 * inch, 2.35 * inch, 1.9 * inch, 1.0 * inch], compact=True),
        Spacer(1, 7),
        panel_inventory_table(),
        PageBreak(),
    ]

    story += [
        P("P-102 / PANEL PLACEMENT", "Eyebrow"),
        P("All 40 faces in one map", "H1A"),
        P("The top projection is a non-overlapping map of the canonical triangulated disk. Each printed label is the panel piece ID listed on P-101.", "Deck"),
        DrawingBlock("face-map", 6.7 * inch, 5.05 * inch),
        Spacer(1, 8),
        table([
            ["ENTRANCE-VIEW AFFECTED FACES", "PIECE CONSEQUENCE", "STATUS"],
            [" / ".join(entrance["hiddenFaceIds"]), "Six canonical face panels hidden only in entrance view", "No replacement enclosure designed"],
        ], [2.45 * inch, 2.85 * inch, 1.4 * inch], compact=True),
        Spacer(1, 7),
        P("FIGURE TEXT EQUIVALENT: Thirty isosceles P1 faces and ten equilateral P2 faces tile the complete dome. Six marked faces form the optional entrance visualization patch.", "Caption"),
        PageBreak(),
    ]

    story += [
        P("E-101 / OPTIONAL ENTRANCE STUDY", "Eyebrow"),
        P("Crouch opening aligned to one shell patch", "H1A"),
        P("The entrance is a visual opening study. It deliberately does not alter the canonical schedules or exports; affected shell parts are hidden only in this view.", "Deck"),
        DrawingBlock("entrance", 6.7 * inch, 4.05 * inch),
        Spacer(1, 7),
        table([
            ["ITEM", "VALUE", "BOUNDARY"],
            ["Clear opening", f"{entrance['clearWidthInches']} x {entrance['clearRiseInches']} in", "Crouch entry; not full standing access"],
            ["Outer cassette", f"{entrance['outerWidthInches']:.2f} x {entrance['outerHeightInches']:.2f} in", "3 in jambs / 2.25 in lintel study"],
            ["Source patch rise", f"{entrance['sourcePatchRiseInches']:.6f} in", "Geometric patch bound only"],
            ["Hidden members", " / ".join(entrance["hiddenMemberPieceIds"]), "Seven canonical members omitted in view"],
            ["Retained boundary", " / ".join(entrance["retainedBoundaryMemberPieceIds"]), "Five canonical boundary members remain"],
            ["Hidden node", entrance["hiddenNodeIds"][0], "One canonical node omitted in view"],
        ], [1.3 * inch, 3.0 * inch, 2.4 * inch], compact=True),
        Spacer(1, 7),
        P("VISUAL OPENING STUDY - REPLACEMENT LOAD PATH NOT DESIGNED. Reinforcement, joints, door, threshold, weather seals, drainage, egress, guards, foundation, and acoustic performance remain unevaluated.", "Warn"),
        P("FIGURE TEXT EQUIVALENT: Dashed red members and node V007 are omitted from the entrance view. A 36 by 58 inch clear cassette is centered within the selected six-face patch.", "Caption"),
        PageBreak(),
    ]

    story += [
        P("D-101 / PLATFORM + APPROACH", "Eyebrow"),
        P("Dome above a larger all-wood platform concept", "H1A"),
        P("The platform is spatially aligned with the 144 inch dome and 36 inch entrance. It is not a joist, footing, guard, or connection design.", "Deck"),
        DrawingBlock("platform", 6.7 * inch, 4.0 * inch),
        Spacer(1, 7),
        table([
            ["PARAMETER", "VALUE", "MODEL MEANING"],
            ["Platform diameter", f"{platform['diameterInches']:.3f} in", "Regular decagon, corner to corner"],
            ["Dome base diameter", f"{project['diameterInches']:.3f} in", "Node center, corner to corner"],
            ["Apron", f"{platform['radialApronBeyondDomeNodesInches']:.3f} in vertex / {platform['flatApronInches']:.6f} in flat", "Not 24 in everywhere"],
            ["Outer side", f"{platform['decagonSideInches']:.6f} in", "Ten equal rim segments"],
            ["Deck + frame", f"{platform['deckBoardCount']} boards / {platform['primaryJoistCount']} radial / {platform['rimJoistCount']} rim", "Counts only; sizes unengineered"],
            ["Supports", f"{platform['supportCount']} + one center hub", "Concept axes only"],
            ["Vertical", f"{platform['deckTopInches']:.3f} in deck top / {platform['clearBelowFrameInches']:.3f} in clear underside", "Three-rise approach; 10 in treads"],
        ], [1.35 * inch, 2.15 * inch, 3.2 * inch], compact=True),
        Spacer(1, 7),
        P("ALL-WOOD CONNECTION GOAL ONLY. The H4 clearance body reaches 1.500 in below the base-node datum, so a recess or raised bearing datum is unresolved. Foundation, load path, isolation, weathering, guards, joints, and acoustics are not modeled.", "Warn"),
        P("FIGURE TEXT EQUIVALENT: A 192 inch decagonal deck surrounds the 144 inch dome, with ten radial frame lines, ten supports at dome base-node axes, and a centered three-step approach.", "Caption"),
        PageBreak(),
    ]

    story += [
        P("J-301 / PORT-NORMAL CLEARANCE", "Eyebrow"),
        P("Spatial fit is closed; structural design is open", "H1A"),
        P("Each shoulder face is normal to its member axis at one fixed setback. The two-shell body and pocket volumes are explicit digital envelopes, not selected or capacity-checked joinery.", "Deck"),
        status_band("CURRENT JOINT STUDY", "SPATIAL CLEARANCE VERIFIED - STRUCTURAL REVIEW OPEN", "study"),
        Spacer(1, 7),
        DrawingBlock("redesign", 6.7 * inch, 2.25 * inch),
        Spacer(1, 5),
        table([
            ["INPUT", "VALUE", "AUDIT MEANING"],
            ["Shoulder", f"Axis-normal at S = {redesign_config['shoulderSetback']:.3f} in", "Fixed port datum"],
            ["Convex footprints", " / ".join(f"{item['id']} {item['maximumPlanarDiameter']:.6f}" for item in redesign["bodyFamilies"]) + " in", "Maximum planar diameters"],
            ["Tenon study", f"{redesign_tenon['length']:.3f} x {redesign_tenon['width']:.3f} x {redesign_tenon['thickness']:.3f} in", "Integral volume only"],
            ["Pocket envelope", f"{redesign_pocket['length']:.3f} x {redesign_pocket['width']:.3f} x {redesign_pocket['thickness']:.3f} in", "Collision envelope; not fit tolerance"],
            ["Radial slab", f"q = {-redesign_hub['radialInboard']:.3f} to +{redesign_hub['radialOutboard']:.3f} in", "Two 1.500 in shells split at q = -1.000"],
            ["Member roll", redesign["selectedRoll"], "Fixed study condition"],
        ], [1.25 * inch, 2.45 * inch, 3.0 * inch], compact=True),
        Spacer(1, 5),
        table([
            ["CLEARANCE CHECK", "RESULT", "MINIMUM"],
            ["Sampled pocket pairs", f"{redesign['sampledPocketCollisions']} / {redesign['sampledPairTests']:,} collide", f"{redesign['minimumSampledPocketSeparation']:.6f} in"],
            ["Sampled member pairs", f"{redesign['sampledMemberCollisions']} / {redesign['sampledMemberPairTests']:,} collide", f"{redesign['minimumSampledMemberSeparation']:.6f} in"],
            ["Continuous pocket bound", f"{redesign['continuousRollPocketCollisions']} / {redesign['continuousRollPocketPairTests']} collide", f"{redesign['minimumContinuousRollPocketSeparation']:.6f} in"],
            ["Continuous member bound", f"{redesign['continuousRollMemberCollisions']} / {redesign['continuousRollMemberPairTests']} collide", f"{redesign['minimumContinuousRollMemberSeparation']:.6f} in"],
            ["Pocket split", "Every pocket crosses q = -1", f"{redesign['minimumPocketSplitPenetration']:.6f} in each side"],
            ["Shoulder to other faces", "Every modeled shoulder fits", f"{redesign['minimumShoulderToOtherFaceClearance']:.6f} in"],
        ], [2.2 * inch, 2.35 * inch, 2.15 * inch], compact=True),
        Spacer(1, 5),
        P("SUPERSEDED HISTORY: The earlier untrimmed 1.5 x 1.25 x 0.5 in tenon-box layout intersected at every tested H4, H5, and H6 pair. It was rejected and is not a fabrication option.", "SmallA"),
        P("No mortise fit, retention, ligament, grain, adhesive, tolerance, moisture, strength, load, assembly, or durability approval is issued.", "Warn"),
        PageBreak(),
    ]

    assumption_text = "<br/>".join(f"- {item}" for item in MODEL["modelAssumptions"])
    story += [
        P("R-001 / RELEASE GATE + AUDIT TRACE", "Eyebrow"),
        P("What Jantz can trust - and what remains open", "H1A"),
        P("Rev 07 consolidates the complete digital reference for Black Belt Building without converting planning geometry into construction authorization.", "Deck"),
        table([
            ["VERIFIED / RECORDED", "OPEN / WITHHELD"],
            ["Class-I 2V topology, node coordinates, 65 axes, two chord classes, 26 node valences, and 40 face incidences.", "Structural loads, member capacity, buckling, connection capacity, anchorage, foundation, code, permit, and occupancy."],
            ["Gross P1/P2 triangle geometry and 209.986765 sq ft total mathematical face area.", "Finished panel cuts, thickness, attachment, seals, drainage, fire, weathering, moisture movement, and acoustics."],
            ["Entrance affected-set adjacency and 36 x 58 in visual opening envelope.", "Replacement shell load path, reinforcement, joints, door, threshold, egress, guards, and weather enclosure."],
            ["192 in platform spatial geometry, apron relationships, frame/support counts, and approach alignment.", "Joist/support sizing, bearing, footings, guards, all-wood joint dimensions, isolation, durability, and acoustic tuning."],
        ], [3.35 * inch, 3.35 * inch], compact=True),
        Spacer(1, 8),
        P("Model assumptions", "H2A"),
        P(assumption_text, "SmallA"),
        P("Next gate", "H2A"),
        P("Confirm actual stock, species and grade, service moisture and exposure, site loads and occupancy, foundation and anchorage, hub material and layup, retention, assembly sequence, weather enclosure, acoustics, and tooling. Then complete exact solids, ligament and grain checks, engineered capacity calculations, a full-scale prototype/test program, and an explicit fabrication release.", "BodyA"),
        P("References + trace", "H2A"),
        P("Canonical sources: lib/geodesic.ts, lib/joinery.ts, and lib/spec.ts. Serialized by scripts/export_pdf_data.mjs; rendered by scripts/generate_audit_pdf.py. Model-data SHA-256: " + MODEL_DIGEST + ".", "SmallA"),
        P("Live accessible model: <link href='https://monroe-domes.vercel.app/'>monroe-domes.vercel.app</link>. Timber reference: <link href='https://www.tfguild.org/timber-frame-engineering-council/standards'>TFEC standards</link>. Project-specific engineering remains required.", "SmallA"),
        dense_table([
            ["REVISION", "DATE", "RECORD"],
            ["06", "2026-08-27", "Core centerline and joint-clearance audit"],
            ["07", "2026-08-29", "Black Belt Building field reference: parts, panels, entrance, platform, and current release gate"],
        ], [0.8 * inch, 1.25 * inch, 4.65 * inch]),
        Spacer(1, 2),
        P("NO APPROVAL OR SIGNATURE BLOCK. REFERENCE STUDY ONLY.", "Warn"),
    ]
    return story


def enhance_pdf(path: Path) -> None:
    reader = PdfReader(path)
    if len(reader.pages) != PAGE_COUNT:
        raise RuntimeError(f"Expected {PAGE_COUNT} pages, generated {len(reader.pages)}.")
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    writer.root_object.update({
        NameObject("/Lang"): TextStringObject("en-US"),
        NameObject("/PageMode"): NameObject("/UseOutlines"),
        NameObject("/ViewerPreferences"): DictionaryObject({
            NameObject("/DisplayDocTitle"): BooleanObject(True),
        }),
    })
    for index, (sheet_code, _) in enumerate(SHEETS):
        writer.set_page_label(index, index, prefix=sheet_code, start=1)
        page = writer.pages[index]
        content = page.get_contents().get_data()
        content = re.sub(
            rb"BT\s+/F1\s+(?:10|12)\s+Tf\s+(?:12|14\.4)\s+TL\s+ET",
            b"",
            content,
        )
        if re.search(rb"/F1(?:\s|$)", content):
            raise RuntimeError(f"Unexpected Helvetica text operation remains on page {index + 1}.")
        cleaned_stream = DecodedStreamObject()
        cleaned_stream.set_data(content)
        page.replace_contents(cleaned_stream)
        fonts = page["/Resources"].get_object().get("/Font", {}).get_object()
        if "/F1" in fonts:
            del fonts["/F1"]
        page[NameObject("/Tabs")] = NameObject("/S")
        for annotation_ref in page.get("/Annots", []):
            annotation = annotation_ref.get_object()
            if annotation.get("/Subtype") != "/Link":
                continue
            uri = annotation.get("/A", {}).get("/URI", "")
            if "monroe-domes" in uri:
                description = "Open the accessible interactive Black Belt Building dome reference"
            elif "tfguild" in uri:
                description = "Open the Timber Frame Engineering Council standards page"
            else:
                description = "Open referenced source"
            annotation[NameObject("/Contents")] = TextStringObject(description)
    writer.add_metadata({
        "/Title": f"Black Belt Building - 12 FT 2V Wood Dome - Rev {REVISION} Field Reference",
        "/Author": "Whole Body",
        "/Subject": "Audited dome geometry, gross panels, entrance, platform, and spatial-clearance planning reference; not for fabrication.",
        "/Keywords": "Black Belt Building, Jantz, geodesic dome, 2V, geometry, panels, platform, entrance, spatial clearance, non-fabrication",
        "/Creator": "Black Belt Building Dome CAD / Whole Body",
    })
    temporary = path.with_suffix(".tagging.pdf")
    with temporary.open("wb") as stream:
        writer.write(stream)
    temporary.replace(path)


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=letter,
        rightMargin=0.58 * inch,
        leftMargin=0.58 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.72 * inch,
        title=f"Black Belt Building - 12 FT 2V Wood Dome - Rev {REVISION} Field Reference",
        author="Whole Body",
        subject="Non-fabrication dome geometry and field planning reference",
        creator="Black Belt Building Dome CAD / Whole Body",
    )
    doc.build(
        build_story(),
        onFirstPage=header_footer,
        onLaterPages=header_footer,
        canvasmaker=FieldCanvas,
    )
    enhance_pdf(OUT)
    PUBLIC.write_bytes(OUT.read_bytes())
    if PUBLIC.read_bytes() != OUT.read_bytes():
        raise RuntimeError("Public and output PDF copies differ.")
    print(OUT)
    print(PUBLIC)


if __name__ == "__main__":
    main()
