#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 analysis/refresh.py 重新生成浏览器报告模板 JS（../mccb-report-templates.js）。

用法：
    python analysis/extract_report_templates.py

同步对象：
    - TEMPLATE / FILE_TEMPLATE / PERSON_TEMPLATE（1:1 字符串）
    - BASE_CSS（与 refresh.py 同算法：主模板 <style> 段 + 子页补充类）
    - chart.min.js 源码（base64，纯 ASCII 已断言）

research-reports.html（报告中心）依赖该文件；改完 refresh.py 模板后必须重跑本脚本。
"""
import base64
import importlib.util
import json
import os
import sys


def js_str(s):
    """无损 JS 字符串字面量：JSON 转义（反斜杠/引号/控制字符全转义）+ U+2028/2029 显式转义。
    禁用 JS 模板字面量内嵌——模板内含 `\\.`、`\\d`、`\\uXXXX` 等转义会被二次解析破坏。"""
    j = json.dumps(s, ensure_ascii=False)
    return j.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REFRESH_PY = os.environ.get("REFRESH_PY", os.path.join(HERE, "refresh.py"))
CHART_JS = os.environ.get("CHART_JS", os.path.join(ROOT, "chart.min.js"))
OUT_JS = os.path.join(ROOT, "mccb-report-templates.js")

spec = importlib.util.spec_from_file_location("mccb_refresh", REFRESH_PY)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

tpl_dashboard = mod.TEMPLATE
tpl_file = mod.FILE_TEMPLATE
tpl_person = mod.PERSON_TEMPLATE
css = mod.BASE_CSS
chart = open(CHART_JS, encoding="utf-8").read()

# 模板内允许含反引号/${/转义序列——输出用 JSON 字符串字面量（js_str），1:1 无损。
assert all(b <= 127 for b in chart.encode("utf-8")), "chart.min.js 非纯 ASCII，base64+atob 不安全"
assert "@@CHARTJS@@" in tpl_dashboard and "@@DATA@@" in tpl_dashboard
assert "@@CHARTJS@@" in tpl_file and "@@CSS@@" in tpl_file and "@@DATA@@" in tpl_file
assert "@@CHARTJS@@" in tpl_person and "@@CSS@@" in tpl_person and "@@DATA@@" in tpl_person

b64 = base64.b64encode(chart.encode("ascii")).decode("ascii")

out = []
out.append("/**")
out.append(" * MCCB 报告模板（1:1 提取自 analysis/refresh.py）+ Chart.js 源码（base64）。")
out.append(" * 供 research-reports.html（报告中心）在浏览器内渲染 dashboard / 文件报告 / 个人报告。")
out.append(" * 勿手改：修改 analysis/refresh.py 模板后运行  python analysis/extract_report_templates.py  重新生成。")
out.append(" * 占位符：@@CSS@@ / @@CHARTJS@@ / @@DATA@@。")
out.append(" */")
out.append("(function(root, factory){")
out.append("  const api = factory();")
out.append("  if (typeof module==='object'&&module.exports) module.exports = api;")
out.append("  if (root) root.MCCBReportTemplates = api;")
out.append("})(typeof window!=='undefined'?window:globalThis, function(){")
out.append("  'use strict';")
out.append("  const dashboard = " + js_str(tpl_dashboard) + ";")
out.append("  const file = " + js_str(tpl_file) + ";")
out.append("  const person = " + js_str(tpl_person) + ";")
out.append("  const baseCss = " + js_str(css) + ";")
out.append("  const chartB64 = \"" + b64 + "\";")
out.append("  let _chartSrc = null;")
out.append("  return {")
out.append("    dashboard, file, person, baseCss,")
out.append("    chartSrc(){ if (_chartSrc === null) { try { _chartSrc = atob(chartB64); } catch (e) { _chartSrc = ''; } } return _chartSrc; }")
out.append("  };")
out.append("});")

with open(OUT_JS, "w", encoding="utf-8") as f:
    f.write("\n".join(out) + "\n")
print("WROTE", OUT_JS, os.path.getsize(OUT_JS), "bytes")
print("templates: dashboard=", len(tpl_dashboard), "file=", len(tpl_file), "person=", len(tpl_person), "css=", len(css), "chart_b64=", len(b64))
