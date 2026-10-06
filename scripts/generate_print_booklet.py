#!/usr/bin/env python3
"""Build the A4 duplex, fold-to-A5 honeymoon itinerary booklet.

The website's itinerary-data.js stays the source of truth.  This script reads
that data, makes compact A5 reading pages, then imposes them on A4 landscape
spreads for short-edge duplex printing and centre folding.
"""

from __future__ import annotations

import html
import json
import math
import re
import subprocess
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter, Transformation
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "js" / "data" / "itinerary-data.js"
OUTPUT = ROOT / "downloads" / "uk-ireland-honeymoon-a4-folded-booklet.pdf"

A5_W, A5_H = 419.528, 595.276
A4_W, A4_H = 841.89, 595.276
MARGIN = 27

INK = colors.HexColor("#162A2A")
NAVY = colors.HexColor("#1D3041")
GREEN = colors.HexColor("#24473F")
SAGE = colors.HexColor("#9DAA8B")
GOLD = colors.HexColor("#B28B4A")
IVORY = colors.HexColor("#F7F2E8")
PAPER = colors.HexColor("#FFFDF8")
MIST = colors.HexColor("#E6E7DE")
MUTED = colors.HexColor("#667170")
ROSE = colors.HexColor("#8C5B59")

FONT_CJK = "BookletCJK"
FONT_SERIF = "BookletSerif"
FONT_SERIF_BOLD = "BookletSerifBold"

pdfmetrics.registerFont(TTFont(FONT_CJK, "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"))
pdfmetrics.registerFont(TTFont(FONT_SERIF, "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"))
pdfmetrics.registerFont(TTFont(FONT_SERIF_BOLD, "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"))


IMAGE_FOR_DAY = {
    "1009": "assets/trip/al-mourjan-garden.jpeg",
    "1010": "assets/trip/manchester.jpg",
    "1011": "assets/trip/liverpool.jpg",
    "1012": "assets/trip/edinburgh.jpg",
    "1013": "assets/trip/edinburgh-castle.jpg",
    "1014": "assets/trip/loch-ness.jpg",
    "1017": "assets/trip/loch-ness.jpg",
    "1018": "assets/city-ground-nottingham.jpg",
    "1019": "assets/trip/belfast.png",
    "1020": "assets/trip/belfast.png",
    "1021": "assets/trip/dublin.jpg",
    "1022": "assets/trip/dublin.jpg",
    "1024": "assets/trip/bangkok.jpg",
    "1025": "assets/trip/bangkok.jpg",
    "1026": "assets/trip/bangkok.jpg",
}


def load_trip_data() -> dict:
    """Evaluate the static data module without needing a browser or build step."""
    script = """
const fs = require('fs');
const vm = require('vm');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(process.argv[1], 'utf8'), context);
process.stdout.write(JSON.stringify(context.window.TripData));
"""
    result = subprocess.run(
        ["node", "-e", script, str(DATA_FILE)],
        check=True,
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def clean_text(value: str, *, route: bool = False) -> str:
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    value = re.sub(r"</(?:p|li|div|h[1-6])>", "\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", "", value)
    value = html.unescape(value).replace("\xa0", " ")
    value = re.sub(r"[\U0001F000-\U0001FAFF\u2600-\u27BF]", "", value)
    value = re.sub(r"\s+", " ", value).strip()
    # Keep the print guide public-friendly: schedules stay, individual costs do not.
    value = re.sub(r"(?:£|€|NT\$)\s?[\d,.]+", "", value)
    value = re.sub(r"\s+([,.;:])", r"\1", value)
    value = value.replace(" → ", " · ")
    return value


def match_first(source: str, pattern: str) -> str:
    found = re.search(pattern, source, re.S | re.I)
    return clean_text(found.group(1), route=True) if found else ""


def extract_events(markup: str) -> list[dict[str, str]]:
    events: list[dict[str, str]] = []
    for chunk in re.split(r'<div class="timeline-item">', markup)[1:]:
        time = match_first(chunk, r'<div class="time">(.*?)</div>')
        title = match_first(chunk, r'<div class="event-title">(.*?)</div>')
        detail = match_first(chunk, r'<div class="event-detail">(.*?)</div>')
        if time or title:
            events.append({"time": time or "—", "title": title or "行程安排", "detail": detail})
    return events


def extract_notes(markup: str) -> list[str]:
    notes = []
    for content in re.findall(r'<div class="note[^\"]*">(.*?)</div>', markup, re.S | re.I):
        text = clean_text(content)
        if len(text) > 18:
            notes.append(text)
    return notes


def build_days(data: dict) -> list[dict]:
    presentation = data["meta"].get("dailyPresentation", {})
    days = []
    for panel in data["panels"]:
        if panel["id"] == "overview":
            continue
        markup = panel["html"]
        day_id = panel["id"]
        days.append(
            {
                "id": day_id,
                "date": match_first(markup, r'<div class="date">(.*?)</div>'),
                "title": match_first(markup, r'<h2>(.*?)</h2>'),
                "route": match_first(markup, r'<div class="route">(.*?)</div>'),
                "events": extract_events(markup),
                "notes": extract_notes(markup),
                "presentation": presentation.get(day_id, {}),
                "photo": IMAGE_FOR_DAY.get(day_id),
            }
        )
    return days


def page_canvas() -> tuple[canvas.Canvas, BytesIO]:
    buffer = BytesIO()
    return canvas.Canvas(buffer, pagesize=(A5_W, A5_H)), buffer


def finish_page(surface: canvas.Canvas, buffer: BytesIO) -> PdfReader:
    surface.showPage()
    surface.save()
    buffer.seek(0)
    return PdfReader(buffer)


def wrap(surface: canvas.Canvas, text: str, font: str, size: float, width: float, limit: int | None = None) -> list[str]:
    surface.setFont(font, size)
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    lines, line = [], ""
    for char in normalized:
        candidate = line + char
        if line and pdfmetrics.stringWidth(candidate, font, size) > width:
            lines.append(line.rstrip())
            line = char.lstrip()
        else:
            line = candidate
    if line:
        lines.append(line.rstrip())
    if limit and len(lines) > limit:
        lines = lines[:limit]
        lines[-1] = lines[-1].rstrip("，、；;：: ") + "…"
    return lines


def draw_wrapped(
    surface: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    width: float,
    *,
    font: str = FONT_CJK,
    size: float = 8.2,
    leading: float = 11,
    color: colors.Color = INK,
    limit: int | None = None,
) -> tuple[float, list[str]]:
    lines = wrap(surface, text, font, size, width, limit)
    surface.setFillColor(color)
    surface.setFont(font, size)
    for line in lines:
        surface.drawString(x, y, line)
        y -= leading
    return y, lines


def draw_cover_image(surface: canvas.Canvas, relpath: str | None, x: float, y: float, width: float, height: float) -> None:
    if not relpath or not (ROOT / relpath).exists():
        surface.setFillColor(GREEN)
        surface.rect(x, y, width, height, stroke=0, fill=1)
        surface.setStrokeColor(SAGE)
        surface.setLineWidth(0.5)
        for step in range(-int(height), int(width) + int(height), 24):
            surface.line(x + step, y, x + step + height, y + height)
        return
    image = ImageReader(str(ROOT / relpath))
    image_w, image_h = image.getSize()
    scale = max(width / image_w, height / image_h)
    draw_w, draw_h = image_w * scale, image_h * scale
    draw_x = x + (width - draw_w) / 2
    draw_y = y + (height - draw_h) / 2
    surface.saveState()
    path = surface.beginPath()
    path.rect(x, y, width, height)
    surface.clipPath(path, stroke=0, fill=0)
    surface.drawImage(image, draw_x, draw_y, draw_w, draw_h, mask="auto")
    surface.restoreState()


def draw_footer(surface: canvas.Canvas, page_number: int, label: str = "2026 UK & IRELAND · HONEYMOON") -> None:
    surface.setStrokeColor(colors.HexColor("#B9B5AB"))
    surface.setLineWidth(0.45)
    surface.line(MARGIN, 21, A5_W - MARGIN, 21)
    surface.setFillColor(MUTED)
    surface.setFont(FONT_SERIF, 6.6)
    surface.drawString(MARGIN, 10, label)
    surface.drawRightString(A5_W - MARGIN, 10, f"{page_number:02d}")


def day_number(day_id: str) -> int:
    return int(day_id) - 1008


def short_title(text: str) -> str:
    return re.sub(r"^[^\w\u4e00-\u9fff]+\s*", "", text).replace(" → ", " · ")


def display_day_title(day: dict) -> str:
    return short_title(day["presentation"].get("highlight") or day["title"])


def display_day_date(value: str) -> str:
    return re.sub(r"[（(].*?[）)]", "", value).strip()


def draw_kicker(surface: canvas.Canvas, value: str, x: float, y: float, color: colors.Color = GOLD) -> None:
    surface.setFillColor(color)
    surface.setFont(FONT_SERIF_BOLD, 7.5)
    surface.drawString(x, y, value.upper())


def draw_fact(surface: canvas.Canvas, label: str, value: str, x: float, y: float, width: float, tint: colors.Color) -> None:
    surface.setFillColor(tint)
    surface.roundRect(x, y - 38, width, 38, 6, stroke=0, fill=1)
    surface.setFillColor(GREEN)
    surface.setFont(FONT_SERIF_BOLD, 6.2)
    surface.drawString(x + 8, y - 11, label.upper())
    draw_wrapped(surface, (value or "—").replace(" → ", " · "), x + 8, y - 22, width - 16, size=7.4, leading=8.7, limit=2, color=INK)


def draw_timeline_event(surface: canvas.Canvas, event: dict, y: float) -> float:
    dot_x, content_x = 68, 86
    time_x, content_w = 28, A5_W - content_x - MARGIN
    title_lines = wrap(surface, event["title"], FONT_CJK, 8.5, content_w, 2)
    detail_lines = wrap(surface, event["detail"], FONT_CJK, 7.05, content_w, 2) if event["detail"] else []
    height = max(26, 7 + len(title_lines) * 10 + len(detail_lines) * 8.8)
    surface.setStrokeColor(colors.HexColor("#B5BDB5"))
    surface.setLineWidth(0.6)
    surface.line(dot_x, y + 3, dot_x, y - height + 2)
    surface.setFillColor(GOLD)
    surface.circle(dot_x, y, 2.5, stroke=0, fill=1)
    surface.setFillColor(MUTED)
    surface.setFont(FONT_CJK, 7.2)
    for index, line in enumerate(wrap(surface, event["time"], FONT_CJK, 7.2, 34, 2)):
        surface.drawRightString(dot_x - 10, y - index * 8.4, line)
    next_y, _ = draw_wrapped(surface, "\n".join(title_lines), content_x, y + 1, content_w, size=8.5, leading=10, color=INK)
    if detail_lines:
        next_y -= 1
        next_y, _ = draw_wrapped(surface, "\n".join(detail_lines), content_x, next_y, content_w, size=7.05, leading=8.8, color=MUTED)
    return min(y - height - 4, next_y - 7)


def render_day_page(day: dict, group: list[dict], group_index: int, group_count: int, page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    surface.setFillColor(PAPER)
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)

    continuation = group_index > 0
    if not continuation:
        draw_cover_image(surface, day["photo"], 0, A5_H - 158, A5_W, 158)
        surface.setFillColor(colors.Color(0.04, 0.12, 0.12, alpha=0.65))
        surface.rect(0, A5_H - 158, A5_W, 158, stroke=0, fill=1)
        draw_kicker(surface, f"DAY {day_number(day['id']):02d} · {display_day_date(day['date'])}", MARGIN, A5_H - 36, colors.white)
        surface.setFillColor(colors.white)
        surface.setFont(FONT_CJK, 19)
        title_lines = wrap(surface, display_day_title(day), FONT_CJK, 19, A5_W - 2 * MARGIN, 2)
        title_y = A5_H - 65
        for line in title_lines:
            surface.drawString(MARGIN, title_y, line)
            title_y -= 23
        route = day["route"] or day["presentation"].get("highlight", "")
        draw_wrapped(surface, route, MARGIN, A5_H - 135, A5_W - 2 * MARGIN, size=7.5, leading=9.5, color=colors.white, limit=2)
        fact_y = A5_H - 176
        draw_fact(surface, "Day highlight", day["presentation"].get("highlight", ""), MARGIN, fact_y, 176, MIST)
        draw_fact(surface, "Tonight", day["presentation"].get("stay", ""), MARGIN + 189, fact_y, 176, colors.HexColor("#EDE4CE"))
        y = fact_y - 62
        draw_kicker(surface, "THE DAY, AT A GLANCE", MARGIN, y, GREEN)
        y -= 20
    else:
        surface.setFillColor(GREEN)
        surface.rect(0, A5_H - 94, A5_W, 94, stroke=0, fill=1)
        draw_kicker(surface, f"DAY {day_number(day['id']):02d} · CONTINUED", MARGIN, A5_H - 34, colors.HexColor("#EFDFAF"))
        surface.setFillColor(colors.white)
        surface.setFont(FONT_CJK, 15)
        surface.drawString(MARGIN, A5_H - 62, display_day_title(day))
        y = A5_H - 124
        draw_kicker(surface, f"TIMELINE · PART {group_index + 1} OF {group_count}", MARGIN, y, GREEN)
        y -= 20

    for event in group:
        y = draw_timeline_event(surface, event, y)

    if group_index == group_count - 1 and day["notes"] and y > 85:
        note = day["notes"][0]
        surface.setFillColor(colors.HexColor("#F0EEE6"))
        surface.roundRect(MARGIN, 50, A5_W - 2 * MARGIN, min(44, y - 56), 6, stroke=0, fill=1)
        draw_kicker(surface, "TRAVEL NOTE", MARGIN + 10, min(82, y - 12), ROSE)
        draw_wrapped(surface, note, MARGIN + 10, min(69, y - 25), A5_W - 2 * MARGIN - 20, size=7.1, leading=8.8, limit=2, color=INK)

    draw_footer(surface, page_number, f"DAY {day_number(day['id']):02d} · {display_day_date(day['date'])}")
    return finish_page(surface, buffer)


def render_cover(_: dict, page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    draw_cover_image(surface, "assets/trip/edinburgh.jpg", 0, 0, A5_W, A5_H)
    surface.setFillColor(colors.Color(0.05, 0.12, 0.13, alpha=0.73))
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    surface.setStrokeColor(colors.HexColor("#D9C693"))
    surface.setLineWidth(1.2)
    surface.line(MARGIN, A5_H - 48, A5_W - MARGIN, A5_H - 48)
    draw_kicker(surface, "OUR HONEYMOON · 2026", MARGIN, A5_H - 34, colors.HexColor("#E8D7A8"))
    surface.setFillColor(colors.white)
    surface.setFont(FONT_SERIF, 28)
    surface.drawString(MARGIN, 280, "UNITED KINGDOM")
    surface.setFont(FONT_SERIF, 21)
    surface.drawString(MARGIN, 248, "× IRELAND")
    surface.setFont(FONT_CJK, 24)
    surface.drawString(MARGIN, 204, "2026 英國・愛爾蘭蜜月")
    surface.setFillColor(colors.HexColor("#E8D7A8"))
    surface.setFont(FONT_SERIF, 10)
    surface.drawString(MARGIN, 169, "09 OCTOBER — 26 OCTOBER")
    surface.setFillColor(colors.white)
    surface.setFont(FONT_CJK, 9)
    surface.drawString(MARGIN, 78, "A4 雙面短邊翻轉 · 對摺成 A5 小冊")
    surface.setFont(FONT_SERIF, 7.5)
    surface.drawString(MARGIN, 60, "FULL TIMELINE EDITION · PRINT GUIDE")
    return finish_page(surface, buffer)


def render_print_guide(_: dict, page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    surface.setFillColor(IVORY)
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    draw_kicker(surface, "START HERE", MARGIN, A5_H - 48, GOLD)
    surface.setFillColor(INK)
    surface.setFont(FONT_CJK, 22)
    surface.drawString(MARGIN, A5_H - 85, "這本手冊怎麼用")
    items = [
        ("01", "A4 雙面列印", "選擇 A4、雙面、短邊翻轉、實際大小／100%。不要啟用印表機的 Booklet 模式。"),
        ("02", "依頁序對摺", "檔案已經完成小冊頁序。列印後依紙張順序疊好、沿中央對摺，再以騎馬釘或膠裝固定。"),
        ("03", "旅行時用網站", "手冊保留完整時間節奏與備註；即時導航、營業時間與天氣請使用網站的 Map、Weather 與 Google Maps。"),
    ]
    y = A5_H - 140
    for no, title, body in items:
        surface.setFillColor(GREEN)
        surface.circle(MARGIN + 12, y, 12, stroke=0, fill=1)
        surface.setFillColor(colors.white)
        surface.setFont(FONT_SERIF_BOLD, 8)
        surface.drawCentredString(MARGIN + 12, y - 3, no)
        surface.setFillColor(INK)
        surface.setFont(FONT_CJK, 11)
        surface.drawString(MARGIN + 34, y + 2, title)
        draw_wrapped(surface, body, MARGIN + 34, y - 15, A5_W - MARGIN - 34, size=8.2, leading=11, color=MUTED, limit=3)
        y -= 110
    surface.setFillColor(colors.HexColor("#E3E6D8"))
    surface.roundRect(MARGIN, 88, A5_W - 2 * MARGIN, 54, 7, stroke=0, fill=1)
    draw_kicker(surface, "ON THE ROAD", MARGIN + 12, 123, GREEN)
    draw_wrapped(surface, "固定預約優先；天氣、交通或體力有變時，先縮短可選景點，不犧牲用餐、飯店與交通緩衝。", MARGIN + 12, 107, A5_W - 2 * MARGIN - 24, size=8, leading=10.5, limit=3, color=INK)
    draw_footer(surface, page_number)
    return finish_page(surface, buffer)


def render_flights(data: dict, page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    surface.setFillColor(PAPER)
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    draw_kicker(surface, "TRAVEL CONTROL", MARGIN, A5_H - 42, GOLD)
    surface.setFillColor(INK)
    surface.setFont(FONT_CJK, 22)
    surface.drawString(MARGIN, A5_H - 76, "空中移動總覽")
    y = A5_H - 116
    for flight in data["meta"]["travelControl"]["flights"]:
        surface.setFillColor(IVORY)
        surface.roundRect(MARGIN, y - 46, A5_W - 2 * MARGIN, 44, 6, stroke=0, fill=1)
        surface.setFillColor(GREEN)
        surface.setFont(FONT_SERIF_BOLD, 10)
        surface.drawString(MARGIN + 10, y - 17, flight["code"])
        surface.setFillColor(INK)
        surface.setFont(FONT_CJK, 8.3)
        surface.drawString(MARGIN + 69, y - 17, flight["route"].replace(" → ", " · "))
        surface.setFillColor(MUTED)
        surface.setFont(FONT_CJK, 7.2)
        surface.drawString(MARGIN + 69, y - 31, f"{flight['time']}  ·  {flight['cabin']}  ·  {flight['aircraft']}")
        y -= 53
    draw_footer(surface, page_number)
    return finish_page(surface, buffer)


def render_stays(data: dict, page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    surface.setFillColor(PAPER)
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    draw_kicker(surface, "REST WELL", MARGIN, A5_H - 42, GOLD)
    surface.setFillColor(INK)
    surface.setFont(FONT_CJK, 22)
    surface.drawString(MARGIN, A5_H - 76, "住宿總覽")
    hotels = [place for place in data["meta"]["journeyMap"]["places"] if place["kind"] == "hotel"]
    y = A5_H - 112
    for hotel in hotels:
        surface.setStrokeColor(colors.HexColor("#D6D7CE"))
        surface.setLineWidth(0.6)
        surface.line(MARGIN, y - 41, A5_W - MARGIN, y - 41)
        surface.setFillColor(GREEN)
        surface.setFont(FONT_SERIF_BOLD, 7)
        surface.drawString(MARGIN, y - 12, f"DAY {day_number(hotel['day']):02d}")
        surface.setFillColor(INK)
        surface.setFont(FONT_CJK, 8.7)
        surface.drawString(MARGIN + 50, y - 12, hotel["name"])
        draw_wrapped(surface, hotel["description"], MARGIN + 50, y - 26, A5_W - 2 * MARGIN - 50, size=6.8, leading=8, limit=1, color=MUTED)
        y -= 47
    draw_footer(surface, page_number)
    return finish_page(surface, buffer)


def render_journey(data: dict, page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    surface.setFillColor(GREEN)
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    draw_kicker(surface, "THE WHOLE STORY", MARGIN, A5_H - 44, colors.HexColor("#E6D49B"))
    surface.setFillColor(colors.white)
    surface.setFont(FONT_CJK, 22)
    surface.drawString(MARGIN, A5_H - 78, "蜜月的移動節奏")
    stops = [
        ("01", "Taipei / Seoul / Doha", "航班與轉機"),
        ("02", "Manchester / Liverpool", "城市、球場與音樂"),
        ("03", "Edinburgh / Highlands / Skye", "火車與公路旅行"),
        ("04", "Glasgow / Nottingham", "藝術、球賽與回程前一晚"),
        ("05", "Belfast / Dublin", "海岸導覽與愛爾蘭城市"),
        ("06", "Doha / Bangkok / Taipei", "空中體驗與慢慢回家"),
    ]
    y = A5_H - 132
    for number, title, detail in stops:
        surface.setStrokeColor(colors.HexColor("#8FA69B"))
        surface.setLineWidth(0.55)
        surface.line(MARGIN + 14, y - 40, MARGIN + 14, y - 101)
        surface.setFillColor(GOLD)
        surface.circle(MARGIN + 14, y - 28, 6, stroke=0, fill=1)
        surface.setFillColor(colors.HexColor("#EDE8DB"))
        surface.setFont(FONT_SERIF_BOLD, 7)
        surface.drawString(MARGIN + 32, y - 25, number)
        surface.setFillColor(colors.white)
        surface.setFont(FONT_CJK, 10)
        surface.drawString(MARGIN + 32, y - 43, title)
        surface.setFillColor(colors.HexColor("#C7D2C9"))
        surface.setFont(FONT_CJK, 7.5)
        surface.drawString(MARGIN + 32, y - 59, detail)
        y -= 77
    draw_footer(surface, page_number, "OUR HONEYMOON · JOURNEY OVERVIEW")
    return finish_page(surface, buffer)


def render_highlands(days: list[dict], page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    surface.setFillColor(IVORY)
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    draw_cover_image(surface, "assets/trip/loch-ness.jpg", 0, A5_H - 178, A5_W, 178)
    surface.setFillColor(colors.Color(0.05, 0.16, 0.13, alpha=0.58))
    surface.rect(0, A5_H - 178, A5_W, 178, stroke=0, fill=1)
    draw_kicker(surface, "SCOTTISH HIGHLANDS", MARGIN, A5_H - 38, colors.HexColor("#F2DEA2"))
    surface.setFillColor(colors.white)
    surface.setFont(FONT_CJK, 20)
    surface.drawString(MARGIN, A5_H - 76, "公路旅行章節")
    y = A5_H - 216
    for day in [day for day in days if "1014" <= day["id"] <= "1018"]:
        surface.setFillColor(PAPER)
        surface.roundRect(MARGIN, y - 45, A5_W - 2 * MARGIN, 43, 6, stroke=0, fill=1)
        surface.setFillColor(GREEN)
        surface.setFont(FONT_SERIF_BOLD, 7.2)
        surface.drawString(MARGIN + 10, y - 14, f"DAY {day_number(day['id']):02d}")
        surface.setFillColor(INK)
        surface.setFont(FONT_CJK, 9)
        surface.drawString(MARGIN + 58, y - 14, short_title(day["title"]))
        draw_wrapped(surface, day["presentation"].get("driving", day["route"]), MARGIN + 58, y - 29, A5_W - 2 * MARGIN - 68, size=7, leading=8.5, limit=1, color=MUTED)
        y -= 53
    surface.setFillColor(colors.HexColor("#E2E6D9"))
    surface.roundRect(MARGIN, 85, A5_W - 2 * MARGIN, 62, 7, stroke=0, fill=1)
    draw_kicker(surface, "ROAD-TRIP RULE", MARGIN + 12, 128, GREEN)
    draw_wrapped(surface, "天氣、停車與路況比『多塞一個點』重要。若延誤，先縮短可選景點，不壓縮飯店、加油、用餐與安全緩衝。", MARGIN + 12, 111, A5_W - 2 * MARGIN - 24, size=8, leading=10.5, limit=3, color=INK)
    draw_footer(surface, page_number, "HIGHLANDS ROAD TRIP")
    return finish_page(surface, buffer)


def render_bookings(data: dict, page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    surface.setFillColor(PAPER)
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    draw_kicker(surface, "FIXED MOMENTS", MARGIN, A5_H - 42, GOLD)
    surface.setFillColor(INK)
    surface.setFont(FONT_CJK, 22)
    surface.drawString(MARGIN, A5_H - 76, "已確認的重要安排")
    saved = [place for place in data["meta"]["journeyMap"]["places"] if place.get("saved")]
    y = A5_H - 116
    for place in saved[:9]:
        surface.setFillColor(GREEN)
        surface.circle(MARGIN + 5, y - 4, 3, stroke=0, fill=1)
        surface.setFillColor(INK)
        surface.setFont(FONT_CJK, 8.6)
        surface.drawString(MARGIN + 17, y - 7, place["name"])
        detail = place["description"]
        if place.get("time") and place["time"] != "—":
            detail = f"{place['time']} · {detail}"
        draw_wrapped(surface, detail, MARGIN + 17, y - 21, A5_W - 2 * MARGIN - 17, size=6.9, leading=8.3, limit=1, color=MUTED)
        y -= 47
    surface.setFillColor(colors.HexColor("#EFE5D4"))
    surface.roundRect(MARGIN, 66, A5_W - 2 * MARGIN, 50, 7, stroke=0, fill=1)
    draw_wrapped(surface, "手冊只列出已確認的固定安排；現場請以官方通知、電子票券與網站最新版為準。", MARGIN + 12, 97, A5_W - 2 * MARGIN - 24, size=8, leading=10.5, limit=3, color=INK)
    draw_footer(surface, page_number)
    return finish_page(surface, buffer)


def render_city_index(_: dict, page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    surface.setFillColor(PAPER)
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    draw_kicker(surface, "CITY CHAPTERS", MARGIN, A5_H - 42, GOLD)
    surface.setFillColor(INK)
    surface.setFont(FONT_CJK, 22)
    surface.drawString(MARGIN, A5_H - 76, "城市篇章索引")
    chapters = [
        ("10/10–11", "Manchester & Liverpool", "工業、球場、音樂"),
        ("10/12–13", "Edinburgh", "Old Town、Castle、Afternoon Tea"),
        ("10/14–18", "Highlands & Skye", "租車、公路、風景與球賽"),
        ("10/19–20", "Belfast", "城市住一晚、巨人堤道"),
        ("10/20–22", "Dublin", "愛爾蘭城市日"),
        ("10/23–26", "Doha & Bangkok", "貴賓室、飛行與慢旅"),
    ]
    y = A5_H - 121
    for date, city, mood in chapters:
        surface.setFillColor(MIST)
        surface.roundRect(MARGIN, y - 50, A5_W - 2 * MARGIN, 48, 6, stroke=0, fill=1)
        surface.setFillColor(GREEN)
        surface.setFont(FONT_SERIF_BOLD, 7)
        surface.drawString(MARGIN + 11, y - 14, date)
        surface.setFillColor(INK)
        surface.setFont(FONT_SERIF, 10)
        surface.drawString(MARGIN + 11, y - 29, city)
        surface.setFillColor(MUTED)
        surface.setFont(FONT_CJK, 7.3)
        surface.drawRightString(A5_W - MARGIN - 11, y - 29, mood)
        y -= 61
    draw_footer(surface, page_number)
    return finish_page(surface, buffer)


def render_collage(_: dict, page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    surface.setFillColor(IVORY)
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    draw_kicker(surface, "TRAVEL JOURNAL", MARGIN, A5_H - 42, GOLD)
    surface.setFillColor(INK)
    surface.setFont(FONT_CJK, 22)
    surface.drawString(MARGIN, A5_H - 76, "在路上的片刻")
    tiles = [
        ("assets/trip/manchester.jpg", MARGIN, 300, 177, 155),
        ("assets/trip/edinburgh-castle.jpg", MARGIN + 190, 300, 175, 155),
        ("assets/trip/belfast.png", MARGIN, 122, 177, 155),
        ("assets/trip/bangkok.jpg", MARGIN + 190, 122, 175, 155),
    ]
    for image, x, y, width, height in tiles:
        draw_cover_image(surface, image, x, y, width, height)
        surface.setStrokeColor(PAPER)
        surface.setLineWidth(2)
        surface.rect(x, y, width, height, stroke=1, fill=0)
    surface.setFillColor(MUTED)
    surface.setFont(FONT_CJK, 8)
    surface.drawCentredString(A5_W / 2, 85, "城市、山路、海岸與最後的曼谷。")
    draw_footer(surface, page_number)
    return finish_page(surface, buffer)


def render_back_cover(_: dict, page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    draw_cover_image(surface, "assets/trip/bangkok.jpg", 0, 0, A5_W, A5_H)
    surface.setFillColor(colors.Color(0.06, 0.13, 0.12, alpha=0.72))
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    surface.setStrokeColor(colors.HexColor("#E8D7A8"))
    surface.setLineWidth(0.8)
    surface.line(MARGIN, 165, A5_W - MARGIN, 165)
    surface.setFillColor(colors.white)
    surface.setFont(FONT_CJK, 24)
    surface.drawCentredString(A5_W / 2, 220, "旅程的節奏，留給兩個人。")
    surface.setFillColor(colors.HexColor("#E8D7A8"))
    surface.setFont(FONT_SERIF, 10)
    surface.drawCentredString(A5_W / 2, 190, "HAVE A SLOW, BEAUTIFUL HONEYMOON.")
    surface.setFillColor(colors.white)
    surface.setFont(FONT_SERIF, 7)
    surface.drawCentredString(A5_W / 2, 50, "2026 UK & IRELAND · KC & JUJU")
    return finish_page(surface, buffer)


def impose_booklet(a5_pages: list[PdfReader]) -> PdfWriter:
    """Lay reading-order A5 pages out as A4 short-edge, duplex fold spreads."""
    while len(a5_pages) % 4:
        blank_surface, blank_buffer = page_canvas()
        blank_surface.setFillColor(PAPER)
        blank_surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
        a5_pages.append(finish_page(blank_surface, blank_buffer))

    writer = PdfWriter()
    pages = [reader.pages[0] for reader in a5_pages]
    total = len(pages)
    for sheet in range(total // 4):
        front = writer.add_blank_page(width=A4_W, height=A4_H)
        back = writer.add_blank_page(width=A4_W, height=A4_H)
        left_front, right_front = total - 1 - 2 * sheet, 2 * sheet
        left_back, right_back = 2 * sheet + 1, total - 2 - 2 * sheet
        front.merge_transformed_page(pages[left_front], Transformation().translate(0, 0))
        front.merge_transformed_page(pages[right_front], Transformation().translate(A5_W, 0))
        back.merge_transformed_page(pages[left_back], Transformation().translate(0, 0))
        back.merge_transformed_page(pages[right_back], Transformation().translate(A5_W, 0))
    return writer


def main() -> None:
    data = load_trip_data()
    days = build_days(data)
    specs: list[tuple[str, object]] = [
        ("cover", data),
        ("print", data),
        ("flights", data),
        ("stays", data),
        ("journey", data),
        ("highlands", days),
        ("bookings", data),
        ("cities", data),
        ("collage", data),
    ]
    for day in days:
        groups = [day["events"][index : index + 6] for index in range(0, len(day["events"]), 6)] or [[]]
        for index, group in enumerate(groups):
            specs.append(("day", (day, group, index, len(groups))))
    specs.append(("back", data))

    # Keep the back cover as the final page while making a valid multiple of four.
    while len(specs) % 4:
        specs.insert(-1, ("cities", data))

    a5_readers: list[PdfReader] = []
    total_pages = len(specs)
    for page_number, (kind, payload) in enumerate(specs, start=1):
        if kind == "cover":
            a5_readers.append(render_cover(payload, page_number))
        elif kind == "print":
            a5_readers.append(render_print_guide(payload, page_number))
        elif kind == "flights":
            a5_readers.append(render_flights(payload, page_number))
        elif kind == "stays":
            a5_readers.append(render_stays(payload, page_number))
        elif kind == "journey":
            a5_readers.append(render_journey(payload, page_number))
        elif kind == "highlands":
            a5_readers.append(render_highlands(payload, page_number))
        elif kind == "bookings":
            a5_readers.append(render_bookings(payload, page_number))
        elif kind == "cities":
            a5_readers.append(render_city_index(payload, page_number))
        elif kind == "collage":
            a5_readers.append(render_collage(payload, page_number))
        elif kind == "day":
            a5_readers.append(render_day_page(*payload, page_number))
        elif kind == "back":
            a5_readers.append(render_back_cover(payload, page_number))
        else:
            raise ValueError(f"Unknown page type: {kind}")

    booklet = impose_booklet(a5_readers)
    booklet.add_metadata(
        {
            "/Title": "2026 UK & Ireland Honeymoon - A4 Folded Print Booklet",
            "/Author": "KC & JUJU",
            "/Subject": "A4 duplex, short-edge print booklet. Fold to A5.",
        }
    )
    with OUTPUT.open("wb") as destination:
        booklet.write(destination)
    print(f"Created {OUTPUT} with {total_pages} A5 reading pages on {len(booklet.pages)} A4 spreads")


if __name__ == "__main__":
    main()
