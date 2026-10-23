#!/usr/bin/env python3.11
"""Study page plus same-origin daily closes. The browser cannot read the exchanges directly."""

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, date
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.abspath(__file__))
HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "8765"))
NY = ZoneInfo("America/New_York")
SYMBOL = re.compile(r"[A-Z][A-Z0-9.\-]{0,9}")
CACHE = {}
TTL_OK = 600
TTL_MISS = 60


def dedupe(bars):
    chosen = {}
    for bar in bars:
        chosen[bar["date"]] = bar["close"]
    return [{"date": day, "close": chosen[day]} for day in sorted(chosen)]


def yahoo_bars(symbol):
    url = "https://query1.finance.yahoo.com/v8/finance/chart/" + urllib.parse.quote(symbol) + "?range=6mo&interval=1d"
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.loads(response.read().decode())
    result = (payload.get("chart") or {}).get("result") or [None]
    result = result[0] or {}
    stamps = result.get("timestamp") or []
    closes = ((result.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
    bars = []
    for stamp, close in zip(stamps, closes):
        if stamp is None or close is None:
            continue
        bars.append({
            "date": datetime.fromtimestamp(stamp, NY).date().isoformat(),
            "close": round(float(close), 4)
        })
    return dedupe(bars)


def nasdaq_bars(symbol, asset):
    start = (date.today() - timedelta(days=220)).isoformat()
    end = date.today().isoformat()
    url = (
        "https://api.nasdaq.com/api/quote/" + urllib.parse.quote(symbol)
        + "/historical?assetclass=" + asset + "&fromdate=" + start + "&todate=" + end + "&limit=200"
    )
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.loads(response.read().decode())
    rows = (((payload.get("data") or {}).get("tradesTable") or {}).get("rows")) or []
    bars = []
    for row in rows:
        raw = str(row.get("close") or "").replace("$", "").replace(",", "")
        try:
            close = float(raw)
        except ValueError:
            continue
        parts = str(row.get("date") or "").split("/")
        if len(parts) != 3:
            continue
        bars.append({"date": parts[2] + "-" + parts[0].zfill(2) + "-" + parts[1].zfill(2), "close": round(close, 4)})
    return dedupe(bars)


def bars_for(symbol):
    now = datetime.now().timestamp()
    cached = CACHE.get(symbol)
    if cached and cached[0] > now:
        return cached[1]
    bars = []
    try:
        bars = yahoo_bars(symbol)
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError):
        bars = []
    if len(bars) < 8:
        for asset in ("stocks", "etf"):
            try:
                found = nasdaq_bars(symbol, asset)
            except (urllib.error.URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError):
                found = []
            if len(found) >= 8:
                bars = found
                break
    CACHE[symbol] = (now + (TTL_OK if len(bars) >= 8 else TTL_MISS), bars)
    return bars


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/quote":
            return super().do_GET()
        query = urllib.parse.parse_qs(parsed.query)
        symbol = (query.get("symbol") or [""])[0].upper().strip()
        if not SYMBOL.fullmatch(symbol):
            self.send_json({"symbol": symbol, "bars": []}, 400)
            return
        self.send_json({"symbol": symbol, "bars": bars_for(symbol)})

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            return


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), partial(Handler, directory=ROOT))
    print("study page on http://%s:%s" % (HOST, PORT), flush=True)
    server.serve_forever()
