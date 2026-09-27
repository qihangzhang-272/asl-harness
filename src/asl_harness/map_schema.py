"""Mode working paradigms and visual vocabulary, never an execution scheduler."""
import re
import xml.etree.ElementTree as ET

ICON_NAMES = {'Box', 'Search', 'Send', 'Palette', 'PenLine', 'ChartNoAxesCombined', 'PanelsTopLeft', 'Layers3', 'Puzzle'}


def icon_value(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError('图标需要使用 emoji、内置图标名或安全 SVG')
    if value in ICON_NAMES:
        return value
    if not value.startswith('<'):
        if len(value) <= 16 and not re.search(r'[\x00-\x7f]', value):
            return value
        raise ValueError('图标可用 emoji，或 Box / Search / Send / Palette / PenLine / ChartNoAxesCombined / PanelsTopLeft / Layers3 / Puzzle')
    if len(value) > 16000 or '<!' in value or '<?' in value:
        raise ValueError('SVG 不支持文档声明或超过 16 KB 的内容')
    try:
        root = ET.fromstring(value)
    except ET.ParseError as error:
        raise ValueError('SVG 格式不完整') from error
    tags = {'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'}
    numeric = {'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'points'}
    if root.tag.split('}')[-1] != 'svg' or len(list(root.iter())) > 100:
        raise ValueError('图标只能是简洁 SVG（最多 100 个图形）')
    for node in root.iter():
        if node.tag.split('}')[-1] not in tags or (node.text or '').strip():
            raise ValueError('SVG 只允许基础图形；不允许脚本、外部图片或嵌入网页')
        for name, content in node.attrib.items():
            valid = name in numeric and re.fullmatch(r'[0-9eE., +\-]+', content)
            valid = valid or name == 'd' and re.fullmatch(r'[MmLlHhVvCcSsQqTtAaZz0-9eE., +\-]+', content)
            valid = valid or name in {'fill', 'stroke'} and re.fullmatch(r'#[a-fA-F0-9]{3}(?:[a-fA-F0-9]{3})?|none|currentColor', content)
            valid = valid or name == 'stroke-linecap' and content in {'butt', 'round', 'square'}
            valid = valid or name == 'stroke-linejoin' and content in {'miter', 'round', 'bevel'}
            valid = valid or name in {'fill-rule', 'clip-rule'} and content in {'evenodd', 'nonzero'}
            if not valid:
                raise ValueError(f'SVG 属性不受支持：{name}；不可使用事件、外链或 CSS')
    return value


def architecture_value(value, allowed=None):
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) - {'nodes', 'edges', 'shared', 'paradigms'}:
        raise ValueError('架构仅支持 nodes、shared、paradigms；旧版可读取 edges')
    nodes, links = value.get('nodes', []), value.get('edges', [])
    if not isinstance(nodes, list) or len(nodes) > 120 or not isinstance(links, list) or len(links) > 240:
        raise ValueError('单个架构最多 120 个节点、240 条关系')
    by_id = {}
    for node in nodes:
        if not isinstance(node, dict) or set(node) - {'title', 'skill', 'note', 'icon', 'color'}:
            raise ValueError('架构节点只能引用完整技能，支持 skill、title、note、icon、color')
        identifier = node.get('skill')
        if not isinstance(identifier, str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}', identifier) or identifier in by_id:
            raise ValueError('每个架构节点必须引用唯一的技能；一个技能只有一个节点')
        if allowed is not None and identifier not in allowed:
            raise ValueError(f'架构节点 {identifier} 引用的技能不在当前 Mode')
        for field, limit in (('title', 80), ('note', 1200)):
            if field in node and (not isinstance(node[field], str) or len(node[field]) > limit):
                raise ValueError(f'架构节点 {identifier} 的 {field} 需为不超过 {limit} 字的文本')
        if 'icon' in node:
            icon_value(node['icon'])
        if 'color' in node and (not isinstance(node['color'], str) or not re.fullmatch(r'#[a-fA-F0-9]{6}', node['color'])):
            raise ValueError(f'架构节点 {identifier} 的颜色需要为 #RRGGBB')
        by_id[identifier] = node
    seen = set()
    for link in links:
        if not isinstance(link, dict) or not {'from', 'to'} <= set(link) <= {'from', 'to', 'label'}:
            raise ValueError('架构关系只支持 from、to 和可选 label')
        if any(not isinstance(link[k], str) for k in link) or len(link.get('label', '')) > 80:
            raise ValueError('架构关系需为文本，名称最多 80 字')
        pair = (link['from'], link['to'])
        if pair in seen or pair[0] == pair[1] or allowed is not None and not set(pair) <= allowed:
            raise ValueError('架构关系必须连接当前 Mode 内的不同技能，且不能重复')
        seen.add(pair)
    if 'paradigms' not in value and 'shared' not in value:
        return {'nodes': [dict(node) for node in nodes], 'edges': [dict(link) for link in links]}
    if links:
        raise ValueError('新版架构的关系应放在具体 paradigm.edges 中，不保留全局 edges')
    shared = value.get('shared', [])
    paradigms = value.get('paradigms', [])
    def members(ids, location):
        if (not isinstance(ids, list) or any(not isinstance(s, str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}', s) for s in ids)
                or len(ids) != len(set(ids)) or allowed is not None and not set(ids) <= allowed):
            raise ValueError(f'{location} 必须引用当前 Mode 中不重复的完整技能')
        return set(ids)
    covered = members(shared, 'architecture.shared')
    if not isinstance(paradigms, list) or len(paradigms) > 24:
        raise ValueError('architecture.paradigms 最多保存 24 个工作范式')
    ids = set()
    for index, paradigm in enumerate(paradigms):
        location = f'architecture.paradigms[{index}]'
        if not isinstance(paradigm, dict) or set(paradigm) != {'id', 'title', 'description', 'skills', 'edges'}:
            raise ValueError(f'{location} 需要 id、title、description、skills、edges')
        pid = paradigm['id']
        if not isinstance(pid, str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}', pid) or pid in ids or pid == 'shared':
            raise ValueError(f'{location}.id 必须唯一，使用小写英文、数字和短横线')
        ids.add(pid)
        for field, limit in (('title', 80), ('description', 1200)):
            if not isinstance(paradigm[field], str) or not paradigm[field].strip() or len(paradigm[field]) > limit:
                raise ValueError(f'{location}.{field} 需为 1–{limit} 字，说明范式名称与工作方式')
        assigned = members(paradigm['skills'], location + '.skills')
        if not assigned or assigned.intersection(shared):
            raise ValueError(f'{location}.skills 不能为空，通用技能只放 shared')
        architecture_value({'edges': paradigm['edges']}, assigned)
        if any(not edge.get('label', '').strip() for edge in paradigm['edges']):
            raise ValueError(f'{location}.edges 每条关联都需要 label，说明传递、反馈或选择条件')
        covered.update(assigned)
    if allowed is not None and covered != allowed:
        raise ValueError('架构尚未归属的技能：' + '、'.join(sorted(allowed - covered)) + '；请加入工作范式或明确列为通用能力')
    return {'nodes': [dict(node) for node in nodes], 'shared': list(shared),
            'paradigms': [{**p, 'skills': list(p['skills']), 'edges': [dict(e) for e in p['edges']]} for p in paradigms]}


def prune_architecture(value, allowed):
    if value is None:
        return None
    nodes = [node for node in value.get('nodes', []) if node['skill'] in allowed]
    if 'paradigms' in value:
        return {'nodes': nodes, 'shared': [s for s in value.get('shared', []) if s in allowed],
                'paradigms': [{**p, 'skills': [s for s in p['skills'] if s in allowed],
                    'edges': [e for e in p['edges'] if {e['from'], e['to']} <= allowed]}
                    for p in value['paradigms'] if set(p['skills']) & allowed]}
    return {'nodes': nodes, 'edges': [link for link in value.get('edges', []) if {link['from'], link['to']} <= allowed]}


def place_skills(architecture, skills, placement):
    """Explicit placement of new members; never infer business relations."""
    if not skills or not architecture or 'paradigms' not in architecture:
        return architecture
    if placement == 'shared':
        return {**architecture, 'shared': list(dict.fromkeys([*architecture['shared'], *skills]))}
    if placement not in {p['id'] for p in architecture['paradigms']}:
        raise ValueError('请为新加入的技能选择工作范式，或明确选择通用能力')
    return {**architecture, 'paradigms': [{**p, 'skills': list(dict.fromkeys([*p['skills'], *skills]))}
            if p['id'] == placement else p for p in architecture['paradigms']]}
