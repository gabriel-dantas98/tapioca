"""List 3MF mesh resources and assembly transforms without extracting files."""
import argparse
from collections import Counter
import json
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET


def inspect_model(stream):
    stack = []
    resources = []
    build = []
    current = None
    units = None
    for event, node in ET.iterparse(stream, events=('start', 'end')):
        tag = node.tag.rsplit('}', 1)[-1]
        if event == 'start':
            stack.append(node)
            if tag == 'model':
                units = node.get('unit', 'millimeter')
            elif tag == 'object':
                current = {
                    'id': node.get('id'),
                    'name': node.get('name'),
                    'material_group': node.get('pid'),
                    'vertices': 0,
                    'triangles': 0,
                    'components': [],
                    'paint_codes': Counter(),
                }
            continue
        if tag in ('vertex', 'triangle') and current is not None:
            current['vertices' if tag == 'vertex' else 'triangles'] += 1
            if (code := node.get('paint_color')) is not None:
                current['paint_codes'][code] += 1
        elif tag == 'component' and current is not None:
            current['components'].append({k.rsplit('}', 1)[-1]: v for k, v in node.attrib.items()})
        elif tag == 'object':
            if current is not None:
                current['paint_codes'] = dict(current['paint_codes'].most_common(12))
                resources.append(current)
            current = None
        elif tag == 'item':
            build.append({k.rsplit('}', 1)[-1]: v for k, v in node.attrib.items()})
        stack.pop()
        if stack:
            stack[-1].remove(node)
    return {'unit': units, 'resources': resources, 'build': build}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    args = parser.parse_args()
    report = {}
    with ZipFile(args.file) as archive:
        for name in archive.namelist():
            if name.lower().endswith('.model'):
                with archive.open(name) as stream:
                    report[name] = inspect_model(stream)
    if not report:
        parser.error('No .model XML members found in this 3MF.')
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
