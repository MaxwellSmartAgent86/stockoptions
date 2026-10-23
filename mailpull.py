#!/usr/bin/env python3
"""Read the last 10 days of Tastytrade fill and assignment mail from Mail.app.

Binds to this Mac only. Returns the fills. Does not return the message text
or an account number.
"""

import json
import re
import subprocess
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = 8766
ALLOWED = {"http://127.0.0.1:8765", "http://localhost:8765"}

APPLESCRIPT = r'''
tell application "Mail"
  set cutoff to (current date) - (10 * days)
  set out to ""
  set hits to messages of inbox whose date received ≥ cutoff
  repeat with m in hits
    set snd to sender of m
    set subj to subject of m
    set blob to snd & " " & subj
    if blob contains "tastytrade" or blob contains "investordelivery" then
      set mark to ""
      if subj contains "fill" then set mark to "FILL"
      if subj contains "Assignment/Exercise" then set mark to "ASSIGN"
      if mark is not "" then
        set mid to id of m as string
        set out to out & "===== " & mark & " | " & mid & " | " & ((date received of m) as string) & " | " & subj & linefeed
        set out to out & (content of m) & linefeed
      end if
    end if
  end repeat
  return out
end tell
'''

LEG = re.compile(
    r"^(Bought|Sold)\s+(\d+)\s+([A-Z][A-Z.]*)\s+(\d{2})/(\d{2})/(\d{2})\s+(Call|Put)\s+([\d.]+)\s+@\s+([\d.]+)"
)
STOCK = re.compile(r"^(Bought|Sold)\s+(\d+)\s+([A-Z][A-Z.]*)\s+@\s+([\d.]+)\s*$")
ASSIGNED = re.compile(
    r"^Assigned\s+(\d+)\s+([A-Z][A-Z.]*)\s+(\d{4})-(\d{2})-(\d{2})\s+([\d.]+)\s+(Puts|Calls)"
)
HEADER = re.compile(r"^===== (FILL|ASSIGN) \| (\d+) \| (.+?) \| (.*)$")


def parse_when(value):
    cleaned = value.replace("\u202f", " ").replace("\u00a0", " ").strip()
    return datetime.strptime(cleaned, "%A, %B %d, %Y at %I:%M:%S %p")


def iso_date(year, month, day):
    year = int(year)
    if year < 100:
        year += 2000
    return f"{year:04d}-{int(month):02d}-{int(day):02d}"


def show_when(moment):
    return moment.strftime("%b %d, %Y").replace(" 0", " ")


def pull_text():
    script = "/tmp/tasty-mailpull.applescript"
    with open(script, "w", encoding="utf-8") as handle:
        handle.write(APPLESCRIPT)
    result = subprocess.run(
        ["osascript", script],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Mail could not be read.")
    return result.stdout


def aggregate(legs):
    bucket = {}
    order = []
    for leg in legs:
        key = (leg["side"], leg["kind"], leg.get("expiration", ""), leg.get("strike"), leg["underlying_symbol"], leg.get("assigned") is True)
        if key not in bucket:
            bucket[key] = dict(leg)
            bucket[key]["quantity"] = 0
            bucket[key]["_prices"] = []
            order.append(key)
        current = bucket[key]
        current["quantity"] += leg["quantity"]
        if leg.get("price"):
            current["_prices"].append(leg["price"])
    out = []
    for key in order:
        leg = bucket[key]
        prices = list(dict.fromkeys(leg.pop("_prices")))
        if prices:
            leg["price"] = " and ".join(prices)
        out.append(leg)
    return out


def orders_from(text):
    fills = {}
    assigned = []
    blocks = re.split(r"\n(?====== )", text)
    for block in blocks:
        lines = block.splitlines()
        if not lines:
            continue
        header = HEADER.match(lines[0].strip())
        if not header:
            continue
        kind, _mid, when_text, subject = header.groups()
        try:
            moment = parse_when(when_text)
        except ValueError:
            continue
        if moment < datetime.now() - timedelta(days=10, hours=12):
            continue
        if kind == "FILL":
            order_match = re.search(r"Order\s+([A-Z][A-Z.]*)\s+#(\d+)", subject)
            if not order_match:
                continue
            symbol, order_id = order_match.groups()
            rec = fills.setdefault(order_id, {
                "symbol": symbol,
                "order": order_id,
                "when": show_when(moment),
                "_at": moment,
                "legs": [],
            })
            if moment > rec["_at"]:
                rec["_at"] = moment
                rec["when"] = show_when(moment)
            for line in lines[1:]:
                sample = line.strip().replace("\u2028", " ").replace("\u00a0", " ")
                leg = LEG.match(sample)
                if leg:
                    side, qty, root, month, day, year, right, strike, price = leg.groups()
                    rec["legs"].append({
                        "side": "buy" if side == "Bought" else "sell",
                        "kind": right.lower(),
                        "quantity": int(qty),
                        "strike": float(strike),
                        "expiration": iso_date(year, month, day),
                        "underlying_symbol": root,
                        "symbol": root,
                        "price": price,
                    })
                    continue
                stock = STOCK.match(sample)
                if stock:
                    side, qty, root, price = stock.groups()
                    rec["legs"].append({
                        "side": "buy" if side == "Bought" else "sell",
                        "kind": "stock",
                        "quantity": int(qty),
                        "underlying_symbol": root,
                        "symbol": root,
                        "price": price,
                    })
        else:
            for line in lines[1:]:
                sample = line.strip().replace("\u2028", " ").replace("\u00a0", " ")
                hit = ASSIGNED.match(sample)
                if not hit:
                    continue
                qty, root, year, month, day, strike, right = hit.groups()
                assigned.append({
                    "symbol": root,
                    "when": show_when(moment),
                    "_at": moment,
                    "legs": [{
                        "side": "sell",
                        "kind": "put" if right == "Puts" else "call",
                        "quantity": int(qty),
                        "strike": float(strike),
                        "expiration": iso_date(year, month, day),
                        "underlying_symbol": root,
                        "symbol": root,
                        "assigned": True,
                    }],
                })
    rows = []
    for rec in fills.values():
        legs = aggregate(rec["legs"])
        if not legs:
            continue
        rows.append({
            "symbol": rec["symbol"],
            "order": rec["order"],
            "when": rec["when"],
            "_at": rec["_at"],
            "legs": legs,
        })
    rows.extend(assigned)
    rows.sort(key=lambda row: row["_at"], reverse=True)
    for row in rows:
        row.pop("_at", None)
    return rows


def pull():
    return orders_from(pull_text())


class Handler(BaseHTTPRequestHandler):
    cache = {"at": None, "rows": None}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors()
        self.end_headers()

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path != "/fills":
            self.send_error(404)
            return
        refresh = "refresh=1" in query
        fresh = (
            Handler.cache["rows"] is not None
            and Handler.cache["at"] is not None
            and datetime.now() - Handler.cache["at"] < timedelta(minutes=10)
        )
        if refresh or not fresh:
            try:
                rows = pull()
            except subprocess.CalledProcessError:
                body = b'{"error":"Mail could not be read."}'
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_cors()
                self.end_headers()
                self.wfile.write(body)
                return
            Handler.cache["rows"] = rows
            Handler.cache["at"] = datetime.now()
        body = json.dumps(Handler.cache["rows"]).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_cors()
        self.end_headers()
        self.wfile.write(body)

    def send_cors(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    import sys
    if "--once" in sys.argv:
        json.dump(pull(), sys.stdout)
        sys.stdout.write("\n")
    else:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
