"""
CPT-IP Report Parser & HTML Generator
Parses .trep text reports and generates interactive HTML reports with charts.
"""
import re, json, os, sys
from pathlib import Path

BASE_DIR = Path("D:/Software/DSH/psy-exp/data/cpt-results")
OUTPUT_DIR = Path("D:/Software/DSH/psy-exp/data/cpt-reports")
OUTPUT_DIR.mkdir(exist_ok=True)


def parse_trep(filepath):
    """Parse a .trep file into structured data."""
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()

    # Extract header fields
    header = {}
    def extract(pattern, key, group=1):
        m = re.search(pattern, text)
        if m: header[key] = m.group(group).strip()

    extract(r'Date:\s*(.+)', 'date')
    extract(r'Tester:\s*(.+)', 'tester')
    extract(r'Seq File:\s*(.+)', 'seq_file')
    extract(r'Stim Dur:\s*(\d+)', 'stim_dur')
    extract(r'Resp Pol:\s*(.+)', 'resp_pol')
    extract(r'Subj Code:\s*(.+)', 'subj_code')
    extract(r'Age:\s*(\d+)', 'age')
    extract(r'Sex:\s*(.+)', 'sex')
    extract(r'Ses Num:\s*(\d+)', 'ses_num')
    extract(r'Comments:\s*(.+)', 'comments')

    # Extract blocks: Practice, 2-Digit, 3-Digit, 4-Digit
    blocks = {}
    block_patterns = [
        ('practice', r'PRACTICE BLOCK.*?\n(.*?)(?=\n\n\n2-Digit|\Z)', re.DOTALL),
        ('2digit', r'2-Digit Numbers.*?\n(.*?)(?=\n\n\n3-Digit|\Z)', re.DOTALL),
        ('3digit', r'3-Digit Numbers.*?\n(.*?)(?=\n\n\n4-Digit|\Z)', re.DOTALL),
        ('4digit', r'4-Digit Numbers.*?\n(.*?)\Z', re.DOTALL),
    ]

    for name, pattern, flags in block_patterns:
        m = re.search(pattern, text, flags)
        if m:
            block_text = m.group(1)
            block = parse_block(block_text)
            if name != 'practice':
                dprime_m = re.search(r'DPRIME.*?=\s*([\d.]+)', block_text)
                if dprime_m:
                    block['dprime'] = float(dprime_m.group(1))
            blocks[name] = block

    return {'header': header, 'blocks': blocks, 'filename': os.path.basename(filepath)}


def parse_block(text):
    """Parse a block's data lines (HITS, FALSE ALARMS, RANDOMS)."""
    data = {}
    for line in text.split('\n'):
        line = line.strip()
        if line.startswith('HITS'):
            parts = re.split(r'\s{2,}', line)
            if len(parts) >= 6:
                data['hits'] = {
                    'total_possible': int(parts[1]),
                    'actual_responses': int(parts[2]),
                    'proportion': float(parts[3]),
                    'rt_mean': float(parts[4]),
                    'rt_sd': float(parts[5])
                }
        elif line.startswith('FALSE ALARMS'):
            parts = re.split(r'\s{2,}', line)
            if len(parts) >= 6:
                data['false_alarms'] = {
                    'total_possible': int(parts[1]),
                    'actual_responses': int(parts[2]),
                    'proportion': float(parts[3]),
                    'rt_mean': float(parts[4]),
                    'rt_sd': float(parts[5])
                }
        elif line.startswith('RANDOMS'):
            parts = re.split(r'\s{2,}', line)
            if len(parts) >= 4:
                data['randoms'] = {
                    'total_possible': int(parts[1]),
                    'actual_responses': int(parts[2]),
                    'proportion': float(parts[3])
                }
    return data


def _make_svg_bar_grouped(datasets, labels, colors, title, y_max=None):
    """Generate grouped bar chart as inline SVG. datasets=[{label, data}], labels=x-axis, colors=per-dataset."""
    svg_w, svg_h = 380, 210
    ml, mr, mt, mb = 45, 15, 20, 35
    cw = svg_w - ml - mr
    ch = svg_h - mt - mb

    all_values = [v for ds in datasets for v in ds['data']]
    if y_max is not None:
        y_max_val = y_max
    else:
        y_max_val = max(all_values) * 1.3 if all_values else 1
    if y_max_val <= 0:
        y_max_val = 1

    n_groups = len(labels)
    n_bars = len(datasets)
    group_w = cw / n_groups
    bar_w = group_w / (n_bars + 0.8)
    gap = bar_w * 0.25

    svg = f'<svg viewBox="0 0 {svg_w} {svg_h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:380px;height:auto;display:block;margin:0 auto;">'
    svg += f'<rect x="0" y="0" width="{svg_w}" height="{svg_h}" fill="white" rx="6"/>'

    # Y-axis grid lines & labels
    y_ticks = 5
    for i in range(y_ticks + 1):
        y_val = y_max_val * i / y_ticks
        y = mt + ch - (ch * i / y_ticks)
        svg += f'<line x1="{ml}" y1="{y:.1f}" x2="{svg_w - mr}" y2="{y:.1f}" stroke="#e8e8e8" stroke-width="1"/>'
        label = f'{y_val:.2f}'
        if y_val >= 100:
            label = f'{y_val:.0f}'
        elif y_val >= 1:
            label = f'{y_val:.2f}'
        svg += f'<text x="{ml - 6}" y="{y + 4}" text-anchor="end" fill="#888" font-size="10">{label}</text>'

    # Bars
    for gi in range(n_groups):
        x_center = ml + (gi + 0.5) * group_w
        for bi in range(n_bars):
            bx = x_center - (n_bars * bar_w + (n_bars - 1) * gap) / 2 + bi * (bar_w + gap)
            val = datasets[bi]['data'][gi]
            bar_h = max((val / y_max_val) * ch, 0)
            by = mt + ch - bar_h
            svg += f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bar_w:.1f}" height="{bar_h:.1f}" fill="{colors[bi]}" rx="3" opacity="0.85"/>'

    # X-axis labels
    for gi, lab in enumerate(labels):
        x_center = ml + (gi + 0.5) * group_w
        svg += f'<text x="{x_center:.1f}" y="{mt + ch + 16}" text-anchor="middle" fill="#555" font-size="11">{lab}</text>'

    # Title
    svg += f'<text x="{svg_w / 2}" y="14" text-anchor="middle" fill="#555" font-size="13" font-weight="600">{title}</text>'

    # Legend (only if multiple datasets)
    if n_bars > 1:
        lx_start = ml
        for bi in range(n_bars):
            lx = lx_start + bi * 130
            svg += f'<rect x="{lx}" y="{svg_h - 12}" width="10" height="10" fill="{colors[bi]}" rx="2" opacity="0.85"/>'
            svg += f'<text x="{lx + 14}" y="{svg_h - 3}" fill="#666" font-size="10">{datasets[bi]["label"]}</text>'

    svg += '</svg>'
    return svg


def _make_svg_line_chart(data, labels, color, title):
    """Generate line chart as inline SVG."""
    svg_w, svg_h = 380, 210
    ml, mr, mt, mb = 45, 15, 20, 35
    cw = svg_w - ml - mr
    ch = svg_h - mt - mb

    max_val = max(data) * 1.3 if data and max(data) > 0 else 1
    if max_val <= 0:
        max_val = 1
    n = len(labels)

    svg = f'<svg viewBox="0 0 {svg_w} {svg_h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:380px;height:auto;display:block;margin:0 auto;">'
    svg += f'<rect x="0" y="0" width="{svg_w}" height="{svg_h}" fill="white" rx="6"/>'

    # Y-axis grid
    y_ticks = 5
    for i in range(y_ticks + 1):
        y_val = max_val * i / y_ticks
        y = mt + ch - (ch * i / y_ticks)
        svg += f'<line x1="{ml}" y1="{y:.1f}" x2="{svg_w - mr}" y2="{y:.1f}" stroke="#e8e8e8" stroke-width="1"/>'
        label = f'{y_val:.2f}'
        if y_val >= 100:
            label = f'{y_val:.0f}'
        svg += f'<text x="{ml - 6}" y="{y + 4}" text-anchor="end" fill="#888" font-size="10">{label}</text>'

    # Points
    pts = []
    for i in range(n):
        x = ml + (i + 0.5) * (cw / n)
        y = mt + ch - (data[i] / max_val) * ch
        pts.append((x, y))

    # Fill area under line
    if n >= 2:
        path = f'M {pts[0][0]:.1f} {mt + ch:.1f}'
        for px, py in pts:
            path += f' L {px:.1f} {py:.1f}'
        path += f' L {pts[-1][0]:.1f} {mt + ch:.1f} Z'
        svg += f'<path d="{path}" fill="{color}25" stroke="none"/>'

        # Line
        lpath = f'M {pts[0][0]:.1f} {pts[0][1]:.1f}'
        for px, py in pts[1:]:
            lpath += f' L {px:.1f} {py:.1f}'
        svg += f'<path d="{lpath}" fill="none" stroke="{color}" stroke-width="3" stroke-linejoin="round"/>'

    # Dots
    for px, py in pts:
        svg += f'<circle cx="{px:.1f}" cy="{py:.1f}" r="5" fill="{color}" stroke="white" stroke-width="2"/>'

    # X labels
    for i, lab in enumerate(labels):
        x = ml + (i + 0.5) * (cw / n)
        svg += f'<text x="{x:.1f}" y="{mt + ch + 16}" text-anchor="middle" fill="#555" font-size="11">{lab}</text>'

    # Title
    svg += f'<text x="{svg_w / 2}" y="14" text-anchor="middle" fill="#555" font-size="13" font-weight="600">{title}</text>'

    svg += '</svg>'
    return svg


def generate_html(data):
    """Generate a self-contained HTML report with inline SVG charts (no external CDN)."""
    h = data['header']
    blocks = data['blocks']

    def fmt(val, fmt_str='.4f'):
        """Format a number with precision; return raw string for non-numeric."""
        if isinstance(val, (int, float)):
            return f'{val:{fmt_str}}'
        return str(val) if val else '—'

    def html_escape(s):
        """Escape HTML special characters to prevent XSS."""
        s = str(s)
        return (s.replace('&', '&amp;')
                 .replace('<', '&lt;')
                 .replace('>', '&gt;')
                 .replace('"', '&quot;')
                 .replace("'", '&#39;'))

    # Prepare chart data
    conditions = ['2位数字', '3位数字', '4位数字']
    keys = ['2digit', '3digit', '4digit']

    hit_rates = []
    fa_rates = []
    dprimes = []
    rt_means = []
    rt_sds = []
    rand_rates = []

    for k in keys:
        b = blocks.get(k, {})
        hits = b.get('hits', {})
        fa = b.get('false_alarms', {})
        rand = b.get('randoms', {})
        hit_rates.append(hits.get('proportion', 0))
        fa_rates.append(fa.get('proportion', 0))
        dprimes.append(b.get('dprime', 0))
        rt_means.append(hits.get('rt_mean', 0))
        rt_sds.append(hits.get('rt_sd', 0))
        rand_rates.append(rand.get('proportion', 0))

    practice = blocks.get('practice', {})

    # Generate inline SVG charts
    hit_fa_svg = _make_svg_bar_grouped(
        [{'label': '击中率', 'data': hit_rates}, {'label': '虚报率', 'data': fa_rates}],
        conditions, ['#dc3545', '#28a745'], '击中率 vs 虚报率', y_max=1)
    dprime_svg = _make_svg_line_chart(dprimes, conditions, '#1a73e8', 'd-prime（敏感度）')
    rt_svg = _make_svg_bar_grouped(
        [{'label': '反应时均值', 'data': rt_means}],
        conditions, ['#ff9f1c'], '反应时（击中）')
    rand_svg = _make_svg_bar_grouped(
        [{'label': '随机反应率', 'data': rand_rates}],
        conditions, ['#6c757d'], '随机反应率', y_max=1)

    html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CPT-IP 测试报告 - {html_escape(h.get('subj_code', '未知'))}</title>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Microsoft YaHei", sans-serif;
    background: #f0f2f5; color: #333; padding: 20px;
}}
.container {{ max-width: 1000px; margin: 0 auto; }}
.header {{
    background: linear-gradient(135deg, #1a73e8, #0d47a1);
    color: white; padding: 30px 40px; border-radius: 12px 12px 0 0;
}}
.header h1 {{ font-size: 24px; margin-bottom: 6px; }}
.header .subtitle {{ opacity: 0.85; font-size: 14px; }}
.info-grid {{
    display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    background: white; padding: 20px 40px; gap: 12px;
    border-bottom: 1px solid #e0e0e0;
}}
.info-item {{ 
    display: flex; flex-direction: column; 
}}
.info-item .label {{ font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }}
.info-item .value {{ font-size: 16px; font-weight: 600; color: #222; margin-top: 2px; }}
.card {{
    background: white; border-radius: 0 0 12px 12px; padding: 30px 40px;
    margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}}
.card-top {{ border-radius: 0; }}
.chart-row {{ display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 30px; }}
.chart-box {{ flex: 1; min-width: 280px; }}
.chart-box h3 {{ font-size: 15px; color: #555; margin-bottom: 10px; text-align: center; }}
table {{ width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }}
th {{ background: #f8f9fa; color: #555; font-weight: 600; padding: 10px 12px; text-align: left; border-bottom: 2px solid #dee2e6; }}
td {{ padding: 10px 12px; border-bottom: 1px solid #eee; }}
tr:hover td {{ background: #f8f9ff; }}
.text-center {{ text-align: center; }}
.badge {{ display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; }}
.badge-hits {{ background: #fff0f0; color: #dc3545; }}
.badge-fa {{ background: #f0fff0; color: #28a745; }}
.badge-dprime {{ background: #e8f0fe; color: #1a73e8; }}
.footer {{ text-align: center; color: #999; font-size: 12px; margin-top: 20px; }}
</style>
</head>
<body>
<div class="container">

<div class="header">
    <h1>🧠 CPT-IP 测试报告</h1>
    <div class="subtitle">Continuous Performance Test — Identical Pairs 版本</div>
</div>

<div class="info-grid">
    <div class="info-item">
        <span class="label">被试编号</span>
        <span class="value">{h.get('subj_code', '—')}</span>
    </div>
    <div class="info-item">
        <span class="label">性别</span>
        <span class="value">{'男' if h.get('sex','').upper() == 'M' else '女' if h.get('sex','').upper() == 'F' else h.get('sex','—')}</span>
    </div>
    <div class="info-item">
        <span class="label">年龄</span>
        <span class="value">{h.get('age', '—')}{' 岁' if h.get('age') and h['age'] != '—' else ''}</span>
    </div>
    <div class="info-item">
        <span class="label">测试日期</span>
        <span class="value">{h.get('date', '—')}</span>
    </div>
    <div class="info-item">
        <span class="label">测试次数</span>
        <span class="value">{'第 ' + h.get('ses_num', '—') + ' 次' if h.get('ses_num') and h['ses_num'] != '—' else '—'}</span>
    </div>
    <div class="info-item">
        <span class="label">刺激时长</span>
        <span class="value">{h.get('stim_dur', '—')} ms</span>
    </div>
</div>

<div class="card card-top">
    <h2 style="margin-bottom:16px; font-size:18px;">📊 各条件表现概览</h2>

    <div class="chart-row">
        <div class="chart-box">
            <h3>击中率 vs 虚报率</h3>
            {hit_fa_svg}
        </div>
        <div class="chart-box">
            <h3>d-prime（敏感度）</h3>
            {dprime_svg}
        </div>
    </div>

    <div class="chart-row">
        <div class="chart-box">
            <h3>反应时（击中）</h3>
            {rt_svg}
        </div>
        <div class="chart-box">
            <h3>随机反应率</h3>
            {rand_svg}
        </div>
    </div>
</div>

<div class="card">
    <h2 style="margin-bottom:16px; font-size:18px;">📋 详细数据</h2>

    <h3 style="font-size:14px; color:#666; margin:16px 0 8px;">练习块（10 试次）</h3>
    <table>
        <tr>
            <th>指标</th>
            <th class="text-center">可能总数</th>
            <th class="text-center">实际反应</th>
            <th class="text-center">比例</th>
            <th class="text-center">平均反应时(ms)</th>
        </tr>
        <tr>
            <td>击中</td>
            <td class="text-center">{practice.get('hits',{}).get('total_possible','—')}</td>
            <td class="text-center">{practice.get('hits',{}).get('actual_responses','—')}</td>
            <td class="text-center">{fmt(practice.get('hits',{}).get('proportion'))}</td>
            <td class="text-center">{fmt(practice.get('hits',{}).get('rt_mean'), '.2f')}</td>
        </tr>
        <tr>
            <td>虚报</td>
            <td class="text-center">{practice.get('false_alarms',{}).get('total_possible','—')}</td>
            <td class="text-center">{practice.get('false_alarms',{}).get('actual_responses','—')}</td>
            <td class="text-center">{fmt(practice.get('false_alarms',{}).get('proportion'))}</td>
            <td class="text-center">{fmt(practice.get('false_alarms',{}).get('rt_mean'), '.2f')}</td>
        </tr>
        <tr>
            <td>随机</td>
            <td class="text-center">{practice.get('randoms',{}).get('total_possible','—')}</td>
            <td class="text-center">{practice.get('randoms',{}).get('actual_responses','—')}</td>
            <td class="text-center">{fmt(practice.get('randoms',{}).get('proportion'))}</td>
            <td class="text-center">—</td>
        </tr>
    </table>

    <h3 style="font-size:14px; color:#666; margin:16px 0 8px;">正式测试（各 150 试次）</h3>
    <table>
        <tr>
            <th>条件</th>
            <th class="text-center">击中率</th>
            <th class="text-center">虚报率</th>
            <th class="text-center">随机率</th>
            <th class="text-center">d-prime</th>
            <th class="text-center">RT 均值(ms)</th>
            <th class="text-center">RT 标准差</th>
        </tr>
'''
    for cond, k in zip(conditions, keys):
        b = blocks.get(k, {})
        hits = b.get('hits', {})
        fa = b.get('false_alarms', {})
        rand = b.get('randoms', {})
        html += f'''
        <tr>
            <td><strong>{cond}</strong></td>
            <td class="text-center"><span class="badge badge-hits">{fmt(hits.get('proportion'))}</span></td>
            <td class="text-center"><span class="badge badge-fa">{fmt(fa.get('proportion'))}</span></td>
            <td class="text-center">{fmt(rand.get('proportion'))}</td>
            <td class="text-center"><span class="badge badge-dprime">{fmt(b.get('dprime'))}</span></td>
            <td class="text-center">{fmt(hits.get('rt_mean'), '.2f')}</td>
            <td class="text-center">{fmt(hits.get('rt_sd'), '.2f')}</td>
        </tr>'''

    html += '''
    </table>
</div>

<div class="footer">
    CPT-IP 报告自动生成 &bull; 数据来源: .trep 文件
</div>

</div>
</body>
</html>'''
    return html


def sanitize_filename(name):
    """Remove characters invalid in Windows filenames."""
    return re.sub(r'[<>:"/\\|?*]', '_', str(name))


def process_one(filepath):
    """处理单个 .trep 文件并生成 HTML 报告。返回 (成功:bool, 路径:str, 错误:str)。"""
    if not os.path.exists(filepath):
        return False, filepath, "文件不存在"
    try:
        data = parse_trep(filepath)
    except Exception as e:
        return False, filepath, f"解析失败: {e}"

    subj = data['header'].get('subj_code', 'unknown')
    ses = data['header'].get('ses_num', '1')
    safe_subj = sanitize_filename(subj)
    safe_ses = sanitize_filename(str(ses))
    outname = f"{safe_subj}_ses{safe_ses}.html"
    outpath = OUTPUT_DIR / outname

    try:
        html = generate_html(data)
        with open(outpath, 'w', encoding='utf-8') as f:
            f.write(html)
    except Exception as e:
        return False, filepath, f"生成失败: {e}"

    return True, outpath, f"{subj} (ses {ses})"


def main():
    n = len(sys.argv)

    if n == 1:
        # 无参数 → 单文件默认
        process_one(str(BASE_DIR / "0327王赫斌.trep"))

    elif n == 2 and sys.argv[1] in ('--all', '--batch'):
        # --all / --batch → 批量处理所有 .trep
        trep_files = sorted(BASE_DIR.glob("*.trep"))
        if not trep_files:
            print("❌ 未找到任何 .trep 文件")
            sys.exit(1)
        total = len(trep_files)
        ok = 0
        fail = 0
        print(f"📂 发现 {total} 个 .trep 文件，开始批量处理...\n")
        for fp in trep_files:
            print(f"  📄 {fp.name} ... ", end='', flush=True)
            success, path_or_name, detail = process_one(str(fp))
            if success:
                print(f"✅ → {path_or_name.name}")
                ok += 1
            else:
                print(f"❌ {detail}")
                fail += 1
        print(f"\n{'='*40}")
        print(f"✅ 成功: {ok}  |  ❌ 失败: {fail}  |  总计: {total}")
        print(f"📁 报告目录: {OUTPUT_DIR}")

    else:
        # CLI 参数 → 单文件处理
        for fp in sys.argv[1:]:
            if fp in ('--all', '--batch'):
                continue
            success, path_or_name, detail = process_one(fp)
            if success:
                print(f"✅ 报告已生成: {path_or_name}")
                print(f"   被试: {detail}")
            else:
                print(f"❌ {path_or_name}: {detail}")
                sys.exit(1)


if __name__ == '__main__':
    main()
