#!/usr/bin/env python3
"""Generate the Black Belt Building 3V geometry field reference.

This document intentionally stops at audited node-center geometry. It does not
publish saw lengths, joinery, doorway cuts, platform construction, structural
capacity, enclosure design, or occupancy approval.
"""

from __future__ import annotations

import hashlib
import html
import json
import math
import re
import subprocess
from pathlib import Path

import reportlab
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    BooleanObject,
    DecodedStreamObject,
    DictionaryObject,
    NameObject,
    TextStringObject,
)
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_NAME = "black-belt-building-3v-geometry-field-reference-intake-01.pdf"
OUT = ROOT / "output" / "pdf" / OUTPUT_NAME
PUBLIC = ROOT / "public" / "downloads" / OUTPUT_NAME

PAGE_WIDTH, PAGE_HEIGHT = letter
LEFT = 0.58 * inch
RIGHT = PAGE_WIDTH - LEFT
CONTENT_WIDTH = RIGHT - LEFT
TOP = PAGE_HEIGHT - 0.88 * inch
BOTTOM = 0.78 * inch

CREAM = colors.HexColor("#F3F0E6")
PAPER = colors.HexColor("#FCFBF6")
INK = colors.HexColor("#14231A")
DEEP = colors.HexColor("#07110B")
GREEN = colors.HexColor("#28573A")
GREEN_PALE = colors.HexColor("#DCE7DC")
AMBER = colors.HexColor("#855919")
AMBER_PALE = colors.HexColor("#F2E3C9")
BLUE = colors.HexColor("#31586B")
BLUE_PALE = colors.HexColor("#DDE8ED")
RED = colors.HexColor("#A33C2E")
RED_PALE = colors.HexColor("#F3D9D3")
GRAY = colors.HexColor("#59645D")
MID = colors.HexColor("#859087")
LINE = colors.HexColor("#ABB6AD")
WHITE = colors.white


def register_fonts() -> tuple[str, str, str]:
    avenir = Path("/System/Library/Fonts/Avenir Next.ttc")
    mono = Path("/System/Library/Fonts/SFNSMono.ttf")
    fallback = Path(reportlab.__file__).resolve().parent / "fonts"
    try:
        pdfmetrics.registerFont(TTFont("AvenirNext3V", str(avenir), subfontIndex=7))
        pdfmetrics.registerFont(TTFont("AvenirNextDemi3V", str(avenir), subfontIndex=2))
        sans, bold = "AvenirNext3V", "AvenirNextDemi3V"
    except Exception:
        pdfmetrics.registerFont(TTFont("FieldSans3V", str(fallback / "Vera.ttf")))
        pdfmetrics.registerFont(TTFont("FieldSansBold3V", str(fallback / "VeraBd.ttf")))
        sans, bold = "FieldSans3V", "FieldSansBold3V"
    try:
        pdfmetrics.registerFont(TTFont("SFMono3V", str(mono)))
        mono_name = "SFMono3V"
    except Exception:
        pdfmetrics.registerFont(TTFont("FieldMono3V", str(fallback / "VeraMono.ttf")))
        mono_name = "FieldMono3V"
    return sans, bold, mono_name


SANS, BOLD, MONO = register_fonts()


class FieldCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        kwargs.setdefault("initialFontName", SANS)
        kwargs.setdefault("initialFontSize", 10)
        super().__init__(*args, **kwargs)


def load_model() -> dict:
    result = subprocess.run(
        ["node", "--experimental-strip-types", str(ROOT / "scripts" / "export_3v_pdf_data.mjs")],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


MODEL = load_model()
MESH = MODEL["model"]
AUDIT = MESH["audit"]
VERTEX_BY_ID = {item["id"]: item for item in MESH["vertices"]}
EDGE_BY_ID = {item["id"]: item for item in MESH["edges"]}
REVISION = MODEL["project"]["revision"]
MODEL_DIGEST = MODEL["sourceDigest"]
if re.fullmatch(r"[0-9a-f]{64}", MODEL_DIGEST) is None:
    raise RuntimeError("The 3V model export did not provide a valid source digest.")

SHEETS = (
    ("G3-000", "Release cover"),
    ("G3-101", "Canonical plan and elevation"),
    ("G3-201", "Node coordinate schedule"),
    ("G3-202", "Unique axis schedule A and B"),
    ("G3-203", "Unique axis schedule C"),
    ("P3-101", "Gross face families and schedule 1"),
    ("P3-102", "Gross face schedule 2"),
    ("R3-101", "Count and source reconciliation"),
    ("R3-201", "Construction holds and next gate"),
)
PAGE_COUNT = len(SHEETS)

SCHEDULE_BODY_SIZE = 8.5
SCHEDULE_HEADER_SIZE = 8.1
FACE_SCHEDULE_BODY_SIZE = 9.0
FACE_SCHEDULE_HEADER_SIZE = 8.3


BODY = ParagraphStyle(
    "Body3V", fontName=SANS, fontSize=9.0, leading=11.5, textColor=INK,
)
SMALL = ParagraphStyle(
    "Small3V", fontName=SANS, fontSize=7.6, leading=9.4, textColor=GRAY,
)
CELL = ParagraphStyle(
    "Cell3V", fontName=SANS, fontSize=8.5, leading=10.2, textColor=INK,
)
CELL_MONO = ParagraphStyle(
    "CellMono3V", fontName=MONO, fontSize=8.5, leading=10.0, textColor=INK,
)
HEAD = ParagraphStyle(
    "Head3V", fontName=BOLD, fontSize=8.2, leading=9.7, textColor=WHITE,
)
WARN = ParagraphStyle(
    "Warn3V", fontName=BOLD, fontSize=8.1, leading=10.0, textColor=RED,
)


def p(text: str, style: ParagraphStyle = BODY) -> Paragraph:
    return Paragraph(text, style)


def assert_model_contract() -> None:
    counts = AUDIT["counts"]
    topology = AUDIT["topology"]
    edge_classes = {item["type"]: item for item in MESH["edgeClasses"]}
    hubs = {str(item["valence"]): item for item in MESH["hubClasses"]}
    families = {item["family"]: item for item in MODEL["panelFamilies"]}

    assert REVISION == "INTAKE-01"
    assert MODEL["project"]["status"] == "GEOMETRY VERIFIED · CONSTRUCTION PACKAGE INCOMPLETE"
    assert (counts["vertices"], counts["edges"], counts["faces"]) == (61, 165, 105)
    assert counts["boundaryVertices"] == 15
    assert (counts["struts"]["A"], counts["struts"]["B"], counts["struts"]["C"]) == (30, 55, 80)
    assert (counts["hubs"]["4"], counts["hubs"]["5"], counts["hubs"]["6"]) == (15, 6, 40)
    assert (edge_classes["A"]["count"], edge_classes["B"]["count"], edge_classes["C"]["count"]) == (30, 55, 80)
    assert (hubs["4"]["count"], hubs["5"]["count"], hubs["6"]["count"]) == (15, 6, 40)
    assert (families["PENT"]["count"], families["HEX"]["count"]) == (30, 75)
    assert families["PENT"]["baseClass"] == families["HEX"]["baseClass"] == "B"
    assert math.isclose(families["PENT"]["grossHeightInches"], 22.059649374295724, abs_tol=1e-9)
    assert math.isclose(families["HEX"]["grossHeightInches"], 27.909805109273513, abs_tol=1e-9)
    assert topology["eulerCharacteristic"] == 1
    assert topology["boundaryEdgeCount"] == 15
    assert topology["strutEndpointCount"] == topology["hubPortCount"] == 330
    assert topology["faceEdgeIncidences"] == 315
    assert all(AUDIT["checks"].values())
    assert math.isclose(AUDIT["boundary"]["maximumNodePairSpanInches"], 152, abs_tol=1e-8)
    assert math.isclose(MESH["peakHeight"], 92.15241094091974, abs_tol=1e-9)
    assert len(MODEL["members"]) == 165 and len(MODEL["panels"]) == 105
    assert len({item["pieceId"] for item in MODEL["members"]}) == 165
    assert len({item["pieceId"] for item in MODEL["panels"]}) == 105
    assert MODEL["sourcePlan"]["reportedComponentCounts"]["panelFrameEdgePieces"] == 315
    assert MODEL["releaseBoundary"]["fabrication"] == "NOT RELEASED"
    assert MODEL["releaseBoundary"]["joinery"] == "NOT MODELED"
    assert MODEL["releaseBoundary"]["structure"] == "NOT ENGINEERED"
    assert SCHEDULE_BODY_SIZE >= 8.5 and FACE_SCHEDULE_BODY_SIZE >= 8.5
    assert SCHEDULE_HEADER_SIZE >= 8.0 and FACE_SCHEDULE_HEADER_SIZE >= 8.0


assert_model_contract()


def safe(text: object) -> str:
    return html.escape(str(text)).replace("·", "/")


def wrapped_lines(text: str, font: str, size: float, width: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if pdfmetrics.stringWidth(candidate, font, size) <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_wrapped(
    c: canvas.Canvas,
    text: str,
    x: float,
    top: float,
    width: float,
    font: str = SANS,
    size: float = 9.0,
    leading: float = 11.5,
    color=INK,
    max_lines: int | None = None,
) -> float:
    lines = wrapped_lines(text, font, size, width)
    if max_lines is not None:
        lines = lines[:max_lines]
    c.setFont(font, size)
    c.setFillColor(color)
    for index, line in enumerate(lines):
        c.drawString(x, top - index * leading, line)
    return top - len(lines) * leading


def draw_table(
    c: canvas.Canvas,
    data: list[list[object]],
    x: float,
    top: float,
    widths: list[float],
    *,
    compact: bool = True,
    header: bool = True,
    background=CREAM,
) -> float:
    converted: list[list[Paragraph]] = []
    for row_index, row in enumerate(data):
        converted_row: list[Paragraph] = []
        for cell in row:
            if isinstance(cell, Paragraph):
                converted_row.append(cell)
            else:
                converted_row.append(p(safe(cell), HEAD if header and row_index == 0 else CELL))
        converted.append(converted_row)
    table = Table(converted, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    padding = 2.7 if compact else 4.5
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), padding),
        ("BOTTOMPADDING", (0, 0), (-1, -1), padding),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("BACKGROUND", (0, 1 if header else 0), (-1, -1), background),
    ]
    if header:
        commands.append(("BACKGROUND", (0, 0), (-1, 0), INK))
    table.setStyle(TableStyle(commands))
    _, height = table.wrapOn(c, sum(widths), PAGE_HEIGHT)
    table.drawOn(c, x, top - height)
    return top - height


def draw_header_footer(c: canvas.Canvas, page_index: int) -> None:
    sheet_code, sheet_title = SHEETS[page_index]
    page_number = page_index + 1
    bookmark = f"sheet-{page_number:02d}"
    c.bookmarkPage(bookmark)
    c.addOutlineEntry(f"{sheet_code} - {sheet_title}", bookmark, level=0, closed=False)

    c.setFillColor(DEEP)
    c.rect(LEFT, PAGE_HEIGHT - 34, CONTENT_WIDTH, 20, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(BOLD, 8.6)
    c.drawString(LEFT + 9, PAGE_HEIGHT - 28, "BLACK BELT BUILDING / 3V GEOMETRY REFERENCE")
    c.setFont(MONO, 8.0)
    c.drawRightString(
        RIGHT - 9,
        PAGE_HEIGHT - 28,
        f"{sheet_code}  |  {REVISION}  |  {page_number:02d}/{PAGE_COUNT:02d}",
    )
    c.setStrokeColor(RED)
    c.setLineWidth(1.2)
    c.line(LEFT, PAGE_HEIGHT - 39, RIGHT, PAGE_HEIGHT - 39)

    c.setStrokeColor(LINE)
    c.setLineWidth(0.4)
    c.line(LEFT, 45, RIGHT, 45)
    c.setFillColor(RED)
    c.setFont(BOLD, 7.7)
    c.drawCentredString(
        PAGE_WIDTH / 2,
        29,
        "GEOMETRY REFERENCE / NOT FOR FABRICATION - DO NOT ORDER, CUT, MACHINE, ASSEMBLE, OR OCCUPY.",
    )


def page_title(c: canvas.Canvas, eyebrow: str, title: str, deck: str) -> float:
    c.setFillColor(GREEN)
    c.setFont(BOLD, 8.2)
    c.drawString(LEFT, TOP, eyebrow.upper())
    c.setFillColor(INK)
    c.setFont(BOLD, 20)
    c.drawString(LEFT, TOP - 27, title)
    return draw_wrapped(c, deck, LEFT, TOP - 47, CONTENT_WIDTH, SANS, 9.3, 11.6, GRAY, 3) - 7


def draw_warning_box(c: canvas.Canvas, x: float, top: float, width: float, text: str) -> float:
    lines = wrapped_lines(text, BOLD, 8.4, width - 24)
    height = max(38, 19 + len(lines) * 10.5)
    c.setFillColor(RED_PALE)
    c.setStrokeColor(RED)
    c.setLineWidth(0.8)
    c.roundRect(x, top - height, width, height, 4, fill=1, stroke=1)
    c.setFillColor(RED)
    c.setFont(BOLD, 8.4)
    for index, line in enumerate(lines):
        c.drawString(x + 12, top - 18 - index * 10.5, line)
    return top - height


def draw_card(
    c: canvas.Canvas,
    x: float,
    top: float,
    width: float,
    height: float,
    eyebrow: str,
    value: str,
    detail: str,
    tone: str = "green",
) -> None:
    bg, accent = {
        "green": (GREEN_PALE, GREEN),
        "amber": (AMBER_PALE, AMBER),
        "blue": (BLUE_PALE, BLUE),
        "red": (RED_PALE, RED),
    }[tone]
    c.setFillColor(bg)
    c.setStrokeColor(accent)
    c.setLineWidth(0.6)
    c.roundRect(x, top - height, width, height, 4, fill=1, stroke=1)
    c.setFillColor(accent)
    c.setFont(BOLD, 7.1)
    c.drawString(x + 9, top - 14, eyebrow.upper())
    c.setFillColor(INK)
    c.setFont(BOLD, 14)
    c.drawString(x + 9, top - 32, value)
    draw_wrapped(c, detail, x + 9, top - 45, width - 18, SANS, 7.3, 8.7, GRAY, 2)


def project_axon(position: list[float]) -> tuple[float, float, float]:
    px, py, pz = position
    return (0.82 * px - 0.58 * pz, py + 0.26 * px + 0.32 * pz, 0.55 * px + 0.78 * pz)


def transform_points(
    points: list[tuple[float, float]],
    x: float,
    y: float,
    width: float,
    height: float,
    pad: float = 24,
) -> tuple[list[tuple[float, float]], float]:
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
    scale = min((width - 2 * pad) / (max_x - min_x), (height - 2 * pad) / (max_y - min_y))
    mapped = [
        (
            x + width / 2 + (px - (min_x + max_x) / 2) * scale,
            y + height / 2 + (py - (min_y + max_y) / 2) * scale,
        )
        for px, py in points
    ]
    return mapped, scale


def set_axis_stroke(c: canvas.Canvas, axis_type: str, width: float = 0.85, muted: bool = False) -> None:
    if muted:
        c.setStrokeColor(MID)
        c.setDash(1.2, 2.0)
        c.setLineWidth(max(0.35, width * 0.65))
    elif axis_type == "A":
        c.setStrokeColor(GREEN)
        c.setDash()
        c.setLineWidth(width * 1.18)
    elif axis_type == "B":
        c.setStrokeColor(AMBER)
        c.setDash(5, 2.4)
        c.setLineWidth(width)
    else:
        c.setStrokeColor(BLUE)
        c.setDash(1.1, 2.0)
        c.setLineWidth(width)


def draw_axis_legend(c: canvas.Canvas, x: float, y: float) -> None:
    items = (("A", "A 27.051163"), ("B", "B 31.313722"), ("C", "C 32.001477"))
    for index, (axis_type, label) in enumerate(items):
        item_x = x + index * 116
        set_axis_stroke(c, axis_type, 1.0)
        c.line(item_x, y + 3, item_x + 26, y + 3)
        c.setDash()
        c.setFillColor(INK)
        c.setFont(MONO, 7.3)
        c.drawString(item_x + 31, y, label)


def draw_frame(c: canvas.Canvas, x: float, y: float, width: float, height: float, label: str) -> None:
    c.setFillColor(WHITE)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.rect(x, y, width, height, fill=1, stroke=1)
    c.setFillColor(INK)
    c.setFont(BOLD, 7.5)
    c.drawString(x + 7, y + height - 12, label)


def draw_axon(c: canvas.Canvas, x: float, y: float, width: float, height: float, cover: bool = False) -> None:
    draw_frame(c, x, y, width, height, "CANONICAL 3V / 5-8 NODE-CENTER MESH - NTS")
    projected = [project_axon(item["position"]) for item in MESH["vertices"]]
    raw = [(item[0], item[1]) for item in projected]
    mapped, _ = transform_points(raw, x, y + 16, width, height - 32, 26 if cover else 20)
    lookup = {item["id"]: mapped[index] for index, item in enumerate(MESH["vertices"])}
    depth = {item["id"]: projected[index][2] for index, item in enumerate(MESH["vertices"])}
    edges = sorted(MESH["edges"], key=lambda item: (depth[item["start"]] + depth[item["end"]]) / 2)
    for edge in edges:
        set_axis_stroke(c, edge["type"], 1.0 if cover else 0.75)
        c.line(*lookup[edge["start"]], *lookup[edge["end"]])
    c.setDash()
    for vertex in MESH["vertices"]:
        px, py = lookup[vertex["id"]]
        if vertex["isBoundary"]:
            c.setFillColor(WHITE)
            c.setStrokeColor(RED)
            c.setLineWidth(0.8)
            c.rect(px - 1.8, py - 1.8, 3.6, 3.6, fill=1, stroke=1)
        else:
            c.setFillColor(INK)
            c.circle(px, py, 1.25, fill=1, stroke=0)
    draw_axis_legend(c, x + 12, y + 9)


def draw_plan(c: canvas.Canvas, x: float, y: float, width: float, height: float) -> None:
    draw_frame(c, x, y, width, height, "PLAN / NODE-CENTER AXES - NTS")
    raw = [(item["position"][0], item["position"][2]) for item in MESH["vertices"]]
    mapped, _ = transform_points(raw, x, y + 14, width, height - 27, 23)
    lookup = {item["id"]: mapped[index] for index, item in enumerate(MESH["vertices"])}
    for edge in MESH["edges"]:
        set_axis_stroke(c, edge["type"], 0.62)
        c.line(*lookup[edge["start"]], *lookup[edge["end"]])
    c.setDash()
    for vertex in MESH["vertices"]:
        px, py = lookup[vertex["id"]]
        c.setFillColor(RED if vertex["isBoundary"] else INK)
        if vertex["isBoundary"]:
            c.rect(px - 1.4, py - 1.4, 2.8, 2.8, fill=1, stroke=0)
        else:
            c.circle(px, py, 1.05, fill=1, stroke=0)

    boundary = [VERTEX_BY_ID[item] for item in MESH["boundaryVertexIds"]]
    first, second = max(
        ((a, b) for i, a in enumerate(boundary) for b in boundary[i + 1 :]),
        key=lambda pair: math.hypot(
            pair[0]["position"][0] - pair[1]["position"][0],
            pair[0]["position"][2] - pair[1]["position"][2],
        ),
    )
    a, b = lookup[first["id"]], lookup[second["id"]]
    c.setStrokeColor(RED)
    c.setLineWidth(0.7)
    c.line(*a, *b)
    mid_x, mid_y = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    c.setFillColor(WHITE)
    c.rect(mid_x - 51, mid_y - 5, 102, 11, fill=1, stroke=0)
    c.setFillColor(RED)
    c.setFont(MONO, 6.8)
    c.drawCentredString(mid_x, mid_y - 2, "MAX BOUNDARY SPAN 152.000000 IN")
    c.setFillColor(GRAY)
    c.setFont(SANS, 6.7)
    c.drawString(x + 7, y + 7, "Red squares: 15 non-planar boundary nodes")


def draw_elevation(c: canvas.Canvas, x: float, y: float, width: float, height: float) -> None:
    draw_frame(c, x, y, width, height, "FRONT ELEVATION / LOW DATUM - NTS")
    raw = [(item["position"][0], item["position"][1]) for item in MESH["vertices"]]
    mapped, scale = transform_points(raw, x, y + 14, width, height - 27, 23)
    lookup = {item["id"]: mapped[index] for index, item in enumerate(MESH["vertices"])}
    for edge in MESH["edges"]:
        average_z = (VERTEX_BY_ID[edge["start"]]["position"][2] + VERTEX_BY_ID[edge["end"]]["position"][2]) / 2
        set_axis_stroke(c, edge["type"], 0.62, muted=average_z < -1e-9)
        c.line(*lookup[edge["start"]], *lookup[edge["end"]])
    c.setDash()
    for vertex in MESH["vertices"]:
        px, py = lookup[vertex["id"]]
        c.setFillColor(RED if vertex["isBoundary"] else INK)
        if vertex["isBoundary"]:
            c.rect(px - 1.4, py - 1.4, 2.8, 2.8, fill=1, stroke=0)
        else:
            c.circle(px, py, 1.05, fill=1, stroke=0)

    min_y = min(point[1] for point in mapped)
    max_y = max(point[1] for point in mapped)
    dim_x = x + width - 9
    c.setStrokeColor(RED)
    c.setLineWidth(0.55)
    c.line(dim_x, min_y, dim_x, max_y)
    c.line(dim_x - 3, min_y, dim_x + 3, min_y)
    c.line(dim_x - 3, max_y, dim_x + 3, max_y)
    c.saveState()
    c.translate(dim_x - 3, (min_y + max_y) / 2)
    c.rotate(90)
    c.setFillColor(RED)
    c.setFont(MONO, 6.8)
    c.drawCentredString(0, 0, "PEAK / LOW DATUM 92.152411 IN")
    c.restoreState()
    high_y = min_y + AUDIT["boundary"]["rippleInches"] * scale
    c.setStrokeColor(AMBER)
    c.setDash(3, 2)
    c.line(x + 13, high_y, x + width - 18, high_y)
    c.setDash()
    c.setFillColor(AMBER)
    c.setFont(MONO, 6.6)
    c.drawString(x + 7, y + 7, "BOUNDARY RIPPLE 1.237902 IN / 5 LOW + 10 HIGH")


def draw_schedule_columns(
    c: canvas.Canvas,
    rows: list[str],
    x: float,
    top: float,
    width: float,
    *,
    columns: int,
    header: str,
    font_size: float,
    row_height: float,
    header_font_size: float | None = None,
) -> float:
    per_column = math.ceil(len(rows) / columns)
    column_gap = 8
    column_width = (width - column_gap * (columns - 1)) / columns
    table_height = 20 + per_column * row_height
    for column in range(columns):
        column_x = x + column * (column_width + column_gap)
        subset = rows[column * per_column : (column + 1) * per_column]
        c.setFillColor(INK)
        c.setStrokeColor(INK)
        c.rect(column_x, top - 18, column_width, 18, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont(MONO, header_font_size or font_size)
        c.drawString(column_x + 5, top - 12.5, header)
        c.setFillColor(PAPER)
        c.setStrokeColor(LINE)
        c.rect(column_x, top - table_height, column_width, table_height - 18, fill=1, stroke=1)
        c.setFillColor(INK)
        c.setFont(MONO, font_size)
        baseline = top - 29
        for row_index, row in enumerate(subset):
            row_y = baseline - row_index * row_height
            if row_index % 2:
                c.setFillColor(CREAM)
                c.rect(column_x + 0.3, row_y - 2.8, column_width - 0.6, row_height, fill=1, stroke=0)
            c.setFillColor(INK)
            c.drawString(column_x + 5, row_y, row)
    return top - table_height


def draw_cover(c: canvas.Canvas) -> None:
    draw_header_footer(c, 0)
    c.setFillColor(GREEN)
    c.setFont(BOLD, 8.5)
    c.drawString(LEFT, TOP, "PREPARED FOR JANTZ / BLACK BELT BUILDING")
    c.setFillColor(INK)
    c.setFont(BOLD, 28)
    c.drawString(LEFT, TOP - 34, "12 FT 8 IN / 3V DOME")
    c.setFont(BOLD, 17)
    c.drawString(LEFT, TOP - 58, "GEOMETRY FIELD REFERENCE")
    c.setFillColor(GRAY)
    c.setFont(SANS, 10.2)
    c.drawString(LEFT, TOP - 78, "Independent 5/8 Class-I node-center model / construction package incomplete")

    draw_axon(c, LEFT, 330, CONTENT_WIDTH, 285, cover=True)

    card_width = (CONTENT_WIDTH - 12) / 2
    draw_card(c, LEFT, 316, card_width, 66, "UNIQUE AXES", "165", "30 A / 55 B / 80 C node-center chords", "green")
    draw_card(c, LEFT + card_width + 12, 316, card_width, 66, "NODES", "61", "15 four-way / 6 five-way / 40 six-way", "blue")
    draw_card(c, LEFT, 240, card_width, 66, "GROSS FACES", "105", "30 A-A-B / 75 B-C-C triangles", "amber")
    draw_card(c, LEFT + card_width + 12, 240, card_width, 66, "RELEASE", "HOLD", "No joinery, doorway, platform, or capacity", "red")

    draw_warning_box(
        c,
        LEFT,
        164,
        CONTENT_WIDTH,
        "USE THIS PDF TO IDENTIFY THE AUDITED GEOMETRY AND OPEN QUESTIONS. DO NOT USE ANY DIMENSION AS A SAW, SHOULDER, BEVEL, MITER, HUB, PANEL, OR JOINERY CUT.",
    )
    c.setFillColor(GRAY)
    c.setFont(SANS, 7.8)
    c.drawString(LEFT, 74, "Print-optimized and text-searchable. This document is not represented as PDF/UA tagged.")
    c.setFillColor(GREEN)
    c.setFont(BOLD, 8.0)
    url_text = "Interactive companion: monroe-domes.vercel.app/3v"
    c.drawString(LEFT, 61, url_text)
    c.linkURL("https://monroe-domes.vercel.app/3v", (LEFT, 58, LEFT + 240, 71), relative=0)


def draw_geometry_page(c: canvas.Canvas) -> None:
    draw_header_footer(c, 1)
    current = page_title(
        c,
        "G3-101 / CANONICAL MODEL",
        "Plan and elevation",
        "Every line terminates at mathematical node centers. The 152 inch normalization is a maximum boundary-node span, not a proven outside-frame diameter.",
    )
    gap = 10
    frame_width = (CONTENT_WIDTH - gap) / 2
    frame_height = 300
    frame_y = current - frame_height
    draw_plan(c, LEFT, frame_y, frame_width, frame_height)
    draw_elevation(c, LEFT + frame_width + gap, frame_y, frame_width, frame_height)

    table_top = frame_y - 11
    table_top = draw_table(c, [
        ["PARAMETER", "AUDITED VALUE", "MODEL MEANING"],
        ["Sphere radius", f"{MESH['sphereRadius']:.6f} in", "Radial projection sphere"],
        ["Max boundary-node span", f"{AUDIT['boundary']['maximumNodePairSpanInches']:.6f} in", "Normalization datum; not outside timber"],
        ["Minimum boundary caliper", f"{AUDIT['boundary']['minimumCaliperSpanInches']:.6f} in", "Directional width of 15-node boundary"],
        ["Maximum mesh plan span", f"{AUDIT['envelope']['maximumMeshPlanSpanInches']:.6f} in", "Any two modeled nodes in plan"],
        ["Peak / low datum", f"{MESH['peakHeight']:.6f} in", "Highest node above five low boundary nodes"],
        ["Boundary ripple", f"{AUDIT['boundary']['rippleInches']:.6f} in", "Ten boundary nodes above five low nodes"],
    ], LEFT, table_top, [1.52 * inch, 1.55 * inch, 4.26 * inch])
    c.setFillColor(RED)
    c.setFont(BOLD, 7.8)
    c.drawString(LEFT, table_top - 14, "THE 15-NODE BOUNDARY IS NOT PLANAR. A PONY WALL OR SUPPORT DATUM IS NOT MODELED.")
    c.setFillColor(GRAY)
    c.setFont(MONO, 7.2)
    c.drawString(
        LEFT,
        table_top - 27,
        "CHECKS: V-E+F = 61-165+105 = 1 / 2E = 330 = HUB PORTS / BOUNDARY = 15 EDGES",
    )


def draw_node_schedule_page(c: canvas.Canvas) -> None:
    draw_header_footer(c, 2)
    current = page_title(
        c,
        "G3-201 / NODE SCHEDULE",
        "All 61 mathematical nodes",
        "Coordinates use +Y up and the five lowest boundary nodes at Y = 0. Values shown to 0.001 inch are display rounding only, not fabrication tolerance.",
    )
    current = draw_table(c, [
        ["NODE FAMILY", "QTY", "IDS", "BOUNDARY"],
        ["4-way", "15", "V047-V061", "All 15 are boundary nodes"],
        ["5-way", "6", "V001 / V027-V031", "Interior"],
        ["6-way", "40", "V002-V026 / V032-V046", "Interior"],
    ], LEFT, current, [1.0 * inch, 0.55 * inch, 2.35 * inch, 3.43 * inch]) - 10

    rows = []
    for vertex in MESH["vertices"]:
        x_pos, y_pos, z_pos = vertex["position"]
        boundary = "Y" if vertex["isBoundary"] else "-"
        rows.append(
            f"{vertex['id']} {vertex['valence']:1d} {boundary} {x_pos:+8.3f} {y_pos:+8.3f} {z_pos:+8.3f}"
        )
    current = draw_schedule_columns(
        c,
        rows,
        LEFT,
        current,
        CONTENT_WIDTH,
        columns=2,
        header="ID   V B        X        Y        Z   (IN)",
        font_size=SCHEDULE_BODY_SIZE,
        row_height=12.4,
        header_font_size=SCHEDULE_HEADER_SIZE,
    )
    draw_warning_box(
        c,
        LEFT,
        current - 10,
        CONTENT_WIDTH,
        "NODE VALENCE IS TOPOLOGY, NOT A HUB SPECIFICATION. HUB SIZE, LAYUP, PORT GEOMETRY, LIGAMENTS, GRAIN, RETENTION, AND CAPACITY ARE NOT DESIGNED.",
    )


def member_schedule_row(member: dict) -> str:
    boundary = "B" if member["isBoundary"] else "-"
    return f"{member['pieceId']} {member['id']} {member['start']}>{member['end']} {boundary}"


def draw_axis_ab_page(c: canvas.Canvas) -> None:
    draw_header_footer(c, 3)
    current = page_title(
        c,
        "G3-202 / UNIQUE AXIS SCHEDULE",
        "A and B node-center chords",
        "The IDs below enumerate unique mesh edges once. Lengths are center-to-center chord geometry only; no stock allowance, shoulder, tenon, hub, bevel, miter, or tolerance is included.",
    )
    classes = {item["type"]: item for item in MESH["edgeClasses"]}
    current = draw_table(c, [
        ["CLASS", "QTY", "NODE-CENTER CHORD", "CHORD FACTOR", "FABRICATION STATUS"],
        ["A", "30", f"{classes['A']['length']:.6f} in", f"{classes['A']['chordFactor']:.12f}", "NOT A FINISHED CUT"],
        ["B", "55", f"{classes['B']['length']:.6f} in", f"{classes['B']['chordFactor']:.12f}", "NOT A FINISHED CUT"],
    ], LEFT, current, [0.55 * inch, 0.55 * inch, 1.45 * inch, 1.65 * inch, 3.13 * inch]) - 10

    members = sorted(
        (item for item in MODEL["members"] if item["type"] in ("A", "B")),
        key=lambda item: (item["type"], item["pieceId"]),
    )
    rows = [member_schedule_row(item) for item in members]
    current = draw_schedule_columns(
        c,
        rows,
        LEFT,
        current,
        CONTENT_WIDTH,
        columns=3,
        header="PIECE  EDGE  START>END  BND",
        font_size=SCHEDULE_BODY_SIZE,
        row_height=12.2,
        header_font_size=SCHEDULE_HEADER_SIZE,
    )
    c.setFillColor(GRAY)
    c.setFont(SANS, 8.5)
    c.drawString(LEFT, current - 14, "BND B = one of the 15 mathematical boundary edges. A blank marker means interior edge.")
    draw_warning_box(
        c,
        LEFT,
        current - 24,
        CONTENT_WIDTH,
        "DO NOT TRANSCRIBE THESE CHORDS TO LUMBER. PHYSICAL MEMBER LENGTH DEPENDS ON AN UNRELEASED CONNECTION, SETBACK, STOCK, MOISTURE, AND ASSEMBLY DATUM.",
    )


def draw_axis_c_page(c: canvas.Canvas) -> None:
    draw_header_footer(c, 4)
    current = page_title(
        c,
        "G3-203 / UNIQUE AXIS SCHEDULE",
        "C node-center chords",
        "This sheet completes the 165-edge canonical skeleton. The schedule is an identity and adjacency reference, not a lumber cut list.",
    )
    c_class = next(item for item in MESH["edgeClasses"] if item["type"] == "C")
    current = draw_table(c, [
        ["CLASS", "QTY", "NODE-CENTER CHORD", "CHORD FACTOR", "FABRICATION STATUS"],
        ["C", "80", f"{c_class['length']:.6f} in", f"{c_class['chordFactor']:.12f}", "NOT A FINISHED CUT"],
    ], LEFT, current, [0.55 * inch, 0.55 * inch, 1.45 * inch, 1.65 * inch, 3.13 * inch]) - 10

    members = [item for item in MODEL["members"] if item["type"] == "C"]
    rows = [member_schedule_row(item) for item in members]
    current = draw_schedule_columns(
        c,
        rows,
        LEFT,
        current,
        CONTENT_WIDTH,
        columns=3,
        header="PIECE  EDGE  START>END  BND",
        font_size=SCHEDULE_BODY_SIZE,
        row_height=12.2,
        header_font_size=SCHEDULE_HEADER_SIZE,
    )
    c.setFillColor(GRAY)
    c.setFont(SANS, 8.5)
    c.drawString(LEFT, current - 14, "BND B = boundary edge. All C entries remain node-center mathematical axes.")
    draw_warning_box(
        c,
        LEFT,
        current - 24,
        CONTENT_WIDTH,
        "NO CUT END CONDITION IS IMPLIED. PLANAR FACE ANGLES ON P3-101 ARE ALSO NOT SAW, BEVEL, COMPOUND-MITER, OR JOINERY SETTINGS.",
    )


def draw_triangle(
    c: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    family: dict,
    tone: str,
) -> None:
    fill, stroke = (GREEN_PALE, GREEN) if tone == "green" else (BLUE_PALE, BLUE)
    points = [(x + 18, y + 30), (x + width - 18, y + 30), (x + width / 2, y + height - 25)]
    path = c.beginPath()
    path.moveTo(*points[0])
    path.lineTo(*points[1])
    path.lineTo(*points[2])
    path.close()
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(1.1)
    c.drawPath(path, fill=1, stroke=1)
    c.setFillColor(INK)
    c.setFont(BOLD, 9.4)
    c.drawString(x + 4, y + height - 13, f"{family['family']} / {family['classSignature']}")
    c.setFont(BOLD, 8.0)
    c.setFillColor(stroke)
    c.drawRightString(x + width - 4, y + height - 13, "SCHEMATIC / NTS")
    c.setStrokeColor(stroke)
    c.setDash(3, 2)
    c.line(x + width / 2, y + 30, x + width / 2, y + height - 25)
    c.setDash()
    c.setFillColor(INK)
    c.setFont(MONO, 8.0)
    sides = " / ".join(f"{value:.6f}" for value in family["sideLengthsInches"])
    c.drawCentredString(x + width / 2, y + 43, f"SIDES {sides} IN")
    c.setFont(BOLD, 8.0)
    c.drawCentredString(
        x + width / 2,
        y + 17,
        f"B-EDGE BASE {family['baseLengthInches']:.6f} IN / ALTITUDE TO B {family['grossHeightInches']:.6f} IN",
    )
    c.setFont(SANS, 8.0)
    c.drawCentredString(x + width / 2, y + 5, f"GROSS FACE QTY {family['count']} / NOT A PANEL CUT")


def ordered_panels() -> list[dict]:
    return sorted(
        MODEL["panels"],
        key=lambda item: (0 if item["family"] == "PENT" else 1, item["pieceId"]),
    )


def face_schedule_rows(panels: list[dict]) -> list[str]:
    return [
        f"{item['pieceId']} {item['faceId']} {'/'.join(item['vertices'])}"
        for item in panels
    ]


def draw_face_page(c: canvas.Canvas) -> None:
    draw_header_footer(c, 5)
    current = page_title(
        c,
        "P3-101 / GROSS FACE SCHEDULE",
        "Two mathematical triangle families",
        "Each face is listed once from the canonical triangulated shell. Dimensions and angles describe the node-center plane only; no thickness, seam, frame duplication, kerf, joinery, skin, or doorway modification is included.",
    )
    families = {item["family"]: item for item in MODEL["panelFamilies"]}
    triangle_height = 108
    triangle_width = (CONTENT_WIDTH - 10) / 2
    draw_triangle(c, LEFT, current - triangle_height, triangle_width, triangle_height, families["PENT"], "green")
    draw_triangle(c, LEFT + triangle_width + 10, current - triangle_height, triangle_width, triangle_height, families["HEX"], "blue")
    current -= triangle_height + 8

    current = draw_table(c, [
        ["FAMILY", "QTY", "B-EDGE BASE", "ALTITUDE TO B", "PLANAR INTERIOR ANGLES", "AREA EACH"],
        ["PENT / A-A-B", "30", f"{families['PENT']['baseLengthInches']:.6f} in", f"{families['PENT']['grossHeightInches']:.6f} in", " / ".join(f"{value:.6f}" for value in families["PENT"]["anglesDegrees"]) + " DEG", f"{families['PENT']['areaSquareInches']:.6f} sq in"],
        ["HEX / B-C-C", "75", f"{families['HEX']['baseLengthInches']:.6f} in", f"{families['HEX']['grossHeightInches']:.6f} in", " / ".join(f"{value:.6f}" for value in families["HEX"]["anglesDegrees"]) + " DEG", f"{families['HEX']['areaSquareInches']:.6f} sq in"],
    ], LEFT, current, [0.88 * inch, 0.42 * inch, 1.08 * inch, 1.12 * inch, 2.55 * inch, 1.28 * inch]) - 9

    rows = face_schedule_rows(ordered_panels()[:53])
    current = draw_schedule_columns(
        c,
        rows,
        LEFT,
        current,
        CONTENT_WIDTH,
        columns=2,
        header="PIECE     FACE  VERTICES",
        font_size=FACE_SCHEDULE_BODY_SIZE,
        row_height=11.4,
        header_font_size=FACE_SCHEDULE_HEADER_SIZE,
    )
    c.setFillColor(RED)
    c.setFont(BOLD, 8.2)
    c.drawString(LEFT, current - 13, "CONTINUED ON P3-102 / PLANAR ANGLES ARE NOT SAW OR JOINERY SETTINGS.")


def draw_face_continuation_page(c: canvas.Canvas) -> None:
    draw_header_footer(c, 6)
    current = page_title(
        c,
        "P3-102 / GROSS FACE SCHEDULE",
        "Face inventory continuation",
        "This sheet completes all 105 canonical face identities. Read with the B-edge base convention and gross family dimensions on P3-101; every entry remains node-center geometry only.",
    )
    current = draw_table(c, [
        ["SHEET", "PIECES LISTED", "SHEET COUNT", "STATUS"],
        ["P3-101", "PENT-001-PENT-030 / HEX-001-HEX-023", "53", "GROSS NODE-CENTER FACES"],
        ["P3-102", "HEX-024-HEX-075", "52", "GROSS NODE-CENTER FACES"],
    ], LEFT, current, [0.8 * inch, 3.05 * inch, 0.95 * inch, 2.53 * inch]) - 12

    rows = face_schedule_rows(ordered_panels()[53:])
    current = draw_schedule_columns(
        c,
        rows,
        LEFT,
        current,
        CONTENT_WIDTH,
        columns=2,
        header="PIECE     FACE  VERTICES",
        font_size=FACE_SCHEDULE_BODY_SIZE,
        row_height=11.4,
        header_font_size=FACE_SCHEDULE_HEADER_SIZE,
    )
    current = draw_warning_box(
        c,
        LEFT,
        current - 13,
        CONTENT_WIDTH,
        "GROSS FACES ARE NOT FINISHED PANELS OR MODULE CUTS. PLANAR INTERIOR ANGLES ARE NOT MITER, BEVEL, COMPOUND-SAW, OR JOINERY SETTINGS.",
    )
    c.setFillColor(GRAY)
    c.setFont(SANS, 8.5)
    c.drawString(LEFT, current - 14, "Schedule total: 30 PENT + 75 HEX = 105 faces. Doorway-piece allocation remains unresolved.")


def draw_reconciliation_page(c: canvas.Canvas) -> None:
    draw_header_footer(c, 7)
    current = page_title(
        c,
        "R3-101 / COUNT RECONCILIATION",
        "165 unique axes and 315 face-edge incidences",
        "These counts describe two different reference systems. They agree mathematically without turning the private-source panel method into a released fabrication schedule.",
    )

    card_width = (CONTENT_WIDTH - 20) / 3
    draw_card(c, LEFT, current, card_width, 82, "CANONICAL SKELETON", "165", "Unique node-center axes; each shared edge counted once", "green")
    draw_card(c, LEFT + card_width + 10, current, card_width, 82, "GROSS FACES", "105", "Triangular faces in one connected manifold disk", "blue")
    draw_card(c, LEFT + 2 * (card_width + 10), current, card_width, 82, "FACE-EDGE INCIDENCES", "315", "3 x 105; shared boundaries duplicate by face", "amber")
    current -= 96

    c.setFillColor(INK)
    c.setFont(BOLD, 15)
    c.drawCentredString(PAGE_WIDTH / 2, current, "315 = 3 x 105 = 2(165) - 15")
    c.setFillColor(GRAY)
    c.setFont(SANS, 8.0)
    c.drawCentredString(PAGE_WIDTH / 2, current - 16, "Face sides = twice every interior edge plus each of the 15 boundary edges once")
    current -= 34

    source_lengths = {"A": 27.062500, "B": 31.312500, "C": 32.000000}
    class_by_type = {item["type"]: item for item in MESH["edgeClasses"]}
    comparison_rows: list[list[object]] = [[
        "CLASS", "INDEPENDENT CHORD", "ROUNDED SOURCE", "RESIDUAL", "INTERPRETATION",
    ]]
    for axis_type in ("A", "B", "C"):
        computed = class_by_type[axis_type]["length"]
        source = source_lengths[axis_type]
        comparison_rows.append([
            axis_type,
            f"{computed:.6f} in",
            f"{source:.6f} in",
            f"{computed - source:+.6f} in",
            "Reconciliation only; not tolerance",
        ])
    current = draw_table(c, comparison_rows, LEFT, current, [0.55 * inch, 1.55 * inch, 1.45 * inch, 1.15 * inch, 2.63 * inch]) - 12

    current = draw_warning_box(
        c,
        LEFT,
        current,
        CONTENT_WIDTH,
        "NO BLANKET +/-0.0015 IN CLAIM IS VALID. THE THREE RESIDUALS DIFFER, AND NONE ESTABLISHES MACHINING ACCURACY, FIT, OR FABRICATION TOLERANCE.",
    ) - 12

    current = draw_table(c, [
        ["REFERENCE SYSTEM", "COUNT", "WHAT IS VERIFIED", "WHAT IS WITHHELD"],
        ["Independent skeleton", "165", "Topology, node coordinates, edge identities, chord classes", "All physical member end conditions"],
        ["Private-source panel method", "315", "Reported total matches 3 x 105 face sides", "Doorway allocation and physical cut schedule"],
        ["Gross face schedule", "105", "30 A-A-B and 75 B-C-C node-center triangles", "Finished wood panels or modules"],
    ], LEFT, current, [1.35 * inch, 0.6 * inch, 2.75 * inch, 2.63 * inch]) - 10

    source = MODEL["sourcePlan"]
    c.setFillColor(INK)
    c.setFont(BOLD, 8.0)
    c.drawString(LEFT, current, "PRIVATE SOURCE CROSS-CHECK")
    current = draw_wrapped(
        c,
        f"{source['title']} / {source['author']} / {source['publicationYear']}. {source['licenseBoundary']}",
        LEFT,
        current - 13,
        CONTENT_WIDTH,
        SANS,
        7.8,
        9.7,
        GRAY,
        3,
    )
    draw_wrapped(
        c,
        "The source reports 73 full hex panels, 30 pent panels, two right door half-panels, and two left door half-panels. Those doorway labels are not mapped to a verified physical cut package here.",
        LEFT,
        current - 6,
        CONTENT_WIDTH,
        SANS,
        7.8,
        9.7,
        GRAY,
        3,
    )


def draw_holds_page(c: canvas.Canvas) -> None:
    draw_header_footer(c, 8)
    current = page_title(
        c,
        "R3-201 / RELEASE GATE",
        "What Jantz can use now - and what must be resolved",
        "Use the geometry to orient review, identify pieces, and write RFIs. Construction remains on hold until the physical systems below are designed, checked, and explicitly released.",
    )

    hold_rows: list[list[object]] = [["SYSTEM", "STATUS", "REQUIRED RESOLUTION"]]
    for hold in MODEL["constructionHolds"]:
        hold_rows.append([hold["label"], hold["status"], hold["detail"]])
    current = draw_table(c, hold_rows, LEFT, current, [1.2 * inch, 1.55 * inch, 4.58 * inch], compact=False) - 11

    c.setFillColor(INK)
    c.setFont(BOLD, 10.5)
    c.drawString(LEFT, current, "RFI / PRE-FABRICATION CHECKLIST")
    current -= 15
    checklist = [
        "Confirm site, jurisdiction, use, occupancy, egress, and governing loads.",
        "Define actual outside dimensions, floor datum, headroom, and support geometry.",
        "Resolve the non-planar 15-node boundary and any pony-wall or curb system.",
        "Engineer member section, species, grade, moisture, buckling, and durability.",
        "Engineer hubs/connections: material, layup, ports, setbacks, fasteners, retention, and capacity.",
        "Define exact finished member datums, cut lengths, bevels, miters, tolerances, and labeling.",
        "Engineer doorway clear opening, removed/altered parts, replacement load path, and threshold.",
        "Engineer all-wood platform/foundation, bearing, uplift, anchorage, drainage, stairs, and guards.",
        "Design enclosure layers, seams, flashing, membrane, ventilation, fire, and moisture movement.",
        "Prototype and test assembly sequence, fit, weathering, structural behavior, and acoustics.",
    ]
    c.setFont(SANS, 8.5)
    for index, item in enumerate(checklist, start=1):
        c.setFillColor(GREEN if index <= 3 else INK)
        c.setFont(BOLD, 8.5)
        c.drawString(LEFT, current, f"{index:02d}")
        c.setFillColor(INK)
        c.setFont(SANS, 8.5)
        c.drawString(LEFT + 22, current, item)
        current -= 14.2

    current -= 2
    current = draw_warning_box(
        c,
        LEFT,
        current,
        CONTENT_WIDTH,
        "NEXT RELEASE GATE: ENGINEERED PHYSICAL CONNECTIONS + SITE LOADS + FOUNDATION/PLATFORM + DOORWAY LOAD PATH + WEATHER ENCLOSURE + PROTOTYPE/TEST EVIDENCE + EXPLICIT FABRICATION ISSUE.",
    ) - 11

    current = draw_table(c, [
        ["RELEASE ITEM", "CURRENT STATE"],
        ["Geometry and topology", "VERIFIED INDEPENDENTLY"],
        ["Unique axis chord lengths", "NODE-CENTER ONLY"],
        ["Panel faces", "GROSS GEOMETRY ONLY"],
        ["Doorway / platform / joinery", "DO NOT CUT / NO 3V DESIGN / NOT MODELED"],
        ["Weather / acoustics / structure", "NOT DESIGNED / NOT TESTED / NOT ENGINEERED"],
        ["Fabrication", "NOT RELEASED"],
    ], LEFT, current, [2.42 * inch, 4.91 * inch]) - 10

    c.setFillColor(GRAY)
    c.setFont(MONO, 6.5)
    c.drawString(LEFT, current, f"MODEL DATA SHA-256  {MODEL_DIGEST}")
    c.setFont(SANS, 7.2)
    c.drawString(LEFT, current - 13, "Canonical code: lib/geodesic3v.ts + lib/spec3v.ts. Export: scripts/export_3v_pdf_data.mjs.")
    c.setFillColor(GREEN)
    c.setFont(BOLD, 7.5)
    c.drawString(LEFT, current - 26, "Accessible interactive reference: https://monroe-domes.vercel.app/3v")
    c.linkURL("https://monroe-domes.vercel.app/3v", (LEFT, current - 29, LEFT + 275, current - 17), relative=0)


PAGE_DRAWERS = (
    draw_cover,
    draw_geometry_page,
    draw_node_schedule_page,
    draw_axis_ab_page,
    draw_axis_c_page,
    draw_face_page,
    draw_face_continuation_page,
    draw_reconciliation_page,
    draw_holds_page,
)


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
        # Platypus tables may emit an empty text-state operation using a core
        # Helvetica resource. It paints no text, so remove it and then prune
        # any now-unused unembedded core-font resource.
        content = re.sub(
            rb"BT\s+/F\d+\s+(?:10|12)\s+Tf\s+(?:12|14\.4)\s+TL\s+ET",
            b"",
            content,
        )
        cleaned_stream = DecodedStreamObject()
        cleaned_stream.set_data(content)
        page.replace_contents(cleaned_stream)
        page[NameObject("/Tabs")] = NameObject("/S")

        fonts = page["/Resources"].get_object().get("/Font", {}).get_object()
        for resource_name in list(fonts.keys()):
            font = fonts[resource_name].get_object()
            if font.get("/FontDescriptor") is None and not re.search(
                re.escape(resource_name.encode("ascii")) + rb"(?:\s|$)", content
            ):
                del fonts[resource_name]
        for resource_name, font_ref in fonts.items():
            font = font_ref.get_object()
            descendants = font.get("/DescendantFonts", [])
            candidates = [font] + [item.get_object() for item in descendants]
            descriptors = [
                candidate.get("/FontDescriptor").get_object()
                for candidate in candidates
                if candidate.get("/FontDescriptor") is not None
            ]
            if not descriptors or not any(
                any(key in descriptor for key in ("/FontFile", "/FontFile2", "/FontFile3"))
                for descriptor in descriptors
            ):
                raise RuntimeError(f"Font {resource_name} on page {index + 1} is not embedded.")

        for annotation_ref in page.get("/Annots", []):
            annotation = annotation_ref.get_object()
            if annotation.get("/Subtype") == "/Link":
                annotation[NameObject("/Contents")] = TextStringObject(
                    "Open the accessible interactive 3V geometry reference"
                )

    writer.add_metadata({
        "/Title": "Black Belt Building - 12 FT 8 IN 3V Dome - Geometry Field Reference",
        "/Author": "Whole Body",
        "/Subject": "Audited 3V 5/8 node-center geometry and construction-release holds; not for fabrication.",
        "/Keywords": "Black Belt Building, Jantz, geodesic dome, 3V, 5/8, geometry, node schedule, non-fabrication",
        "/Creator": "Black Belt Building Dome CAD / Whole Body",
        "/ModelDataSHA256": MODEL_DIGEST,
    })
    temporary = path.with_suffix(".metadata.pdf")
    with temporary.open("wb") as stream:
        writer.write(stream)
    temporary.replace(path)


def validate_pdf(path: Path) -> None:
    reader = PdfReader(path)
    if len(reader.pages) != PAGE_COUNT:
        raise RuntimeError("Final 3V PDF page count changed during metadata pass.")
    page_text = [page.extract_text() or "" for page in reader.pages]
    text = "\n".join(page_text)
    required = (
        "61 mathematical nodes",
        "165 unique axes",
        "315 face-edge incidences",
        "A and B node-center chords",
        "C node-center chords",
        "Two mathematical triangle families",
        "Face inventory continuation",
        "B-EDGE BASE",
        "ALTITUDE TO B",
        "27.909805",
        "FABRICATION",
        "NOT RELEASED",
        "DO NOT ORDER, CUT, MACHINE, ASSEMBLE, OR OCCUPY",
    )
    missing = [item for item in required if item not in text]
    if missing:
        raise RuntimeError(f"Required PDF text is missing: {missing}")
    if text.count("GEOMETRY REFERENCE / NOT FOR FABRICATION") != PAGE_COUNT:
        raise RuntimeError("Every page must carry the geometry-only fabrication hold.")
    if any(item["id"] not in page_text[2] for item in MESH["vertices"]):
        raise RuntimeError("The final node schedule does not contain all 61 node IDs.")
    member_schedule_text = page_text[3] + page_text[4]
    if any(item["pieceId"] not in member_schedule_text for item in MODEL["members"]):
        raise RuntimeError("The final axis schedules do not contain all 165 piece IDs.")
    face_schedule_text = page_text[5] + page_text[6]
    if any(item["pieceId"] not in face_schedule_text for item in MODEL["panels"]):
        raise RuntimeError("The final face schedules do not contain all 105 piece IDs.")
    if "44.498447" in text or "39.350380" in text:
        raise RuntimeError("2V member dimensions leaked into the separate 3V PDF.")


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    c = FieldCanvas(
        str(OUT),
        pagesize=letter,
        pageCompression=1,
        title="Black Belt Building - 12 FT 8 IN 3V Dome - Geometry Field Reference",
        author="Whole Body",
        subject="Geometry reference only; not for fabrication.",
        creator="Black Belt Building Dome CAD / Whole Body",
    )
    c.setPageCompression(1)
    for index, draw_page in enumerate(PAGE_DRAWERS):
        c.setFillColor(PAPER)
        c.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
        draw_page(c)
        if index < PAGE_COUNT - 1:
            c.showPage()
    c.save()

    enhance_pdf(OUT)
    validate_pdf(OUT)
    PUBLIC.write_bytes(OUT.read_bytes())
    if hashlib.sha256(PUBLIC.read_bytes()).digest() != hashlib.sha256(OUT.read_bytes()).digest():
        raise RuntimeError("Public and output copies of the 3V PDF differ.")
    print(OUT)
    print(PUBLIC)


if __name__ == "__main__":
    main()
