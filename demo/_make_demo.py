# -*- coding: utf-8 -*-
"""MCCB 工作台 · 演示数据生成器（100% 合成数据，不含任何真实受试者信息）

原理：
  1. 生成一套与真实 MCCB 导出同构的合成 .xlsx（同表头、同列结构，值全随机合成，固定种子可复现）
  2. 以内存 monkeypatch 方式复用 ../refresh.py 的完整管线（HERE/CHART_JS/OUT_HTML/DIAG_MAP
     重定向到 docs/_build/），refresh.py 本体零改动
  3. 产物覆写 docs/ 下的演示站：mccb_dashboard.html + person.html + reports/

用法：
    python docs/_make_demo.py
"""
import os, sys, shutil
import datetime as dt

import numpy as np
import openpyxl

DEMO = os.path.dirname(os.path.abspath(__file__))          # .../mccb-dashboard/demo
ROOT = os.path.dirname(DEMO)                               # 仓库根
BUILD = os.path.join(DEMO, "_build")                       # 临时构建区（跑完即删）

rng = np.random.default_rng(20261028)
random_seed = 20261028
import random
random.seed(random_seed)

# ---------------- 1. 合成 .xlsx ----------------
CORE_TESTS = ["TMT", "BACS SC", "HVLT-R", "WMS-III SS",
              "NAB Mazes", "BVMT-R", "Fluency", "MSCEIT ME", "CPT-IP"]
COMP_BASES = ["SoP", "AV", "WM", "Vrbl Lrng", "Vis Lrng", "RPS", "SC", "Overall Comp", "Neurocog Comp"]

# 演示文件: (文件名, 分组, 受试者数, 能力均值, 能力SD, 各访视数百分比, 纵向改善/访视, 综合分用AGET后缀)
FILES = [
    ("健康对照演示.xlsx", "健康对照", 54,  52, 5, [80, 20],                 0.0, False),
    ("精分演示队列.xlsx", "精分",     120, 43, 6, [30, 25, 18, 13, 9, 5],   0.0, False),
    ("抑郁演示队列.xlsx", "抑郁",      15, 46, 5, [70, 20, 10],             0.0, False),
    ("双相演示队列.xlsx", "双相",       6, 48, 6, [60, 25, 15],             0.0, False),
    ("强迫演示队列.xlsx", "强迫",       5, 49, 5, [80, 20],                 0.0, False),
    ("HDN演示.xlsx",      "HDN",      20, 42, 6, [60, 20, 10, 10],          0.0, False),
    ("神经调控演示.xlsx", "神经调控",  30, 44, 5, [0, 25, 30, 25, 20],      0.9, False),
    ("tDCS演示.xlsx",     "神经调控",  20, 45, 5, [0, 25, 30, 25, 20],      0.9, True),
    ("项目演示A.xlsx",    "独立项目",  25, 50, 7, [80, 20],                 0.0, False),
    ("项目演示B.xlsx",    "独立项目",  20, 50, 7, [80, 20],                 0.0, False),
    ("项目演示C.xlsx",    "独立项目",  15, 50, 7, [80, 20],                 0.0, False),
    ("test_演示1.xlsx",   "其他",       8, 50, 8, [100],                    0.0, False),
    ("test_演示2.xlsx",   "其他",       8, 50, 8, [100],                    0.0, False),
]
DOMAIN_MEMBERS = {
    "SoP": ["TMT", "BACS SC"], "AV": ["CPT-IP", "BACS SC"], "WM": ["WMS-III SS", "NAB Mazes"],
    "Vrbl Lrng": ["HVLT-R", "Fluency"], "Vis Lrng": ["NAB Mazes", "BVMT-R"],
    "RPS": ["Fluency", "BVMT-R"], "SC": ["MSCEIT ME"],
    "Overall Comp": CORE_TESTS,
    "Neurocog Comp": [t for t in CORE_TESTS if t != "MSCEIT ME"],
}
DOMAIN_EXTRA = {
    "精分": {"SoP": -4, "Vis Lrng": -3, "RPS": -2},
    "抑郁": {"SoP": -2, "WM": -2, "Vrbl Lrng": -2},
    "HDN": {"SoP": -3, "RPS": -2},
    "双相": {"WM": -2},
    "强迫": {"Vrbl Lrng": -2},
    "神经调控": {"SoP": -2},
}
def clamp(v, lo=10, hi=90):
    return int(round(min(hi, max(lo, v))))

def gen_file(fname, group, n_subj, mu, sd, visit_pcts, trend, aget):
    rows = []
    for s in range(n_subj):
        gseq = next(GSEQ)
        theta = rng.normal(mu, sd)
        tau = {t: rng.normal(0, 3) for t in CORE_TESTS}
        gender = "Male" if rng.random() < 0.5 else "Female"
        base_age = int(rng.integers(18, 59))
        rater = random.choice(["rater_a", "rater_b", "rater_c"])
        name = "" if rng.random() < 0.3 else f"演示{gseq:04d}"
        d0 = dt.date(2019, 11, 1) + dt.timedelta(days=int(rng.integers(0, (dt.date(2025, 8, 31) - dt.date(2019, 11, 1)).days)))
        # visit_pcts[i] = 访视数为 (i+1) 次的百分比（索引差一陷阱，勿直接当次数用）
        vcount = int(rng.choice(list(range(len(visit_pcts))), p=np.array(visit_pcts) / 100)) + 1
        date = d0
        for v in range(1, vcount + 1):
            if v > 1:
                date = date + dt.timedelta(days=int(rng.integers(90, 301)))
                if date > dt.date(2026, 9, 20):
                    break
            age = base_age + (date - d0).days // 365
            tests = {}
            for t in CORE_TESTS:
                if rng.random() < 0.08:
                    continue
                tests[t] = clamp(theta + tau[t] + rng.normal(0, 2.5) + trend * (v - 1))
            present = len(tests)
            sc = {}
            for base in COMP_BASES:
                members = DOMAIN_MEMBERS[base]
                vals = [tests[t] for t in members if t in tests]
                if base == "SC":
                    ok = "MSCEIT ME" in tests
                elif base in ("Overall Comp", "Neurocog Comp"):
                    ok = present >= 6
                else:
                    ok = len(vals) >= 2
                if not ok or rng.random() < 0.08:
                    continue
                extra = DOMAIN_EXTRA.get(group, {}).get(base, 0)
                if base == "SC":
                    sc[base] = clamp(theta * 0.3 + tests["MSCEIT ME"] * 0.7 + rng.normal(0, 3) + extra)
                else:
                    sc[base] = clamp(0.55 * theta + 0.45 * (sum(vals) / len(vals)) + rng.normal(0, 3) + extra)
            rows.append({
                "Respondent ID": f"9{gseq:04d}V{v:02d}",
                "Name": name, "Gender": gender,
                "Start Date": date.strftime("%Y-%m-%d"), "Test Date": date.strftime("%Y-%m-%d"),
                "Start Age": age, "Test Age": age, "Assessment": v, "Rater": rater,
                **{t: tests.get(t) for t in CORE_TESTS},
                **{f"{t} AGT": tests.get(t) for t in CORE_TESTS},
                **{f"{b} {'AGET' if aget else 'AGT'}": sc.get(b) for b in COMP_BASES},
            })
    return rows

GSEQ = iter(range(1, 347))  # 13 个文件合计 346 名合成受试者

# 合成文件写入 docs/data/（随仓库提交，便于他人直接跑）
data_dir = os.path.join(DEMO, "data")
os.makedirs(data_dir, exist_ok=True)
shutil.rmtree(BUILD, ignore_errors=True)
os.makedirs(os.path.join(BUILD, "data"))
for fname, group, n, mu, sd, vp, trend, aget in FILES:
    rows = gen_file(fname, group, n, mu, sd, vp, trend, aget)
    if not rows:
        continue
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Data"
    keys = list(rows[0].keys())
    ws.append(keys)
    for r in rows:
        ws.append([r[k] for k in keys])
    wb.save(os.path.join(data_dir, fname))
    shutil.copy(os.path.join(data_dir, fname), os.path.join(BUILD, "data", fname))
    print(f"  gen {fname}: {len(rows)} rows")

# ---------------- 2. monkeypatch 复用 refresh.py 管线（不改本体） ----------------
shutil.copy(os.path.join(ROOT, "chart.min.js"), os.path.join(BUILD, "chart.min.js"))
sys.path.insert(0, ROOT)
import refresh  # noqa: E402

refresh.HERE = BUILD
refresh.CHART_JS = os.path.join(BUILD, "chart.min.js")
refresh.OUT_HTML = os.path.join(BUILD, "mccb_dashboard.html")
refresh.DIAG_MAP = {os.path.splitext(f)[0].lower(): g for f, g, *_ in FILES if g != "其他"}
refresh.main()

# ---------------- 3. 覆写 docs/ 演示站 ----------------
for f in os.listdir(os.path.join(BUILD, "reports")):
    os.makedirs(os.path.join(DEMO, "reports"), exist_ok=True)
    dst = os.path.join(DEMO, "reports", f)
    if os.path.exists(dst):
        os.remove(dst)
    shutil.copy(os.path.join(BUILD, "reports", f), dst)
for f in ("mccb_dashboard.html", "person.html"):
    shutil.copy(os.path.join(BUILD, f), os.path.join(DEMO, f))
shutil.rmtree(BUILD, ignore_errors=True)
print("DEMO_READY:", DEMO)
