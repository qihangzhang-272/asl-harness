"""Mode working paradigms and visual vocabulary, never an execution scheduler."""
import math
import re
import xml.etree.ElementTree as ET

ICON_NAMES = {'Box', 'Search', 'Send', 'Palette', 'PenLine', 'ChartNoAxesCombined', 'PanelsTopLeft', 'Layers3', 'Puzzle'}
EDGE_KEYS = {'from', 'to', 'label', 'condition', 'sourceHandle', 'targetHandle'}
EDGE_HANDLES = {'top', 'right', 'bottom', 'left'}
COORDINATE_LIMIT = 100000
ARCHITECTURE_KEYS = {'nodes', 'edges', 'shared', 'paradigms', 'layout'}


def _coordinate_value(value, location):
    if (isinstance(value, bool) or not isinstance(value, (int, float))
            or abs(value) > COORDINATE_LIMIT or isinstance(value, float) and not math.isfinite(value)):
        raise ValueError(f'{location} 需为绝对值不超过 {COORDINATE_LIMIT} 的有限数字，不接受 true/false、NaN 或 inf')
    return value


def layout_value(layout, contexts):
    """Optional view-only coordinates: {paradigm id or shared: {skill id: {x, y}}}."""
    if not isinstance(layout, dict):
        raise ValueError('architecture.layout 需要为对象：{范式ID 或 shared: {技能ID: {x, y}}}')
    cleaned = {}
    for scope, members in layout.items():
        if scope not in contexts:
            raise ValueError(f'architecture.layout.{scope} 不是当前架构中的工作范式或 shared')
        if not isinstance(members, dict):
            raise ValueError(f'architecture.layout.{scope} 需要以技能 ID 为键，值为 {{x, y}} 坐标')
        points = {}
        for skill, point in members.items():
            if skill not in contexts[scope]:
                raise ValueError(f'architecture.layout.{scope}.{skill} 不是该范围的成员')
            if not isinstance(point, dict) or set(point) != {'x', 'y'}:
                raise ValueError(f'architecture.layout.{scope}.{skill} 需要恰好 x、y 两个坐标')
            points[skill] = {'x': _coordinate_value(point['x'], f'architecture.layout.{scope}.{skill}.x'),
                             'y': _coordinate_value(point['y'], f'architecture.layout.{scope}.{skill}.y')}
        cleaned[scope] = points
    return cleaned


def _edge_value(link):
    if not isinstance(link, dict) or not {'from', 'to'} <= set(link) <= EDGE_KEYS:
        raise ValueError('架构关系只支持 from、to、可选 label、condition、sourceHandle、targetHandle')
    if any(not isinstance(link[key], str) for key in link) or len(link.get('label', '')) > 80:
        raise ValueError('架构关系需为文本，名称最多 80 字')
    condition = link.get('condition')
    if condition is not None and (not condition.strip() or len(condition) > 160):
        raise ValueError('架构关系的 condition 需为 1–160 字，说明这条关系的适用条件')
    for field in ('sourceHandle', 'targetHandle'):
        if field in link and link[field] not in EDGE_HANDLES:
            raise ValueError(f'架构关系的 {field} 只能是 top、right、bottom、left')
    return link


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
    if not isinstance(value, dict) or set(value) - ARCHITECTURE_KEYS:
        raise ValueError('架构仅支持 nodes、shared、paradigms、layout；旧版可读取 edges')
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
        _edge_value(link)
        pair = (link['from'], link['to'])
        if pair in seen or pair[0] == pair[1] or allowed is not None and not set(pair) <= allowed:
            raise ValueError('架构关系必须连接当前 Mode 内的不同技能，且不能重复')
        seen.add(pair)
    if 'paradigms' not in value and 'shared' not in value:
        legacy = {'nodes': [dict(node) for node in nodes], 'edges': [dict(link) for link in links]}
        if 'layout' in value:
            legacy['layout'] = layout_value(value['layout'], {})
        return legacy
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
    contexts = {'shared': set(covered)}
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
        contexts[pid] = set(assigned)
    if allowed is not None and covered != allowed:
        raise ValueError('架构尚未归属的技能：' + '、'.join(sorted(allowed - covered)) + '；请加入工作范式或明确列为通用能力')
    result = {'nodes': [dict(node) for node in nodes], 'shared': list(shared),
              'paradigms': [{**p, 'skills': list(p['skills']), 'edges': [dict(e) for e in p['edges']]} for p in paradigms]}
    if 'layout' in value:
        result['layout'] = layout_value(value['layout'], contexts)
    return result


def _pruned_layout(layout, shared, paradigms):
    """Drop coordinates whose scope no longer exists or whose member was removed."""
    if not isinstance(layout, dict):
        return {}
    kept = {}
    if shared and 'shared' in layout:
        members = {skill: point for skill, point in layout['shared'].items() if skill in shared}
        if members:
            kept['shared'] = members
    for paradigm in paradigms:
        scope = paradigm['id']
        if scope not in layout:
            continue
        skills = set(paradigm['skills'])
        members = {skill: point for skill, point in layout[scope].items() if skill in skills}
        if members:
            kept[scope] = members
    return kept


def prune_architecture(value, allowed):
    if value is None:
        return None
    allowed = set(allowed)
    nodes = [node for node in value.get('nodes', []) if node['skill'] in allowed]
    if 'paradigms' in value:
        shared = [s for s in value.get('shared', []) if s in allowed]
        paradigms = [{**p, 'skills': [s for s in p['skills'] if s in allowed],
            'edges': [e for e in p['edges'] if {e['from'], e['to']} <= allowed]}
            for p in value['paradigms'] if set(p['skills']) & allowed]
        pruned = {'nodes': nodes, 'shared': shared, 'paradigms': paradigms}
        if 'layout' in value:
            layout = _pruned_layout(value['layout'], set(shared), paradigms)
            if layout:
                pruned['layout'] = layout
        return pruned
    pruned = {'nodes': nodes, 'edges': [link for link in value.get('edges', []) if {link['from'], link['to']} <= allowed]}
    if 'layout' in value:
        layout = _pruned_layout(value['layout'], set(), [])
        if layout:
            pruned['layout'] = layout
    return pruned


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
