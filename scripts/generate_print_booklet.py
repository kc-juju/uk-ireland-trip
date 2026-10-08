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
BW_OUTPUT = ROOT / "downloads" / "uk-ireland-honeymoon-black-white-reading-guide.pdf"
BW_BOOKLET_OUTPUT = ROOT / "downloads" / "uk-ireland-honeymoon-black-white-a4-folded-booklet.pdf"
MOBILE_OUTPUT = ROOT / "downloads" / "uk-ireland-honeymoon-mobile-reading-guide.pdf"

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
MONOCHROME = False

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
    # A small number of existing itinerary days use a compact bullet schedule
    # instead of timeline markup.  Preserve those plans in the booklet rather
    # than leaving a mostly empty daily page.
    if not events:
        for item in re.findall(r"<li[^>]*>(.*?)</li>", markup, re.S | re.I):
            text = clean_text(item)
            if not text:
                continue
            time_match = re.match(r"^((?:約\s*)?\d{1,2}:\d{2}(?:\s*[–-]\s*\d{1,2}:\d{2})?)\s*(.*)$", text)
            events.append(
                {
                    "time": time_match.group(1) if time_match else "—",
                    "title": time_match.group(2).lstrip("、· ") if time_match else text,
                    "detail": "",
                }
            )
    return events


def extract_notes(markup: str) -> list[str]:
    notes = []
    for content in re.findall(r'<div class="note[^\"]*">(.*?)</div>', markup, re.S | re.I):
        text = clean_text(content)
        if len(text) > 18 and not re.search(r"honeymoon\s+complete|回家啦", text, re.I):
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
    # Measurement uses pdfmetrics directly; keeping ``surface`` in the
    # signature preserves callers while allowing pagination before a page is
    # created.
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
    if MONOCHROME:
        text = printable_detail(text)
    lines = wrap(surface, text, font, size, width, limit)
    surface.setFillColor(color)
    surface.setFont(font, size)
    for line in lines:
        surface.drawString(x, y, line)
        y -= leading
    return y, lines


def draw_cover_image(surface: canvas.Canvas, relpath: str | None, x: float, y: float, width: float, height: float) -> None:
    if MONOCHROME:
        # The monochrome edition uses paper-white editorial fields. Corner
        # marks and one small index tab retain hierarchy without photo ink,
        # heavy fills, or a repeating background texture.
        surface.setFillColor(PAPER)
        surface.rect(x, y, width, height, stroke=0, fill=1)
        crop = min(20, max(10, min(width, height) / 8))
        inset = min(14, max(8, min(width, height) / 12))
        surface.setStrokeColor(colors.HexColor("#282828"))
        surface.setLineWidth(0.75)
        # Two open crop marks create a quiet printed-journal feel without
        # boxing the content into a large, dark panel.
        surface.line(x + inset, y + height - inset, x + inset + crop, y + height - inset)
        surface.line(x + inset, y + height - inset, x + inset, y + height - inset - crop)
        surface.line(x + width - inset, y + inset, x + width - inset - crop, y + inset)
        surface.line(x + width - inset, y + inset, x + width - inset, y + inset + crop)
        tab = min(20, max(12, min(width, height) / 7))
        tab_x = x + width - inset - tab
        tab_y = y + height - inset - tab
        surface.setFillColor(colors.HexColor("#E0E0E0"))
        surface.roundRect(tab_x, tab_y, tab, tab, 2, stroke=0, fill=1)
        surface.setFillColor(INK)
        surface.circle(tab_x + tab / 2, tab_y + tab / 2, 2.1, stroke=0, fill=1)
        return
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
    surface.setStrokeColor(themed("#B9B5AB", "#B8B8B8"))
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


def book_title_case(value: str) -> str:
    """Apply restrained book-style title case to English print headings."""
    if not MONOCHROME or not re.search(r"[A-Za-z]", value):
        return value
    small_words = {"a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "of", "on", "or", "per", "the", "to", "via", "vs", "with"}
    tokens = re.split(r"(\s+)", value)
    word_positions = [index for index, token in enumerate(tokens) if re.search(r"[A-Za-z]", token)]
    if not word_positions:
        return value
    first, last = word_positions[0], word_positions[-1]
    for index in word_positions:
        token = tokens[index]
        match = re.match(r"^(.*?)([A-Za-z][A-Za-z'’.-]*)([^A-Za-z]*)$", token)
        if not match:
            continue
        prefix, word, suffix = match.groups()
        lower = word.lower()
        if word.isupper() or any(char.isdigit() for char in word):
            styled = word
        elif lower in small_words and index not in {first, last}:
            styled = lower
        else:
            styled = lower[:1].upper() + lower[1:]
        tokens[index] = f"{prefix}{styled}{suffix}"
    return "".join(tokens)


def printable_detail(value: str) -> str:
    """Remove screen-only navigation cues and closing full stops in the mono PDF."""
    if not MONOCHROME:
        return value
    text = value or ""
    navigation = r"(?:Google\s*Maps|導航|地圖|官方資訊)\s*↗?"
    text = re.sub(rf"\s*[·•]\s*{navigation}", "", text)
    text = re.sub(rf"\s*{navigation}", "", text)
    text = text.replace("↗", "")
    text = text.replace("。", "；")
    text = re.sub(r"\s*[；;。.!！]+\s*$", "", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def display_day_date(value: str) -> str:
    return re.sub(r"[（(].*?[）)]", "", value).strip()


def draw_kicker(surface: canvas.Canvas, value: str, x: float, y: float, color: colors.Color = GOLD) -> None:
    surface.setFillColor(color)
    surface.setFont(FONT_SERIF_BOLD, 7.5)
    surface.drawString(x, y, value.upper())


def heading_font(value: str) -> str:
    """Use the booklet serif only for English headings in the mono edition."""
    return FONT_SERIF if MONOCHROME and not re.search(r"[\u4e00-\u9fff]", value) else FONT_CJK


def draw_section_title(
    surface: canvas.Canvas,
    english: str,
    chinese: str,
    x: float,
    y: float,
    size: float = 22,
    color: colors.Color | None = None,
) -> None:
    value = english if MONOCHROME else chinese
    surface.setFillColor(color or INK)
    surface.setFont(heading_font(value), size)
    surface.drawString(x, y, value)


def themed(hex_value: str, grayscale: str) -> colors.Color:
    """Use a real neutral tint in the monochrome reading edition."""
    return colors.HexColor(grayscale if MONOCHROME else hex_value)


def themed_overlay(red: float, green: float, blue: float, alpha: float) -> colors.Color:
    """Keep translucent overlays neutral in the black-and-white edition."""
    if MONOCHROME:
        luminance = (red + green + blue) / 3
        return colors.Color(luminance, luminance, luminance, alpha=alpha)
    return colors.Color(red, green, blue, alpha=alpha)


def draw_fact(surface: canvas.Canvas, label: str, value: str, x: float, y: float, width: float, tint: colors.Color) -> None:
    surface.setFillColor(tint)
    surface.roundRect(x, y - 38, width, 38, 6, stroke=0, fill=1)
    surface.setFillColor(GREEN)
    surface.setFont(FONT_SERIF_BOLD, 6.2)
    surface.drawString(x + 8, y - 11, label.upper())
    draw_wrapped(surface, (value or "—").replace(" → ", " · "), x + 8, y - 22, width - 16, size=7.4, leading=8.7, limit=2, color=INK)


def draw_timeline_event(surface: canvas.Canvas, event: dict, y: float) -> float:
    # A dedicated, two-line time column makes ranges readable at A5 size.  Do
    # not let a long range wrap in the middle of the end time.
    dot_x, content_x = 78, 98
    content_w = A5_W - content_x - MARGIN
    title_lines = wrap(surface, book_title_case(event["title"]), FONT_CJK, 8.5, content_w, 2)
    detail = printable_detail(event["detail"])
    detail_lines = wrap(surface, detail, FONT_CJK, 7.05, content_w, 3) if detail else []
    time = event["time"].strip()
    range_match = re.match(r"^(.*?)([–-])(.*)$", time)
    if range_match:
        time_lines = [f"{range_match.group(1).strip()}{range_match.group(2)}", range_match.group(3).strip()]
    else:
        time_lines = wrap(surface, time, FONT_CJK, 7.2, 42, 2)
    height = max(28, 7 + len(title_lines) * 10 + len(detail_lines) * 8.8, len(time_lines) * 8.6 + 9)
    surface.setStrokeColor(themed("#B5BDB5", "#B8B8B8"))
    surface.setLineWidth(0.6)
    surface.line(dot_x, y + 3, dot_x, y - height + 2)
    surface.setFillColor(GOLD)
    surface.circle(dot_x, y, 2.5, stroke=0, fill=1)
    surface.setFillColor(MUTED)
    surface.setFont(FONT_CJK, 7.2)
    for index, line in enumerate(time_lines):
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
        day_title = book_title_case(display_day_title(day))
        day_title_font = heading_font(day_title)
        title_lines = wrap(surface, day_title, day_title_font, 19, A5_W - 2 * MARGIN, 2)
        # Keep first pages compact in the monochrome edition. A second title
        # line earns only the room it needs instead of a fixed photo-height header.
        # Leave comparable space above the title and below the final timeline
        # item on monochrome daily pages; the denser timeline can still extend
        # safely to the footer when needed.
        header_height = (126 + max(0, len(title_lines) - 1) * 23) if MONOCHROME else 158
        header_bottom = A5_H - header_height
        draw_cover_image(surface, day["photo"], 0, header_bottom, A5_W, header_height)
        if not MONOCHROME:
            surface.setFillColor(themed_overlay(0.04, 0.12, 0.12, 0.65))
            surface.rect(0, header_bottom, A5_W, header_height, stroke=0, fill=1)
        header_ink = INK if MONOCHROME else colors.white
        draw_kicker(surface, f"DAY {day_number(day['id']):02d} · {display_day_date(day['date'])}", MARGIN, A5_H - 36, header_ink)
        surface.setFillColor(header_ink)
        surface.setFont(day_title_font, 19)
        title_y = A5_H - (60 if MONOCHROME else 65)
        for line in title_lines:
            surface.drawString(MARGIN, title_y, line)
            title_y -= 23
        route = day["route"] or day["presentation"].get("highlight", "")
        route_y = header_bottom + 17 if MONOCHROME else A5_H - 135
        draw_wrapped(surface, route, MARGIN, route_y, A5_W - 2 * MARGIN, size=7.5, leading=9.5, color=MUTED if MONOCHROME else colors.white, limit=2)
        fact_y = header_bottom - 18 if MONOCHROME else A5_H - 176
        draw_fact(surface, "Day highlight", day["presentation"].get("highlight", ""), MARGIN, fact_y, 176, MIST)
        draw_fact(surface, "Tonight", day["presentation"].get("stay", ""), MARGIN + 189, fact_y, 176, themed("#EDE4CE", "#E7E7E7"))
        y = fact_y - 62
        draw_kicker(surface, "THE DAY, AT A GLANCE", MARGIN, y, GREEN)
        y -= 20
    else:
        if MONOCHROME:
            surface.setFillColor(PAPER)
            surface.rect(0, A5_H - 94, A5_W, 94, stroke=0, fill=1)
            surface.setStrokeColor(INK)
            surface.setLineWidth(0.9)
            surface.line(0, A5_H - 94, A5_W, A5_H - 94)
            header_ink = INK
        else:
            surface.setFillColor(GREEN)
            surface.rect(0, A5_H - 94, A5_W, 94, stroke=0, fill=1)
            header_ink = colors.white
        draw_kicker(surface, f"DAY {day_number(day['id']):02d} · CONTINUED", MARGIN, A5_H - 34, INK if MONOCHROME else themed("#EFDFAF", "#E0E0E0"))
        surface.setFillColor(header_ink)
        continuation_title = book_title_case(display_day_title(day))
        surface.setFont(heading_font(continuation_title), 15)
        surface.drawString(MARGIN, A5_H - 62, continuation_title)
        y = A5_H - 124
        # Continuation timelines share one fixed start, regardless of event
        # count, so short pages align with the denser continuation pages.
        draw_kicker(surface, "TIMELINE", MARGIN, y, GREEN)
        y -= 20

    for event in group:
        y = draw_timeline_event(surface, event, y)

    draw_footer(surface, page_number, f"DAY {day_number(day['id']):02d} · {display_day_date(day['date'])}")
    return finish_page(surface, buffer)


def render_cover(_: dict, page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    draw_cover_image(surface, "assets/trip/edinburgh.jpg", 0, 0, A5_W, A5_H)
    if not MONOCHROME:
        surface.setFillColor(themed_overlay(0.05, 0.12, 0.13, 0.73))
        surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    surface.setStrokeColor(themed("#D9C693", "#252525"))
    surface.setLineWidth(1.2)
    surface.line(MARGIN, A5_H - 48, A5_W - MARGIN, A5_H - 48)
    draw_kicker(surface, "OUR HONEYMOON · 2026", MARGIN, A5_H - 34, themed("#E8D7A8", "#333333"))
    surface.setFillColor(INK if MONOCHROME else colors.white)
    surface.setFont(FONT_SERIF, 28)
    surface.drawString(MARGIN, 280, "UNITED KINGDOM")
    surface.setFont(FONT_SERIF, 28 if MONOCHROME else 21)
    surface.drawString(MARGIN, 240 if MONOCHROME else 248, "× IRELAND")
    if not MONOCHROME:
        surface.setFont(FONT_CJK, 24)
        surface.drawString(MARGIN, 204, "2026 英國・愛爾蘭蜜月")
    surface.setFillColor(themed("#E8D7A8", "#5F5F5F"))
    surface.setFont(FONT_SERIF, 10)
    surface.drawString(MARGIN, 194 if MONOCHROME else 169, "09 OCTOBER — 26 OCTOBER")
    surface.setFillColor(INK if MONOCHROME else colors.white)
    surface.setFont(FONT_SERIF, 8)
    surface.drawString(MARGIN, 65, "KC & JUJU · A HONEYMOON JOURNAL")
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
    surface.setFillColor(themed("#E3E6D8", "#E5E5E5"))
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
    draw_section_title(surface, "Flight", "航班總覽", MARGIN, A5_H - 76)
    # Seven flight cards need the same visual breathing room above and below
    # the group. Anchor the list as a whole rather than just its first row.
    y = A5_H - (142 if MONOCHROME else 116)
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


def render_business_dining(data: dict, page_number: int) -> PdfReader:
    """Make the Qatar order strategy usable without opening the web guide."""
    surface, buffer = page_canvas()
    surface.setFillColor(PAPER)
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    plan = data["meta"]["travelControl"]["businessDining"]
    draw_kicker(surface, "IN THE AIR", MARGIN, A5_H - 42, GOLD)
    draw_section_title(surface, plan["title"], "卡達商務艙餐酒策略", MARGIN, A5_H - 76, 19)
    surface.setFillColor(MUTED)
    surface.setFont(FONT_CJK, 7.2)
    surface.drawString(MARGIN, A5_H - 94, plan["subtitle"])

    def draw_dining_items(items: list[str], x: float, start_y: float, width: float) -> float:
        """Keep each choice as its own readable checklist line."""
        item_y = start_y
        for item in items:
            item_y, _ = draw_wrapped(
                surface,
                item,
                x,
                item_y,
                width,
                size=6.25,
                leading=7.35,
                limit=2,
                color=INK,
            )
            item_y -= 1.4
        return item_y

    y = A5_H - 159
    card_height = 154
    for flight in plan["flights"]:
        surface.setFillColor(IVORY)
        surface.roundRect(MARGIN, y - card_height, A5_W - 2 * MARGIN, card_height, 7, stroke=0, fill=1)
        surface.setFillColor(GREEN)
        surface.setFont(FONT_SERIF_BOLD, 10)
        surface.drawString(MARGIN + 12, y - 18, flight["code"])
        surface.setFillColor(INK)
        surface.setFont(FONT_CJK, 7.5)
        surface.drawString(MARGIN + 58, y - 18, flight["route"])

        menu_x, drinks_x = MARGIN + 12, MARGIN + 194
        surface.setFillColor(MUTED)
        surface.setFont(FONT_SERIF_BOLD, 6.2)
        surface.drawString(menu_x, y - 35, "MENU HIGHLIGHTS")
        surface.drawString(drinks_x, y - 35, "DRINK FLOW")
        menu_y = draw_dining_items(flight["menu"], menu_x, y - 47, 164)
        drinks_y = draw_dining_items(flight["drinks"], drinks_x, y - 47, 184)
        note_y = min(menu_y, drinks_y) - 3
        surface.setStrokeColor(themed("#D6D7CE", "#D2D2D2"))
        surface.setLineWidth(0.45)
        surface.line(MARGIN + 12, note_y + 4, A5_W - MARGIN - 12, note_y + 4)
        draw_wrapped(surface, flight["note"], MARGIN + 12, note_y - 7, A5_W - 2 * MARGIN - 24, size=6.2, leading=7.2, limit=2, color=MUTED)
        y -= card_height + 14
    draw_footer(surface, page_number, "QATAR BUSINESS DINING")
    return finish_page(surface, buffer)


def render_business_menu(menu: dict, page_number: int) -> PdfReader:
    """Print each Qatar food menu as a compact two-by-two reference page."""
    surface, buffer = page_canvas()
    surface.setFillColor(PAPER)
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    draw_kicker(surface, "IN THE AIR", MARGIN, A5_H - 42, GOLD)
    surface.setFillColor(INK)
    surface.setFont(FONT_SERIF, 19)
    surface.drawString(MARGIN, A5_H - 76, f"{menu['code']} Menu")
    surface.setFillColor(MUTED)
    surface.setFont(FONT_CJK, 7.2)
    surface.drawString(MARGIN, A5_H - 94, menu["route"])

    card_width, card_height = 176, 147
    positions = [
        (MARGIN, A5_H - 145),
        (MARGIN + 189, A5_H - 145),
        (MARGIN, A5_H - 313),
        (MARGIN + 189, A5_H - 313),
    ]
    for section, (x, y) in zip(menu["sections"], positions):
        surface.setFillColor(IVORY)
        surface.roundRect(x, y - card_height, card_width, card_height, 7, stroke=0, fill=1)
        surface.setFillColor(GREEN)
        surface.setFont(FONT_SERIF_BOLD, 6.6)
        surface.drawString(x + 11, y - 18, section["title"])
        item_y = y - 34
        for item in section["items"]:
            item_y, _ = draw_wrapped(
                surface,
                item,
                x + 11,
                item_y,
                card_width - 22,
                size=6.4,
                leading=7.5,
                limit=2,
                color=INK,
            )
            item_y -= 3
    draw_footer(surface, page_number, f"{menu['code']} · QATAR BUSINESS MENU")
    return finish_page(surface, buffer)


STAY_LOCATIONS = {
    "Overnight transit · Doha": "Doha · 機場轉機休息",
    "Hotel ibis Manchester Centre Princess Street": "Manchester city centre",
    "Premier Inn Edinburgh City Centre": "York Place / St James Quarter · Edinburgh",
    "Airbnb · Fort William": "7 Laggan Road, Inverlochy, Scotland PH33 6NP",
    "Isle of Skye Airbnb · Carbost": "5 Fernilea, Carbost, Scotland IV47 8SJ",
    "The Golden Jubilee Conference Hotel": "Beardmore Street, Clydebank G81 4SA",
    "Premier Inn Manchester Airport Heald Green": "Finney Lane, Manchester SK8 3QH",
    "The Flint · Belfast": "48 Howard Street, Belfast BT1 6PG",
    "Academy Plaza Hotel · Dublin": "Dublin · O’Connell Street area",
    "The Standard, Bangkok Mahanakhon": "114 Naradhiwas Rajanagarindra Rd, Silom, Bangkok 10500",
}


def build_stays(days: list[dict]) -> list[dict[str, str]]:
    """Create one row per continuous overnight base from the actual day data."""
    stays: list[dict[str, str]] = []
    for day in days:
        stay = day["presentation"].get("stay", "").strip()
        if not stay or stay.startswith("Home"):
            continue
        if stays and stays[-1]["name"] == stay and int(stays[-1]["end"]) == day_number(day["id"]) - 1:
            stays[-1]["end"] = str(day_number(day["id"]))
            continue
        stays.append(
            {
                "start": str(day_number(day["id"])),
                "end": str(day_number(day["id"])),
                "name": stay,
                "description": STAY_LOCATIONS.get(stay, "住宿資訊請見每日行程"),
            }
        )
    return stays


def render_stays(days: list[dict], segment: int, page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    surface.setFillColor(PAPER)
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    draw_kicker(surface, "REST WELL", MARGIN, A5_H - 42, GOLD)
    draw_section_title(surface, "Hotel", "住宿總覽", MARGIN, A5_H - 76)
    surface.setFillColor(MUTED)
    surface.setFont(FONT_CJK, 7.4)
    hotels = build_stays(days)
    rows = hotels if MONOCHROME else hotels[segment * 6 : (segment + 1) * 6]
    if not MONOCHROME:
        surface.drawRightString(A5_W - MARGIN, A5_H - 72, f"{segment + 1} / 2")
    y = A5_H - (98 if MONOCHROME else 112)
    row_height = 43 if MONOCHROME else 58
    line_offset = 40 if MONOCHROME else 41
    day_font_size = 6.6 if MONOCHROME else 7
    hotel_font_size = 7.8 if MONOCHROME else 8.7
    description_font_size = 6.1 if MONOCHROME else 6.8
    description_y_offset = 24 if MONOCHROME else 26
    for index, hotel in enumerate(rows):
        # Centre each divider between the description above and the next
        # hotel's label. The last row closes naturally into the footer.
        if index < len(rows) - 1:
            surface.setStrokeColor(themed("#D6D7CE", "#D2D2D2"))
            surface.setLineWidth(0.6)
            surface.line(MARGIN, y - line_offset, A5_W - MARGIN, y - line_offset)
        surface.setFillColor(GREEN)
        surface.setFont(FONT_SERIF_BOLD, day_font_size)
        day_label = f"DAY {int(hotel['start']):02d}" if hotel["start"] == hotel["end"] else f"DAYS {int(hotel['start']):02d}–{int(hotel['end']):02d}"
        surface.drawString(MARGIN, y - 12, day_label)
        surface.setFillColor(INK)
        surface.setFont(FONT_CJK, hotel_font_size)
        hotel_x = MARGIN + 64
        surface.drawString(hotel_x, y - 12, hotel["name"])
        draw_wrapped(surface, hotel["description"], hotel_x, y - description_y_offset, A5_W - MARGIN - hotel_x, size=description_font_size, leading=7.2 if MONOCHROME else 8, limit=1, color=MUTED)
        y -= row_height
    draw_footer(surface, page_number)
    return finish_page(surface, buffer)


def render_journey(data: dict, page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    surface.setFillColor(PAPER if MONOCHROME else GREEN)
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    draw_kicker(surface, "THE WHOLE STORY", MARGIN, A5_H - 44, themed("#E6D49B", "#303030"))
    draw_section_title(surface, "Journey Overview", "旅程路線總覽", MARGIN, A5_H - 78, color=INK if MONOCHROME else colors.white)
    stops = [
        ("01", "Taipei / Seoul / Doha", "航班與轉機"),
        ("02", "Manchester / Liverpool", "城市、球場與音樂"),
        ("03", "Edinburgh / Highlands / Skye", "火車與公路旅行"),
        ("04", "Glasgow / Nottingham", "藝術、球賽與回程前一晚"),
        ("05", "Belfast / Dublin", "海岸導覽與愛爾蘭城市"),
        ("06", "Doha / Bangkok / Taipei", "空中體驗與慢慢回家"),
    ]
    # Align the six-stop timeline's visible top and bottom whitespace.
    y = A5_H - (106 if MONOCHROME else 132)
    for index, (number, title, detail) in enumerate(stops):
        if index < len(stops) - 1:
            surface.setStrokeColor(themed("#8FA69B", "#A0A0A0"))
            surface.setLineWidth(0.55)
            surface.line(MARGIN + 14, y - 40, MARGIN + 14, y - 96)
        surface.setFillColor(GOLD)
        surface.circle(MARGIN + 14, y - 28, 6, stroke=0, fill=1)
        surface.setFillColor(themed("#EDE8DB", "#EEEEEE"))
        surface.setFont(FONT_SERIF_BOLD, 7)
        surface.drawString(MARGIN + 32, y - 25, number)
        surface.setFillColor(INK if MONOCHROME else colors.white)
        surface.setFont(FONT_CJK, 10)
        surface.drawString(MARGIN + 32, y - 43, title)
        surface.setFillColor(themed("#C7D2C9", "#C8C8C8"))
        surface.setFont(FONT_CJK, 7.5)
        surface.drawString(MARGIN + 32, y - 59, detail)
        y -= 68
    draw_footer(surface, page_number, "OUR HONEYMOON · JOURNEY OVERVIEW")
    return finish_page(surface, buffer)


def render_highlands(days: list[dict], page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    surface.setFillColor(IVORY)
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    # Match the compact monochrome daily-page header.  The previous taller
    # field pushed the five road-trip cards visibly down the page.
    road_field_height = 126 if MONOCHROME else 178
    draw_cover_image(surface, "assets/trip/loch-ness.jpg", 0, A5_H - road_field_height, A5_W, road_field_height)
    if not MONOCHROME:
        surface.setFillColor(themed_overlay(0.05, 0.16, 0.13, 0.58))
        surface.rect(0, A5_H - road_field_height, A5_W, road_field_height, stroke=0, fill=1)
    draw_kicker(surface, "SCOTTISH HIGHLANDS", MARGIN, A5_H - 38, themed("#F2DEA2", "#303030"))
    draw_section_title(surface, "Highlands Road Trip", "公路旅行章節", MARGIN, A5_H - 76, 20, INK if MONOCHROME else colors.white)
    # Align the first road-trip card with the daily-page fact cards; this
    # gives the header and the card stack the same visual rhythm as page 11+
    # in the monochrome edition.
    y = A5_H - (142 if MONOCHROME else 216)
    for day in [day for day in days if "1014" <= day["id"] <= "1018"]:
        surface.setFillColor(PAPER)
        surface.roundRect(MARGIN, y - 45, A5_W - 2 * MARGIN, 43, 6, stroke=0, fill=1)
        surface.setFillColor(GREEN)
        surface.setFont(FONT_SERIF_BOLD, 7.2)
        surface.drawString(MARGIN + 10, y - 14, f"DAY {day_number(day['id']):02d}")
        surface.setFillColor(INK)
        surface.setFont(FONT_CJK, 8.7)
        title = book_title_case(display_day_title(day))
        title_lines = wrap(surface, title, FONT_CJK, 8.7, A5_W - 2 * MARGIN - 68, 1)
        surface.drawString(MARGIN + 58, y - 14, title_lines[0] if title_lines else "—")
        draw_wrapped(surface, day["presentation"].get("driving", day["route"]), MARGIN + 58, y - 29, A5_W - 2 * MARGIN - 68, size=7, leading=8.5, limit=1, color=MUTED)
        y -= 53
    draw_footer(surface, page_number, "HIGHLANDS ROAD TRIP")
    return finish_page(surface, buffer)


def render_bookings(data: dict, page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    surface.setFillColor(PAPER)
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    draw_kicker(surface, "FIXED MOMENTS", MARGIN, A5_H - 42, GOLD)
    draw_section_title(surface, "Booked Moments", "已確認的重要安排", MARGIN, A5_H - 76)
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
    if not MONOCHROME:
        surface.setFillColor(themed("#EFE5D4", "#EAEAEA"))
        surface.roundRect(MARGIN, 66, A5_W - 2 * MARGIN, 50, 7, stroke=0, fill=1)
        draw_wrapped(surface, "手冊只列出已確認的固定安排；現場請以官方通知、電子票券與網站最新版為準。", MARGIN + 12, 97, A5_W - 2 * MARGIN - 24, size=8, leading=10.5, limit=3, color=INK)
    draw_footer(surface, page_number)
    return finish_page(surface, buffer)


def render_city_index(_: dict, page_number: int) -> PdfReader:
    surface, buffer = page_canvas()
    surface.setFillColor(PAPER)
    surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    draw_kicker(surface, "CITY CHAPTERS", MARGIN, A5_H - 42, GOLD)
    draw_section_title(surface, "City Chapters", "城市篇章索引", MARGIN, A5_H - 76)
    chapters = [
        ("10/10–11", "Manchester & Liverpool", "工業、球場、音樂"),
        ("10/12–13", "Edinburgh", "Old Town、Castle、Afternoon Tea"),
        ("10/14–18", "Highlands & Skye", "租車、公路、風景與球賽"),
        ("10/19–20", "Belfast", "城市住一晚、巨人堤道"),
        ("10/20–22", "Dublin", "愛爾蘭城市日"),
        ("10/23–26", "Doha & Bangkok", "貴賓室、飛行與慢旅"),
    ]
    # The six chapter cards share the same top and bottom breathing room.
    y = A5_H - (156 if MONOCHROME else 121)
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
    if not MONOCHROME:
        surface.setFillColor(themed_overlay(0.06, 0.13, 0.12, 0.72))
        surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
    surface.setStrokeColor(themed("#E8D7A8", "#333333"))
    surface.setLineWidth(0.8)
    surface.line(MARGIN, 165, A5_W - MARGIN, 165)
    if MONOCHROME:
        surface.setFillColor(INK)
        surface.setFont(FONT_SERIF, 13)
        surface.drawCentredString(A5_W / 2, 220, "KC & JUJU")
        surface.setFillColor(MUTED)
        surface.setFont(FONT_SERIF, 7.5)
        surface.drawCentredString(A5_W / 2, 193, "UK & IRELAND · OCTOBER 2026")
    else:
        surface.setFillColor(colors.white)
        surface.setFont(FONT_CJK, 24)
        surface.drawCentredString(A5_W / 2, 220, "旅程的節奏，留給兩個人。")
        surface.setFillColor(themed("#E8D7A8", "#5F5F5F"))
        surface.setFont(FONT_SERIF, 10)
        surface.drawCentredString(A5_W / 2, 190, "HAVE A SLOW, BEAUTIFUL HONEYMOON.")
    surface.setFillColor(INK if MONOCHROME else colors.white)
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


def build_specs(data: dict, days: list[dict], *, include_collage: bool, pad_for_booklet: bool) -> list[tuple[str, object]]:
    """Shared content order for the visual booklet and no-photo reading edition."""
    specs: list[tuple[str, object]] = [
        ("cover", data),
        ("flights", data),
        ("stays", (days, 0)),
        ("journey", data),
        ("highlands", days),
        ("bookings", data),
        ("cities", data),
    ]
    if MONOCHROME:
        # The compact card keeps the actionable order plan in the printable
        # guide while the full menus remain available on the web guide.
        menu_specs = [("dining-menu", menu) for menu in data["meta"]["travelControl"]["businessDining"]["menus"]]
        specs[2:2] = [("dining", data), *menu_specs]
    if not MONOCHROME:
        specs.insert(3, ("stays", (days, 1)))
    if include_collage:
        specs.append(("collage", data))
    for day in days:
        groups = group_events_for_pages(day["events"]) or [[]]
        for index, group in enumerate(groups):
            specs.append(("day", (day, group, index, len(groups))))
    specs.append(("back", data))

    # The print-imposed file needs a full set of four reading pages.  The
    # digital reading edition remains in natural reading order and needs no
    # duplicated filler pages.
    if pad_for_booklet:
        while len(specs) % 4:
            specs.insert(-1, ("blank", data))
    return specs


def event_height(event: dict) -> float:
    """Mirror the timeline renderer so a long day never runs into its footer."""
    content_w = A5_W - 98 - MARGIN
    title_lines = wrap(None, book_title_case(event["title"]), FONT_CJK, 8.5, content_w, 2)
    detail = printable_detail(event["detail"])
    detail_lines = wrap(None, detail, FONT_CJK, 7.05, content_w, 3) if detail else []
    time = event["time"].strip()
    time_count = 2 if re.match(r"^.*?([–-]).*$", time) else len(wrap(None, time, FONT_CJK, 7.2, 42, 2))
    return max(28, 7 + len(title_lines) * 10 + len(detail_lines) * 8.8, time_count * 8.6 + 9) + 4


def group_events_for_pages(events: list[dict]) -> list[list[dict]]:
    """Split by rendered height, not by event count, to protect every footer."""
    if not events:
        return []
    groups: list[list[dict]] = []
    current: list[dict] = []
    used = 0.0
    capacity = 305.0 if MONOCHROME else 238.0
    for event in events:
        required = event_height(event)
        if current and used + required > capacity:
            groups.append(current)
            current, used, capacity = [], 0.0, 370.0  # continuation page
        current.append(event)
        used += required
    if current:
        groups.append(current)
    return groups


def render_specs(specs: list[tuple[str, object]]) -> list[PdfReader]:
    readers: list[PdfReader] = []
    for page_number, (kind, payload) in enumerate(specs, start=1):
        if kind == "cover":
            readers.append(render_cover(payload, page_number))
        elif kind == "flights":
            readers.append(render_flights(payload, page_number))
        elif kind == "dining":
            readers.append(render_business_dining(payload, page_number))
        elif kind == "dining-menu":
            readers.append(render_business_menu(payload, page_number))
        elif kind == "stays":
            days, segment = payload
            readers.append(render_stays(days, segment, page_number))
        elif kind == "journey":
            readers.append(render_journey(payload, page_number))
        elif kind == "highlands":
            readers.append(render_highlands(payload, page_number))
        elif kind == "bookings":
            readers.append(render_bookings(payload, page_number))
        elif kind == "cities":
            readers.append(render_city_index(payload, page_number))
        elif kind == "blank":
            surface, buffer = page_canvas()
            surface.setFillColor(PAPER)
            surface.rect(0, 0, A5_W, A5_H, stroke=0, fill=1)
            readers.append(finish_page(surface, buffer))
        elif kind == "collage":
            readers.append(render_collage(payload, page_number))
        elif kind == "day":
            readers.append(render_day_page(*payload, page_number))
        elif kind == "back":
            readers.append(render_back_cover(payload, page_number))
        else:
            raise ValueError(f"Unknown page type: {kind}")
    return readers


def create_black_white_editions(data: dict, days: list[dict]) -> tuple[int, int]:
    """Produce matching natural-reading and A4-folded monochrome editions."""
    global INK, NAVY, GREEN, SAGE, GOLD, IVORY, PAPER, MIST, MUTED, ROSE, MONOCHROME
    original = (INK, NAVY, GREEN, SAGE, GOLD, IVORY, PAPER, MIST, MUTED, ROSE, MONOCHROME)
    try:
        INK = colors.HexColor("#111111")
        NAVY = colors.HexColor("#202020")
        GREEN = colors.HexColor("#161616")
        SAGE = colors.HexColor("#8C8C8C")
        GOLD = colors.HexColor("#454545")
        IVORY = colors.HexColor("#F6F6F6")
        PAPER = colors.white
        MIST = colors.HexColor("#E8E8E8")
        MUTED = colors.HexColor("#606060")
        ROSE = colors.HexColor("#505050")
        MONOCHROME = True
        readers = render_specs(build_specs(data, days, include_collage=False, pad_for_booklet=False))
        reading_writer = PdfWriter()
        for reader in readers:
            reading_writer.add_page(reader.pages[0])
        reading_writer.add_metadata(
            {
                "/Title": "2026 UK & Ireland Honeymoon - Black and White Reading Guide",
                "/Author": "KC & JUJU",
                "/Subject": "Image-free, black and white digital reading edition.",
            }
        )
        with BW_OUTPUT.open("wb") as destination:
            reading_writer.write(destination)

        folded_writer = impose_booklet(readers.copy())
        folded_writer.add_metadata(
            {
                "/Title": "2026 UK & Ireland Honeymoon - Black and White A4 Folded Booklet",
                "/Author": "KC & JUJU",
                "/Subject": "Image-free A4 duplex booklet. Print short-edge and fold to A5.",
            }
        )
        with BW_BOOKLET_OUTPUT.open("wb") as destination:
            folded_writer.write(destination)
        return len(reading_writer.pages), len(folded_writer.pages)
    finally:
        INK, NAVY, GREEN, SAGE, GOLD, IVORY, PAPER, MIST, MUTED, ROSE, MONOCHROME = original


def create_mobile_edition(data: dict, days: list[dict]) -> int:
    """Produce a color A5 reading edition in normal order for phone viewing."""
    readers = render_specs(build_specs(data, days, include_collage=True, pad_for_booklet=False))
    writer = PdfWriter()
    for reader in readers:
        writer.add_page(reader.pages[0])
    writer.add_metadata(
        {
            "/Title": "2026 UK & Ireland Honeymoon - Mobile Reading Guide",
            "/Author": "KC & JUJU",
            "/Subject": "Color A5 digital reading edition for mobile viewing.",
        }
    )
    with MOBILE_OUTPUT.open("wb") as destination:
        writer.write(destination)
    return len(writer.pages)


def main() -> None:
    data = load_trip_data()
    days = build_days(data)
    specs = build_specs(data, days, include_collage=True, pad_for_booklet=True)

    a5_readers = render_specs(specs)
    total_pages = len(a5_readers)

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
    mobile_page_count = create_mobile_edition(data, days)
    bw_page_count, bw_spread_count = create_black_white_editions(data, days)
    print(f"Created {OUTPUT} with {total_pages} A5 reading pages on {len(booklet.pages)} A4 spreads")
    print(f"Created {MOBILE_OUTPUT} with {mobile_page_count} A5 reading pages")
    print(f"Created {BW_OUTPUT} with {bw_page_count} A5 reading pages")
    print(f"Created {BW_BOOKLET_OUTPUT} with {bw_spread_count} A4 print sides")


if __name__ == "__main__":
    main()
