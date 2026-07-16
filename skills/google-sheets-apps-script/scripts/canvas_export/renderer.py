from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from canvas_export.manifest import (
    BarChartBlock,
    Block,
    CalloutBlock,
    Manifest,
    TableBlock,
    TagsBlock,
)

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as exc:
    raise SystemExit(
        "canvas-export requires Pillow. Run: python3 -m pip install pillow"
    ) from exc


@dataclass(frozen=True)
class Theme:
    bg: tuple[int, int, int]
    panel: tuple[int, int, int]
    text: tuple[int, int, int]
    muted: tuple[int, int, int]
    accent: tuple[int, int, int]
    border: tuple[int, int, int]
    success_bg: tuple[int, int, int]
    success: tuple[int, int, int]
    warning_bg: tuple[int, int, int]
    warning: tuple[int, int, int]
    info_bg: tuple[int, int, int]
    info: tuple[int, int, int]


THEMES: dict[str, Theme] = {
    "dark": Theme(
        bg=(18, 18, 20),
        panel=(30, 30, 34),
        text=(230, 230, 235),
        muted=(160, 160, 168),
        accent=(56, 132, 255),
        border=(60, 60, 68),
        success_bg=(24, 48, 36),
        success=(46, 160, 110),
        warning_bg=(48, 38, 24),
        warning=(210, 150, 60),
        info_bg=(24, 32, 48),
        info=(56, 132, 255),
    ),
    "light": Theme(
        bg=(250, 250, 252),
        panel=(255, 255, 255),
        text=(24, 24, 28),
        muted=(100, 100, 108),
        accent=(36, 99, 235),
        border=(220, 220, 228),
        success_bg=(232, 248, 238),
        success=(22, 120, 78),
        warning_bg=(255, 246, 230),
        warning=(180, 110, 20),
        info_bg=(232, 240, 255),
        info=(36, 99, 235),
    ),
}


FontLoader = Callable[[int, bool], ImageFont.FreeTypeFont | ImageFont.ImageFont]


def default_font_loader(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


@dataclass
class LayoutEngine:
    manifest: Manifest
    theme: Theme
    font: FontLoader
    x: int
    y: int
    content_width: int

    def advance(self, amount: int) -> None:
        self.y += amount

    def draw_header(self) -> None:
        header = self.manifest.header
        draw = self.draw
        draw.text((self.x, self.y), header.title, fill=self.theme.text, font=self.font(28, True))
        self.advance(36)
        if header.subtitle:
            draw.text((self.x, self.y), header.subtitle, fill=self.theme.muted, font=self.font(14))
            self.advance(28)
        if header.badge:
            badge = header.badge
            tw = draw.textlength(badge, font=self.font(13)) + 24
            draw.rounded_rectangle(
                (self.x, self.y, self.x + tw, self.y + 28),
                radius=14,
                fill=self.theme.panel,
                outline=self.theme.border,
            )
            draw.text((self.x + 12, self.y + 6), badge, fill=self.theme.accent, font=self.font(13))
            self.advance(40)

    def draw_stats(self) -> None:
        if not self.manifest.stats:
            return
        count = len(self.manifest.stats)
        gap = 12
        card_width = (self.content_width - gap * (count - 1)) // count
        sx = self.x
        for stat in self.manifest.stats:
            draw = self.draw
            draw.rounded_rectangle(
                (sx, self.y, sx + card_width, self.y + 70),
                radius=8,
                fill=self.theme.panel,
                outline=self.theme.border,
            )
            value_color = self.theme.accent if stat.emphasis else self.theme.text
            draw.text((sx + 14, self.y + 12), stat.value, fill=value_color, font=self.font(22, True))
            draw.text((sx + 14, self.y + 42), stat.label, fill=self.theme.muted, font=self.font(13))
            sx += card_width + gap
        self.advance(86)

    def draw_table(self, block: TableBlock) -> None:
        row_height = 28
        header_height = 36
        body_height = len(block.rows) * row_height
        card_height = 24 + header_height + body_height + 16
        self._draw_card(block.title, block.trailing, card_height)
        top = self.y + 24
        draw = self.draw
        col_x = [self.x + 16, self.x + 68, self.x + 228]
        for index, label in enumerate(block.headers):
            draw.text((col_x[min(index, len(col_x) - 1)], top), label, fill=self.theme.muted, font=self.font(12, True))
        top += header_height
        for row in block.rows:
            for index, cell in enumerate(row):
                color = self.theme.accent if index == 0 else self.theme.text if index == 1 else self.theme.muted
                weight = index == 0
                draw.text(
                    (col_x[min(index, len(col_x) - 1)], top),
                    cell,
                    fill=color,
                    font=self.font(14, weight),
                )
            top += row_height
        self.advance(card_height + 16)

    def draw_bar_chart(self, block: BarChartBlock) -> None:
        chart_height = 180
        card_height = 24 + 28 + chart_height + (24 if block.caption else 8) + 16
        self._draw_card(block.title, "", card_height)
        series = block.series[0] if block.series else {"name": "", "data": []}
        values = [float(v) for v in series.get("data", [])]
        max_value = max(values) if values else 1.0
        chart_top = self.y + 52
        chart_bottom = chart_top + chart_height - 40
        bar_area_width = self.content_width - 48
        bar_width = max(24, bar_area_width // max(len(block.categories), 1) - 16)
        gap = 16
        sx = self.x + 24
        for index, category in enumerate(block.categories):
            value = values[index] if index < len(values) else 0.0
            bar_h = int((value / max_value) * (chart_bottom - chart_top)) if max_value else 0
            bx0 = sx
            bx1 = sx + bar_width
            by1 = chart_bottom
            by0 = by1 - bar_h
            draw = self.draw
            draw.rounded_rectangle((bx0, by0, bx1, by1), radius=4, fill=self.theme.accent)
            label = category
            draw.text((bx0, chart_bottom + 8), label, fill=self.theme.muted, font=self.font(12))
            suffix = block.value_suffix
            draw.text((bx0, by0 - 18), f"{value:g}{suffix}", fill=self.theme.text, font=self.font(12, True))
            sx += bar_width + gap
        if block.caption:
            draw.text((self.x + 16, self.y + card_height - 28), block.caption, fill=self.theme.muted, font=self.font(12))
        self.advance(card_height + 16)

    def draw_callout(self, block: CalloutBlock) -> None:
        tone_map = {
            "success": (self.theme.success_bg, self.theme.success),
            "warning": (self.theme.warning_bg, self.theme.warning),
            "info": (self.theme.info_bg, self.theme.info),
        }
        bg, fg = tone_map.get(block.tone, tone_map["info"])
        line_height = 22
        card_height = 24 + 28 + len(block.lines) * line_height + 8
        draw = self.draw
        draw.rounded_rectangle(
            (self.x, self.y, self.x + self.content_width, self.y + card_height),
            radius=8,
            fill=bg,
            outline=fg,
        )
        draw.text((self.x + 16, self.y + 14), block.title, fill=fg, font=self.font(16, True))
        top = self.y + 42
        for line in block.lines:
            draw.text((self.x + 16, top), line, fill=self.theme.text, font=self.font(14))
            top += line_height
        self.advance(card_height + 16)

    def draw_tags(self, block: TagsBlock) -> None:
        if block.title:
            self.draw.text((self.x, self.y), block.title, fill=self.theme.text, font=self.font(18, True))
            self.advance(28)
        ax = self.x
        row_y = self.y
        for item in block.items:
            tw = self.draw.textlength(item, font=self.font(13)) + 24
            if ax + tw > self.x + self.content_width:
                ax = self.x
                row_y += 38
            self.draw.rounded_rectangle((ax, row_y, ax + tw, row_y + 34), radius=14, fill=self.theme.panel, outline=self.theme.border)
            self.draw.text((ax + 12, row_y + 8), item, fill=self.theme.muted, font=self.font(13))
            ax += tw + 10
        self.advance(48 if block.title else 40)
        if block.footer:
            self.draw.text((self.x, self.y), block.footer, fill=self.theme.muted, font=self.font(12))
            self.advance(24)

    def _draw_card(self, title: str, trailing: str, height: int) -> None:
        draw = self.draw
        draw.rounded_rectangle(
            (self.x, self.y, self.x + self.content_width, self.y + height),
            radius=10,
            fill=self.theme.panel,
            outline=self.theme.border,
        )
        draw.text((self.x + 16, self.y + 14), title, fill=self.theme.text, font=self.font(18, True))
        if trailing:
            tw = draw.textlength(trailing, font=self.font(13)) + 20
            tx = self.x + self.content_width - tw - 16
            draw.rounded_rectangle((tx, self.y + 12, tx + tw, self.y + 36), radius=14, fill=self.theme.bg, outline=self.theme.border)
            draw.text((tx + 10, self.y + 16), trailing, fill=self.theme.muted, font=self.font(13))

    @property
    def draw(self) -> ImageDraw.ImageDraw:
        if self._draw is None:
            raise RuntimeError("draw context not initialized")
        return self._draw

    _draw: ImageDraw.ImageDraw | None = None


def estimate_height(manifest: Manifest) -> int:
    height = manifest.layout.padding * 2
    height += 36 + (28 if manifest.header.subtitle else 0) + (40 if manifest.header.badge else 0)
    if manifest.stats:
        height += 86
    for block in manifest.blocks:
        if isinstance(block, TableBlock):
            height += 24 + 36 + len(block.rows) * 28 + 16 + 16
        elif isinstance(block, BarChartBlock):
            height += 24 + 28 + 180 + (24 if block.caption else 8) + 16 + 16
        elif isinstance(block, CalloutBlock):
            height += 24 + 28 + len(block.lines) * 22 + 8 + 16
        elif isinstance(block, TagsBlock):
            height += (28 if block.title else 0) + 48 + (24 if block.footer else 0)
    return max(height, 320)


def render_manifest(manifest: Manifest, *, font_loader: FontLoader | None = None) -> Image.Image:
    theme = THEMES.get(manifest.layout.theme, THEMES["dark"])
    font = font_loader or default_font_loader
    width = manifest.layout.width
    height = estimate_height(manifest)
    image = Image.new("RGB", (width, height), theme.bg)
    draw = ImageDraw.Draw(image)
    padding = manifest.layout.padding
    engine = LayoutEngine(
        manifest=manifest,
        theme=theme,
        font=font,
        x=padding,
        y=padding,
        content_width=width - padding * 2,
    )
    engine._draw = draw
    engine.draw_header()
    engine.draw_stats()
    for block in manifest.blocks:
        if isinstance(block, TableBlock):
            engine.draw_table(block)
        elif isinstance(block, BarChartBlock):
            engine.draw_bar_chart(block)
        elif isinstance(block, CalloutBlock):
            engine.draw_callout(block)
        elif isinstance(block, TagsBlock):
            engine.draw_tags(block)
    return image


def export_png(manifest: Manifest, output_path: Path, *, optimize: bool = True) -> tuple[Path, int, int]:
    output_path = output_path.expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image = render_manifest(manifest)
    image.save(output_path, format="PNG", optimize=optimize)
    return output_path, image.width, image.height
