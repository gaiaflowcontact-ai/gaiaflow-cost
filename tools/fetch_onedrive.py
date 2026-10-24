"""從 OneDrive 分享連結下載食材總表.xlsx（依序嘗試幾種方式）。

用法：python3 fetch_onedrive.py <分享連結> <輸出檔名>
成功時印出使用的方式與檔案修改時間；全部失敗則以錯誤結束。
修改時間（台北時間）寫到 <輸出檔名>.updated，給 convert.py 使用。
"""
import base64
import datetime
import email.utils
import re
import sys
import urllib.parse
import urllib.request

share, out = sys.argv[1].strip(), sys.argv[2]
UA = {"User-Agent": "Mozilla/5.0 (GaiaFlow cost sync)"}
TPE = datetime.timezone(datetime.timedelta(hours=8))


def with_param(url, key, value):
    p = urllib.parse.urlsplit(url)
    q = urllib.parse.parse_qsl(p.query, keep_blank_values=True)
    q = [(k, v) for k, v in q if k != key] + [(key, value)]
    return urllib.parse.urlunsplit(p._replace(query=urllib.parse.urlencode(q)))


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read(), r.headers, r.geturl()


token = "u!" + base64.urlsafe_b64encode(share.encode()).decode().rstrip("=")
attempts = []

# 新版個人 OneDrive 連結：https://1drv.ms/x/c/<cid>/<token>
m = re.search(r"1drv\.ms/\w/c/([0-9a-fA-F]+)/([\w-]+)", share)
if m:
    cid, tok = m.group(1), m.group(2)
    attempts.append(("新版連結 download.aspx",
                     lambda: get(f"https://my.microsoftpersonalcontent.com/personal/{cid}/_layouts/15/download.aspx?share={tok}")))
attempts += [
    ("分享連結 + download=1", lambda: get(with_param(share, "download", "1"))),
    ("OneDrive shares API (root)", lambda: get(f"https://api.onedrive.com/v1.0/shares/{token}/root/content")),
    ("OneDrive shares API (driveItem)", lambda: get(f"https://api.onedrive.com/v1.0/shares/{token}/driveItem/content")),
]


def after_redirect():
    _, _, final = get(share)
    p = urllib.parse.urlsplit(final)
    print(f"  （分享連結轉址到 {p.netloc}{p.path[:40]}）")
    return get(with_param(final, "download", "1"))


attempts.append(("轉址後的網址 + download=1", after_redirect))

for label, fn in attempts:
    try:
        body, headers, _ = fn()
    except Exception as e:  # noqa: BLE001
        print(f"✗ {label}: {e}")
        continue
    if body[:2] != b"PK":  # xlsx 是 zip 檔，開頭一定是 PK
        print(f"✗ {label}: 拿到的不是 Excel 檔（{headers.get('Content-Type')}，{len(body)} bytes）")
        continue
    with open(out, "wb") as f:
        f.write(body)
    lm = headers.get("Last-Modified")
    when = email.utils.parsedate_to_datetime(lm).astimezone(TPE) if lm else datetime.datetime.now(TPE)
    with open(out + ".updated", "w") as f:
        f.write(when.strftime("%Y-%m-%d %H:%M"))
    print(f"✓ {label}：{len(body)} bytes，修改時間 {when:%Y-%m-%d %H:%M}")
    sys.exit(0)

sys.exit("全部方式都失敗：OneDrive 不允許程式直接下載這個連結")
