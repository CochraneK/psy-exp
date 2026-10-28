# -*- coding: utf-8 -*-
"""
MCCB 认知测评工作台生成器
================================
扫描本目录下所有 .xls / .xlsx，按表头名读取（兼容 74 列 / 75 列两种导出格式），
把每一行（一次测评）聚合成原始记录，内联 Chart.js，生成自包含的
mccb_dashboard.html。浏览器端做日/周/月/年聚合与交互，无需联网。

用法：
    python refresh.py
生成后用浏览器打开 mccb_dashboard.html 即可。
"""
import os
import glob
import json
import re
import datetime as dt

HERE = os.path.dirname(os.path.abspath(__file__))
CHART_JS = os.path.join(HERE, "chart.min.js")
OUT_HTML = os.path.join(HERE, "mccb_dashboard.html")

# MCCB 核心 9 项测验（工作量口径：非空即记一次完成；LNS 无汉化版本，组内不施测，已剔除）
CORE_TESTS = [
    "TMT", "BACS SC", "HVLT-R", "WMS-III SS",
    "NAB Mazes", "BVMT-R", "Fluency", "MSCEIT ME", "CPT-IP",
]
# 认知综合分（Age-scaled T-score，常模均值≈50 / SD≈10）
# 注意：个别导出用 AGET/AGEP 后缀，读取时按 base 模糊匹配
COMP_BASES = [
    "SoP", "AV", "WM", "Vrbl Lrng", "Vis Lrng",
    "RPS", "SC", "Overall Comp", "Neurocog Comp",
]
COMP_LABELS = {
    "SoP": "处理速度", "AV": "注意警觉", "WM": "工作记忆",
    "Vrbl Lrng": "言语学习", "Vis Lrng": "视觉学习", "RPS": "推理问题",
    "SC": "社会认知", "Overall Comp": "综合", "Neurocog Comp": "神经认知",
}
# 命中即视为"测试/练习数据"，可在工作台勾选"仅统计正式项目"时剔除
TEST_FILE_HINTS = ["test", "练习", "测试"]
# 9 项核心测验的 AGT（年龄 T 分）base
TEST_AGT = [
    "TMT", "BACS SC", "HVLT-R", "WMS-III SS",
    "NAB Mazes", "BVMT-R", "Fluency", "MSCEIT ME", "CPT-IP",
]
TEST_AGT_LABELS = {
    "TMT": "TMT", "BACS SC": "BACS SC", "HVLT-R": "HVLT-R",
    "WMS-III SS": "WMS-III SS",
    "NAB Mazes": "NAB Mazes", "BVMT-R": "BVMT-R",
    "Fluency": "Fluency", "MSCEIT ME": "MSCEIT ME", "CPT-IP": "CPT-IP",
}
# 诊断分组：数据本身通常无诊断列，按数据文件名推断。
# 键 = 文件名 stem（小写），值 = 组名；把你自己各队列/项目文件名映射到对应组即可，
# 组名可自定义，「诊断分组 × 认知域」区块的展示顺序跟随 DIAG_ORDER。
# 以下为 docs/ 演示文件的示例映射（python docs/_make_demo.py 可直接跑通）。
DIAG_MAP = {
    "健康对照演示": "健康对照",
    "精分演示队列": "精分",
    "抑郁演示队列": "抑郁",
    "双相演示队列": "双相",
    "强迫演示队列": "强迫",
    "hdn演示": "HDN",
    "神经调控演示": "神经调控",
    "tdcs演示": "神经调控",
    "项目演示a": "独立项目",
    "项目演示b": "独立项目",
    "项目演示c": "独立项目",
}
DIAG_ORDER = ["健康对照", "精分", "抑郁", "双相", "强迫", "HDN", "神经调控", "独立项目", "其他"]


def diag_of(filename):
    stem = os.path.splitext(os.path.basename(filename))[0].lower()
    return DIAG_MAP.get(stem, "其他")


# ----------------------------- 工具函数 -----------------------------
def norm_id(v):
    """Respondent ID 可能是浮点(1.0)或字符串('CHB')，统一成可读字符串。"""
    if v is None:
        return ""
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else str(v)
    return str(v).strip()


def baseid(s):
    """剥离 Respondent ID 的访视后缀，得到稳定的受试者主标识。
    规则：先去掉尾部 V<数字>（如 12345678V08 -> 12345678），
    再去掉尾部 -<数字>（如 ABC-2 -> ABC）。"""
    s = str(s or "").strip()
    s = re.sub(r"V\d+$", "", s)
    s = re.sub(r"-\d+$", "", s)
    return s


def parse_date(v):
    """date/datetime/字符串/Excel序列号 -> 'YYYY-MM-DD'，空返回 None。"""
    if v is None:
        return None
    if isinstance(v, dt.datetime):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, dt.date):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        try:
            return (dt.datetime(1899, 12, 30) + dt.timedelta(days=float(v))).strftime("%Y-%m-%d")
        except Exception:
            return None
    s = str(v).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y"):
        try:
            return dt.datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    try:
        return dt.datetime.strptime(s[:10], "%Y-%m-%d").strftime("%Y-%m-%d")
    except Exception:
        return None


def to_float(v):
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        f = float(v)
        return None if f != f else f
    s = str(v).strip()
    if not s:
        return None
    try:
        return float(s)
    except Exception:
        return None


def nonblank(v):
    if v is None:
        return False
    if isinstance(v, float):
        return not (v != v)
    return str(v).strip() != ""


def get_composite(rec, base):
    """按表头名模糊取综合分 T 分（兼容 AGT / AGET 后缀），返回 float 或 None。"""
    for suf in (" AGT", " AGET"):
        v = rec.get(base + suf)
        if nonblank(v):
            return to_float(v)
    return None


def norm_phase(v):
    f = to_float(v)
    if f is None:
        return ""
    return str(int(f)) if f.is_integer() else str(f)


# ----------------------------- 读取器 -----------------------------
def read_xls(path):
    import xlrd
    book = xlrd.open_workbook(path)
    rows = []
    for sh in book.sheets():
        if sh.nrows < 2:
            continue
        hdr = [str(sh.cell_value(0, c)).strip() for c in range(sh.ncols)]
        for r in range(1, sh.nrows):
            rec = {}
            for c in range(sh.ncols):
                cell = sh.cell(r, c)
                v = cell.value
                if cell.ctype == xlrd.XL_CELL_DATE:
                    try:
                        v = xlrd.xldate.xldate_as_datetime(v, book.datemode)
                    except Exception:
                        pass
                rec[hdr[c]] = v
            rows.append(rec)
    return rows


def read_xlsx(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = []
    for ws in wb.worksheets:
        it = ws.iter_rows(values_only=True)
        try:
            raw_hdr = next(it)
        except StopIteration:
            continue
        hdr = [str(h).strip() if h is not None else "" for h in raw_hdr]
        for tup in it:
            rec = {hdr[c]: (tup[c] if c < len(tup) else None) for c in range(len(hdr))}
            rows.append(rec)
    return rows


def read_csv(path):
    """读 UTF-8（容忍 BOM）CSV 为 [{表头: 值}] 行字典。
    供 psy-exp 浏览器「分析导出」产出的 dashboard 兼容 CSV 使用；
    值为字符串，parse_date/to_float 均已兼容。"""
    import csv as _csv
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = []
        for row in _csv.DictReader(f):
            rows.append({(k or "").strip(): v for k, v in row.items() if k is not None})
        return rows


def build_records():
    records = []
    files = {}
    _scan_dirs = [HERE]
    _data_dir = os.path.join(HERE, "data")
    if os.path.isdir(_data_dir):
        _scan_dirs.append(_data_dir)
    paths = []
    for _d in _scan_dirs:
        paths += sorted(glob.glob(os.path.join(_d, "*.xls"))) + sorted(glob.glob(os.path.join(_d, "*.xlsx"))) + sorted(glob.glob(os.path.join(_d, "*.csv")))
    for path in paths:
        name = os.path.basename(path)
        low = name.lower()
        is_test = any(h in low for h in TEST_FILE_HINTS)
        try:
            if low.endswith(".csv"):
                raw = read_csv(path)
            elif low.endswith(".xls"):
                raw = read_xls(path)
            else:
                raw = read_xlsx(path)
        except Exception as e:
            files[name] = {"rows": 0, "test": is_test, "min": "", "max": "", "error": str(e)}
            continue
        dates = []
        for rec in raw:
            sd = parse_date(rec.get("Start Date"))
            td = parse_date(rec.get("Test Date"))
            date = sd or td
            if not date:
                continue
            age = to_float(rec.get("Start Age"))
            if age is None:
                age = to_float(rec.get("Test Age"))
            tests = [t for t in CORE_TESTS if nonblank(rec.get(t))]
            sc = {}
            for base in COMP_BASES:
                v = get_composite(rec, base)
                if v is not None:
                    sc[base] = round(v, 1)
            tc = {}
            for base in TEST_AGT:
                v = get_composite(rec, base)
                if v is not None:
                    tc[base] = round(v, 1)
            rid = norm_id(rec.get("Respondent ID"))
            nm = str(rec.get("Name") or "").strip()
            bid = baseid(rid)
            pkey = name + "|" + (bid if bid else (nm or rid))
            dates.append(date)
            records.append({
                "date": date,
                "file": name,
                "diag": diag_of(name),
                "id": rid,
                "name": nm,
                "pkey": pkey,
                "pid": bid,
                "gender": str(rec.get("Gender") or "").strip(),
                "age": round(age, 1) if age is not None else None,
                "phase": norm_phase(rec.get("Assessment")),
                "rater": str(rec.get("Rater") or "").strip(),
                "tests": tests,
                "comp": len(sc),
                "sc": sc,
                "tc": tc,
            })
        files[name] = {
            "rows": len(dates),
            "test": is_test,
            "min": min(dates) if dates else "",
            "max": max(dates) if dates else "",
        }
    records.sort(key=lambda r: (r["date"], r["file"], r["id"]))
    return records, files


# ----------------------------- 组间显著性（Kruskal-Wallis） -----------------------------
def _gender_key(r):
    g = (r.get("gender") or "").strip()
    return "男" if g == "Male" else ("女" if g == "Female" else "未标注")


def kw_group_sig(records, key_fn, group_order=None):
    """对每个综合分域，按分组做 Kruskal-Wallis 非参检验。
    返回 {domain: {H, p, eta2, k, N, n:{group:n}}}；组数<2 或样本不足则省略该域。
    scipy 不可用时返回 {}（静默降级，图表不显示星号）。"""
    try:
        from scipy.stats import kruskal
    except Exception:
        return {}
    sig = {}
    for base in COMP_BASES:
        groups = {}
        for r in records:
            v = (r.get("sc") or {}).get(base)
            if v is None:
                continue
            g = key_fn(r)
            if not g:
                continue
            groups.setdefault(g, []).append(v)
        if group_order:
            gs = [g for g in group_order if groups.get(g)]
        else:
            gs = sorted(groups)
        if len(gs) < 2:
            continue
        arrays = [groups[g] for g in gs]
        N = sum(len(a) for a in arrays)
        if N < 3:
            continue
        try:
            H, p = kruskal(*arrays)
        except Exception:
            continue
        k = len(arrays)
        eta2 = max(0.0, (H - k + 1) / (N - k)) if N > k else None  # epsilon-squared 钳 0，避免无差异时显示 -0.0
        sig[base] = {
            "H": round(float(H), 2),
            "p": float(p),
            "eta2": round(float(eta2), 3) if eta2 is not None else None,
            "k": k,
            "N": N,
            "n": {g: len(groups[g]) for g in gs},
        }
    return sig


# ----------------------------- HTML 模板 -----------------------------
TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MCCB 认知测评工作台</title>
<script>@@CHARTJS@@</script>
<style>
:root{
  --teal:#0d9488; --teal-dark:#0f766e; --teal-soft:#ccfbf1; --teal-100:#f0fdfa;
  --bg:#eef2f1; --card:#ffffff; --ink:#1f2937; --muted:#6b7280; --line:#e5e7eb;
  --sky:#0ea5e9; --indigo:#6366f1; --amber:#f59e0b; --pink:#ec4899;
  --shadow:0 1px 3px rgba(16,24,40,.06),0 1px 2px rgba(16,24,40,.04);
  --shadow-md:0 4px 14px rgba(16,24,40,.08);
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:var(--bg);color:var(--ink);line-height:1.5;padding:24px}
.wrap{max-width:1280px;margin:0 auto}
/* header */
header{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;margin-bottom:22px;padding:22px 26px;background:linear-gradient(135deg,var(--teal) 0%,var(--teal-dark) 100%);border-radius:16px;color:#fff;box-shadow:var(--shadow-md)}
header h1{font-size:24px;font-weight:700;letter-spacing:.5px}
header .sub{font-size:13px;opacity:.9;margin-top:4px}
.hd-right{display:flex;align-items:center;gap:16px;font-size:13px}
.hd-right .upd{opacity:.95;background:rgba(255,255,255,.15);padding:6px 12px;border-radius:8px}
.toggle{display:flex;align-items:center;gap:7px;cursor:pointer;user-select:none;background:rgba(255,255,255,.15);padding:7px 12px;border-radius:8px;font-size:13px}
.toggle input{accent-color:#fff;cursor:pointer}
/* kpi */
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-bottom:20px}
.kpi{background:var(--card);border-radius:14px;padding:16px 18px;box-shadow:var(--shadow);border:1px solid var(--line);position:relative;overflow:hidden}
.kpi::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--teal)}
.kpi:nth-child(2)::before{background:var(--sky)}
.kpi:nth-child(3)::before{background:var(--indigo)}
.kpi:nth-child(4)::before{background:var(--amber)}
.kpi:nth-child(5)::before{background:var(--pink)}
.kpi:nth-child(6)::before{background:#84cc16}
.kpi .k{font-size:12.5px;color:var(--muted);font-weight:600}
.kpi .v{font-size:27px;font-weight:750;margin-top:5px;color:var(--ink);font-variant-numeric:tabular-nums}
.kpi .s{font-size:11.5px;color:var(--muted);margin-top:3px}
/* toolbar */
.bar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px}
.seg{display:inline-flex;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:3px;box-shadow:var(--shadow)}
.seg button{border:0;background:transparent;padding:7px 18px;font-size:13.5px;font-weight:600;color:var(--muted);border-radius:8px;cursor:pointer;transition:.15s}
.seg button.on{background:var(--teal);color:#fff}
/* cards & grid */
.grid{display:grid;gap:16px;margin-bottom:16px}
.g-12{grid-template-columns:1fr}
.g-2{grid-template-columns:1fr 1fr}
.g-32{grid-template-columns:1.5fr 1fr}
.g-23{grid-template-columns:1fr 1.5fr}
.card{background:var(--card);border-radius:14px;padding:18px 20px;box-shadow:var(--shadow);border:1px solid var(--line)}
.card h3{font-size:15px;font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:8px}
.card h3 .dot{width:9px;height:9px;border-radius:50%;background:var(--teal);display:inline-block}
.card .hint{font-size:12px;color:var(--muted);margin-bottom:12px}
.chart-box{position:relative;width:100%}
/* lists */
.phase-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px dashed var(--line);font-size:13.5px}
.phase-row:last-child{border-bottom:0}
.phase-row .tag{background:var(--teal-soft);color:var(--teal-dark);padding:3px 10px;border-radius:20px;font-weight:600;font-size:12.5px}
.phase-row .cnt{font-weight:700;font-variant-numeric:tabular-nums}
/* tables */
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
th{background:var(--teal-100);color:var(--teal-dark);font-weight:700;position:sticky;top:0;font-size:12.5px}
tbody tr:hover{background:var(--teal-100)}
.twrap{max-height:420px;overflow:auto;border-radius:10px;border:1px solid var(--line)}
.pill{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11.5px;font-weight:600}
.pill.formal{background:var(--teal-soft);color:var(--teal-dark)}
.pill.test{background:#fef3c7;color:#b45309}
/* 认知损害筛查 */
.screen-sum{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.chip{padding:4px 11px;border-radius:20px;font-size:12px;font-weight:600;border:1px solid var(--line);background:#fff}
.chip b{font-weight:800;font-variant-numeric:tabular-nums}
.chip.c1{background:var(--teal-100);border-color:var(--teal-soft);color:var(--teal-dark)}
.chip.c2{background:#fffbeb;border-color:#fde68a;color:#b45309}
.chip.c3{background:#fff1f2;border-color:#fecdd3;color:#be123c}
.screen{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}
.screen-cell{padding:12px 14px;border-radius:10px;border:1px solid var(--line);display:flex;flex-direction:column;gap:3px}
.screen-cell .lbl{font-size:12px;color:var(--muted);font-weight:600}
.screen-cell .tval{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1}
.screen-cell .tier{font-size:11.5px;font-weight:700}
.screen-cell .sd{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
.lv-ok{background:var(--teal-100);border-color:var(--teal-soft)}
.lv-ok .tval{color:var(--teal-dark)}.lv-ok .tier{color:var(--teal)}
.lv-mild{background:#fffbeb;border-color:#fde68a}
.lv-mild .tval{color:#b45309}.lv-mild .tier{color:#d97706}
.lv-severe{background:#fff1f2;border-color:#fecdd3}
.lv-severe .tval{color:#be123c}.lv-severe .tier{color:#e11d48}
.lv-na{background:#f9fafb;border-color:var(--line)}
.lv-na .tval{color:var(--muted)}.lv-na .tier{color:var(--muted)}
.muted{color:var(--muted)}
@media(max-width:620px){.screen{grid-template-columns:repeat(2,1fr)}}
/* search */
.controls{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.controls input,.controls select{padding:9px 12px;border:1px solid var(--line);border-radius:9px;font-size:13px;background:#fff;color:var(--ink);outline:none}
.controls input{min-width:230px}
.controls input:focus,.controls select:focus{border-color:var(--teal)}
.count{font-size:12.5px;color:var(--muted);margin-left:auto;align-self:center}
footer{text-align:center;color:var(--muted);font-size:12px;margin-top:24px;padding:16px}
@media(max-width:980px){.kpis{grid-template-columns:repeat(3,1fr)}.g-2,.g-32,.g-23{grid-template-columns:1fr}}
@media(max-width:620px){.kpis{grid-template-columns:repeat(2,1fr)}body{padding:14px}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>MCCB 认知测评工作台</h1>
      <div class="sub">MATRICS Consensus Cognitive Battery · 工作量与项目总览</div>
    </div>
    <div class="hd-right">
      <div class="upd">更新于 <span id="gen"></span></div>
      <label class="toggle"><input type="checkbox" id="onlyFormal"><span>仅统计正式项目</span></label>
    </div>
  </header>

  <div class="kpis" id="kpis"></div>

  <div class="bar">
    <div class="seg" id="modeSeg">
      <button data-m="day">日</button>
      <button data-m="week">周</button>
      <button data-m="month" class="on">月</button>
      <button data-m="year">年</button>
    </div>
    <div class="muted" id="tsCaption" style="font-size:13px"></div>
  </div>

  <div class="grid g-12">
    <div class="card">
      <h3><span class="dot"></span>测评量趋势</h3>
      <div class="hint" id="tsHint">按所选粒度统计的测评场次（柱）与受试者数（线）</div>
      <div class="chart-box" style="height:320px"><canvas id="cTime"></canvas></div>
    </div>
  </div>

  <div class="grid g-2">
    <div class="card">
      <h3><span class="dot" style="background:var(--sky)"></span>性别分布（场次）</h3>
      <div class="hint">当前筛选范围内</div>
      <div class="chart-box" style="height:250px"><canvas id="cGender"></canvas></div>
    </div>
    <div class="card">
      <h3><span class="dot" style="background:var(--amber)"></span>核心测验完成度</h3>
      <div class="hint">每项测验被完成的场次及占全部场次比例</div>
      <div class="chart-box" style="height:250px"><canvas id="cTests"></canvas></div>
    </div>
  </div>

  <div class="grid g-23">
    <div class="card">
      <h3><span class="dot" style="background:var(--indigo)"></span>年龄分布</h3>
      <div class="hint">按开始年龄分组</div>
      <div class="chart-box" style="height:240px"><canvas id="cAge"></canvas></div>
    </div>
    <div class="card">
      <h3><span class="dot" style="background:var(--pink)"></span>项目测评场次</h3>
      <div class="hint">每个 XLS 项目贡献的测评场次（悬停看受试者数；点击柱条进项目独立报告）</div>
      <div class="chart-box" style="height:460px"><canvas id="cProj"></canvas></div>
    </div>
  </div>

  <div class="grid g-12">
    <div class="card">
      <h3><span class="dot" style="background:#84cc16"></span>累计测评场次（按年-月）</h3>
      <div class="hint">随时间累积的总工作量</div>
      <div class="chart-box" style="height:280px"><canvas id="cCum"></canvas></div>
    </div>
  </div>

  <div class="grid g-2">
    <div class="card">
      <h3><span class="dot" style="background:var(--teal)"></span>认知剖面雷达（各域综合分 T 分）</h3>
      <div class="hint">7 个认知域的均值剖面，按项目叠加对比（T 分，50≈常模均值）</div>
      <div class="chart-box" style="height:330px"><canvas id="cRadar"></canvas></div>
    </div>
    <div class="card">
      <h3><span class="dot" style="background:var(--sky)"></span>项目综合分对比（Overall Comp 均值）</h3>
      <div class="hint">各项目综合分均值，按高到低排序（悬停看场次数/人数；点击柱条进项目独立报告）</div>
      <div class="chart-box" style="height:460px"><canvas id="cGroupBar"></canvas></div>
    </div>
  </div>

  <div class="grid g-12">
    <div class="card">
      <h3><span class="dot" style="background:var(--indigo)"></span>各域综合分分布（当前筛选）</h3>
      <div class="hint">每个认知域的 T 分分布：箱体=四分位距，中线=中位，端点=极小/极大</div>
      <div class="chart-box" style="height:300px"><canvas id="cBox"></canvas></div>
    </div>
  </div>

  <div class="grid g-12">
    <div class="card">
      <h3><span class="dot" style="background:var(--indigo)"></span>测验 × 综合分相关热图</h3>
      <div class="hint">9 项测验 T 分 × 9 综合分 T 分的 Pearson 相关系数（当前筛选，r∈[-1,1]；蓝=正相关，红=负相关）</div>
      <div id="heatGrid" style="overflow-x:auto"></div>
    </div>
  </div>

  <div class="grid g-12">
    <div class="card">
      <h3><span class="dot" style="background:var(--teal)"></span>纵向干预：基线 vs 末次综合分</h3>
      <div class="hint">同一受试者 ≥2 波的项目，按项目比较首末次综合 T 分均值（n=配对人数）</div>
      <div class="chart-box" style="height:300px"><canvas id="cLongi"></canvas></div>
    </div>
  </div>

  <div class="grid g-2">
    <div class="card">
      <h3><span class="dot" style="background:#0ea5e9"></span>性别 × 认知域</h3>
      <div class="hint">7 认知域 T 分均值（当前筛选；tooltip 显示 n）</div>
      <div class="chart-box" style="height:300px"><canvas id="cGenderDomain"></canvas></div>
    </div>
    <div class="card">
      <h3><span class="dot" style="background:#f59e0b"></span>诊断分组 × 认知域</h3>
      <div class="hint">按队列/项目文件归组（健康对照/精分/抑郁/双相/强迫/HDN/神经调控/独立项目/其他）</div>
      <div class="chart-box" style="height:300px"><canvas id="cDiagDomain"></canvas></div>
    </div>
  </div>

  <div class="grid g-12">
    <div class="card">
      <h3><span class="dot" style="background:var(--indigo)"></span>组间差异 · Kruskal-Wallis 显著性</h3>
      <div class="hint">每域跨组 H 检验（非参数）· * p&lt;.05 &nbsp;** p&lt;.01 &nbsp;*** p&lt;.001，ns=不显著 · η²=epsilon-squared 效应量 · 跟随「仅统计正式项目」开关</div>
      <div style="overflow-x:auto"><table id="sigTbl"></table></div>
    </div>
  </div>

  <div class="grid g-2">
    <div class="card">
      <h3><span class="dot" style="background:var(--teal)"></span>测评阶段 / 波次</h3>
      <div class="hint">Assessment 字段分布（1/2/3… 或空=基线）</div>
      <div id="phaseList"></div>
    </div>
    <div class="card">
      <h3><span class="dot" style="background:var(--sky)"></span>最近测评活动</h3>
      <div class="hint">最新 12 条</div>
      <div style="overflow-x:auto"><table id="recentTbl"></table></div>
    </div>
  </div>

  <div class="grid g-12">
    <div class="card">
      <h3><span class="dot" style="background:var(--indigo)"></span>明细数据</h3>
      <div class="controls">
        <input type="text" id="q" placeholder="搜索 ID / 姓名 / 项目…">
        <select id="proj"><option value="">全部项目</option></select>
        <span class="count" id="tblCount"></span>
      </div>
      <div class="twrap"><table id="detailTbl"></table></div>
    </div>
  </div>

  <div class="grid g-12">
    <div class="card">
      <h3><span class="dot" style="background:var(--pink)"></span>项目文件清单</h3>
      <div class="hint">本目录内读取到的全部数据文件</div>
      <div style="overflow-x:auto"><table id="fileTbl"></table></div>
    </div>
  </div>

  <footer>数据来源：本目录 <span id="fcount"></span> 个 XLS/XLSX 文件 · 共 <span id="rcount"></span> 次测评 · 由 refresh.py 自动生成，替换文件后重跑即可刷新</footer>
</div>

<script>
const DATA = @@DATA@@;
const CORE = DATA.core_tests;
const DOMAINS = (DATA.comp_bases || []).filter(b => b.indexOf('Comp') === -1);
const PALETTE = ['#0d9488','#0ea5e9','#6366f1','#f59e0b','#ec4899','#84cc16','#14b8a6','#f97316','#8b5cf6','#06b6d4','#f43f5e','#84cc16'];
Chart.defaults.color = '#6b7280';
Chart.defaults.font.family = "'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif";
let MODE = 'month', ONLY = false;
const charts = {};

function recs(){ return DATA.records.filter(r => !ONLY || !DATA.files[r.file].test); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function fmt(n){ return (n==null||n==='')?'—':Number(n).toLocaleString('zh-CN'); }

function bucket(dstr,mode){
  if(mode==='day') return dstr;
  if(mode==='month') return dstr.slice(0,7);
  if(mode==='year') return dstr.slice(0,4);
  const d = new Date(dstr+'T00:00:00');
  const t = new Date(d); t.setDate(t.getDate()+3-((t.getDay()+6)%7));
  const w1 = new Date(t.getFullYear(),0,4);
  const wk = 1+Math.round(((t-w1)/86400000-3+((w1.getDay()+6)%7))/7);
  return t.getFullYear()+'-W'+String(wk).padStart(2,'0');
}
function bucketLabel(k,mode){
  if(mode!=='week') return k;
  const y=+k.slice(0,4), wk=+k.slice(5);
  const jan4=new Date(y,0,4), day=(jan4.getDay()||7);
  const mon=new Date(jan4); mon.setDate(4-day+(wk-1)*7);
  return (mon.getMonth()+1)+'/'+mon.getDate();
}
function timeSeries(mode){
  const R=recs(), m={};
  for(const r of R){
    const k=bucket(r.date,mode);
    if(!m[k]) m[k]={n:0,ids:new Set(),t:0};
    m[k].n++; m[k].ids.add(r.pkey); m[k].t+=(r.tests||[]).length;
  }
  const keys=Object.keys(m).sort();
  return {keys,labels:keys.map(k=>bucketLabel(k,mode)),
    sessions:keys.map(k=>m[k].n),subjects:keys.map(k=>m[k].ids.size),tests:keys.map(k=>m[k].t)};
}

function render(){
  const R=recs();
  // KPI
  const ids=new Set(R.map(r=>r.pkey)), files=new Set(R.map(r=>r.file));
  const tests=R.reduce((a,r)=>a+(r.tests||[]).length,0);
  let span='—';
  if(R.length){
    const ds=R.map(r=>r.date).sort(); const a=ds[0], b=ds[ds.length-1];
    const months=((+b.slice(0,4)-+a.slice(0,4))*12+(+b.slice(5,7)-+a.slice(5,7)))+1;
    span=a.slice(0,7)+' ~ '+b.slice(0,7)+'（'+months+' 个月）';
  }
  let last30=0;
  if(R.length){ const mx=R.map(r=>r.date).sort().pop(); const ref=new Date(mx+'T00:00:00'); ref.setDate(ref.getDate()-29);
    const lo=ref.toISOString().slice(0,10); last30=R.filter(r=>r.date>=lo&&r.date<=mx).length; }
  const kpiData=[
    {k:'总测评场次',v:fmt(R.length),s:'按 Start/Test Date'},
    {k:'受试者数',v:fmt(ids.size),s:'去重 Respondent ID'},
    {k:'项目数',v:fmt(files.size),s:'XLS 数据文件'},
    {k:'测验完成数',v:fmt(tests),s:'核心 9 项累计'},
    {k:'数据跨度',v:R.length?months_span(R):'—',s:span2(R)},
    {k:'近 30 天场次',v:fmt(last30),s:'相对最新日期'}
  ];
  document.getElementById('kpis').innerHTML=kpiData.map(o=>
    '<div class="kpi"><div class="k">'+o.k+'</div><div class="v">'+o.v+'</div><div class="s">'+o.s+'</div></div>').join('');
  renderTime(); renderGender(); renderTests(); renderAge(); renderProj(); renderCum();
  renderRadar(); renderGroupBar(); renderBox();
  renderHeat(); renderLongi(); renderGenderDomain(); renderDiagDomain();
  renderPhase(); renderRecent(); renderTable(); renderFileTbl(); renderSigTable();
}
function months_span(R){
  const ds=R.map(r=>r.date).sort(); const a=ds[0],b=ds[ds.length-1];
  return (((+b.slice(0,4)-+a.slice(0,4))*12+(+b.slice(5,7)-+a.slice(5,7)))+1)+' 个月';
}
function span2(R){
  const ds=R.map(r=>r.date).sort(); return ds[0].slice(0,7)+' ~ '+ds[ds.length-1].slice(0,7);
}

function mk(id,cfg){ if(charts[id]) charts[id].destroy(); charts[id]=new Chart(document.getElementById(id),cfg); }

function renderTime(){
  const ts=timeSeries(MODE);
  document.getElementById('tsCaption').textContent='当前粒度：'+({day:'按日',week:'按周',month:'按月',year:'按年'})[MODE]+' · '+ts.keys.length+' 个区间';
  mk('cTime',{type:'bar',data:{labels:ts.labels,datasets:[
    {type:'bar',label:'测评场次',data:ts.sessions,backgroundColor:'#0d9488',yAxisID:'y',borderRadius:4,maxBarThickness:46},
    {type:'line',label:'受试者数',data:ts.subjects,borderColor:'#f59e0b',backgroundColor:'#f59e0b',yAxisID:'y1',tension:.3,pointRadius:ts.labels.length>60?0:2,borderWidth:2}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{position:'top'},tooltip:{callbacks:{title:items=>ts.keys[items[0].dataIndex]}}},
    scales:{x:{grid:{display:false},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:24}},
      y:{beginAtZero:true,title:{display:true,text:'场次'},grid:{color:'#eef2f1'}},
      y1:{beginAtZero:true,position:'right',title:{display:true,text:'受试者'},grid:{display:false}}}}});
}
function renderGender(){
  const R=recs(), m={};
  for(const r of R){ const g=r.gender||'未知'; m[g]=(m[g]||0)+1; }
  const labels=Object.keys(m), data=Object.values(m);
  const col={Male:'#0ea5e9',Female:'#ec4899'};
  mk('cGender',{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:labels.map(l=>col[l]||'#9ca3af'),borderWidth:2,borderColor:'#fff'}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
      plugins:{legend:{position:'right'},tooltip:{callbacks:{label:c=>c.label+': '+fmt(c.parsed)+' 场 ('+Math.round(c.parsed/(R.length||1)*100)+'%)'}}}}});
}
function renderTests(){
  const R=recs(), m={}; for(const t of CORE) m[t]=0;
  for(const r of R) for(const t of (r.tests||[])) m[t]=(m[t]||0)+1;
  const total=R.length||1;
  const rows=CORE.map(t=>({t,n:m[t],pct:Math.round(m[t]/total*100)})).sort((a,b)=>b.n-a.n);
  mk('cTests',{type:'bar',data:{labels:rows.map(r=>r.t),datasets:[{label:'完成场次',data:rows.map(r=>r.n),backgroundColor:'#f59e0b',borderRadius:4,maxBarThickness:26}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},
      tooltip:{callbacks:{label:c=>fmt(c.parsed.x)+' 场 · 占 '+(rows[c.dataIndex]).pct+'%'}}},
      scales:{x:{beginAtZero:true,grid:{color:'#eef2f1'}},y:{grid:{display:false}}}}});
}
function renderAge(){
  const R=recs(); const bins=[['<18',0,18],['18-24',18,24],['25-29',25,29],['30-34',30,34],['35-39',35,39],['40-49',40,49],['≥50',50,999]];
  const out=bins.map(b=>({l:b[0],n:0}));
  for(const r of R){ if(r.age==null) continue; for(let i=0;i<bins.length;i++) if(r.age>=bins[i][1]&&r.age<bins[i][2]){out[i].n++;break;} }
  mk('cAge',{type:'bar',data:{labels:out.map(o=>o.l),datasets:[{label:'受试者·次',data:out.map(o=>o.n),backgroundColor:'#6366f1',borderRadius:5,maxBarThickness:52}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'#eef2f1'}}}}});
}
function renderProj(){
  const R=recs(), m={};
  for(const r of R){ if(!m[r.file]) m[r.file]={n:0,ids:new Set()}; m[r.file].n++; m[r.file].ids.add(r.pkey); }
  const rows=Object.entries(m).map(([f,v])=>({f,n:v.n,ids:v.ids.size})).sort((a,b)=>b.n-a.n);
  mk('cProj',{type:'bar',data:{labels:rows.map(r=>r.f.replace(/\.xls[x]?$/i,'')),datasets:[{label:'场次',data:rows.map(r=>r.n),backgroundColor:'#ec4899',borderRadius:4,barPercentage:.5,categoryPercentage:.65,maxBarThickness:20}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,onClick:(e,els)=>{if(els.length){const o=DATA.files[rows[els[0].index].f];if(o&&o.report)window.open(o.report,'_blank');}},
      plugins:{legend:{display:false},
      tooltip:{callbacks:{label:c=>'场次 '+fmt(c.parsed.x)+' · 受试者 '+rows[c.dataIndex].ids+'（点击进项目报告）'}}},
      scales:{x:{beginAtZero:true,grid:{color:'#eef2f1'}},y:{grid:{display:false},ticks:{font:{size:12},autoSkip:false,padding:4}}}}});
}
function renderCum(){
  const R=recs(), m={}; for(const r of R){ const k=r.date.slice(0,7); m[k]=(m[k]||0)+1; }
  const keys=Object.keys(m).sort(); let acc=0; const out=keys.map(k=>{acc+=m[k];return k+' · '+acc;});
  mk('cCum',{type:'line',data:{labels:keys,datasets:[{label:'累计场次',data:keys.map((k,i)=>{let s=0;for(let j=0;j<=i;j++)s+=m[keys[j]];return s;}),
    borderColor:'#84cc16',backgroundColor:'rgba(132,204,22,.15)',fill:true,tension:.3,pointRadius:keys.length>60?0:2,borderWidth:2.5}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{grid:{display:false},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:18}},y:{beginAtZero:true,grid:{color:'#eef2f1'}}}}});
}
function q(sorted,p){
  const n=sorted.length; if(n===1) return sorted[0];
  const idx=(n-1)*p, lo=Math.floor(idx), hi=Math.ceil(idx);
  if(lo===hi) return sorted[lo];
  return sorted[lo]+(sorted[hi]-sorted[lo])*(idx-lo);
}
function domainStats(rows){
  const out={};
  for(const b of DOMAINS){
    const vals=rows.map(r=>(r.sc||{})[b]).filter(v=>v!=null);
    if(!vals.length){ out[b]=null; continue; }
    vals.sort((a,c)=>a-c);
    out[b]={min:vals[0],max:vals[vals.length-1],n:vals.length,
      q1:q(vals,.25),med:q(vals,.5),q3:q(vals,.75),mean:vals.reduce((a,c)=>a+c,0)/vals.length};
  }
  return out;
}
function renderRadar(){
  const R=recs(); const byFile={};
  for(const r of R){ if(!r.sc||!Object.keys(r.sc).length) continue;
    (byFile[r.file]=byFile[r.file]||[]).push(r); }
  const files=Object.keys(byFile).filter(f=>byFile[f].length>=3).sort((a,b)=>byFile[b].length-byFile[a].length).slice(0,5);
  const lab=b=>(DATA.comp_labels||{})[b]||b;
  const labels=DOMAINS.map(lab);
  const ds=files.map((f,i)=>{
    const st=domainStats(byFile[f]);
    return {label:f.replace(/\.xls[x]?$/i,''),data:DOMAINS.map(b=>st[b]?Math.round(st[b].mean*10)/10:null),
      borderColor:PALETTE[i%PALETTE.length],backgroundColor:PALETTE[i%PALETTE.length]+'40',borderWidth:2,pointRadius:2};
  });
  mk('cRadar',{type:'radar',data:{labels,datasets:ds},options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:'bottom',labels:{boxWidth:12,font:{size:11}}},
      tooltip:{callbacks:{label:c=>c.dataset.label+': '+c.formattedValue}}},
    scales:{r:{suggestedMin:30,suggestedMax:70,pointLabels:{font:{size:11.5}},ticks:{stepSize:5,backdropColor:'transparent'}}}}});
}
function renderGroupBar(){
  const R=recs(); const m={};
  for(const r of R){ const v=(r.sc||{})['Overall Comp']; if(v==null) continue;
    if(!m[r.file]) m[r.file]={sum:0,n:0,ids:new Set()}; m[r.file].sum+=v; m[r.file].n++; m[r.file].ids.add(r.pkey); }
  const rows=Object.entries(m).map(([f,v])=>({f,mean:v.sum/v.n,n:v.n,ids:v.ids.size})).sort((a,b)=>b.mean-a.mean);
  mk('cGroupBar',{type:'bar',data:{labels:rows.map(r=>r.f.replace(/\.xls[x]?$/i,'')),datasets:[
    {label:'Overall Comp 均值',data:rows.map(r=>Math.round(r.mean*10)/10),backgroundColor:'#0ea5e9',borderRadius:4,barPercentage:.5,categoryPercentage:.65,maxBarThickness:20}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,onClick:(e,els)=>{if(els.length){const o=DATA.files[rows[els[0].index].f];if(o&&o.report)window.open(o.report,'_blank');}},
      plugins:{legend:{display:false},
      tooltip:{callbacks:{label:c=>{const r=rows[c.dataIndex];return '均值 '+r.mean+' · 场次 '+r.n+' · 人数 '+r.ids+'（点击进项目报告）';}}}},
      scales:{x:{suggestedMin:35,suggestedMax:60,grid:{color:'#eef2f1'},title:{display:true,text:'T 分'}},y:{grid:{display:false},ticks:{font:{size:12},autoSkip:false,padding:4}}}}});
}
function renderBox(){
  const R=recs(); const st=domainStats(R);
  const have=DOMAINS.filter(b=>st[b]);
  const lab=b=>(DATA.comp_labels||{})[b]||b;
  const yLabels=have.map(lab);
  const ds=[
    {type:'bar',label:'四分位距 (Q1–Q3)',data:have.map(b=>[st[b].q1,st[b].q3]),
      backgroundColor:'rgba(99,102,241,.25)',borderColor:'#6366f1',borderWidth:1,borderRadius:3,maxBarThickness:30},
    {type:'line',label:'中位数',data:have.map(b=>st[b].med),showLine:false,pointStyle:'rectRounded',
      pointRadius:7,pointBackgroundColor:'#0d9488',pointBorderColor:'#0d9488',pointHoverRadius:8},
    {type:'line',label:'极小值',data:have.map(b=>st[b].min),showLine:false,pointStyle:'circle',
      pointRadius:4,pointBackgroundColor:'#f59e0b',pointBorderColor:'#f59e0b'},
    {type:'line',label:'极大值',data:have.map(b=>st[b].max),showLine:false,pointStyle:'circle',
      pointRadius:4,pointBackgroundColor:'#ec4899',pointBorderColor:'#ec4899'}
  ];
  mk('cBox',{type:'bar',data:{labels:yLabels,datasets:ds},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:'top',labels:{boxWidth:12,font:{size:11}}},
      tooltip:{callbacks:{title:items=>yLabels[items[0].dataIndex],
        label:c=>{const b=have[c.dataIndex];const s=st[b];
          return c.datasetIndex===0?(' Q1 '+s.q1+' · Q3 '+s.q3+' · n '+s.n):(c.dataset.label+' '+c.formattedValue);}}}},
    scales:{x:{suggestedMin:30,suggestedMax:70,grid:{color:'#eef2f1'},title:{display:true,text:'T 分'}},y:{grid:{display:false}}}}});
}
function renderHeat(){
  const R=recs();
  const tests=DATA.test_agt, comps=DATA.comp_bases;
  const tLab=DATA.test_agt_labels||{}, cLab=DATA.comp_labels||{};
  const pairs={};
  for(const r of R){
    for(let i=0;i<tests.length;i++){
      const x=(r.tc||{})[tests[i]];
      if(x==null) continue;
      for(let j=0;j<comps.length;j++){
        const y=(r.sc||{})[comps[j]];
        if(y==null) continue;
        const k=i+'|'+j;
        if(!pairs[k]) pairs[k]=[];
        pairs[k].push([x,y]);
      }
    }
  }
  function pearson(p){
    const n=p.length; if(n<3) return null;
    let sx=0,sy=0; for(const[x,y]of p){sx+=x;sy+=y;}
    const mx=sx/n,my=sy/n;
    let num=0,dx=0,dy=0;
    for(const[x,y]of p){const a=x-mx,b=y-my;num+=a*b;dx+=a*a;dy+=b*b;}
    const den=Math.sqrt(dx*dy);
    return den?num/den:null;
  }
  function rColor(r){
    if(r==null) return 'background:#f5f5f5;color:#999';
    const a=Math.min(Math.abs(r),1);
    if(r>=0) return 'background:rgba(13,148,136,'+(0.12+a*0.78).toFixed(2)+');color:'+(a>0.55?'#fff':'#134e4a');
    return 'background:rgba(245,158,11,'+(0.12+a*0.78).toFixed(2)+');color:'+(a>0.55?'#fff':'#78350f');
  }
  let html='<table style="border-collapse:collapse;width:100%;min-width:720px;font-size:11px">';
  html+='<tr><td style="padding:4px 6px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;min-width:90px"></td>';
  for(let j=0;j<comps.length;j++){
    html+='<td style="padding:4px 6px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;text-align:center;white-space:nowrap">'+(cLab[comps[j]]||comps[j])+'</td>';
  }
  html+='</tr>';
  for(let i=0;i<tests.length;i++){
    html+='<tr><td style="padding:4px 6px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;white-space:nowrap">'+(tLab[tests[i]]||tests[i])+'</td>';
    for(let j=0;j<comps.length;j++){
      const p=pairs[i+'|'+j];
      const r=p?pearson(p):null;
      const txt=r!=null?r.toFixed(2):'\u2014';
      html+='<td style="padding:3px 5px;border:1px solid #e2e8f0;text-align:center;'+rColor(r)+'">'+txt+'</td>';
    }
    html+='</tr>';
  }
  html+='</table>';
  document.getElementById('heatGrid').innerHTML=html;
}
function renderLongi(){
  const R=recs();
  const m={};
  for(const r of R){
    const v=(r.sc||{})['Overall Comp'];
    if(v==null) continue;
    if(!m[r.file]) m[r.file]={};
    if(!m[r.file][r.pkey]) m[r.file][r.pkey]=[];
    m[r.file][r.pkey].push({d:r.date,v:v});
  }
  const files=Object.keys(m).sort();
  const labels=[],baseDs=[],lastDs=[],deltaDs=[],ns=[];
  for(const f of files){
    let bSum=0,lSum=0,n=0;
    for(const id of Object.keys(m[f])){
      const arr=m[f][id];
      if(arr.length<2) continue;
      arr.sort((a,b)=>a.d.localeCompare(b.d));
      bSum+=arr[0].v; lSum+=arr[arr.length-1].v; n++;
    }
    if(n===0) continue;
    const bm=bSum/n, lm=lSum/n;
    labels.push(f.replace(/\.xls[x]?$/i,''));
    baseDs.push(+bm.toFixed(1));
    lastDs.push(+lm.toFixed(1));
    deltaDs.push(+(lm-bm).toFixed(1));
    ns.push(n);
  }
  if(!labels.length){
    document.getElementById('cLongi').parentElement.innerHTML='<div class="muted" style="display:flex;align-items:center;justify-content:center;height:100%">无 \u22652 波配对数据</div>';
    return;
  }
  mk('cLongi',{type:'bar',data:{labels:labels,datasets:[
    {label:'基线均值',data:baseDs,backgroundColor:'rgba(99,102,241,.6)',borderColor:'#6366f1',borderWidth:1,borderRadius:3},
    {label:'末次均值',data:lastDs,backgroundColor:'rgba(13,148,136,.6)',borderColor:'#0d9488',borderWidth:1,borderRadius:3}
  ]},options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:'top',labels:{boxWidth:12,font:{size:11}}},
      tooltip:{callbacks:{afterBody:function(items){const i=items[0].dataIndex;return '\u0394 '+(deltaDs[i]>=0?'+':'')+deltaDs[i]+' \u00b7 n='+ns[i];}}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10},maxRotation:45}},y:{suggestedMin:30,suggestedMax:70,grid:{color:'#eef2f1'},title:{display:true,text:'综合 T 分'}}}}});
}
function domainAgg(list){
  const out={};
  for(const d of DOMAINS){
    const vals=[];
    for(const r of list){ const v=(r.sc||{})[d]; if(v!=null) vals.push(v); }
    out[d]=vals.length?{mean:vals.reduce((a,b)=>a+b,0)/vals.length,n:vals.length}:{mean:null,n:0};
  }
  return out;
}
function curSig(kind){ const s=DATA.sig; if(!s) return null; return ((s[ONLY?'formal':'all']||{})[kind])||null; }
function renderDomainCompare(id,groups,sig){
  const lab=b=>(DATA.comp_labels||{})[b]||b;
  const ds=groups.map(function(g){
    const agg=domainAgg(g.recs);
    return {label:g.label,data:DOMAINS.map(function(d){return agg[d].n?+agg[d].mean.toFixed(1):null;}),
      backgroundColor:g.color+'55',borderColor:g.color,borderWidth:1,_agg:agg};
  });
  const sigStars={id:'sigStars',afterDatasetsDraw:function(chart){
    if(!sig)return;
    const c=chart.ctx,x=chart.scales.x,y=chart.scales.y;
    c.save();c.font='bold 12px sans-serif';c.textAlign='center';c.fillStyle='#0f172a';
    chart.data.labels.forEach(function(lb,i){
      const st=sig[DOMAINS[i]];if(!st)return;
      const stars=st.p<0.001?'***':(st.p<0.01?'**':(st.p<0.05?'*':''));
      if(!stars)return;
      let top=-Infinity;
      chart.data.datasets.forEach(function(ds2){const v=ds2.data[i];if(v!=null&&v>top)top=v;});
      if(top===-Infinity)return;
      c.fillText(stars,x.getPixelForValue(i),Math.max(y.getPixelForValue(top)-9,y.top+11));
    });
    c.restore();
  }};
  mk(id,{type:'bar',data:{labels:DOMAINS.map(lab),datasets:ds},plugins:[sigStars],options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:'top',labels:{boxWidth:10,font:{size:10}}},
    tooltip:{callbacks:{
      label:function(ctx){
        const a=ctx.dataset._agg[DOMAINS[ctx.dataIndex]];
        return ctx.dataset.label+': '+(ctx.parsed.y==null?'—':ctx.parsed.y)+' (n='+a.n+')';
      },
      footer:function(items){
        const st=sig?sig[DOMAINS[items[0].dataIndex]]:null;
        if(!st)return '';
        const pstr=st.p<0.001?'p<.001':'p='+st.p.toFixed(3);
        return 'Kruskal-H='+st.H+'  '+pstr+'  η²='+(st.eta2==null?'—':st.eta2)+'  (N='+st.N+', k='+st.k+')';
      }
    }}},
    scales:{x:{grid:{display:false}},y:{grid:{color:'#eef2f1'},title:{display:true,text:'域 T 分均值'},suggestedMin:40,suggestedMax:60}}}});
}
function renderGenderDomain(){
  const R=recs();
  const g={Male:{label:'男 Male',color:'#0ea5e9',recs:[]},Female:{label:'女 Female',color:'#ec4899',recs:[]},Other:{label:'未标注',color:'#94a3b8',recs:[]}};
  for(const r of R){
    const k=(r.gender==='Male')?'Male':(r.gender==='Female')?'Female':'Other';
    g[k].recs.push(r);
  }
  renderDomainCompare('cGenderDomain',[g.Male,g.Female,g.Other].filter(x=>x.recs.length),curSig('gender'));
}
function renderDiagDomain(){
  const R=recs();
  const order=(DATA.diag_order||[]).slice();
  const g={};
  for(const d of order) g[d]={label:d,recs:[]};
  for(const r of R){
    const d=r.diag||'其他';
    if(!g[d]) g[d]={label:d,recs:[]};
    g[d].recs.push(r);
  }
  const groups=Object.values(g).filter(x=>x.recs.length).map(function(x,i){x.color=PALETTE[i%PALETTE.length];return x;});
  renderDomainCompare('cDiagDomain',groups,curSig('diag'));
}
function renderSigTable(){
  const el=document.getElementById('sigTbl');
  if(!el) return;
  const sig=DATA.sig?DATA.sig[ONLY?'formal':'all']:null;
  if(!sig){ el.innerHTML='<div class="muted">无显著性数据</div>'; return; }
  const pfmt=p=>p<0.001?'<.001':p.toFixed(3);
  const star=p=>p<0.001?'***':(p<0.01?'**':(p<0.05?'*':'ns'));
  const lab=b=>(DATA.comp_labels||{})[b]||b;
  let html='<table><thead><tr><th>认知域</th><th>诊断组间</th><th>p</th><th>η²</th><th>N</th><th>性别组间</th><th>p</th><th>η²</th><th>N</th></tr></thead><tbody>';
  for(const d of (DATA.comp_bases||[])){
    const a=(sig.diag||{})[d], b=(sig.gender||{})[d];
    html+='<tr><td>'+lab(d)+'</td>';
    html+=a?('<td>'+star(a.p)+'</td><td>'+pfmt(a.p)+'</td><td>'+(a.eta2==null?'—':a.eta2)+'</td><td>'+a.N+'</td>'):'<td colspan="4" class="muted">—</td>';
    html+=b?('<td>'+star(b.p)+'</td><td>'+pfmt(b.p)+'</td><td>'+(b.eta2==null?'—':b.eta2)+'</td><td>'+b.N+'</td>'):'<td colspan="4" class="muted">—</td>';
    html+='</tr>';
  }
  html+='</tbody></table>';
  el.innerHTML=html;
}
function renderPhase(){
  const R=recs(), m={};
  for(const r of R){ const p=r.phase||'基线/未标注'; m[p]=(m[p]||0)+1; }
  const rows=Object.entries(m).sort((a,b)=>b[1]-a[1]);
  const el=document.getElementById('phaseList');
  el.innerHTML=rows.map(([p,c])=>'<div class="phase-row"><span class="tag">'+esc(p)+'</span><span class="cnt">'+fmt(c)+' 场</span></div>').join('')||'<div class="muted">无数据</div>';
}
function renderRecent(){
  const R=recs().slice().sort((a,b)=>b.date.localeCompare(a.date)||b.file.localeCompare(a.file)).slice(0,12);
  const h='<thead><tr><th>日期</th><th>项目</th><th>ID</th><th>性别</th><th>阶段</th><th>测验</th></tr></thead><tbody>'+
    R.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(r.file.replace(/\.xls[x]?$/i,''))+'</td><td>'+esc(r.id)+'</td><td>'+esc(r.gender||'—')+'</td><td>'+esc(r.phase||'基线')+'</td><td class="muted">'+(r.tests||[]).length+'</td></tr>').join('')+'</tbody>';
  document.getElementById('recentTbl').innerHTML=h;
}
function renderTable(){
  const q=(document.getElementById('q').value||'').toLowerCase();
  const pf=document.getElementById('proj').value;
  const R=recs().filter(r=>(pf===''||r.file===pf)&&
    (q===''||((r.id+' '+r.name+' '+r.file).toLowerCase().indexOf(q)>-1)))
    .sort((a,b)=>b.date.localeCompare(a.date));
  const cap=400;
  document.getElementById('tblCount').textContent='共 '+R.length+' 条'+(R.length>cap?'（显示前 '+cap+' 条）':'');
  const rows=R.slice(0,cap);
const h='<thead><tr><th>日期</th><th>项目</th><th>ID</th><th>姓名</th><th>性别</th><th>年龄</th><th>阶段</th><th>主试</th><th>测验</th><th>个人报告</th></tr></thead><tbody>'+
           rows.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(r.file.replace(/\.xls[x]?$/i,''))+'</td><td>'+esc(r.id)+'</td><td>'+esc(r.name||'—')+'</td><td>'+esc(r.gender||'—')+'</td><td>'+fmt(r.age)+'</td><td>'+esc(r.phase||'基线')+'</td><td>'+esc(r.rater||'—')+'</td><td class="muted">'+(r.tests||[]).length+'</td><td><a href="person.html?person='+encodeURIComponent(r.pkey)+'" target="_blank">查看</a></td></tr>').join('')+'</tbody>';
  document.getElementById('detailTbl').innerHTML=h;
}
function renderFileTbl(){
  const names=Object.keys(DATA.files).sort((a,b)=>DATA.files[b].rows-DATA.files[a].rows);
const h='<thead><tr><th>文件</th><th>类型</th><th>测评场次</th><th>时间范围</th><th>独立分析</th></tr></thead><tbody>'+
           names.map(f=>{const o=DATA.files[f];return '<tr><td>'+esc(f)+'</td><td><span class="pill '+(o.test?'test':'formal')+'">'+(o.test?'测试':'正式')+'</span></td><td>'+fmt(o.rows)+'</td><td class="muted">'+(o.min?esc(o.min)+' ~ '+esc(o.max):'—')+'</td><td>'+(o.report?'<a href="'+o.report+'" target="_blank">查看</a>':'—')+'</td></tr>';}).join('')+'</tbody>';
  document.getElementById('fileTbl').innerHTML=h;
  document.getElementById('fcount').textContent=names.length;
  document.getElementById('rcount').textContent=fmt(DATA.records.length);
}

function init(){
  document.getElementById('gen').textContent=DATA.generated;
  const sel=document.getElementById('proj');
  Object.keys(DATA.files).sort().forEach(f=>{const o=document.createElement('option');o.value=f;o.textContent=f;sel.appendChild(o);});
  document.getElementById('modeSeg').addEventListener('click',e=>{
    if(e.target.tagName!=='BUTTON') return; MODE=e.target.dataset.m;
    document.querySelectorAll('#modeSeg button').forEach(b=>b.classList.toggle('on',b===e.target)); renderTime();
  });
  document.getElementById('onlyFormal').addEventListener('change',e=>{ONLY=e.target.checked;render();});
  document.getElementById('q').addEventListener('input',renderTable);
  document.getElementById('proj').addEventListener('change',renderTable);
  render();
}
document.addEventListener('DOMContentLoaded',init);
</script>
</body>
</html>
"""


def _report_slug(stem):
    """把文件名主干（去扩展名）转成安全的 report_<slug>.html 文件名。"""
    out = []
    for ch in stem:
        out.append(ch if (ch.isalnum() or "\u4e00" <= ch <= "\u9fff") else "_")
    return "report_" + "".join(out) + ".html"


# 复用主工作台 CSS（DRY：从 TEMPLATE 抽取），再补两个子页专用类
BASE_CSS = TEMPLATE[TEMPLATE.index("<style>") + len("<style>"):TEMPLATE.index("</style>")] + (
    "\n.kpi .v.sm{font-size:17px;line-height:1.4;word-break:break-all}"
    "\n.backlink{display:inline-block;background:rgba(255,255,255,.18);color:#fff;text-decoration:none;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:10px}"
    "\n.backlink:hover{background:rgba(255,255,255,.32)}"
    "\n.num{text-align:right;font-variant-numeric:tabular-nums}"
    "\n.prow .pid{font-weight:700;color:var(--teal-dark)}"
    "\n.prow .pname{font-weight:600}"
    "\n.prow .pn{font-weight:700}"
    "\n.kpis.k8{grid-template-columns:repeat(4,1fr)}"
    "\n@media(max-width:980px){.kpis.k8{grid-template-columns:repeat(2,1fr)}}"
    "\n@media(max-width:620px){.kpis.k8{grid-template-columns:repeat(1,1fr)}}"
    "\n.up{color:#0d9488;font-weight:700}"
    "\n.dn{color:#f43f5e;font-weight:700}"
    "\n.fl{color:var(--muted);font-weight:700}"
)


# ----------------------------- per-file 独立报告模板 -----------------------------
FILE_TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>项目独立分析</title>
<script>@@CHARTJS@@</script>
<style>@@CSS@@</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <a class="backlink" href="../mccb_dashboard.html">← 返回总览</a>
      <h1 id="fhead">项目独立分析</h1>
      <div class="sub"><span id="fdiag"></span> · <span id="ftype"></span></div>
    </div>
    <div class="hd-right"><div class="upd">更新于 <span id="gen"></span></div></div>
  </header>

  <div class="kpis k8" id="kpis"></div>

  <div class="bar">
    <div class="seg" id="modeSeg">
      <button data-m="day">日</button>
      <button data-m="week">周</button>
      <button data-m="month" class="on">月</button>
      <button data-m="year">年</button>
    </div>
    <div class="muted" id="tsCaption" style="font-size:13px"></div>
  </div>

  <div class="grid g-12">
    <div class="card">
      <h3><span class="dot"></span>测评量趋势</h3>
      <div class="hint">按所选粒度统计的测评场次（柱）与受试者数（线）</div>
      <div class="chart-box" style="height:320px"><canvas id="cTrend"></canvas></div>
    </div>
  </div>

  <div class="grid g-2">
    <div class="card">
      <h3><span class="dot" style="background:var(--sky)"></span>受试者性别分布</h3>
      <div class="hint">按测评场次计</div>
      <div class="chart-box" style="height:280px"><canvas id="cGender"></canvas></div>
    </div>
    <div class="card">
      <h3><span class="dot" style="background:var(--amber)"></span>核心测验完成量</h3>
      <div class="hint">9 项核心测验累计完成次数（悬停看占全部场次比例）</div>
      <div class="chart-box" style="height:280px"><canvas id="cTests"></canvas></div>
    </div>
  </div>

  <div class="grid g-23">
    <div class="card">
      <h3><span class="dot" style="background:var(--indigo)"></span>年龄分布</h3>
      <div class="hint">按开始年龄分组</div>
      <div class="chart-box" style="height:280px"><canvas id="cAge"></canvas></div>
    </div>
    <div class="card">
      <h3><span class="dot" style="background:#84cc16"></span>累计测评场次（按年-月）</h3>
      <div class="hint">随时间累积的总工作量</div>
      <div class="chart-box" style="height:280px"><canvas id="cCum"></canvas></div>
    </div>
  </div>

  <div class="grid g-2">
    <div class="card">
      <h3><span class="dot"></span>认知域平均表现</h3>
      <div class="hint">7 认知域 T 分均值（常模≈50）</div>
      <div class="chart-box" style="height:330px"><canvas id="cRadar"></canvas></div>
    </div>
    <div class="card">
      <h3><span class="dot" style="background:var(--sky)"></span>测评阶段 / 波次</h3>
      <div class="hint">Assessment 字段分布（1/2/3… 或空=基线）</div>
      <div id="phaseList"></div>
    </div>
  </div>

  <div class="grid g-12">
    <div class="card">
      <h3><span class="dot" style="background:var(--indigo)"></span>各域综合分分布</h3>
      <div class="hint">每个认知域的 T 分分布：箱体=四分位距，中线=中位，端点=极小/极大</div>
      <div class="chart-box" style="height:300px"><canvas id="cBox"></canvas></div>
    </div>
  </div>

  <div class="grid g-12">
    <div class="card">
      <h3><span class="dot" style="background:var(--indigo)"></span>测验 × 综合分相关热图</h3>
      <div class="hint">9 项测验 T 分 × 9 综合分 T 分的 Pearson 相关系数（本项目，r∈[-1,1]；青=正相关，橙=负相关）</div>
      <div id="heatGrid" style="overflow-x:auto"></div>
    </div>
  </div>

  <div class="grid g-12">
    <div class="card">
      <h3><span class="dot"></span>纵向干预：基线 vs 末次综合分</h3>
      <div class="hint">同一受试者 ≥2 波：首次（基线）与最近一次 Overall Comp T 分均值</div>
      <div id="longiChips" class="screen-sum"></div>
      <div class="chart-box" style="height:260px"><canvas id="cLongi"></canvas></div>
    </div>
  </div>

  <div class="grid g-2">
    <div class="card">
      <h3><span class="dot" style="background:#f59e0b"></span>本项目 vs 健康对照</h3>
      <div class="hint">7 认知域 T 分均值对比（tooltip 显示 n 与 Kruskal-Wallis 检验）</div>
      <div class="chart-box" style="height:300px"><canvas id="cVSHC"></canvas></div>
    </div>
    <div class="card">
      <h3><span class="dot" style="background:#0ea5e9"></span>性别 × 认知域</h3>
      <div class="hint">7 认知域 T 分均值（本项目内；tooltip 显示 n 与 Kruskal-Wallis 检验）</div>
      <div class="chart-box" style="height:300px"><canvas id="cGenderDomain"></canvas></div>
    </div>
  </div>

  <div class="grid g-12">
    <div class="card">
      <h3><span class="dot" style="background:var(--indigo)"></span>组间差异 · Kruskal-Wallis 显著性</h3>
      <div class="hint">每域 H 检验（非参数）· * p&lt;.05 &nbsp;** p&lt;.01 &nbsp;*** p&lt;.001，ns=不显著 · η²=epsilon-squared 效应量</div>
      <div style="overflow-x:auto"><table id="sigTbl"></table></div>
    </div>
  </div>

  <div class="grid g-12">
    <div class="card">
      <h3><span class="dot"></span>测评明细</h3>
      <div class="hint">本项目全部测评记录（倒序，可按 ID / 姓名搜索；「报告」深链单人轨迹）</div>
      <div class="controls">
        <input type="text" id="dq" placeholder="搜索 ID / 姓名…">
        <span class="count" id="dcount"></span>
      </div>
      <div class="twrap"><table id="detailTbl"></table></div>
    </div>
  </div>

  <footer>数据来源：本项目 .xls 测评导出 · 参照组=健康对照（health control.xls） · MCCB 工作台生成</footer>
</div>
<script>
(function(){
const DATA=@@DATA@@;
const META=DATA.meta, R=DATA.records;
const CORE=DATA.core_tests, COMP=DATA.comp_bases, CLAB=DATA.comp_labels;
const DOMAINS=COMP.filter(b=>b.indexOf('Comp')<0);
const PALETTE=['#0d9488','#0ea5e9','#6366f1','#f59e0b','#ec4899','#84cc16','#14b8a6','#f97316','#8b5cf6'];
const charts={};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=v=>(v==null?'—':(Number.isInteger(v)?v:Math.round(v*10)/10));
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const mk=(id,opt)=>{const el=document.getElementById(id);if(!el)return null;if(charts[id])charts[id].destroy();charts[id]=new Chart(el,opt);return charts[id];};
document.getElementById('gen').textContent=META.generated;
document.getElementById('fhead').textContent=META.name.replace(/\.xls[x]?$/i,'')+' · 独立分析';
document.getElementById('fdiag').textContent=META.diag;
document.getElementById('ftype').textContent=META.test?'测试数据':'正式数据';
const ids=new Set(R.map(r=>r.pkey)).size;
const dates=R.map(r=>r.date).sort();
const span=dates.length?dates[0]+' ~ '+dates[dates.length-1]:'—';
const ages=R.map(r=>r.age).filter(a=>a!=null);
const ageRange=ages.length?Math.min.apply(null,ages)+' ~ '+Math.max.apply(null,ages)+' 岁':'—';
const ntests=R.reduce((s,r)=>s+(r.tests||[]).length,0);
let MODE='month';
let last30=0;
if(R.length){const mx=R.map(r=>r.date).sort().pop();const ref=new Date(mx+'T00:00:00');ref.setDate(ref.getDate()-29);const lo=ref.toISOString().slice(0,10);last30=R.filter(r=>r.date>=lo&&r.date<=mx).length;}
function bucket(dstr,mode){
  if(mode==='day') return dstr;
  if(mode==='month') return dstr.slice(0,7);
  if(mode==='year') return dstr.slice(0,4);
  const d=new Date(dstr+'T00:00:00');
  const t=new Date(d);t.setDate(t.getDate()+3-((t.getDay()+6)%7));
  const w1=new Date(t.getFullYear(),0,4);
  const wk=1+Math.round(((t-w1)/86400000-3+((w1.getDay()+6)%7))/7);
  return t.getFullYear()+'-W'+String(wk).padStart(2,'0');
}
function bucketLabel(k,mode){
  if(mode!=='week') return k;
  const y=+k.slice(0,4),wk=+k.slice(5);
  const jan4=new Date(y,0,4),day=(jan4.getDay()||7);
  const mon=new Date(jan4);mon.setDate(4-day+(wk-1)*7);
  return (mon.getMonth()+1)+'/'+mon.getDate();
}
function timeSeries(mode){
  const m={};
  for(const r of R){
    const k=bucket(r.date,mode);
    if(!m[k])m[k]={n:0,ids:new Set()};
    m[k].n++;m[k].ids.add(r.pkey);
  }
  const keys=Object.keys(m).sort();
  return {keys:keys,labels:keys.map(k=>bucketLabel(k,mode)),sessions:keys.map(k=>m[k].n),subjects:keys.map(k=>m[k].ids.size)};
}
function longiStats(){
  const m={};
  R.forEach(r=>{const v=(r.sc||{})['Overall Comp'];if(v==null)return;(m[r.pkey]=m[r.pkey]||[]).push({d:r.date,v:v});});
  let bSum=0,lSum=0,n=0;
  Object.keys(m).forEach(id=>{const a=m[id];if(a.length<2)return;a.sort((x,y)=>x.d.localeCompare(y.d));bSum+=a[0].v;lSum+=a[a.length-1].v;n++;});
  if(!n)return null;
  return {n:n,bm:Math.round(bSum/n*10)/10,lm:Math.round(lSum/n*10)/10};
}
function renderKPIs(){
  const ls=longiStats();
  document.getElementById('kpis').innerHTML=
    '<div class="kpi"><div class="k">测评场次</div><div class="v">'+R.length+'</div><div class="s">次测评记录</div></div>'+
    '<div class="kpi"><div class="k">受试者数</div><div class="v">'+ids+'</div><div class="s">去重 Respondent ID</div></div>'+
    '<div class="kpi"><div class="k">核心测验完成</div><div class="v">'+ntests+'</div><div class="s">9 项核心累计</div></div>'+
    '<div class="kpi"><div class="k">时间跨度</div><div class="v sm">'+esc(span)+'</div><div class="s">首末次测评</div></div>'+
    '<div class="kpi"><div class="k">年龄范围</div><div class="v sm">'+esc(ageRange)+'</div><div class="s">受试者年龄</div></div>'+
    '<div class="kpi"><div class="k">诊断分组</div><div class="v sm">'+esc(META.diag)+'</div><div class="s">按文件名推断</div></div>'+
    '<div class="kpi"><div class="k">近 30 天场次</div><div class="v">'+last30+'</div><div class="s">相对本项目最新日期</div></div>'+
    '<div class="kpi"><div class="k">≥2 波配对受试者</div><div class="v">'+(ls?ls.n:0)+'</div><div class="s">可对比基线 vs 末次</div></div>';
}
function renderTrend(){
  const ts=timeSeries(MODE);
  document.getElementById('tsCaption').textContent='当前粒度：'+({day:'按日',week:'按周',month:'按月',year:'按年'})[MODE]+' · '+ts.keys.length+' 个区间';
  mk('cTrend',{type:'bar',data:{labels:ts.labels,datasets:[
    {type:'bar',label:'测评场次',data:ts.sessions,backgroundColor:'#0d9488',yAxisID:'y',order:2,borderRadius:4,maxBarThickness:46},
    {type:'line',label:'受试者数',data:ts.subjects,borderColor:'#f59e0b',backgroundColor:'#f59e0b',yAxisID:'y1',tension:.3,spanGaps:true,pointRadius:ts.labels.length>60?0:2,borderWidth:2,order:1}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{position:'top'},tooltip:{callbacks:{title:items=>ts.keys[items[0].dataIndex]}}},
    scales:{x:{grid:{display:false},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:24}},
      y:{beginAtZero:true,title:{display:true,text:'场次'},grid:{color:'#eef2f1'},ticks:{precision:0}},
      y1:{beginAtZero:true,position:'right',title:{display:true,text:'受试者'},grid:{display:false},ticks:{precision:0}}}}});
}
function renderGender(){
  const g={Male:0,Female:0,Other:0};
  R.forEach(r=>{g[(r.gender==='Male')?'Male':(r.gender==='Female')?'Female':'Other']++;});
  const labels=['男 Male','女 Female','未标注'],data=[g.Male,g.Female,g.Other];
  mk('cGender',{type:'doughnut',data:{labels:labels,datasets:[{data:data,backgroundColor:['#0ea5e9','#ec4899','#cbd5e1'],borderWidth:0}]},
    options:{maintainAspectRatio:false,cutout:'58%',plugins:{legend:{position:'right'},
      tooltip:{callbacks:{label:c=>c.label+': '+c.parsed+' 场 ('+Math.round(c.parsed/(R.length||1)*100)+'%)'}}}}});
}
function renderTests(){
  const ct={};CORE.forEach(t=>ct[t]=0);
  R.forEach(r=>(r.tests||[]).forEach(t=>{if(ct[t]!=null)ct[t]++;}));
  const total=R.length||1;
  const rows=Object.keys(ct).map(k=>({k:k,n:ct[k],pct:Math.round(ct[k]/total*100)})).sort((a,b)=>b.n-a.n);
  mk('cTests',{type:'bar',data:{labels:rows.map(r=>r.k),datasets:[{label:'完成次数',data:rows.map(r=>r.n),backgroundColor:rows.map((r,i)=>PALETTE[i%PALETTE.length])}]},
    options:{indexAxis:'y',maintainAspectRatio:false,plugins:{legend:{display:false},
      tooltip:{callbacks:{label:c=>c.parsed.x+' 次 · 占 '+(rows[c.dataIndex].pct)+'%'}}},
      scales:{x:{beginAtZero:true,ticks:{precision:0}}}}});
}
function renderAge(){
  const bins=[['<18',0,18],['18-24',18,24],['25-29',25,29],['30-34',30,34],['35-39',35,39],['40-49',40,49],['≥50',50,999]];
  const out=bins.map(b=>({l:b[0],n:0}));
  R.forEach(r=>{if(r.age==null)return;for(let i=0;i<bins.length;i++)if(r.age>=bins[i][1]&&r.age<bins[i][2]){out[i].n++;break;}});
  mk('cAge',{type:'bar',data:{labels:out.map(o=>o.l),datasets:[{label:'测评·次',data:out.map(o=>o.n),backgroundColor:'#6366f1',borderRadius:5,maxBarThickness:52}]},
    options:{maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'#eef2f1'},ticks:{precision:0}}}}});
}
function renderCum(){
  const m={};R.forEach(r=>{const k=r.date.slice(0,7);m[k]=(m[k]||0)+1;});
  const keys=Object.keys(m).sort();let acc=0;
  const data=keys.map(k=>{acc+=m[k];return acc;});
  mk('cCum',{type:'line',data:{labels:keys,datasets:[{label:'累计场次',data:data,borderColor:'#84cc16',backgroundColor:'rgba(132,204,22,.15)',fill:true,tension:.3,pointRadius:keys.length>60?0:2,borderWidth:2.5}]},
    options:{maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{grid:{display:false},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:18}},y:{beginAtZero:true,grid:{color:'#eef2f1'}}}}});
}
function renderRadar(){
  const doms=DOMAINS.map(d=>{
    const v=R.map(r=>(r.sc||{})[d]).filter(x=>x!=null);
    return v.length?mean(v):null;
  });
  mk('cRadar',{type:'radar',data:{labels:DOMAINS.map(d=>CLAB[d]||d),datasets:[{label:'域均值 T 分',data:doms,
    backgroundColor:'rgba(13,148,136,.18)',borderColor:'#0d9488',pointBackgroundColor:'#0d9488',borderWidth:2}]},
    options:{maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{r:{suggestedMin:40,suggestedMax:70,ticks:{stepSize:10,backdropColor:'transparent'}}}}});
}
function renderPhase(){
  const m={};
  R.forEach(r=>{const p=r.phase||'基线/未标注';m[p]=(m[p]||0)+1;});
  const rows=Object.entries(m).sort((a,b)=>b[1]-a[1]);
  document.getElementById('phaseList').innerHTML=rows.map(p=>'<div class="phase-row"><span class="tag">'+esc(p[0])+'</span><span class="cnt">'+p[1]+' 场</span></div>').join('')||'<div class="muted">无数据</div>';
}
function q(sorted,p){
  const n=sorted.length;if(n===1)return sorted[0];
  const idx=(n-1)*p,lo=Math.floor(idx),hi=Math.ceil(idx);
  if(lo===hi)return sorted[lo];
  return sorted[lo]+(sorted[hi]-sorted[lo])*(idx-lo);
}
function domainStats(rows){
  const out={};
  for(const b of DOMAINS){
    const vals=rows.map(r=>(r.sc||{})[b]).filter(v=>v!=null);
    if(!vals.length){out[b]=null;continue;}
    vals.sort((a,c)=>a-c);
    out[b]={min:vals[0],max:vals[vals.length-1],n:vals.length,q1:q(vals,.25),med:q(vals,.5),q3:q(vals,.75),mean:vals.reduce((a,c)=>a+c,0)/vals.length};
  }
  return out;
}
function renderBox(){
  const st=domainStats(R);
  const have=DOMAINS.filter(b=>st[b]);
  if(!have.length){document.getElementById('cBox').parentElement.innerHTML='<div class="muted" style="display:flex;align-items:center;justify-content:center;height:100%">无综合分数据</div>';return;}
  const yLabels=have.map(b=>CLAB[b]||b);
  const ds=[
    {type:'bar',label:'四分位距 (Q1–Q3)',data:have.map(b=>[st[b].q1,st[b].q3]),
      backgroundColor:'rgba(99,102,241,.25)',borderColor:'#6366f1',borderWidth:1,borderRadius:3,maxBarThickness:30},
    {type:'line',label:'中位数',data:have.map(b=>st[b].med),showLine:false,pointStyle:'rectRounded',
      pointRadius:7,pointBackgroundColor:'#0d9488',pointBorderColor:'#0d9488',pointHoverRadius:8},
    {type:'line',label:'极小值',data:have.map(b=>st[b].min),showLine:false,pointStyle:'circle',
      pointRadius:4,pointBackgroundColor:'#f59e0b',pointBorderColor:'#f59e0b'},
    {type:'line',label:'极大值',data:have.map(b=>st[b].max),showLine:false,pointStyle:'circle',
      pointRadius:4,pointBackgroundColor:'#ec4899',pointBorderColor:'#ec4899'}
  ];
  mk('cBox',{type:'bar',data:{labels:yLabels,datasets:ds},options:{indexAxis:'y',maintainAspectRatio:false,
    plugins:{legend:{position:'top',labels:{boxWidth:12,font:{size:11}}},
      tooltip:{callbacks:{title:items=>yLabels[items[0].dataIndex],
        label:c=>{const b=have[c.dataIndex];const s=st[b];
          return c.datasetIndex===0?(' Q1 '+s.q1+' · Q3 '+s.q3+' · n '+s.n):(c.dataset.label+' '+c.formattedValue);}}}},
    scales:{x:{suggestedMin:30,suggestedMax:70,grid:{color:'#eef2f1'},title:{display:true,text:'T 分'}},y:{grid:{display:false}}}}});
}
function renderHeat(){
  const tests=DATA.test_agt||[],comps=COMP;
  const tLab=DATA.test_agt_labels||{},cLab=CLAB;
  const pairs={};
  for(const r of R){
    for(let i=0;i<tests.length;i++){
      const x=(r.tc||{})[tests[i]];
      if(x==null)continue;
      for(let j=0;j<comps.length;j++){
        const y=(r.sc||{})[comps[j]];
        if(y==null)continue;
        const k=i+'|'+j;
        if(!pairs[k])pairs[k]=[];
        pairs[k].push([x,y]);
      }
    }
  }
  function pearson(p){
    const n=p.length;if(n<3)return null;
    let sx=0,sy=0;for(const[x,y]of p){sx+=x;sy+=y;}
    const mx=sx/n,my=sy/n;
    let num=0,dx=0,dy=0;
    for(const[x,y]of p){const a=x-mx,b=y-my;num+=a*b;dx+=a*a;dy+=b*b;}
    const den=Math.sqrt(dx*dy);
    return den?num/den:null;
  }
  function rColor(r){
    if(r==null)return 'background:#f5f5f5;color:#999';
    const a=Math.min(Math.abs(r),1);
    if(r>=0)return 'background:rgba(13,148,136,'+(0.12+a*0.78).toFixed(2)+');color:'+(a>0.55?'#fff':'#134e4a');
    return 'background:rgba(245,158,11,'+(0.12+a*0.78).toFixed(2)+');color:'+(a>0.55?'#fff':'#78350f');
  }
  let html='<table style="border-collapse:collapse;width:100%;min-width:720px;font-size:11px">';
  html+='<tr><td style="padding:4px 6px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;min-width:90px"></td>';
  for(let j=0;j<comps.length;j++){
    html+='<td style="padding:4px 6px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;text-align:center;white-space:nowrap">'+(cLab[comps[j]]||comps[j])+'</td>';
  }
  html+='</tr>';
  for(let i=0;i<tests.length;i++){
    html+='<tr><td style="padding:4px 6px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;white-space:nowrap">'+(tLab[tests[i]]||tests[i])+'</td>';
    for(let j=0;j<comps.length;j++){
      const p=pairs[i+'|'+j];
      const r=p?pearson(p):null;
      const txt=r!=null?r.toFixed(2):'\u2014';
      html+='<td style="padding:3px 5px;border:1px solid #e2e8f0;text-align:center;'+rColor(r)+'">'+txt+'</td>';
    }
    html+='</tr>';
  }
  html+='</table>';
  document.getElementById('heatGrid').innerHTML=html;
}
function renderLongi(){
  const ls=longiStats();
  const box=document.getElementById('cLongi').parentElement;
  if(!ls){box.innerHTML='<div class="muted" style="display:flex;align-items:center;justify-content:center;height:100%">无 \u22652 波配对数据</div>';return;}
  const dl=Math.round((ls.lm-ls.bm)*10)/10;
  document.getElementById('longiChips').innerHTML=
    '<span class="chip c1">配对人数 <b>'+ls.n+'</b></span>'+
    '<span class="chip '+(dl>=0?'c1':'c3')+'">Δ 综合 T <b>'+(dl>=0?'+':'')+dl+'</b></span>'+
    '<span class="chip">基线 <b>'+ls.bm+'</b> → 末次 <b>'+ls.lm+'</b></span>';
  mk('cLongi',{type:'bar',data:{labels:['基线均值（首次）','末次均值（最近）'],datasets:[{label:'综合 T 分均值',data:[ls.bm,ls.lm],
    backgroundColor:['rgba(99,102,241,.6)','rgba(13,148,136,.6)'],borderColor:['#6366f1','#0d9488'],borderWidth:1,borderRadius:3,maxBarThickness:64}]},
    options:{maintainAspectRatio:false,plugins:{legend:{display:false},
      tooltip:{callbacks:{footer:items=>'Δ '+(dl>=0?'+':'')+dl+' · n='+ls.n}}},
      scales:{x:{grid:{display:false}},y:{suggestedMin:30,suggestedMax:70,grid:{color:'#eef2f1'},title:{display:true,text:'综合 T 分'}}}}});
}
function domainAgg(list){
  const out={};
  for(const d of DOMAINS){
    const vals=[];
    for(const r of list){const v=(r.sc||{})[d];if(v!=null)vals.push(v);}
    out[d]=vals.length?{mean:vals.reduce((a,b)=>a+b,0)/vals.length,n:vals.length}:{mean:null,n:0};
  }
  return out;
}
function renderDomainCompare(id,groups,sig){
  const lab=b=>(CLAB)[b]||b;
  const ds=groups.map(function(g){
    const agg=domainAgg(g.recs);
    return {label:g.label,data:DOMAINS.map(function(d){return agg[d].n?+agg[d].mean.toFixed(1):null;}),
      backgroundColor:g.color+'55',borderColor:g.color,borderWidth:1,_agg:agg};
  });
  const sigStars={id:'sigStars',afterDatasetsDraw:function(chart){
    if(!sig)return;
    const c=chart.ctx,x=chart.scales.x,y=chart.scales.y;
    c.save();c.font='bold 12px sans-serif';c.textAlign='center';c.fillStyle='#0f172a';
    chart.data.labels.forEach(function(lb,i){
      const st=sig[DOMAINS[i]];if(!st)return;
      const stars=st.p<0.001?'***':(st.p<0.01?'**':(st.p<0.05?'*':''));
      if(!stars)return;
      let top=-Infinity;
      chart.data.datasets.forEach(function(ds2){const v=ds2.data[i];if(v!=null&&v>top)top=v;});
      if(top===-Infinity)return;
      c.fillText(stars,x.getPixelForValue(i),Math.max(y.getPixelForValue(top)-9,y.top+11));
    });
    c.restore();
  }};
  mk(id,{type:'bar',data:{labels:DOMAINS.map(lab),datasets:ds},plugins:[sigStars],options:{maintainAspectRatio:false,
    plugins:{legend:{position:'top',labels:{boxWidth:10,font:{size:10}}},
    tooltip:{callbacks:{
      label:function(ctx){
        const a=ctx.dataset._agg[DOMAINS[ctx.dataIndex]];
        return ctx.dataset.label+': '+(ctx.parsed.y==null?'—':ctx.parsed.y)+' (n='+a.n+')';
      },
      footer:function(items){
        const st=sig?sig[DOMAINS[items[0].dataIndex]]:null;
        if(!st)return '';
        const pstr=st.p<0.001?'p<.001':'p='+st.p.toFixed(3);
        return 'Kruskal-H='+st.H+'  '+pstr+'  η²='+(st.eta2==null?'—':st.eta2)+'  (N='+st.N+', k='+st.k+')';
      }
    }}},
    scales:{x:{grid:{display:false}},y:{grid:{color:'#eef2f1'},title:{display:true,text:'域 T 分均值'},suggestedMin:40,suggestedMax:60}}}});
}
function renderVSHC(){
  const ref=DATA.ref_records||[];
  if(!ref.length){
    document.getElementById('cVSHC').parentElement.innerHTML='<div class="muted" style="display:flex;align-items:center;justify-content:center;height:100%">本项目即健康对照参照组，无对照可比</div>';
    return;
  }
  renderDomainCompare('cVSHC',[
    {label:'本项目',color:'#0d9488',recs:R},
    {label:'健康对照',color:'#94a3b8',recs:ref}
  ],(DATA.sig&&DATA.sig.vsHC)||null);
}
function renderGenderDomain(){
  const g={Male:{label:'男 Male',color:'#0ea5e9',recs:[]},Female:{label:'女 Female',color:'#ec4899',recs:[]},Other:{label:'未标注',color:'#94a3b8',recs:[]}};
  R.forEach(r=>{const k=(r.gender==='Male')?'Male':(r.gender==='Female')?'Female':'Other';g[k].recs.push(r);});
  renderDomainCompare('cGenderDomain',[g.Male,g.Female,g.Other].filter(x=>x.recs.length),(DATA.sig&&DATA.sig.gender)||null);
}
function renderSigTable(){
  const el=document.getElementById('sigTbl');
  const sig=DATA.sig||{};
  const vs=sig.vsHC||{},gs=sig.gender||{};
  const pfmt=p=>p<0.001?'<.001':p.toFixed(3);
  const star=p=>p<0.001?'***':(p<0.01?'**':(p<0.05?'*':'ns'));
  let html='<table><thead><tr><th>认知域</th><th>vs 健康对照</th><th>p</th><th>η²</th><th>N</th><th>组内性别</th><th>p</th><th>η²</th><th>N</th></tr></thead><tbody>';
  for(const d of COMP){
    const a=vs[d],b=gs[d];
    html+='<tr><td>'+(CLAB[d]||d)+'</td>';
    if(a){html+='<td>'+star(a.p)+'</td><td>'+pfmt(a.p)+'</td><td>'+(a.eta2==null?'—':a.eta2)+'</td><td>'+a.N+'</td>';}
    else{html+=(META.diag==='健康对照')?'<td colspan="4" class="muted">—（本项目即参照组）</td>':'<td colspan="4" class="muted">—</td>';}
    if(b){html+='<td>'+star(b.p)+'</td><td>'+pfmt(b.p)+'</td><td>'+(b.eta2==null?'—':b.eta2)+'</td><td>'+b.N+'</td>';}
    else{html+='<td colspan="4" class="muted">—</td>';}
    html+='</tr>';
  }
  html+='</tbody></table>';
  el.innerHTML=html;
}
function renderDetail(){
  const qstr=(document.getElementById('dq').value||'').toLowerCase();
  const rows=R.filter(r=>qstr===''||((r.id+' '+(r.name||'')).toLowerCase().indexOf(qstr)>-1))
    .sort((a,b)=>b.date.localeCompare(a.date));
  document.getElementById('dcount').textContent='共 '+rows.length+' 条';
  const h='<thead><tr><th>日期</th><th>ID</th><th>姓名</th><th>性别</th><th>年龄</th><th>阶段</th><th>主试</th><th>测验</th><th>报告</th></tr></thead><tbody>'+
    rows.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(r.id)+'</td><td>'+esc(r.name||'—')+'</td><td>'+esc(r.gender||'—')+'</td><td>'+fmt(r.age)+'</td><td>'+esc(r.phase||'基线')+'</td><td>'+esc(r.rater||'—')+'</td><td class="muted">'+(r.tests||[]).length+'</td><td><a href="../person.html?person='+encodeURIComponent(r.pkey)+'" target="_blank">查看</a></td></tr>').join('')+'</tbody>';
  document.getElementById('detailTbl').innerHTML=h;
}
document.getElementById('modeSeg').addEventListener('click',e=>{
  if(e.target.tagName!=='BUTTON')return;MODE=e.target.dataset.m;
  document.querySelectorAll('#modeSeg button').forEach(b=>b.classList.toggle('on',b===e.target));renderTrend();
});
document.getElementById('dq').addEventListener('input',renderDetail);
renderKPIs();renderTrend();renderGender();renderTests();renderAge();renderCum();
renderRadar();renderPhase();renderBox();renderHeat();renderLongi();
renderVSHC();renderGenderDomain();renderSigTable();renderDetail();
})();
</script>
</body>
</html>
"""


# ----------------------------- per-person 报告模板 -----------------------------
PERSON_TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>个人认知报告</title>
<script>@@CHARTJS@@</script>
<style>@@CSS@@
/* ---- person.html 试次跳转扩展样式（仅本页，不动共享 BASE_CSS） ---- */
.vbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:13px 18px}
.vbar .vt{font-size:13.5px;font-weight:750;color:var(--teal-dark)}
.vbar .vhint{font-size:12px;color:var(--muted)}
.vchips{display:flex;gap:8px;flex-wrap:wrap;flex:1}
.vchip{border:1px solid var(--line);background:#fff;border-radius:20px;padding:6px 13px;font-size:12.5px;font-weight:600;color:var(--muted);cursor:pointer;transition:.15s;font-variant-numeric:tabular-nums}
.vchip:hover{border-color:var(--teal);color:var(--teal-dark)}
.vchip.on{background:var(--teal);border-color:var(--teal);color:#fff;box-shadow:var(--shadow)}
.tgl{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);cursor:pointer;user-select:none;margin-left:auto}
.tgl input{accent-color:var(--teal);cursor:pointer}
.tcell{text-align:center;font-weight:750;font-variant-numeric:tabular-nums}
.tcell.ok{background:var(--teal-100);color:var(--teal-dark)}
.tcell.mild{background:#fffbeb;color:#b45309}
.tcell.severe{background:#fff1f2;color:#be123c}
.tcell.na{color:var(--muted);font-weight:400}
.pillst{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11.5px;font-weight:700;border:1px solid transparent}
.pillst.ok{background:var(--teal-soft);color:var(--teal-dark);border-color:var(--teal-soft)}
.pillst.mild{background:#fffbeb;color:#d97706;border-color:#fde68a}
.pillst.severe{background:#fff1f2;color:#be123c;border-color:#fecdd3}
.pillst.na{background:#f9fafb;color:var(--muted);border-color:var(--line)}
.curmark{display:inline-block;background:var(--teal);color:#fff;font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:6px}
/* 通俗解读（患者/家属可读） */
.plain{background:linear-gradient(135deg,#f0fdfa 0%,#ffffff 60%)}
.pb{display:flex;gap:9px;align-items:flex-start;padding:8px 0;font-size:13.5px;line-height:1.65;border-bottom:1px dashed var(--line)}
.pb b{font-variant-numeric:tabular-nums}
.pdot{width:8px;height:8px;border-radius:50%;margin-top:7px;flex:none}
.pd-ok{background:var(--teal)}
.pd-warn{background:var(--amber)}
.pd-mute{background:#94a3b8}
.pdisc{margin-top:10px;font-size:12px;color:var(--muted);line-height:1.65}
.psub{margin-top:13px;font-size:13px;font-weight:750;color:var(--teal-dark);display:flex;align-items:center;gap:7px}
.psub:first-child{margin-top:0}
.psub::before{content:'';width:3px;height:13px;border-radius:2px;background:var(--teal);flex:none}
.pd{display:flex;flex-wrap:wrap;gap:2px 10px;align-items:baseline;padding:7px 0;border-bottom:1px dashed var(--line);font-size:13px;line-height:1.6}
.pd .dn{font-weight:700;color:#1f2937;white-space:nowrap}
.pd .dt{margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.pd .dt.lo{color:#be123c}
.pd .dt.md{color:#d97706}
.pd .dt.ok{color:var(--teal-dark)}
.pd .dd{flex-basis:100%;color:var(--muted);font-size:12.5px}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <a class="backlink" href="mccb_dashboard.html">← 返回总览</a>
      <h1 id="headTitle">个人认知报告</h1>
      <div class="sub" id="headSub"></div>
    </div>
    <div class="hd-right"><div class="upd">更新于 <span id="gen"></span></div></div>
  </header>
  <div id="app"></div>
  <footer>数据来源：本目录 .xls 测评导出 · MCCB 工作台生成 · 深链 ?person=文件|id 可带 ?visit=all|序号|原始ID 定位具体访视</footer>
</div>
<script>
(function(){
const DATA=@@DATA@@;
const R=DATA.records;
const COMP=DATA.comp_bases, CLAB=DATA.comp_labels;
const CORE=DATA.core_tests;
const DOMAINS=COMP.filter(b=>b.indexOf('Comp')<0);
const PALETTE=['#0d9488','#0ea5e9','#6366f1','#f59e0b','#ec4899','#84cc16','#f43f5e'];
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=v=>(v==null?'—':(Number.isInteger(v)?v:Math.round(v*10)/10));
const mk=(id,opt)=>{const el=document.getElementById(id);if(!el)return;return new Chart(el,opt);};
document.getElementById('gen').textContent=DATA.generated;
function persons(){
  const m={};
  R.forEach(r=>{const k=r.pkey;
    const p=m[k]||(m[k]={key:k,id:r.pid||r.id,name:r.name,gender:r.gender,age:r.age,diag:r.diag,file:r.file,n:0,first:r.date,last:r.date,records:[]});
    p.n++;p.records.push(r);
    if(r.name&&/[\u4e00-\u9fff]/.test(r.name)&&!/[一-龥]/.test(p.name))p.name=r.name;
    if(r.date<p.first)p.first=r.date;
    if(r.date>p.last)p.last=r.date;
  });
  return Object.values(m).sort((a,b)=>b.n-a.n||a.key.localeCompare(b.key));
}
function renderIndex(list){
  document.getElementById('headTitle').textContent='个人认知报告 · 全员索引';
  document.getElementById('headSub').textContent='共 '+list.length+' 名受试者 · 点击「报告」查看纵向轨迹';
  document.getElementById('app').innerHTML=
    '<div class="controls"><input id="pq" placeholder="按 ID / 姓名 / 项目搜索…"><span class="count" id="pcount"></span></div>'+
    '<div class="card"><div class="twrap" id="pidx"></div></div>';
  const cap=500;
  function draw(){
    const q=(document.getElementById('pq').value||'').toLowerCase();
    const R2=list.filter(p=>(q===''||((p.id+' '+(p.name||'')+' '+(p.file||'')).toLowerCase().indexOf(q)>-1)));
    document.getElementById('pcount').textContent='共 '+R2.length+' 人'+(R2.length>cap?'（显示前 '+cap+' 人）':'');
    const rows=R2.slice(0,cap);
    const h='<table><thead><tr><th>ID</th><th>姓名</th><th>性别</th><th>年龄</th><th>项目</th><th>诊断</th><th>测评次数</th><th>时间跨度</th><th>报告</th></tr></thead><tbody>'+
      rows.map(p=>'<tr class="prow"><td class="pid">'+esc(p.id)+'</td><td class="pname">'+esc(p.name||'—')+'</td><td>'+esc(p.gender||'—')+'</td><td>'+fmt(p.age)+'</td><td class="muted">'+esc(p.file.replace(/\.xls[x]?$/i,''))+'</td><td>'+esc(p.diag||'—')+'</td><td class="pn">'+p.n+'</td><td class="muted">'+esc(p.first)+' ~ '+esc(p.last)+'</td><td><a href="person.html?person='+encodeURIComponent(p.key)+'" target="_blank">查看</a></td></tr>').join('')+'</tbody></table>';
    document.getElementById('pidx').innerHTML=h;
  }
  document.getElementById('pq').addEventListener('input',draw);
  draw();
}
function latestScore(recs,base){
  for(let i=recs.length-1;i>=0;i--){const sc=recs[i].sc||{};if(sc[base]!=null)return sc[base];}
  return null;
}
function meanProfile(recs){
  const m={};
  COMP.forEach(b=>{const vals=recs.map(r=>(r.sc||{})[b]).filter(v=>v!=null);m[b]=vals.length?Math.round(vals.reduce((s,v)=>s+v,0)/vals.length*10)/10:null;});
  return m;
}
function groupProfile(diag){
  const acc={};const pers={};let nrec=0;
  R.forEach(r=>{
    if(r.diag!==diag)return;
    nrec++;pers[r.pkey]=1;
    const sc=r.sc||{};
    COMP.forEach(b=>{if(sc[b]!=null){(acc[b]=acc[b]||[]).push(sc[b]);}});
  });
  const out={};
  COMP.forEach(b=>{const a=acc[b];out[b]=a&&a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length*10)/10:null;});
  out.__nrec=nrec;out.__npers=Object.keys(pers).length;
  return out;
}
function tierOf(t){
  return t==null?{lv:'lv-na',tier:'缺失',sd:'无数据'}:
    (t<30?{lv:'lv-severe',tier:'显著偏低',sd:((t-50)/10).toFixed(1)+' SD'}:
    (t<40?{lv:'lv-mild',tier:'轻度偏低',sd:((t-50)/10).toFixed(1)+' SD'}:
    {lv:'lv-ok',tier:'正常',sd:((t-50)/10).toFixed(1)+' SD'}));
}
function visitStatus(sc){
  const vs=COMP.map(b=>sc[b]).filter(v=>v!=null);
  if(!vs.length)return{lv:'na',txt:'数据不足',rank:-1};
  if(vs.some(v=>v<30))return{lv:'severe',txt:'显著受损',rank:2};
  if(vs.some(v=>v<40))return{lv:'mild',txt:'轻度受损',rank:1};
  return{lv:'ok',txt:'正常',rank:0};
}
function renderPerson(p){
  const recs=p.records.slice().sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id)));
  const ntests=recs.reduce((s,r)=>s+(r.tests||[]).length,0);
  const stem=p.file.replace(/\.xls[x]?$/i,'');
  const lastDate=recs.length?recs[recs.length-1].date:'—';
  const gp=groupProfile(p.diag);
  const multi=recs.length>=2;
  // ---- 试次跳转状态：'all'=多访视均值 | 0..n-1=单次访视（默认最近一次）；?visit=all|序号|原始ID 可预置 ----
  let sel=multi?(recs.length-1):'all';
  const spv=new URLSearchParams(location.search).get('visit');
  if(multi&&spv!=null){
    if(spv==='all')sel='all';
    else if(/^\d+$/.test(spv)){const i=+spv;if(i>=0&&i<recs.length)sel=i;}
    else{const i=recs.findIndex(r=>String(r.id)===spv);if(i>=0)sel=i;}
  }
  document.getElementById('headTitle').textContent='个人认知报告 · '+(p.name||'—')+'（'+p.id+'）';
  document.getElementById('headSub').textContent=(p.diag||'—')+' · 项目 '+stem+' · 最近测评 '+lastDate+(multi?(' · 共 '+recs.length+' 次访视'):'');
  document.getElementById('app').innerHTML=
    '<div class="kpis k8">'+
      '<div class="kpi"><div class="k">测评次数</div><div class="v">'+recs.length+'</div><div class="s">累计测评场次</div></div>'+
      '<div class="kpi"><div class="k">时间跨度</div><div class="v sm">'+esc(p.first)+' ~ '+esc(p.last)+'</div><div class="s">首末次测评</div></div>'+
      '<div class="kpi"><div class="k">累计测验</div><div class="v">'+ntests+'</div><div class="s">9 项核心完成</div></div>'+
      '<div class="kpi"><div class="k" id="kDateL">当前访视</div><div class="v sm" id="kDate">—</div><div class="s" id="kDateS">访视日期</div></div>'+
      '<div class="kpi"><div class="k" id="kOCL">综合 T（当前访视）</div><div class="v" id="kOC">—</div><div class="s">Overall Composite</div></div>'+
      '<div class="kpi"><div class="k" id="kNCL">神经认知 T（当前访视）</div><div class="v" id="kNC">—</div><div class="s">Neurocognitive Composite</div></div>'+
      '<div class="kpi"><div class="k">性别</div><div class="v">'+esc(p.gender||'—')+'</div><div class="s">受试者</div></div>'+
      '<div class="kpi"><div class="k">同组规模</div><div class="v">'+(gp.__npers||0)+'</div><div class="s">'+esc(p.diag||'其他')+' 组人数</div></div>'+
    '</div>'+
    (multi?('<div class="card vbar"><span class="vt">访视切换</span><span class="vhint">共 '+recs.length+' 次访视 · 点击切换下方判读口径（KPI / 通俗解读 / 筛查 / 雷达 / 差值 / 对标）</span><span class="vchips" id="pVisChips"></span></div>'):'')+
    '<div class="card plain"><h3><span class="dot"></span>通俗解读（患者/家属）</h3><div class="hint">判定口径：<span id="pPlainScope"></span> · T 分：50 = 同龄平均，40–60 常见参考区间</div><div id="pPlain"></div></div>'+
    '<div class="card"><h3><span class="dot"></span>认知损害筛查（临床 T 分标准）</h3><div class="hint">判定口径：<span id="pScopeTag"></span> · T≥40 正常 · 30≤T&lt;40 轻度偏低 · T&lt;30 显著偏低（MCCB 惯用受损界值）</div><div id="pScreenSum"></div><div class="screen" id="pScreen"></div></div>'+
    '<div class="grid g-2">'+
      '<div class="card"><h3><span class="dot"></span>认知域剖面（基准 T=50）</h3><div class="hint">7 认知域，虚线为同诊断组均值</div><div class="chart-box" style="height:340px"><canvas id="cRadar"></canvas></div></div>'+
      '<div class="card"><h3><span class="dot"></span>与同组差值（本人 − 同组均值）</h3><div class="hint">正值（青）高于同组，负值（玫红）低于同组</div><div class="chart-box" style="height:340px"><canvas id="cBench"></canvas></div></div>'+
    '</div>'+
    '<div class="card"><h3><span class="dot"></span>认知域对标（本人 vs 同诊断组均值）</h3><div class="hint">7 认知域 + 2 综合分；|差值|≥1.5 标记高/低，否则持平</div><div class="twrap" id="pbench"></div></div>'+
    (multi?('<div class="card"><h3><span class="dot"></span>损害筛查轨迹（跨访视三档状态）</h3><div class="hint">每次访视 9 综合分按 T&lt;40 轻度 / T&lt;30 显著 分档着色 · 总体状态=该次访视最严重档位 · 「变化」相对上一次访视</div><div class="twrap" id="ptraj"></div></div>'):'')+
    '<div class="grid g-12"><div class="card"><h3><span class="dot"></span>认知域纵向轨迹（T 分）<label class="tgl"><input type="checkbox" id="cLongiGrp" checked><span>同组均值参考线</span></label></h3><div class="hint">各认知域随测评时间的变化，缺失时段自动跳过；虚线=同组均值参考'+(multi?'，竖虚线=当前选中访视':'')+'</div><div class="chart-box" style="height:360px"><canvas id="cLongi"></canvas></div></div></div>'+
    '<div class="card"><h3><span class="dot"></span>逐次测评明细</h3><div class="hint">每次测评的 7 认知域 T 分与完成情况'+(multi?'（「当前」=选中访视）':'')+'</div><div class="twrap" id="pdet"></div></div>';
  // 口径剖面：'all'=多访视均值 | 数字=单次访视
  function scopeMP(s){return s==='all'?meanProfile(recs):Object.assign({},(recs[s]||{}).sc||{});}
  // ---- 3 张图只建一次，切访视走数据更新（避免 canvas 重建/闪烁）----
  // 注意：图必须用真实数据创建——实测 Chart.js 在创建同一 tick 内同步 update('none') 时
  // bar 元素不渲染（轴更新了但柱条缺失）；故初始数据直接取当前口径，update 仅用于后续点击切换
  const dlab=DOMAINS.map(d=>CLAB[d]||d);
  const mp0=scopeMP(sel);
  const rlab0=(sel==='all')?('本人（'+(multi?'多访视均值':'均值')+'）'):'本人（当前访视）';
  const radarChart=mk('cRadar',{type:'radar',data:{labels:dlab,datasets:[
    {label:rlab0,data:DOMAINS.map(d=>mp0[d]),borderColor:'#0d9488',backgroundColor:'rgba(13,148,136,.18)',pointBackgroundColor:'#0d9488'},
    {label:'同组（'+esc(p.diag||'其他')+' '+(gp.__npers||0)+' 人）',data:DOMAINS.map(d=>gp[d]),borderColor:'#94a3b8',borderDash:[5,4],backgroundColor:'rgba(148,163,184,.10)',pointBackgroundColor:'#94a3b8'}
  ]},options:{maintainAspectRatio:false,scales:{r:{min:35,max:65,ticks:{stepSize:5},pointLabels:{font:{size:12}}}},plugins:{legend:{position:'top'}}}});
  const bval0=DOMAINS.map(d=>{const pm=mp0[d],gm=gp[d];return (pm!=null&&gm!=null)?Math.round((pm-gm)*10)/10:null;});
  const bcol0=bval0.map(v=>v==null?'#e5e7eb':(v>=0?'#0d9488':'#f43f5e'));
  const benchChart=mk('cBench',{type:'bar',data:{labels:dlab,datasets:[{label:'与同组差值（T）',data:bval0,backgroundColor:bcol0,borderRadius:4}]},options:{maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{title:{display:true,text:'差值（本人 − 同组）'}}}}});
  const dsP=DOMAINS.map((d,i)=>({
    label:CLAB[d]||d,
    data:recs.map(r=>(r.sc||{})[d]!=null?(r.sc||{})[d]:null),
    borderColor:PALETTE[i%PALETTE.length],
    backgroundColor:PALETTE[i%PALETTE.length],
    tension:.3,spanGaps:true,
    pointRadius:recs.map((r,i2)=>(multi&&sel!=='all'&&i2===sel)?5:3),
    pointHoverRadius:6
  }));
  const dsG=DOMAINS.map((d,i)=>{
    if(gp[d]==null)return null;
    return{label:'同组均值 · '+(CLAB[d]||d),data:recs.map(r=>gp[d]),
      borderColor:PALETTE[i%PALETTE.length]+'59',backgroundColor:PALETTE[i%PALETTE.length]+'59',
      borderDash:[6,5],borderWidth:1.4,pointRadius:0,pointHoverRadius:0,tension:0,groupMean:true};
  }).filter(Boolean);
  const selLine={
    id:'selLine',
    afterDatasetsDraw(chart){
      const s=chart.$sel;
      if(s==null||!chart.scales||!chart.scales.x||!chart.chartArea)return;
      const x=chart.scales.x.getPixelForValue(s);
      const area=chart.chartArea,ctx=chart.ctx;
      ctx.save();
      ctx.strokeStyle='rgba(15,118,110,.7)';
      ctx.setLineDash([5,4]);
      ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(x,area.top);ctx.lineTo(x,area.bottom);ctx.stroke();
      ctx.restore();
    }
  };
  const longiChart=mk('cLongi',{type:'line',data:{labels:recs.map(r=>r.date),datasets:dsP.concat(dsG)},options:{maintainAspectRatio:false,
    plugins:{legend:{position:'top'}},scales:{y:{suggestedMin:40,suggestedMax:70,title:{display:true,text:'T 分'}}}},plugins:[selLine]});
  if(longiChart&&typeof longiChart.update==='function'){
    longiChart.$sel=(multi&&sel!=='all')?sel:null;
    longiChart.update('none');
  }
  const grpBox=document.getElementById('cLongiGrp');
  if(grpBox)grpBox.addEventListener('change',function(){
    if(!longiChart||!longiChart.data||typeof longiChart.update!=='function')return;
    const on=this.checked;
    longiChart.data.datasets.forEach(d=>{if(d.groupMean)d.hidden=!on;});
    longiChart.update();
  });
  // ---- 损害筛查轨迹表（静态，只画一次）----
  function drawTraj(){
    let tr='<table><thead><tr><th>日期</th><th>ID</th>'+COMP.map(b=>'<th>'+(CLAB[b]||b)+'</th>').join('')+'<th>域受损</th><th>综合受损</th><th>显著</th><th>总体状态</th><th>变化</th></tr></thead><tbody>';
    let prevRank=null;
    recs.forEach(r=>{
      const sc=r.sc||{};
      const cells=COMP.map(b=>{
        const v=sc[b];
        if(v==null)return '<td class="tcell na">—</td>';
        const cls=v<30?'severe':(v<40?'mild':'ok');
        return '<td class="tcell '+cls+'">'+fmt(v)+'</td>';
      }).join('');
      const domImp=DOMAINS.filter(d=>sc[d]!=null&&sc[d]<40).length;
      const compImp=COMP.filter(b=>b.indexOf('Comp')>=0&&sc[b]!=null&&sc[b]<40).length;
      const sevN=COMP.filter(b=>sc[b]!=null&&sc[b]<30).length;
      const st=visitStatus(sc);
      let chg='<span class="muted">—</span>';
      if(prevRank!=null&&st.rank>=0){
        if(st.rank>prevRank)chg='<span class="dn">↑ 加重</span>';
        else if(st.rank<prevRank)chg='<span class="up">↓ 改善</span>';
        else chg='<span class="fl">— 持平</span>';
      }
      if(st.rank>=0)prevRank=st.rank;
      tr+='<tr><td>'+esc(r.date)+'</td><td>'+esc(r.id)+'</td>'+cells+'<td class="num">'+domImp+'/7</td><td class="num">'+compImp+'/2</td><td class="num">'+sevN+'</td><td><span class="pillst '+st.lv+'">'+st.txt+'</span></td><td>'+chg+'</td></tr>';
    });
    document.getElementById('ptraj').innerHTML=tr+'</tbody></table>';
  }
  if(multi)drawTraj();
  // ---- 逐次测评明细（高亮当前访视；行首保持 <tr><td> 以兼容冒烟断言）----
  function drawDetail(){
    const cols=DOMAINS;
    const h='<table><thead><tr><th>日期</th><th>ID</th><th>阶段</th><th>主试</th><th>测验</th><th>完成</th>'+cols.map(c=>'<th>'+(CLAB[c]||c)+'</th>').join('')+'</tr></thead><tbody>'+
      recs.map((r,i)=>{
        const sc=r.sc||{};
        const isSel=(multi&&sel!=='all'&&i===sel);
        return '<tr><td>'+esc(r.date)+(isSel?' <span class="curmark">当前</span>':'')+'</td><td>'+esc(r.id)+'</td><td>'+esc(r.phase||'基线')+'</td><td>'+esc(r.rater||'—')+'</td><td class="muted">'+(r.tests||[]).length+'</td><td class="muted">'+r.comp+'</td>'+cols.map(c=>'<td class="num">'+fmt(sc[c])+'</td>').join('')+'</tr>';
      }).join('')+'</tbody></table>';
    document.getElementById('pdet').innerHTML=h;
  }
  // ---- 通俗解读（患者/家属可读；措辞温和、不下诊断结论）----
  // 7 个认知域的日常含义（MCCB/MATRICS 标准通俗释义）
  const PLAINDOM={
    'SoP':'您做简单、熟悉的任务时有多快、多准，比如打字速度、反应快慢',
    'AV':'长时间保持警觉、注意任务，并及时注意到重要信号的能力，比如开车时注意到红绿灯',
    'WM':'把信息在脑中短暂记住并边用边处理的能力，比如刚听到的电话号码边记边拨、购物时心算找零',
    'Vrbl Lrng':'学习和记住词语、名字、口头指示等语言信息的能力',
    'Vis Lrng':'学习和记住看到的东西（形状、图案、图片、布局）的能力',
    'RPS':'推理新问题、做决定、规划步骤的能力，比如安排一次出行、想出新问题的解决办法',
    'SC':'从面部表情、语气和情境中理解他人情绪与社会情境的能力，即读懂他人'
  };
  function plainTier(t){
    if(t<30)return '明显偏低';
    if(t<40)return '轻度偏低';
    if(t<45)return '略低（仍在正常参考内）';
    if(t<55)return '平均水平';
    if(t<60)return '略高';
    return '明显偏高';
  }
  function plainBullets(mp,s){
    const allMode=(s==='all');
    const out=[];
    const psub=t=>'<div class="psub">'+t+'</div>';
    // ① 总体评定
    out.push(psub('① 总体评定'));
    const ov=mp['Overall Comp'];
    if(ov==null){
      out.push('<div class="pb"><span class="pdot pd-mute"></span>本口径缺少总体综合分，请参照下方各认知域的分数。</div>');
    }else{
      let lvl;
      if(ov<30)lvl='明显低于同龄平均水平（参考值 50 分），属于明显偏低区间（30 分以下）';
      else if(ov<40)lvl='低于同龄平均水平（参考值 50 分），属于轻度偏低区间（30–40 分）';
      else if(ov<45)lvl='略低于同龄平均水平（参考值 50 分），但仍在正常参考范围（40 分以上）';
      else if(ov<55)lvl='处于同龄平均水平（参考值 50 分）';
      else if(ov<60)lvl='略高于同龄平均水平（参考值 50 分）';
      else lvl='明显高于同龄平均水平（参考值 50 分）';
      let grp='';
      const gm=gp['Overall Comp'];
      if(gm!=null){
        const d=Math.round((ov-gm)*10)/10;
        grp=' 与同诊断组（'+(gp.__npers||0)+' 人）相比，您'+(d>=1.5?'高于组内平均水平。':(d<=-1.5?'低于组内平均水平。':'与组内平均水平大体相当。'));
      }
      const tail=ov<40?' 单项分数可能受睡眠、情绪等临时因素影响，复看时可与医生留意这一点。':'';
      out.push('<div class="pb"><span class="pdot '+(ov<40?'pd-warn':'pd-ok')+'"></span>您的总体认知水平为 <b>'+fmt(ov)+' 分</b>（'+lvl+'）。'+grp+tail+'</div>');
    }
    // ② 各认知域是什么 + 当前水平
    out.push(psub('② 七个认知域：各管什么，您目前的水平'));
    DOMAINS.forEach(d=>{
      const t=mp[d];
      const cls=(t==null)?'md':(t<40?'lo':(t<45?'md':'ok'));
      out.push('<div class="pd"><span class="dn">'+(CLAB[d]||d)+'</span><span class="dt '+cls+'">'+(t==null?'未测':(fmt(t)+' 分 · '+plainTier(t)))+'</span><span class="dd">'+(PLAINDOM[d]||'')+'</span></div>');
    });
    // ③ 强项与需要留意
    out.push(psub('③ 强项与需要留意'));
    const doms=DOMAINS.map(d=>({d:d,t:mp[d]})).filter(x=>x.t!=null).sort((a,b)=>b.t-a.t);
    const strong=doms.filter(x=>x.t>=55);
    const okDom=doms.filter(x=>x.t>=50);
    if(strong.length){
      out.push('<div class="pb"><span class="pdot pd-ok"></span>相对强项：'+strong.slice(0,2).map(x=>(CLAB[x.d]||x.d)+' '+fmt(x.t)+' 分').join('、')+'，明显高于同龄平均水平，是您的优势所在。</div>');
    }else if(okDom.length){
      out.push('<div class="pb"><span class="pdot pd-ok"></span>相对强项：'+okDom.slice(0,2).map(x=>(CLAB[x.d]||x.d)+' '+fmt(x.t)+' 分').join('、')+'，达到或接近同龄平均水平。</div>');
    }
    const warn=doms.filter(x=>x.t<40).sort((a,b)=>a.t-b.t);
    if(warn.length){
      out.push('<div class="pb"><span class="pdot pd-warn"></span>需要多留意：'+warn.map(x=>(CLAB[x.d]||x.d)+' '+fmt(x.t)+' 分').join('、')+'，低于正常参考下限（40 分）。建议与医生结合日常生活表现一起评估，经过针对性训练后常可见改善。</div>');
    }else{
      out.push('<div class="pb"><span class="pdot pd-ok"></span>各认知域均未低于关注线（40 分），整体表现良好。</div>');
    }
    // ④ 历次变化解读
    out.push(psub('④ 历次变化'));
    if(multi){
      const n=recs.length;
      const fv=(recs[0].sc||{})['Overall Comp'],lvv=(recs[n-1].sc||{})['Overall Comp'];
      if(fv!=null&&lvv!=null){
        const delta=Math.round((lvv-fv)*10)/10;
        if(delta>=3)out.push('<div class="pb"><span class="pdot pd-ok"></span>总体：从首次到最近一次测评，总体认知分从 '+fmt(fv)+' 分升到 '+fmt(lvv)+' 分（提升 '+delta+' 分），呈改善趋势，请继续保持当前的生活与治疗方案。</div>');
        else if(delta<=-3)out.push('<div class="pb"><span class="pdot pd-warn"></span>总体：从首次到最近一次测评，总体认知分从 '+fmt(fv)+' 分降到 '+fmt(lvv)+' 分（下降 '+Math.abs(delta)+' 分），呈下降趋势，请复诊时带上这份报告与医生讨论。</div>');
        else out.push('<div class="pb"><span class="pdot pd-mute"></span>总体：总体认知分从首次到最近一次基本稳定（'+fmt(fv)+' → '+fmt(lvv)+' 分），未见明显变化。</div>');
      }else{
        out.push('<div class="pb"><span class="pdot pd-mute"></span>总体：首次或最近一次测评缺少总体综合分，仅能按各域比较。</div>');
      }
      const up=[],down=[];let stay=0,miss=0;
      DOMAINS.forEach(d=>{
        const a=(recs[0].sc||{})[d],b=(recs[n-1].sc||{})[d];
        if(a==null||b==null){miss++;return;}
        const dd=Math.round((b-a)*10)/10;
        if(dd>=3)up.push((CLAB[d]||d)+'（'+fmt(a)+' → '+fmt(b)+'）');
        else if(dd<=-3)down.push((CLAB[d]||d)+'（'+fmt(a)+' → '+fmt(b)+'）');
        else stay++;
      });
      if(up.length)out.push('<div class="pb"><span class="pdot pd-ok"></span>与首次相比，以下认知域<b>有进步</b>（提高 3 分及以上）：'+up.join('、')+'。</div>');
      if(down.length)out.push('<div class="pb"><span class="pdot pd-warn"></span>与首次相比，以下认知域<b>有所下降</b>（降低 3 分及以上）：'+down.join('、')+'。</div>');
      if(!up.length&&!down.length&&stay)out.push('<div class="pb"><span class="pdot pd-mute"></span>与首次相比，各认知域变化都不大（均在 3 分以内）。</div>');
      if(miss)out.push('<div class="pb"><span class="pdot pd-mute"></span>注：有 '+miss+' 个认知域在首次或最近一次测评中缺分，未纳入比较。</div>');
      if(n>=3){
        const a1=(recs[n-2].sc||{})['Overall Comp'],a2=(recs[n-1].sc||{})['Overall Comp'];
        if(a1!=null&&a2!=null){
          const dd=Math.round((a2-a1)*10)/10;
          if(dd>=3)out.push('<div class="pb"><span class="pdot pd-ok"></span>与上一次相比（最近两次）：总体分提高 '+dd+' 分（'+fmt(a1)+' → '+fmt(a2)+'），近期呈改善趋势。</div>');
          else if(dd<=-3)out.push('<div class="pb"><span class="pdot pd-warn"></span>与上一次相比（最近两次）：总体分下降 '+Math.abs(dd)+' 分（'+fmt(a1)+' → '+fmt(a2)+'），近期呈下降趋势，请复诊时与医生讨论。</div>');
          else out.push('<div class="pb"><span class="pdot pd-mute"></span>与上一次相比（最近两次）：总体分基本平稳（'+fmt(a1)+' → '+fmt(a2)+'）。</div>');
        }
      }
      out.push('<div class="pb"><span class="pdot pd-mute"></span>注：重复测评时，部分人会因熟悉测验而分数略有提高（「练习效应」），请结合总体趋势与日常生活表现理解变化。</div>');
    }else{
      out.push('<div class="pb"><span class="pdot pd-mute"></span>这是您第一次测评；后续再测评后，可与本次结果对比，看到变化趋势。</div>');
    }
    // ⑤ 说明与免责声明
    out.push(psub('⑤ 说明与免责声明'));
    if(!allMode){
      const rNow=recs[s];
      if(rNow&&rNow.comp<9)out.push('<div class="pb"><span class="pdot pd-mute"></span>本次测评完成 9 项核心测验中的 '+rNow.comp+' 项，相关域的解读仅供参考。</div>');
    }
    const missDom=DOMAINS.filter(d=>mp[d]==null);
    if(missDom.length)out.push('<div class="pb"><span class="pdot pd-mute"></span>当前口径未测出以下认知域的 T 分：'+missDom.map(d=>(CLAB[d]||d)).join('、')+'，相关部分仅按已完成内容解读。</div>');
    out.push('<div class="pdisc">T 分说明：T 分是按年龄校正后的分数，同龄人平均 50 分、标准差 10 分，40–60 分是常见参考区间。分数波动：同一人不同次测评分数可能相差数分，也可能受当天状态、睡眠、情绪、用药等临时因素影响，单次波动不代表真实水平变化；重复测评还可能因熟悉测验而略有提高（练习效应）。本解读由测评数据自动生成，仅供参考，不构成诊断或治疗建议；报告中「强项/留意」是相对同龄人的比较，不等同于对日常能力的判断。如报告与日常生活表现不符，或有任何疑问，请咨询主治医师。</div>');
    return out.join('');
  }
  // ---- 访视 chips（按当前 sel 高亮）----
  const chipsEl=document.getElementById('pVisChips');
  function chipHtml(){
    let h='<button class="vchip'+(sel==='all'?' on':'')+'" data-v="all" title="以全部访视均值判读下方区块">总览 · 多访视均值</button>';
    h+=recs.map((r,i)=>{
      let suf='';
      if(p.id&&String(r.id).indexOf(p.id)===0)suf=String(r.id).slice(p.id.length);
      const lab=(suf?('V'+suf.replace(/^[-Vv]/,'')):('第'+(i+1)+'次'))+' · '+r.date;
      return '<button class="vchip'+(sel===i?' on':'')+'" data-v="'+i+'" title="'+esc(r.id)+(r.phase?(' · 阶段 '+esc(r.phase)):'')+'">'+esc(lab)+'</button>';
    }).join('');
    return h;
  }
  if(multi&&chipsEl){
    chipsEl.addEventListener('click',function(e){
      const t=(e&&e.target&&e.target.closest)?e.target.closest('.vchip'):null;
      if(!t)return;
      const v=t.getAttribute('data-v');
      setSel(v==='all'?'all':(+v));
    });
  }
  // ---- 把选中访视套用到全部动态区块 ----
  function applyScope(s){
    sel=s;
    const allMode=(s==='all');
    const mp=scopeMP(s);
    const kDateL=document.getElementById('kDateL'),kDate=document.getElementById('kDate'),kDateS=document.getElementById('kDateS');
    const kOCL=document.getElementById('kOCL'),kNCL=document.getElementById('kNCL');
    if(allMode){
      kDateL.textContent='最近测评';kDate.textContent=lastDate;kDateS.textContent='日期';
      const lab=multi?'多访视均值':'本次测评';
      kOCL.textContent='综合 T（'+lab+'）';kNCL.textContent='神经认知 T（'+lab+'）';
    }else{
      const r=recs[s];
      kDateL.textContent='当前访视';kDate.textContent=r.date;kDateS.textContent=String(r.id);
      kOCL.textContent='综合 T（当前访视）';kNCL.textContent='神经认知 T（当前访视）';
    }
    document.getElementById('kOC').textContent=fmt(mp['Overall Comp']);
    document.getElementById('kNC').textContent=fmt(mp['Neurocog Comp']);
    if(multi&&chipsEl)chipsEl.innerHTML=chipHtml();
    const plainScopeTxt=allMode?(multi?('多访视均值（'+recs.length+' 次）'):'单次访视'):(recs[s].date+'（'+String(recs[s].id)+'）');
    document.getElementById('pScopeTag').textContent=plainScopeTxt;
    document.getElementById('pPlainScope').textContent=plainScopeTxt;
    document.getElementById('pPlain').innerHTML=plainBullets(mp,s);
    const sCells=COMP.map(b=>{const t=mp[b],o=tierOf(t);return '<div class="screen-cell '+o.lv+'"><div class="lbl">'+(CLAB[b]||b)+'</div><div class="tval">'+(t==null?'—':fmt(t))+'</div><div class="tier">'+o.tier+'</div><div class="sd">'+o.sd+'</div></div>';}).join('');
    document.getElementById('pScreen').innerHTML=sCells;
    const domImp=DOMAINS.filter(d=>mp[d]!=null&&mp[d]<40).length;
    const compImp=COMP.filter(b=>b.indexOf('Comp')>=0&&mp[b]!=null&&mp[b]<40).length;
    const sevN=COMP.filter(b=>mp[b]!=null&&mp[b]<30).length;
    document.getElementById('pScreenSum').innerHTML='<div class="screen-sum"><span class="chip c1">认知域受损 <b>'+domImp+'/7</b></span><span class="chip c2">综合分受损 <b>'+compImp+'/2</b></span><span class="chip c3">显著受损 (T&lt;30) <b>'+sevN+' 项</b></span></div>';
    if(radarChart&&radarChart.data&&typeof radarChart.update==='function'){
      radarChart.data.datasets[0].label=allMode?('本人（'+(multi?'多访视均值':'均值')+'）'):'本人（当前访视）';
      radarChart.data.datasets[0].data=DOMAINS.map(d=>mp[d]);
      radarChart.update('none');
    }
    const bval=DOMAINS.map(d=>{const pm=mp[d],gm=gp[d];return (pm!=null&&gm!=null)?Math.round((pm-gm)*10)/10:null;});
    const bcol=bval.map(v=>v==null?'#e5e7eb':(v>=0?'#0d9488':'#f43f5e'));
    if(benchChart&&benchChart.data&&typeof benchChart.update==='function'){
      benchChart.data.datasets[0].data=bval;
      benchChart.data.datasets[0].backgroundColor=bcol;
      benchChart.update('none');
    }
    const brow=COMP.map(b=>{
      const pm=mp[b],gm=gp[b];const diff=(pm!=null&&gm!=null)?Math.round((pm-gm)*10)/10:null;
      let cls='fl',txt='持平';
      if(diff!=null){if(diff>=1.5){cls='up';txt='高于同组';}else if(diff<=-1.5){cls='dn';txt='低于同组';}}
      return '<tr><td>'+(CLAB[b]||b)+'</td><td class="num">'+fmt(pm)+'</td><td class="num">'+fmt(gm)+'</td><td class="num '+cls+'">'+(diff==null?'—':(diff>0?'+':'')+diff)+'</td><td class="'+cls+'">'+txt+'</td></tr>';
    }).join('');
    document.getElementById('pbench').innerHTML='<table><thead><tr><th>认知域</th><th>本人</th><th>同组均值</th><th>差值</th><th>解读</th></tr></thead><tbody>'+brow+'</tbody></table>';
    if(longiChart&&typeof longiChart.update==='function'){
      longiChart.$sel=(multi&&!allMode)?s:null;
      if(longiChart.data)longiChart.data.datasets.forEach(d=>{if(!d.groupMean)d.pointRadius=recs.map((r,i2)=>(multi&&!allMode&&i2===s)?5:3);});
      longiChart.update('none');
    }
    drawDetail();
    try{
      if(typeof history!=='undefined'&&history&&typeof history.replaceState==='function'){
        const sp2=new URLSearchParams(location.search);
        if(allMode)sp2.delete('visit');else sp2.set('visit',String(s));
        const qs=sp2.toString();
        history.replaceState(null,'',location.pathname+(qs?'?'+qs:''));
      }
    }catch(err){}
  }
  function setSel(s){
    if(!multi)s='all';
    if(typeof s==='number'&&(s<0||s>=recs.length))s='all';
    applyScope(s);
  }
  applyScope(sel);
}
function init(){
  const sp=new URLSearchParams(location.search);
  const key=sp.get('person');
  const all=persons();
  if(key){
    const p=all.find(x=>x.key===key);
    if(p){renderPerson(p);return;}
  }
  renderIndex(all);
}
document.addEventListener('DOMContentLoaded',init);
})();
</script>
</body>
</html>
"""


def _emit(tpl, chartjs, data, path):
    """把 CHARTJS / CSS / DATA 注入模板并写出一个自包含 HTML。"""
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    html = (tpl.replace("@@CSS@@", BASE_CSS)
            .replace("@@CHARTJS@@", chartjs)
            .replace("@@DATA@@", payload))
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)


def main():
    records, files = build_records()
    with open(CHART_JS, "r", encoding="utf-8") as f:
        chartjs = f.read()
    # 安全内联：防止嵌入内容里的 </script> 提前闭合标签
    chartjs = chartjs.replace("</script", "<\\/script")

    # 按文件分组记录（供 per-file 独立报告使用）
    file_records = {}
    for r in records:
        file_records.setdefault(r["file"], []).append(r)

    # 需求①：为每个 .xls 生成独立报告链接（须在构建 data 前设置，主工作台文件清单要读 o.report）
    for name in files:
        files[name]["report"] = "reports/" + _report_slug(os.path.splitext(name)[0])

    now = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    sig_all = {
        "diag": kw_group_sig(records, lambda r: r.get("diag") or "其他", DIAG_ORDER),
        "gender": kw_group_sig(records, _gender_key, ["男", "女", "未标注"]),
    }
    formal_recs = [r for r in records if not files[r["file"]]["test"]]
    sig_formal = {
        "diag": kw_group_sig(formal_recs, lambda r: r.get("diag") or "其他", DIAG_ORDER),
        "gender": kw_group_sig(formal_recs, _gender_key, ["男", "女", "未标注"]),
    }
    data = {
        "records": records,
        "files": files,
        "core_tests": CORE_TESTS,
        "comp_bases": COMP_BASES,
        "comp_labels": COMP_LABELS,
        "test_agt": TEST_AGT,
        "test_agt_labels": TEST_AGT_LABELS,
        "diag_order": DIAG_ORDER,
        "sig": {"all": sig_all, "formal": sig_formal},
        "generated": now,
    }
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    html = TEMPLATE.replace("@@CHARTJS@@", chartjs).replace("@@DATA@@", payload)
    with open(OUT_HTML, "w", encoding="utf-8") as f:
        f.write(html)

    # 需求①：per-file 独立 dashboard（每个 .xls 一个 report_<stem>.html，输出到 reports/ 子目录）
    # 报告页与主 dashboard 全量对齐（单项目口径）：注入测验 T 分基准、健康对照参照记录、
    # 以及「本项目 vs 健康对照」「组内性别」两套 Kruskal-Wallis 显著性
    # （健康对照组的文件自身即参照组，跳过 vs 对照，前端显示说明）
    os.makedirs(os.path.join(HERE, "reports"), exist_ok=True)
    hc_records = [r for r in records if r.get("diag") == "健康对照"]
    for name in files:
        stem = os.path.splitext(name)[0]
        projs = file_records.get(name, [])
        if diag_of(name) == "健康对照":
            sig_vs_hc = {}
            ref_recs = []
        else:
            def _vs_hc_key(r, _n=name):
                return "本项目" if r["file"] == _n else "健康对照"
            sig_vs_hc = kw_group_sig(projs + hc_records, _vs_hc_key, ["本项目", "健康对照"])
            ref_recs = hc_records
        sig_gender_file = kw_group_sig(projs, _gender_key, ["男", "女", "未标注"])
        fdata = {
            "meta": {"name": name, "stem": stem, "diag": diag_of(name), "test": files[name]["test"]},
            "records": projs,
            "core_tests": CORE_TESTS,
            "comp_bases": COMP_BASES,
            "comp_labels": COMP_LABELS,
            "test_agt": TEST_AGT,
            "test_agt_labels": TEST_AGT_LABELS,
            "ref_records": ref_recs,
            "sig": {"vsHC": sig_vs_hc, "gender": sig_gender_file},
            "generated": now,
        }
        _emit(FILE_TEMPLATE, chartjs, fdata, os.path.join(HERE, "reports", _report_slug(stem)))

    # 需求②：per-person 报告（单一 person.html，全量数据 + ?person=file|id 客户端过滤；
    #   ≥2 访视显示顶部试次切换器，二级参数 ?visit=all|0基序号|原始ID 指定当前访视）
    pdata = {
        "records": records,
        "core_tests": CORE_TESTS,
        "comp_bases": COMP_BASES,
        "comp_labels": COMP_LABELS,
        "generated": now,
    }
    _emit(PERSON_TEMPLATE, chartjs, pdata, os.path.join(HERE, "person.html"))

    total_tests = sum(len(r["tests"]) for r in records)
    print("WROTE", OUT_HTML)
    print("records=", len(records), "files=", len(files), "core-tests-done=", total_tests)
    print("per-file reports=", len(files), "+ person.html")
    test_files = [k for k, v in files.items() if v["test"]]
    print("test-files=", test_files)


if __name__ == "__main__":
    main()
