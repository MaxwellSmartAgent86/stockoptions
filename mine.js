(function () {
  const form = document.getElementById("pull");
  const emailInput = document.getElementById("email");
  const openBtn = document.getElementById("open-mail");
  const outlookBtn = document.getElementById("open-outlook");
  const pasteInput = document.getElementById("paste");
  const fileInput = document.getElementById("files");
  const chooseBtn = document.getElementById("choose");
  const statusEl = document.getElementById("status");
  const results = document.getElementById("results");
  const sampleBtn = document.getElementById("sample");

  const byId = {};
  TRADES.forEach((trade) => {
    byId[trade.id] = trade;
  });

  function text(value) {
    return value == null ? "" : String(value).trim();
  }

  function lower(value) {
    return text(value).toLowerCase();
  }

  function asNumber(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function field(raw, names) {
    for (let i = 0; i < names.length; i++) {
      const value = raw[names[i]];
      if (value != null && value !== "") return value;
    }
    return null;
  }

  function occOf(symbol) {
    const compact = text(symbol).toUpperCase().replace(/\s+/g, "");
    const match = compact.match(/^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
    if (!match) return null;
    return {
      root: match[1],
      kind: match[5] === "C" ? "call" : "put",
      expiration: (2000 + Number(match[2])) + "-" + match[3] + "-" + match[4],
      strike: Number(match[6]) / 1000
    };
  }

  function sourceOf(raw) {
    if (!raw || !raw.instrument || typeof raw.instrument !== "object") return raw || {};
    const merged = {};
    Object.keys(raw.instrument).forEach((key) => {
      merged[key] = raw.instrument[key];
    });
    Object.keys(raw).forEach((key) => {
      if (key !== "instrument") merged[key] = raw[key];
    });
    return merged;
  }

  function kindOf(raw, parsed) {
    const blob = [
      raw.kind, raw.type, raw["instrument-type"], raw.instrument_type,
      raw["option-type"], raw.option_type, raw.putCall, raw.put_call, raw["put-call"],
      raw.call_or_put, raw["call-or-put"], raw.assetType, raw.asset_type
    ].map(lower).join(" ");
    if (blob.indexOf("call") !== -1 && blob.indexOf("put") === -1) return "call";
    if (blob.indexOf("put") !== -1 && blob.indexOf("call") === -1) return "put";
    if (parsed) return parsed.kind;
    if (/future|crypto|bond|warrant|currency/.test(blob)) return "other";
    if (blob.indexOf("option") !== -1) return "option";
    if (blob.indexOf("cash") !== -1) return "cash";
    return "stock";
  }

  function sideOf(raw, qty) {
    const blob = lower(field(raw, ["side", "action", "direction", "quantity-direction", "quantity_direction"]) || "");
    if (/sell|short|sto/.test(blob)) return "short";
    if (/buy|long|bto/.test(blob)) return "long";
    const shortQty = asNumber(raw.shortQuantity != null ? raw.shortQuantity : raw["short-quantity"]);
    const longQty = asNumber(raw.longQuantity != null ? raw.longQuantity : raw["long-quantity"]);
    if (shortQty && !longQty) return "short";
    if (qty != null && qty < 0) return "short";
    return "long";
  }

  function legFrom(raw) {
    raw = sourceOf(raw);
    const parsed = occOf(field(raw, ["symbol", "occ_symbol", "occ-symbol"]));
    const qtyRaw = asNumber(field(raw, ["quantity", "qty", "contracts"]));
    const shortQty = asNumber(raw.shortQuantity != null ? raw.shortQuantity : raw["short-quantity"]);
    const longQty = asNumber(raw.longQuantity != null ? raw.longQuantity : raw["long-quantity"]);
    const signed = qtyRaw != null ? qtyRaw : (shortQty ? -Math.abs(shortQty) : longQty);
    if (signed === 0 || lower(field(raw, ["quantity-direction", "quantity_direction"]) || "") === "zero") return null;
    const strikeField = asNumber(field(raw, ["strike", "strike_price", "strike-price"]));
    const expRaw = text(field(raw, ["expiration", "expiry", "expiration_date", "expiration-date", "expires-at", "expires_at"]));
    return {
      side: sideOf(raw, signed),
      kind: kindOf(raw, parsed),
      qty: signed == null ? 1 : Math.abs(signed),
      strike: strikeField != null ? strikeField : (parsed ? parsed.strike : null),
      expiration: (expRaw ? expRaw.slice(0, 10) : "") || (parsed ? parsed.expiration : ""),
      cashSecured: raw.cash_secured === true || raw.cashSecured === true || raw["cash-secured"] === true,
      symbol: text(field(raw, ["underlying_symbol", "underlying-symbol", "underlying", "root"]) || (parsed && parsed.root) || field(raw, ["symbol"])),
      account: text(raw["account-label"] || ""),
      closed: raw.closed === true
    };
  }

  function rowsOf(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object") return [];
    const direct = data.positions || data.trades || data.results || data.items;
    if (Array.isArray(direct)) return direct;
    if (data.data) {
      if (Array.isArray(data.data)) return data.data;
      if (Array.isArray(data.data.items)) return data.data.items;
      if (Array.isArray(data.data.positions)) return data.data.positions;
    }
    if (data.securitiesAccount && Array.isArray(data.securitiesAccount.positions)) {
      return data.securitiesAccount.positions;
    }
    return [];
  }

  function groupRows(rows) {
    const nested = rows.some((row) => Array.isArray(row.legs) && row.legs.length);
    if (nested) {
      return rows.map((row) => ({
        symbol: text(row.symbol || row.underlying || row.underlying_symbol) || "Position",
        legs: row.legs.map(legFrom).filter((leg) => leg && leg.kind !== "cash")
      })).filter((row) => row.legs.length).flatMap(partition);
    }
    const groups = [];
    const index = {};
    rows.forEach((row) => {
      const leg = legFrom(row);
      if (!leg || leg.kind === "cash") return;
      const key = (leg.account ? leg.account + " · " : "") + (leg.symbol || text(row.symbol) || "Position");
      if (!index[key]) {
        index[key] = { symbol: key, legs: [] };
        groups.push(index[key]);
      }
      index[key].legs.push(leg);
    });
    return groups.flatMap(partition);
  }

  function dated(legs) {
    const dates = legs.map((leg) => leg.expiration).filter(Boolean);
    return dates.every((date) => date === dates[0]);
  }

  function findCondor(pool) {
    const longPuts = pool.filter((leg) => leg.kind === "put" && leg.side === "long" && leg.strike != null);
    const shortPuts = pool.filter((leg) => leg.kind === "put" && leg.side === "short" && leg.strike != null);
    const shortCalls = pool.filter((leg) => leg.kind === "call" && leg.side === "short" && leg.strike != null);
    const longCalls = pool.filter((leg) => leg.kind === "call" && leg.side === "long" && leg.strike != null);
    for (let a = 0; a < longPuts.length; a++) {
      for (let b = 0; b < shortPuts.length; b++) {
        if (!(shortPuts[b].strike > longPuts[a].strike)) continue;
        for (let c = 0; c < shortCalls.length; c++) {
          for (let d = 0; d < longCalls.length; d++) {
            if (!(shortCalls[c].strike < longCalls[d].strike)) continue;
            const legs = [longPuts[a], shortPuts[b], shortCalls[c], longCalls[d]];
            if (dated(legs)) return legs;
          }
        }
      }
    }
    return null;
  }

  function findCallPair(pool) {
    const longs = pool.filter((leg) => leg.kind === "call" && leg.side === "long");
    const shorts = pool.filter((leg) => leg.kind === "call" && leg.side === "short");
    for (let i = 0; i < longs.length; i++) {
      for (let j = 0; j < shorts.length; j++) {
        const bought = longs[i];
        const sold = shorts[j];
        const later = bought.expiration && sold.expiration && bought.expiration !== sold.expiration;
        const debit = bought.strike != null && sold.strike != null && bought.strike < sold.strike;
        if (later || debit) return [bought, sold];
      }
    }
    return null;
  }

  function findPutPair(pool) {
    const longs = pool.filter((leg) => leg.kind === "put" && leg.side === "long");
    const shorts = pool.filter((leg) => leg.kind === "put" && leg.side === "short");
    for (let i = 0; i < longs.length; i++) {
      for (let j = 0; j < shorts.length; j++) {
        const bought = longs[i];
        const sold = shorts[j];
        const later = bought.expiration && sold.expiration && bought.expiration !== sold.expiration;
        const debit = bought.strike != null && sold.strike != null && bought.strike > sold.strike;
        if (later || debit) return [bought, sold];
      }
    }
    return null;
  }

  function findStrangle(pool) {
    if (pool.some((leg) => leg.kind === "stock" && leg.side === "long")) return null;
    const call = pool.find((leg) => leg.kind === "call" && leg.side === "long");
    const put = pool.find((leg) => leg.kind === "put" && leg.side === "long");
    if (!call || !put) return null;
    return [call, put];
  }

  function partition(group) {
    const pool = group.legs.slice();
    const out = [];
    function peel(found) {
      if (!found) return false;
      found.forEach((leg) => {
        const at = pool.indexOf(leg);
        if (at >= 0) pool.splice(at, 1);
      });
      out.push({ symbol: group.symbol, legs: found });
      return true;
    }
    while (peel(findCondor(pool))) {}
    while (peel(findCallPair(pool))) {}
    while (peel(findPutPair(pool))) {}
    while (peel(findStrangle(pool))) {}
    while (peel((() => {
      const stock = pool.find((leg) => leg.kind === "stock" && leg.side === "long");
      const call = pool.find((leg) => leg.kind === "call" && leg.side === "short");
      const put = pool.find((leg) => leg.kind === "put" && leg.side === "long");
      return stock && call && put ? [stock, call, put] : null;
    })())) {}
    while (peel((() => {
      const stock = pool.find((leg) => leg.kind === "stock" && leg.side === "long");
      const call = pool.find((leg) => leg.kind === "call" && leg.side === "short");
      const put = pool.find((leg) => leg.kind === "put" && leg.side === "short");
      return stock && call && put ? [stock, call, put] : null;
    })())) {}
    while (peel((() => {
      const stock = pool.find((leg) => leg.kind === "stock" && leg.side === "long");
      const call = pool.find((leg) => leg.kind === "call" && leg.side === "short");
      return stock && call ? [stock, call] : null;
    })())) {}
    while (peel((() => {
      const stock = pool.find((leg) => leg.kind === "stock" && leg.side === "long");
      const put = pool.find((leg) => leg.kind === "put" && leg.side === "long");
      return stock && put ? [stock, put] : null;
    })())) {}
    ["put", "call"].forEach((kind) => {
      const side = kind === "put" ? "short" : "long";
      while (peel((() => {
        const leg = pool.find((item) => item.kind === kind && item.side === side);
        return leg ? [leg] : null;
      })())) {}
    });
    while (peel((() => {
      const leg = pool.find((item) => item.kind === "put" && item.side === "long");
      return leg ? [leg] : null;
    })())) {}
    while (peel((() => {
      const leg = pool.find((item) => item.kind === "stock" && item.side === "long");
      return leg ? [leg] : null;
    })())) {}
    if (pool.length) out.push({ symbol: group.symbol, legs: pool.slice() });
    return out;
  }

  function describe(leg) {
    const name = (leg.closed ? "Closed " : "") + (leg.side === "short" ? "Short" : "Long");
    if (leg.kind === "stock") return name + " stock " + leg.qty;
    if (leg.kind === "other") return name + " contract × " + leg.qty;
    const strike = leg.strike == null ? "" : " " + leg.strike;
    const when = leg.expiration ? " " + leg.expiration : "";
    return name + " " + leg.kind + strike + when + " × " + leg.qty;
  }

  function classify(legs) {
    const stockLong = legs.filter((leg) => leg.kind === "stock" && leg.side === "long");
    const calls = legs.filter((leg) => leg.kind === "call");
    const puts = legs.filter((leg) => leg.kind === "put");
    const longCalls = calls.filter((leg) => leg.side === "long");
    const shortCalls = calls.filter((leg) => leg.side === "short");
    const longPuts = puts.filter((leg) => leg.side === "long");
    const shortPuts = puts.filter((leg) => leg.side === "short");
    const hasShares = stockLong.length > 0;

    if (hasShares && shortCalls.length && longPuts.length && !longCalls.length) return "collar";
    if (hasShares && shortCalls.length && shortPuts.length && !longCalls.length && !longPuts.length) return "wheel";
    if (hasShares && shortCalls.length && !longCalls.length && !longPuts.length && !shortPuts.length) return "covered-call";
    if (hasShares && longPuts.length && !calls.length && !shortPuts.length) return "protective-put";
    if (!hasShares && longCalls.length === 1 && shortCalls.length === 1 && !puts.length) {
      const bought = longCalls[0];
      const sold = shortCalls[0];
      if (bought.expiration && sold.expiration && bought.expiration !== sold.expiration) {
        return bought.strike != null && sold.strike != null && bought.strike !== sold.strike ? "diagonal" : "calendar";
      }
      if (bought.strike != null && sold.strike != null && bought.strike < sold.strike) return "bull-call";
    }
    if (!hasShares && longPuts.length === 1 && shortPuts.length === 1 && !calls.length) {
      const bought = longPuts[0];
      const sold = shortPuts[0];
      if (bought.expiration && sold.expiration && bought.expiration !== sold.expiration) {
        return bought.strike != null && sold.strike != null && bought.strike !== sold.strike ? "diagonal" : "calendar";
      }
      if (bought.strike != null && sold.strike != null && bought.strike > sold.strike) return "bear-put";
    }
    if (!hasShares && longCalls.length === 1 && shortCalls.length === 1 && longPuts.length === 1 && shortPuts.length === 1) {
      const strikes = [shortPuts[0].strike, longPuts[0].strike, shortCalls[0].strike, longCalls[0].strike];
      if (strikes.every((strike) => strike != null) && shortPuts[0].strike > longPuts[0].strike && shortCalls[0].strike < longCalls[0].strike) return "iron-condor";
    }
    if (!hasShares && longCalls.length === 1 && longPuts.length === 1 && !shortCalls.length && !shortPuts.length) {
      if (longCalls[0].strike != null && longCalls[0].strike === longPuts[0].strike) return "straddle";
      return "strangle";
    }
    if (!hasShares && shortPuts.length === 1 && !longPuts.length && !calls.length) return "cash-secured-put";
    if (!hasShares && longCalls.length === 1 && !shortCalls.length && !puts.length) return "long-call";
    if (!hasShares && longPuts.length === 1 && !shortPuts.length && !calls.length) return "long-put";
    if (hasShares && !calls.length && !puts.length) return "shares";
    return "unmatched";
  }

  function sharesNote() {
    return {
      name: "Shares",
      where: "The feed is long stock and nothing else. No option is on.",
      why: "Owning the shares is the position a covered call and a protective put both start from. A long call is the lesson’s stock replacement when the shares are not owned and the gain is meant to stay open.",
      switches: [
        { id: "covered-call", when: "A quiet tape is enough and you would sell the shares higher" },
        { id: "protective-put", when: "You will keep the shares and the next move may explode" },
        { id: "long-call", when: "You wanted the upside without holding the shares" }
      ]
    };
  }

  function extraNote(id) {
    if (id === "collar") {
      return {
        name: "Collar",
        where: "Long stock, a short call, and a long put.",
        why: "The lesson teaches those pieces apart. The short call against the shares is a covered call. The long put against the shares is a protective put. Together they are a collar, which is not a trade on the study page.",
        switches: [
          { id: "covered-call", when: "You drop the put and keep the call you sold" },
          { id: "protective-put", when: "You drop the short call and keep the insurance" }
        ]
      };
    }
    if (id === "diagonal") {
      return {
        name: "Diagonal",
        where: "A later month against a nearer month, and the strikes differ.",
        why: "A calendar keeps the strike and changes the month. A diagonal changes both. The lesson’s time trade is the calendar.",
        switches: [
          { id: "calendar", when: "You keep one strike and only change the month" }
        ]
      };
    }
    return {
      name: "Not on the study page",
      where: "The legs do not match a structure on the study page.",
      why: "Read the legs below against What it is on each trade. A match needs the same sides, and for a spread the same relationship of strikes.",
      switches: []
    };
  }

  function profile(id, legs) {
    if (id === "shares") return sharesNote();
    if (id === "wheel") {
      const trade = byId.wheel;
      const secured = legs.some((leg) => leg.cashSecured);
      return Object.assign({}, trade, {
        why: trade.why + (secured
          ? " This mail has both phases on at once, and it marks the cash for the put as reserved."
          : " This mail has both phases on at once. It does not say whether the cash for the put is reserved or only margin is posted. The put is still the short put in the cycle.")
      });
    }
    if (id === "cash-secured-put") {
      const trade = byId["cash-secured-put"];
      const secured = legs.some((leg) => leg.cashSecured);
      return Object.assign({}, trade, {
        why: trade.why + (secured
          ? " This mail marks the cash as reserved."
          : " This mail does not say whether the cash is reserved or only margin is posted. The payoff is the same short put. The collateral is the difference between a cash-secured put and what a desk calls a naked put.")
      });
    }
    if (byId[id]) return byId[id];
    return extraNote(id);
  }

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }

  function render(groups) {
    results.replaceChildren();
    if (!groups.length) {
      statusEl.textContent = "That paste had no positions to read.";
      return;
    }
    statusEl.textContent = groups.length + (groups.length === 1 ? " position." : " positions.");
    groups.forEach((group) => {
      const id = classify(group.legs);
      const trade = profile(id, group.legs);
      const article = el("article", "position");
      const title = el("h2");
      if (trade.id) {
        const link = document.createElement("a");
        link.href = "index.html#" + trade.id;
        link.textContent = group.symbol + " — " + trade.name;
        title.append(link);
      } else {
        title.textContent = group.symbol + " — " + trade.name;
      }
      const legs = el("ul", "legs");
      group.legs.forEach((leg) => legs.append(el("li", "", describe(leg))));
      const label = trade.id
        ? (trade.name.toLowerCase().indexOf("the ") === 0 ? trade.name.toLowerCase() : "the " + trade.name.toLowerCase())
        : trade.name;
      article.append(
        title,
        legs,
        el("h3", "", "What the legs are"),
        el("p", "", trade.what || trade.where),
        el("h3", "", "Why this shape"),
        el("p", "", "The mail shows the fills. It does not show the motive. The structure the legs make is " + label + ". " + trade.why)
      );
      const alts = el("ul", "alts");
      (trade.switches || []).forEach((item) => {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.href = "index.html#" + item.id;
        link.textContent = byId[item.id] ? byId[item.id].name : item.id;
        li.append(link, document.createTextNode(". " + item.when + "."));
        alts.append(li);
      });
      article.append(el("h3", "", "If the setup were different"), alts.childElementCount ? alts : el("p", "", "The lesson does not name a switch from this shape."));
      results.append(article);
    });
  }

  function readJson(raw) {
    const data = JSON.parse(raw);
    render(groupRows(rowsOf(data)));
  }

  const MONTHS = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
  };

  function pad(value) {
    const textValue = String(value);
    return textValue.length === 1 ? "0" + textValue : textValue;
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function plainMail(raw) {
    if (!/<[a-z][\s\S]*>/i.test(raw)) return raw;
    const doc = new DOMParser().parseFromString(raw, "text/html");
    return doc.body ? doc.body.textContent : raw;
  }

  function headerValue(headers, name) {
    const match = headers.match(new RegExp("^" + name + ":\\s*(.+)$", "im"));
    return match ? match[1].trim() : "";
  }

  function decodeBody(body, encoding) {
    if (/quoted-printable/i.test(encoding)) {
      return body.replace(/=\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }
    if (/base64/i.test(encoding)) {
      try {
        return atob(body.replace(/\s/g, ""));
      } catch (err) {
        return body;
      }
    }
    return body;
  }

  function textPart(part) {
    const splitAt = part.indexOf("\n\n");
    if (splitAt < 0) return "";
    const headers = part.slice(0, splitAt);
    const type = headerValue(headers, "Content-Type");
    if (/text\/html/i.test(type) || /application\//i.test(type)) return "";
    const body = decodeBody(part.slice(splitAt + 2), headerValue(headers, "Content-Transfer-Encoding"));
    return /text\/html/i.test(type) ? "" : body;
  }

  function readableMessage(block) {
    const splitAt = block.indexOf("\n\n");
    if (splitAt < 0) return plainMail(block);
    const headers = block.slice(0, splitAt);
    let body = decodeBody(block.slice(splitAt + 2), headerValue(headers, "Content-Transfer-Encoding"));
    const type = headerValue(headers, "Content-Type");
    const boundary = type.match(/boundary="?([^";\s]+)"?/i);
    if (boundary) {
      const fence = boundary[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const parts = body.split(new RegExp("\\n--" + fence));
      const plain = parts.map(textPart).find(Boolean);
      body = plain || parts.map((part) => part).join("\n");
    }
    if (/<[a-z][\s\S]*>/i.test(body)) body = plainMail(body);
    return headers + "\n\n" + body;
  }

  function messagesOf(raw) {
    const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "").replace(/^\uFEFF/, "");
    const parts = text.split(/\n(?=From:\s*\S)|\n(?=From\s+[^\s:])/i);
    return parts.map((part) => readableMessage(part.trim())).filter(Boolean);
  }

  function messageDate(block) {
    const match = block.match(/^Date:\s*(.+)$/im);
    if (!match) return null;
    const date = new Date(match[1]);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function recentEnough(date) {
    if (!date) return true;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 10);
    return date >= cutoff;
  }

  function actionOf(line) {
    const sample = line.toLowerCase();
    if (/sell to close|sold to close|\bstc\b/.test(sample)) return { side: "long", closed: true };
    if (/buy to close|bought to close|\bbtc\b/.test(sample)) return { side: "short", closed: true };
    if (/sell to open|sold to open|\bsto\b|\bsold\b|\bsell\b/.test(sample)) return { side: "short", closed: false };
    if (/buy to open|bought to open|\bbto\b|\bbought\b|\bbuy\b|\bbot\b/.test(sample)) return { side: "long", closed: false };
    return null;
  }

  function qtyOf(line) {
    const match = line.match(/(?:open|close|bought|sold|buy|sell|bot|sto|bto|stc|btc)\s+(\d+(?:\.\d+)?)/i);
    return match ? Number(match[1]) : 1;
  }

  function symbolOf(line) {
    const skip = /^(buy|sell|sold|bought|bot|sto|bto|stc|btc|to|open|close|shares|share|of|the|a|an|call|calls|put|puts|cash|secured|covered|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|you|your|for|at|on|in|and|or|was|were|filled|order|trade|confirmation|account|contract|contracts|option|options|price|limit|market|from|subject|date|this|that|with|have|has|been|executed|avg|average|debit|credit|exp|expiration|we|our|is|it|be|as|by|per)$/i;
    const words = line.match(/\b[A-Za-z]{1,6}\b/g) || [];
    const caps = words.find((word) => /^[A-Z]{1,5}$/.test(word) && !skip.test(word));
    if (caps) return caps;
    const found = words.find((word) => !skip.test(word));
    return found ? found.toUpperCase() : "";
  }

  function dateOf(blob) {
    let match = blob.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[1] + "-" + match[2] + "-" + match[3];
    match = blob.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (match) {
      const year = match[3].length === 2 ? "20" + match[3] : match[3];
      return year + "-" + pad(match[1]) + "-" + pad(match[2]);
    }
    match = blob.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/i);
    if (match) return match[3] + "-" + MONTHS[match[1].slice(0, 3).toLowerCase()] + "-" + pad(match[2]);
    return "";
  }

  function strikeOf(blob) {
    const before = blob.match(/(\d+(?:\.\d+)?)\s*(call|put)\b/i);
    if (before) return Number(before[1]);
    const after = blob.match(/\b(call|put)\s+(\d+(?:\.\d+)?)/i);
    return after ? Number(after[2]) : null;
  }

  function rowFrom(action, symbol, kind, strike, expiration, qty, cash) {
    return {
      side: action.side,
      kind: kind,
      quantity: qty,
      strike: strike,
      expiration: expiration,
      symbol: symbol,
      underlying_symbol: symbol,
      cash_secured: cash,
      closed: action.closed
    };
  }

  function legsIn(block) {
    const legs = [];
    block.split("\n").forEach((line) => {
      const occMatch = line.toUpperCase().match(/([A-Z]{1,6})\s*(\d{2})(\d{2})(\d{2})([CP])(\d{8})/);
      if (occMatch) {
        const parsed = occOf(occMatch[1] + occMatch[2] + occMatch[3] + occMatch[4] + occMatch[5] + occMatch[6]);
        const action = actionOf(line) || { side: "long", closed: false };
        if (parsed) {
          legs.push(rowFrom(action, parsed.root, parsed.kind, parsed.strike, parsed.expiration, qtyOf(line), /cash[-\s]?secured|cash[-\s]?covered/i.test(line)));
          return;
        }
      }
      if (/\bshares?\b/i.test(line) && !/\b(call|put)\b/i.test(line)) {
        const share = line.match(/\b(\d+(?:\.\d+)?)\s+shares?\s+(?:of\s+)?([A-Za-z]{1,6})\b/i);
        const action = actionOf(line);
        if (share && action) {
          legs.push(rowFrom(action, share[2].toUpperCase(), "stock", null, "", Number(share[1]), false));
          return;
        }
      }
      if (!/\b(call|put)\b/i.test(line)) return;
      const action = actionOf(line);
      const symbol = symbolOf(line);
      if (!action || !symbol) return;
      const kind = /put/i.test(line) ? "put" : "call";
      legs.push(rowFrom(action, symbol, kind, strikeOf(line), dateOf(line), qtyOf(line), /cash[-\s]?secured|cash[-\s]?covered/i.test(line)));
    });
    return legs;
  }

  function sampleMail() {
    const sent = new Date();
    sent.setDate(sent.getDate() - 1);
    const stamp = sent.toUTCString();
    return [
      "From: confirms@example.com",
      "Date: " + stamp,
      "Subject: Trade confirmation",
      "",
      "Bought 100 shares of KO",
      "Sell to open 1 KO Nov 20 2026 75 Call",
      "",
      "From: confirms@example.com",
      "Date: " + stamp,
      "Subject: Trade confirmation",
      "",
      "Sell to open 1 KO 55 Put 2026-11-20 cash secured"
    ].join("\n");
  }

  function gmailUrl(address) {
    const query = "newer_than:10d (confirmation OR filled OR \"to open\" OR \"trade confirmation\")";
    const mail = "https://mail.google.com/mail/u/0/#search/" + encodeURIComponent(query);
    return "https://accounts.google.com/AccountChooser?Email=" + encodeURIComponent(address) + "&continue=" + encodeURIComponent(mail);
  }

  function outlookUrl(address) {
    const query = "received>=today-10days trade confirmation";
    return "https://outlook.live.com/mail/0/search?q=" + encodeURIComponent(query) + "&login_hint=" + encodeURIComponent(address);
  }

  function openMailbox(url) {
    const address = emailInput.value.trim();
    if (!validEmail(address)) {
      statusEl.textContent = "Type the email address to open.";
      emailInput.focus();
      return;
    }
    const tab = window.open(url(address), "_blank");
    if (tab) tab.opener = null;
    statusEl.textContent = tab
      ? "The mailbox is open in a new tab, searched for trade mail from the last 10 days. Paste those messages below, or choose the email files, then read the trades. The address was not saved."
      : "The browser blocked the mailbox tab. Allow pop-ups for this page, then open the mailbox again.";
  }

  function readMail(raw) {
    const messages = messagesOf(raw);
    const fresh = messages.filter((message) => recentEnough(messageDate(message)));
    if (!fresh.length) {
      results.replaceChildren();
      statusEl.textContent = messages.length
        ? "Those messages are older than 10 days."
        : "Paste the trade emails from the mailbox, or choose the files.";
      return;
    }
    const groups = [];
    fresh.forEach((message) => {
      const legs = legsIn(message);
      const opening = legs.filter((leg) => !leg.closed);
      const used = opening.length ? opening : legs;
      if (!used.length) return;
      groupRows(used).forEach((group) => groups.push(group));
    });
    if (!groups.length) {
      results.replaceChildren();
      statusEl.textContent = "Those messages did not include a stock or option fill this page could read. Include the buy or sell, the symbol, and for an option the strike and whether it is a call or a put.";
      return;
    }
    const skipped = messages.length - fresh.length;
    render(groups);
    if (skipped) statusEl.textContent += " Older mail was left out.";
  }

  function readPaste(raw) {
    const trimmed = raw.trim();
    if (!trimmed) {
      results.replaceChildren();
      statusEl.textContent = "Open the mailbox, then paste the trade emails from the last 10 days or choose the files.";
      return;
    }
    if (trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[") {
      try {
        readJson(trimmed);
        return;
      } catch (err) {
        statusEl.textContent = "That paste is not JSON the reader could use.";
        return;
      }
    }
    readMail(trimmed);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    readPaste(pasteInput.value);
  });

  openBtn.addEventListener("click", () => openMailbox(gmailUrl));
  outlookBtn.addEventListener("click", () => openMailbox(outlookUrl));

  emailInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      openBtn.click();
    }
  });

  chooseBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;
    Promise.all(files.map((file) => file.text())).then((texts) => {
      pasteInput.value = texts.join("\n\n");
      readPaste(pasteInput.value);
      fileInput.value = "";
    });
  });

  pasteInput.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  pasteInput.addEventListener("drop", (event) => {
    const files = Array.from(event.dataTransfer.files || []);
    if (!files.length) return;
    event.preventDefault();
    Promise.all(files.map((file) => file.text())).then((texts) => {
      pasteInput.value = texts.join("\n\n");
      readPaste(pasteInput.value);
    });
  });

  sampleBtn.addEventListener("click", () => {
    pasteInput.value = sampleMail();
    statusEl.textContent = "Sample loaded. These are the lesson’s Coca-Cola shapes, written as mail, not an account.";
    pasteInput.focus();
  });
})();
