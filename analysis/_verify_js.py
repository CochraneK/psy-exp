# -*- coding: utf-8 -*-
"""提取每个生成 HTML 的最后一个 <script> 块（应用 JS），写入临时 .js，供 node --check。
每次运行先清空 _jscheck/ 下的旧 .js，跑完后也清空一次（自检完成即可，不留残留）。
node 路径：默认 PATH 中的 node，可用环境变量 MCCB_NODE 覆盖。"""
import glob, os, re, shutil, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = os.environ.get("MCCB_NODE") or shutil.which("node") or "node"
TMP = os.path.join(HERE, "_jscheck")
os.makedirs(TMP, exist_ok=True)

def _clean_tmp():
    for _old in glob.glob(os.path.join(TMP, "*.js")):
        try:
            os.remove(_old)
        except OSError:
            pass

_clean_tmp()

htmls = sorted(glob.glob(os.path.join(HERE, "mccb_dashboard.html")) +
               glob.glob(os.path.join(HERE, "person.html")) +
               glob.glob(os.path.join(HERE, "reports", "report_*.html")))

def last_script(html):
    # 取最后一个 <script>...</script>
    idxs = [m.start() for m in re.finditer(r"<script>", html)]
    if not idxs:
        return None
    start = idxs[-1] + len("<script>")
    end = html.find("</script>", start)
    if end < 0:
        return html[start:]
    return html[start:end]

ok, bad = [], []
for p in htmls:
    name = os.path.basename(p)
    html = open(p, encoding="utf-8").read()
    js = last_script(html)
    if js is None:
        bad.append((name, "no script block"))
        continue
    jsfile = os.path.join(TMP, name.replace(".html", ".js"))
    with open(jsfile, "w", encoding="utf-8") as f:
        f.write(js)
    r = subprocess.run([NODE, "--check", jsfile], capture_output=True, text=True)
    if r.returncode == 0:
        ok.append(name)
    else:
        bad.append((name, r.stderr.strip()[:600]))

_clean_tmp()

print("CHECKED", len(htmls), "files")
print("OK", len(ok))
for n in ok:
    print("  [ok]", n)
if bad:
    print("BAD", len(bad))
    for n, err in bad:
        print("  [FAIL]", n)
        print("   ", err)
else:
    print("BAD 0")
