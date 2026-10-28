# -*- coding: utf-8 -*-
"""CSV → refresh.py 回环驱动器（verify-export-csv.cjs 调用）。

用法：
    python _roundtrip_driver.py <tmpdir> <refresh.py 路径>

步骤：
  1. importlib 加载 refresh.py（其 __main__ 守卫保证 import 无副作用）
  2. monkeypatch mod.HERE / mod.CHART_JS / mod.OUT_HTML 指向 tmpdir
  3. 跑 mod.main()：扫描 tmpdir 里的 CSV → 生成 out_dashboard.html + person.html + reports/
  4. 花括号配对状态机提取生成的 HTML 里 `const DATA = {...}`（字符串感知，防 JSON 内引号干扰）
  5. 写 tmpdir/data.json，输出 PY_OK 行（records/files/person/reports/scipy 计数）
"""
import importlib.util
import json
import os
import sys


def extract_data_payload(html):
    """从生成的 dashboard HTML 提取 const DATA 的 JSON 载荷。"""
    marker = 'const DATA = '
    i = html.index(marker)
    start = html.index('{', i)
    depth = 0
    in_str = False
    esc = False
    for j in range(start, len(html)):
        ch = html[j]
        if in_str:
            if esc:
                esc = False
            elif ch == '\\':
                esc = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    return html[start:j + 1]
    raise RuntimeError('DATA payload brace not closed')


def main():
    if len(sys.argv) != 3:
        print('PY_USAGE: _roundtrip_driver.py <tmpdir> <refresh.py>')
        sys.exit(2)
    tmp = os.path.abspath(sys.argv[1])
    refresh_path = os.path.abspath(sys.argv[2])

    spec = importlib.util.spec_from_file_location('refresh_mod', refresh_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.HERE = tmp
    mod.CHART_JS = os.path.join(tmp, 'chart.min.js')
    mod.OUT_HTML = os.path.join(tmp, 'out_dashboard.html')
    mod.main()

    with open(os.path.join(tmp, 'out_dashboard.html'), encoding='utf-8') as f:
        html = f.read()
    payload = extract_data_payload(html).replace('<\\/', '</')
    data = json.loads(payload)

    with open(os.path.join(tmp, 'data.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)

    reports_dir = os.path.join(tmp, 'reports')
    report_files = sorted(os.listdir(reports_dir)) if os.path.isdir(reports_dir) else []
    try:
        import scipy  # noqa: F401
        has_scipy = 1
    except Exception:
        has_scipy = 0
    n_sig = len((data.get('sig') or {}).get('formal', {}).get('gender', {}))
    print('PY_OK records=%d files=%d person=%s scipy=%d sig_domains=%d reports=%s' % (
        len(data['records']), len(data['files']),
        1 if os.path.exists(os.path.join(tmp, 'person.html')) else 0,
        has_scipy, n_sig, ','.join(report_files)))


if __name__ == '__main__':
    main()
