from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


SUPPORTED_VERSION = 1


@dataclass
class Layout:
    width: int = 960
    padding: int = 32
    theme: str = "dark"


@dataclass
class Header:
    title: str
    subtitle: str = ""
    badge: str = ""


@dataclass
class Stat:
    label: str
    value: str
    emphasis: bool = False


@dataclass
class TableBlock:
    type: str
    title: str
    headers: list[str]
    rows: list[list[str]]
    trailing: str = ""


@dataclass
class BarChartBlock:
    type: str
    title: str
    categories: list[str]
    series: list[dict[str, Any]]
    value_suffix: str = ""
    caption: str = ""


@dataclass
class CalloutBlock:
    type: str
    tone: str
    title: str
    lines: list[str]


@dataclass
class TagsBlock:
    type: str
    title: str
    items: list[str]
    footer: str = ""


Block = TableBlock | BarChartBlock | CalloutBlock | TagsBlock


@dataclass
class Manifest:
    version: int
    layout: Layout
    header: Header
    stats: list[Stat] = field(default_factory=list)
    blocks: list[Block] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)


def _require_mapping(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{path} must be an object")
    return value


def _require_string(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{path} must be a non-empty string")
    return value


def _require_string_list(value: Any, path: str) -> list[str]:
    if not isinstance(value, list) or not value:
        raise ValueError(f"{path} must be a non-empty array")
    out: list[str] = []
    for index, item in enumerate(value):
        out.append(_require_string(item, f"{path}[{index}]"))
    return out


def _parse_table(raw: dict[str, Any]) -> TableBlock:
    return TableBlock(
        type="table",
        title=_require_string(raw.get("title"), "blocks[].title"),
        headers=_require_string_list(raw.get("headers"), "blocks[].headers"),
        rows=[
            [str(cell) for cell in row]
            for row in raw.get("rows", [])
        ],
        trailing=str(raw.get("trailing", "")),
    )


def _parse_bar_chart(raw: dict[str, Any]) -> BarChartBlock:
    series = raw.get("series")
    if not isinstance(series, list) or not series:
        raise ValueError("blocks[].series must be a non-empty array")
    return BarChartBlock(
        type="bar_chart",
        title=_require_string(raw.get("title"), "blocks[].title"),
        categories=_require_string_list(raw.get("categories"), "blocks[].categories"),
        series=series,
        value_suffix=str(raw.get("valueSuffix", raw.get("value_suffix", ""))),
        caption=str(raw.get("caption", "")),
    )


def _parse_callout(raw: dict[str, Any]) -> CalloutBlock:
    lines = raw.get("lines", [])
    if not isinstance(lines, list):
        raise ValueError("blocks[].lines must be an array")
    return CalloutBlock(
        type="callout",
        tone=str(raw.get("tone", "info")),
        title=_require_string(raw.get("title"), "blocks[].title"),
        lines=[str(line) for line in lines],
    )


def _parse_tags(raw: dict[str, Any]) -> TagsBlock:
    return TagsBlock(
        type="tags",
        title=str(raw.get("title", "")),
        items=_require_string_list(raw.get("items"), "blocks[].items"),
        footer=str(raw.get("footer", "")),
    )


def _parse_block(raw: Any, index: int) -> Block:
    block = _require_mapping(raw, f"blocks[{index}]")
    block_type = _require_string(block.get("type"), f"blocks[{index}].type")
    if block_type == "table":
        return _parse_table(block)
    if block_type == "bar_chart":
        return _parse_bar_chart(block)
    if block_type == "callout":
        return _parse_callout(block)
    if block_type == "tags":
        return _parse_tags(block)
    raise ValueError(f"blocks[{index}].type unsupported: {block_type}")


def parse_manifest(data: dict[str, Any]) -> Manifest:
    version = data.get("version")
    if version != SUPPORTED_VERSION:
        raise ValueError(f"manifest version must be {SUPPORTED_VERSION}")

    layout_raw = _require_mapping(data.get("layout", {}), "layout")
    header_raw = _require_mapping(data.get("header"), "header")

    stats: list[Stat] = []
    for index, item in enumerate(data.get("stats", [])):
        stat = _require_mapping(item, f"stats[{index}]")
        stats.append(
            Stat(
                label=_require_string(stat.get("label"), f"stats[{index}].label"),
                value=_require_string(stat.get("value"), f"stats[{index}].value"),
                emphasis=bool(stat.get("emphasis", False)),
            )
        )

    blocks = [_parse_block(item, index) for index, item in enumerate(data.get("blocks", []))]

    return Manifest(
        version=version,
        layout=Layout(
            width=int(layout_raw.get("width", 960)),
            padding=int(layout_raw.get("padding", 32)),
            theme=str(layout_raw.get("theme", "dark")),
        ),
        header=Header(
            title=_require_string(header_raw.get("title"), "header.title"),
            subtitle=str(header_raw.get("subtitle", "")),
            badge=str(header_raw.get("badge", "")),
        ),
        stats=stats,
        blocks=blocks,
        meta=dict(data.get("meta", {})),
    )


def load_manifest(path: Path) -> Manifest:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("manifest root must be a JSON object")
    return parse_manifest(data)
