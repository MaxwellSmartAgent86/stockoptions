(function () {
  const form = document.getElementById("pull");
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
      account: "",
      price: text(field(raw, ["price", "fill_price"])),
      closed: raw.closed === true,
      assigned: raw.assigned === true
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
        when: text(row.when),
        order: text(row.order),
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
        const credit = bought.strike != null && sold.strike != null && bought.strike > sold.strike;
        if (later || debit || credit) return [bought, sold];
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
        const credit = bought.strike != null && sold.strike != null && bought.strike < sold.strike;
        if (later || debit || credit) return [bought, sold];
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
      out.push({
        symbol: group.symbol,
        when: group.when || "",
        order: group.order || "",
        legs: found
      });
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
    if (pool.length) {
      out.push({
        symbol: group.symbol,
        when: group.when || "",
        order: group.order || "",
        legs: pool.slice()
      });
    }
    return out;
  }

  function describe(leg) {
    const name = (leg.assigned ? "Assigned " : (leg.closed ? "Closed " : "")) + (leg.side === "short" ? "Short" : "Long");
    const price = leg.price ? " @ " + leg.price : "";
    if (leg.kind === "stock") return name + " stock " + leg.qty + price;
    if (leg.kind === "other") return name + " contract × " + leg.qty + price;
    const strike = leg.strike == null ? "" : " " + leg.strike;
    const when = leg.expiration ? " " + leg.expiration : "";
    return name + " " + leg.kind + strike + when + " × " + leg.qty + price;
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
      const spread = spreadName(bought, sold, "bull-call", "call-credit");
      if (spread) return spread;
    }
    if (!hasShares && longPuts.length === 1 && shortPuts.length === 1 && !calls.length) {
      const bought = longPuts[0];
      const sold = shortPuts[0];
      const spread = spreadName(bought, sold, "bear-put", "put-credit");
      if (spread) return spread;
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
    if (!hasShares && shortPuts.length > 1 && !longPuts.length && !calls.length) return "short-put";
    if (!hasShares && shortCalls.length && shortPuts.length && !longCalls.length && !longPuts.length) return "short-strangle";
    if (!hasShares && longCalls.length === 1 && !shortCalls.length && !puts.length) return "long-call";
    if (!hasShares && longPuts.length === 1 && !shortPuts.length && !calls.length) return "long-put";
    if (!hasShares && shortCalls.length && !longCalls.length && !puts.length) return "short-call";
    if (legs.length && legs.every((leg) => leg.kind === "stock" && leg.side === "short")) return "stock-sale";
    if (hasShares && !calls.length && !puts.length) return "shares";
    return "unmatched";
  }

  function spreadName(bought, sold, debitName, creditName) {
    if (bought.expiration && sold.expiration && bought.expiration !== sold.expiration) {
      if (bought.strike != null && sold.strike != null && bought.strike !== sold.strike) return "diagonal";
      return bought.expiration > sold.expiration ? "calendar" : "short-calendar";
    }
    if (bought.strike == null || sold.strike == null || bought.strike === sold.strike) return "";
    return debitName === "bull-call"
      ? (bought.strike < sold.strike ? debitName : creditName)
      : (bought.strike > sold.strike ? debitName : creditName);
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
    if (id === "put-credit") {
      return {
        name: "Put credit spread",
        where: "Short the higher put, long the lower put, same month.",
        why: "The lesson’s bear put buys the higher put and sells the lower one. This fill is the other way around. The short put alone is the cash-secured put. The long put caps how much that short put can make and defines the loss.",
        switches: [
          { id: "bear-put", when: "You buy the higher put and sell the lower one" },
          { id: "cash-secured-put", when: "You drop the long put and keep the short put" }
        ]
      };
    }
    if (id === "call-credit") {
      return {
        name: "Call credit spread",
        where: "Short the lower call, long the higher call, same month.",
        why: "The lesson’s bull call buys the lower call and sells the higher one. This fill is the other way around. A short call with no shares is not the covered call.",
        switches: [
          { id: "bull-call", when: "You buy the lower call and sell the higher one" },
          { id: "covered-call", when: "You already own the shares and you keep only the short call" }
        ]
      };
    }
    if (id === "short-calendar") {
      return {
        name: "Short calendar",
        where: "Same strike. The near month is bought and the later month is sold.",
        why: "The lesson’s calendar is long the later month and short the near month. This fill is the opposite. The strike is unchanged, which is what makes it a calendar rather than a diagonal.",
        switches: [
          { id: "calendar", when: "You buy the later month and sell the near month" }
        ]
      };
    }
    if (id === "short-call") {
      return {
        name: "Short call",
        where: "A call was sold, and the fill has no shares.",
        why: "The lesson’s covered call sells the call against shares you already own. Without the shares, this is not that trade. The long call is the lesson’s trade when the gain is meant to stay open.",
        switches: [
          { id: "covered-call", when: "You already own the shares" },
          { id: "long-call", when: "You want the upside left open" }
        ]
      };
    }
    if (id === "stock-sale") {
      return {
        name: "Stock sale",
        where: "Shares were sold, and no option is in the fill.",
        why: "The lesson’s trades are opened on top of shares or instead of them. A sale of shares is not one of the twelve.",
        switches: []
      };
    }
    if (id === "short-put") {
      return {
        name: "Short puts",
        where: "Puts were sold, and the fill has no shares and no long put.",
        why: "Each short put is the cash-secured put: get paid while waiting to buy shares at the strike. No long put is there to cap the loss.",
        switches: [
          { id: "cash-secured-put", when: "You keep one short put" },
          { id: "bear-put", when: "You buy the higher put and sell the lower one" }
        ]
      };
    }
    if (id === "short-strangle") {
      return {
        name: "Short strangle",
        where: "A call and a put were sold, different strikes, and the fill has no shares and no wings.",
        why: "The lesson’s strangle buys the call and the put. This fill sells them. The iron condor is that sale plus the two wings. The wheel holds shares and sells a put, then a call, one phase at a time.",
        switches: [
          { id: "strangle", when: "You buy the call and the put" },
          { id: "iron-condor", when: "You add the wings" }
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
      const assigned = legs.some((leg) => leg.assigned);
      return Object.assign({}, trade, {
        why: trade.why + (assigned
          ? " This mail is an assignment notice. The short put was assigned, so the shares were bought at the strike. The lesson’s wheel then sells a covered call against those shares."
          : (secured
            ? " This mail marks the cash as reserved."
            : " This mail does not say whether the cash is reserved or only margin is posted. The payoff is the same short put. The collateral is the difference between a cash-secured put and what a desk calls a naked put."))
      });
    }
    if (id === "short-call" && legs.length > 1) {
      const note = extraNote(id);
      note.where = "Calls were sold at more than one strike, and the fill has no shares.";
      return note;
    }
    if (id === "short-put" && legs.length > 1) {
      const note = extraNote(id);
      note.where = "Puts were sold at more than one strike, and the fill has no shares and no long put.";
      return note;
    }
    if (id === "short-strangle" && legs.length > 2) {
      const note = extraNote(id);
      note.where = "Calls and puts were sold at more than one strike, and the fill has no shares and no wings.";
      return note;
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

  const quoteCache = {};
  let guessToken = 0;

  function money(value) {
    if (value == null || !Number.isFinite(value)) return "";
    return "$" + value.toFixed(2);
  }

  function parseISO(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function isoFromDate(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function isoDaysBefore(iso, days) {
    const date = parseISO(iso);
    if (!date) return "";
    date.setDate(date.getDate() - days);
    return isoFromDate(date);
  }

  function prettyISO(iso) {
    const date = parseISO(iso);
    if (!date) return iso || "";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
  }

  function whenISO(text) {
    const match = String(text || "").match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/i);
    if (!match) return "";
    return match[3] + "-" + MONTHS[match[1].slice(0, 3).toLowerCase()] + "-" + pad(match[2]);
  }

  function closeOnOrBefore(bars, iso) {
    let found = null;
    bars.forEach((bar) => {
      if (bar.date <= iso) found = bar;
    });
    return found;
  }

  function realizedVol(bars, endIndex) {
    const start = Math.max(1, endIndex - 60);
    const rets = [];
    for (let i = start; i <= endIndex; i++) {
      const prev = bars[i - 1].close;
      const close = bars[i].close;
      if (prev > 0 && close > 0) rets.push(Math.log(close / prev));
    }
    if (rets.length < 8) return null;
    const mean = rets.reduce((sum, value) => sum + value, 0) / rets.length;
    const variance = rets.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / (rets.length - 1);
    return Math.sqrt(variance) * Math.sqrt(252);
  }

  function outlookKind(ret, rv) {
    const band = rv * Math.sqrt(20 / 252);
    if (!Number.isFinite(band) || band === 0) return "";
    const z = ret / band;
    if (z >= 1.5) return "+2";
    if (z >= 0.35) return "+1";
    if (z <= -1.5) return "-2";
    if (z <= -0.35) return "-1";
    return "0";
  }

  function outlookPhrase(ret, rv) {
    const kind = outlookKind(ret, rv);
    if (kind === "+2") return "a hard rise, outside one usual 20-session move";
    if (kind === "+1") return "an ordinary rise, inside the usual range";
    if (kind === "-2") return "a hard drop, outside one usual 20-session move";
    if (kind === "-1") return "an ordinary drop, inside the usual range";
    if (kind === "0") return "sideways, inside the usual range";
    return "";
  }

  function movePhrase(ret) {
    if (Math.abs(ret) < 0.0005) return "unchanged";
    return (ret > 0 ? "up " : "down ") + Math.abs(ret * 100).toFixed(1) + "%";
  }

  function ivSentence(iv, id) {
    const n = Math.round(iv);
    const credit = {
      "cash-secured-put": true, "short-put": true, "put-credit": true, "call-credit": true,
      "short-call": true, "short-strangle": true, "covered-call": true, "iron-condor": true, "short-calendar": true
    };
    const debit = {
      "long-call": true, "bull-call": true, "long-put": true, "bear-put": true, "straddle": true, "strangle": true, "calendar": true
    };
    let line = "IV rank in the file is " + n + ". ";
    if (n >= 50) line += "Implied volatility is in the upper half of its own range.";
    else if (n <= 25) line += "Implied volatility is in the lower part of its own range.";
    else line += "That is a mid reading of implied volatility against its own range.";
    if (credit[id] && n >= 50) line += " That is where a credit is usually sold.";
    if (credit[id] && n <= 25) line += " A credit sale is thinner there than it has been, so the strike carries more of this guess.";
    if (debit[id] && n <= 25) line += " A debit is cheaper there than it has been.";
    return line;
  }

  function listStrikes(strikes) {
    const nums = strikes.map((strike) => String(strike));
    if (nums.length < 2) return nums[0] || "";
    return nums.slice(0, -1).join(", ") + " and " + nums[nums.length - 1];
  }

  function sideStrikes(legs, kind, side) {
    return legs.filter((leg) => leg.kind === kind && leg.side === side && leg.strike != null).map((leg) => leg.strike).sort((a, b) => a - b);
  }

  function nearest(strikes, spot) {
    if (!strikes.length) return null;
    if (spot == null) return strikes[0];
    return strikes.slice().sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot))[0];
  }

  function daysLeft(group, asOf) {
    if (group.tape && group.tape.dte != null) return { days: group.tape.dte, fromFile: true };
    const dates = group.legs.map((leg) => leg.expiration).filter(Boolean).sort();
    const end = dates.length ? parseISO(dates[0]) : null;
    const start = parseISO(asOf);
    if (!end || !start) return { days: null, fromFile: false };
    return { days: Math.max(0, Math.round((end - start) / 86400000)), fromFile: false };
  }

  function distanceClause(strike, spot, rv, left) {
    if (spot == null || strike == null || !(spot > 0)) return "";
    if (strike === spot) return " It sits at the price.";
    const pct = (Math.abs(strike - spot) / spot * 100).toFixed(1);
    const place = strike < spot ? "under the price" : "above the price";
    let clause = " It sits " + pct + "% " + place;
    if (rv && left.days) {
      const move = spot * rv * Math.sqrt(left.days / 365);
      if (move > 0) {
        clause += ", about " + (Math.abs(strike - spot) / move).toFixed(1) + " usual moves over the " + left.days + (left.fromFile ? " days left in the file" : " days left");
      }
    }
    return clause + ".";
  }

  function tapeFit(id, ret, rv) {
    if (ret == null || rv == null) return "";
    const kind = outlookKind(ret, rv);
    if (id === "cash-secured-put" || id === "short-put" || id === "put-credit") {
      return kind === "-1" || kind === "-2"
        ? "That drop is the case where a short put is closer to assignment."
        : "That tape leaves a short put with room when the strike is still under the price.";
    }
    if (id === "short-call" || id === "call-credit" || id === "covered-call") {
      return kind === "+1" || kind === "+2"
        ? "That rise is the case where a short call is closer to being run through."
        : "That tape is the case where a short call can finish out of the money.";
    }
    if (id === "short-strangle" || id === "iron-condor") {
      return kind === "+2" || kind === "-2"
        ? "That move is outside the usual range, which is the case that sale is built to avoid."
        : "That tape still sits inside the usual range, which is the case that sale is built for.";
    }
    if (id === "long-call" || id === "bull-call") {
      if (kind === "+1" || kind === "+2") return "The tape into the open was already rising, which is the direction this debit wants.";
      if (kind === "0") return "The tape into the open was sideways, so this debit needs a new rise to pay for itself.";
      return "The tape into the open was falling, so this debit is a bet that the drop turns.";
    }
    if (id === "long-put" || id === "bear-put") {
      if (kind === "-1" || kind === "-2") return "The tape into the open was already falling, which is the direction this debit wants.";
      if (kind === "0") return "The tape into the open was sideways, so this debit needs a new drop to pay for itself.";
      return "The tape into the open was rising, so this debit is a bet that the rise turns.";
    }
    if (id === "straddle" || id === "strangle") return "The long premium wants a move larger than the usual range. The realized volatility is how large that usual move has been.";
    return "";
  }

  function shapeSentence(id, legs, spot, rv, left) {
    const longCalls = sideStrikes(legs, "call", "long");
    const shortCalls = sideStrikes(legs, "call", "short");
    const longPuts = sideStrikes(legs, "put", "long");
    const shortPuts = sideStrikes(legs, "put", "short");
    if (id === "cash-secured-put" && shortPuts.length) {
      return "A put sold at " + shortPuts[0] + " is the lesson’s cash-secured put: get paid while waiting to buy the shares at that strike." + distanceClause(shortPuts[0], spot, rv, left);
    }
    if (id === "short-put" && shortPuts.length) {
      return "Puts were sold at " + listStrikes(shortPuts) + ". Each one is a cash-secured put, and the loss stays open below the lowest strike." + distanceClause(nearest(shortPuts, spot), spot, rv, left);
    }
    if (id === "short-call" && shortCalls.length) {
      const strike = nearest(shortCalls, spot);
      const many = shortCalls.length > 1;
      return (many ? "Calls were sold at " : "A call was sold at ") + listStrikes(shortCalls) + ". The lesson’s covered call sells the call against shares. There are no shares in this fill. The guess is that the stock was not expected to finish through " + strike + "." + distanceClause(strike, spot, rv, left);
    }
    if (id === "put-credit" && shortPuts.length && longPuts.length) {
      const hi = Math.max.apply(null, shortPuts);
      const lo = Math.min.apply(null, longPuts);
      return "The short put is at " + hi + " and the long put is at " + lo + ". The credit is kept if the stock stays above " + hi + ", and the long put caps the loss. The lesson’s bear put buys the higher put and sells the lower one." + distanceClause(hi, spot, rv, left);
    }
    if (id === "call-credit" && shortCalls.length && longCalls.length) {
      const lo = Math.min.apply(null, shortCalls);
      const hi = Math.max.apply(null, longCalls);
      return "The short call is at " + lo + " and the long call is at " + hi + ". The credit is kept if the stock stays under " + lo + ", and the long call caps the loss. The lesson’s bull call buys the lower call and sells the higher one." + distanceClause(lo, spot, rv, left);
    }
    if (id === "bull-call" && longCalls.length && shortCalls.length) {
      const lo = Math.min.apply(null, longCalls);
      const hi = Math.max.apply(null, shortCalls);
      let line = "The long call is at " + lo + " and the short call is at " + hi + ". That is the lesson’s bull call: the same direction as a long call, less cash in the trade, and the gain capped at " + hi + ".";
      if (spot != null && spot >= hi) line += " The price was already at or above the short strike, so the spread was in the money and the gain left is the width that is still open.";
      else if (spot != null && spot >= lo) line += " The price was between the strikes, so the long call was in the money and the short call was still above the market.";
      else if (spot != null) line += " Both strikes were above the price, so the spread still needed a rise to reach " + lo + ".";
      return line;
    }
    if (id === "bear-put" && longPuts.length && shortPuts.length) {
      const hi = Math.max.apply(null, longPuts);
      const lo = Math.min.apply(null, shortPuts);
      let line = "The long put is at " + hi + " and the short put is at " + lo + ". That is the lesson’s bear put: the same direction as a long put, less cash in the trade, and the gain capped at " + lo + ".";
      if (spot != null && spot <= lo) line += " The price was already at or under the short strike, so the spread was in the money.";
      else if (spot != null && spot <= hi) line += " The price was between the strikes.";
      else if (spot != null) line += " Both strikes were under the price, so the spread still needed a drop to reach " + hi + ".";
      return line;
    }
    if (id === "long-call" && longCalls.length) {
      return "A call was bought at " + longCalls[0] + ". The lesson uses that when the gain is meant to stay open, and the stock has to rise by enough to pay for the call." + distanceClause(longCalls[0], spot, rv, left);
    }
    if (id === "long-put" && longPuts.length) {
      return "A put was bought at " + longPuts[0] + ". The lesson uses that as the alternative to shorting the shares: the decline still has to pay for the put, and the loss stops at what was paid." + distanceClause(longPuts[0], spot, rv, left);
    }
    if (id === "short-strangle") {
      const callText = shortCalls.length === 1 ? "A call was sold at " + shortCalls[0] : "Calls were sold at " + listStrikes(shortCalls);
      const putText = shortPuts.length === 1 ? "a put was sold at " + shortPuts[0] : "puts were sold at " + listStrikes(shortPuts);
      return callText + " and " + putText + ", with no shares and no wings. The guess is that the stock stays between those strikes. The lesson’s strangle buys both options. The iron condor is this sale plus the wings.";
    }
    if (id === "covered-call" && shortCalls.length) {
      return "Shares are held and the call at " + shortCalls[0] + " is sold. The lesson’s covered call gets paid if the stock goes nowhere, and gives up the move above " + shortCalls[0] + "." + distanceClause(shortCalls[0], spot, rv, left);
    }
    if (id === "protective-put" && longPuts.length) {
      return "Shares are held and a put is bought at " + listStrikes(longPuts) + ". The lesson uses that when the shares stay on and a hard drop has to be survived." + distanceClause(nearest(longPuts, spot), spot, rv, left);
    }
    if (id === "wheel") return "Shares, a short call, and a short put are on together. The lesson’s wheel sells the next credit after the first one finishes. Both phases are on at once here.";
    if (id === "iron-condor") return "The short put and the short call mark the range, and the long wings cap the loss. The lesson uses this when the stock is expected to stay between the short strikes.";
    if (id === "straddle") return "The call and the put share a strike and both are bought. The lesson uses that when direction is the unknown and the bet is the size of the move.";
    if (id === "strangle") return "The call and the put are bought at different strikes. The lesson uses that when a large move is the bet and the debit is smaller than the at-the-money straddle.";
    if (id === "calendar") return "The later month is bought and the near month is sold, at one strike. The lesson uses that when the near option can expire and the later one is still held.";
    if (id === "short-calendar") return "The near month is bought and the later month is sold, at one strike. The lesson’s calendar buys the later month and sells the near month.";
    if (id === "diagonal") return "The months differ and the strikes differ. The lesson’s time trade, the calendar, keeps one strike. A diagonal changes both, often as a roll or a defined-risk short in the later month.";
    if (id === "collar") return "A short call and a long put are both on against the shares. The lesson teaches the short call as a covered call and the long put as a protective put.";
    if (id === "stock-sale") return "Shares were sold and no option is in the fill. The lesson’s trades are opened on top of shares or instead of them.";
    if (id === "shares") return "The shares are on with no option. A covered call and a protective put both start from that.";
    return "These legs do not make one structure on the study page. The guess stays with the strikes above and the price.";
  }

  function tapeGuess(group, id, bars) {
    const tape = group.tape || {};
    const spotFile = Number.isFinite(tape.fileSpot) ? tape.fileSpot : null;
    const days = Number.isFinite(tape.daysOpen) ? tape.daysOpen : null;
    const iv = Number.isFinite(tape.ivRank) ? tape.ivRank : null;
    const waiting = bars === undefined;
    const record = spotFile != null || days != null || iv != null ? "The file does not record the motive." : "The fill does not record the motive.";
    const sentences = ["This is a guess from the tape. " + record];
    let spotNow = null;
    let spotThen = null;
    let ret = null;
    let rv = null;
    let asOf = "";
    if (bars && bars.length) {
      const last = bars[bars.length - 1];
      spotNow = last.close;
      let end = last;
      if (days != null && days > 0) {
        const found = closeOnOrBefore(bars, isoDaysBefore(last.date, days));
        if (found) end = found;
      } else {
        const stamped = whenISO(group.when);
        if (stamped) {
          const found = closeOnOrBefore(bars, stamped);
          if (found) end = found;
        }
      }
      spotThen = end.close;
      asOf = end.date;
      const endIndex = bars.indexOf(end);
      if (endIndex >= 20 && bars[endIndex - 20].close > 0) ret = end.close / bars[endIndex - 20].close - 1;
      rv = realizedVol(bars, endIndex);
    }
    const spot = spotThen != null ? spotThen : spotFile;
    if (spotNow != null && spotThen != null && days != null && days > 0 && spotThen !== spotNow) {
      sentences.push(group.symbol + " last closed at " + money(spotNow) + ". About " + days + (days === 1 ? " day" : " days") + " before that, it closed at " + money(spotThen) + ".");
    } else if (spotNow != null) sentences.push(group.symbol + " last closed at " + money(spotNow) + ".");
    else if (spotFile != null) sentences.push("The file marks " + group.symbol + " at " + money(spotFile) + ".");
    else if (!waiting) sentences.push("No price loaded for " + group.symbol + ", so this guess stays with the strikes and the shape.");
    if (ret != null) {
      const outlook = rv != null ? outlookPhrase(ret, rv) : "";
      const vol = rv != null ? " Realized volatility over the sessions into that close was about " + Math.round(rv * 100) + "% annualized." : "";
      sentences.push("Over the 20 sessions into " + (prettyISO(asOf) || "that close") + " it was " + (outlook ? outlook + ", " : "") + movePhrase(ret) + "." + vol);
    } else if (!waiting && !(bars && bars.length)) {
      sentences.push("The daily closes did not load, so the 20-session trend is not in this guess.");
    }
    if (spotNow != null && spotFile != null && spotFile > 0 && Math.abs(spotNow - spotFile) / spotFile > 0.03) {
      sentences.push("The file marks it at " + money(spotFile) + ".");
    }
    if (iv != null) sentences.push(ivSentence(iv, id));
    const shape = shapeSentence(id, group.legs, spot, rv, daysLeft(group, asOf || (bars && bars.length ? bars[bars.length - 1].date : "")));
    if (shape) sentences.push(shape);
    const fit = tapeFit(id, ret, rv);
    if (fit) sentences.push(fit);
    return sentences.join(" ");
  }

  const quoteWait = [];
  let quoteActive = 0;

  function loadBars(symbol) {
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)) return Promise.resolve(null);
    if (Object.prototype.hasOwnProperty.call(quoteCache, symbol)) return Promise.resolve(quoteCache[symbol]);
    function start() {
      quoteActive += 1;
      return fetch("quote?symbol=" + encodeURIComponent(symbol)).then((response) => {
        if (!response.ok) throw new Error("status");
        return response.json();
      }).then((data) => {
        const bars = data && Array.isArray(data.bars) && data.bars.length >= 8 ? data.bars : null;
        if (bars) quoteCache[symbol] = bars;
        return bars;
      }).catch(() => null).then((bars) => {
        quoteActive -= 1;
        const next = quoteWait.shift();
        if (next) next();
        return bars;
      });
    }
    if (quoteActive >= 4) return new Promise((resolve) => quoteWait.push(() => resolve(start())));
    return start();
  }

  function fillGuesses(slots, token) {
    const pending = {};
    slots.forEach((slot) => {
      const symbol = slot.group.symbol;
      if (!pending[symbol]) pending[symbol] = loadBars(symbol);
    });
    let done = 0;
    let failed = 0;
    slots.forEach((slot) => {
      pending[slot.group.symbol].then((bars) => {
        if (token !== guessToken) return;
        if (!bars) failed += 1;
        slot.guess.textContent = tapeGuess(slot.group, slot.id, bars);
        done += 1;
        if (done < slots.length || token !== guessToken) return;
        if (failed === slots.length) {
          const extra = " Daily history did not load, so the trend is left out.";
          if (statusEl.textContent.indexOf("Daily history did not load") === -1) statusEl.textContent += extra;
        }
      });
    });
  }

  function render(groups) {
    const token = ++guessToken;
    results.replaceChildren();
    if (!groups.length) {
      statusEl.textContent = "That paste had no positions to read.";
      return;
    }
    statusEl.textContent = groups.length + (groups.length === 1 ? " position." : " positions.");
    const slots = [];
    groups.forEach((group) => {
      const id = classify(group.legs);
      const trade = profile(id, group.legs);
      const article = el("article", "position");
      const title = el("h2");
      const heading = group.symbol + (group.order ? " #" + group.order : "") + " — " + trade.name;
      if (trade.id) {
        const link = document.createElement("a");
        link.href = "index.html#" + trade.id;
        link.textContent = heading;
        title.append(link);
      } else {
        title.textContent = heading;
      }
      const legs = el("ul", "legs");
      group.legs.forEach((leg) => legs.append(el("li", "", describe(leg))));
      const label = trade.id
        ? (trade.name.toLowerCase().indexOf("the ") === 0 ? trade.name.toLowerCase() : "the " + trade.name.toLowerCase())
        : trade.name;
      const recorded = group.tape ? "The file shows the legs." : "The fill shows the legs.";
      const guess = el("p", "guess", tapeGuess(group, id));
      article.append(title);
      if (group.when) article.append(el("p", "note", group.when));
      article.append(
        legs,
        el("h3", "", "What the legs are"),
        el("p", "", trade.what || trade.where),
        el("h3", "", "Why this shape"),
        el("p", "", recorded + " It does not record the motive. The structure the legs make is " + label + ". " + trade.why),
        el("h3", "", "Best guess"),
        guess
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
      slots.push({ guess: guess, group: group, id: id });
    });
    fillGuesses(slots, token);
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

  function readMail(raw) {
    const messages = messagesOf(raw);
    const fresh = messages.filter((message) => recentEnough(messageDate(message)));
    if (!fresh.length) {
      results.replaceChildren();
      statusEl.textContent = messages.length
        ? "Those messages are older than 10 days."
        : "Choose the positions file, or paste a saved message.";
      return;
    }
    const groups = [];
    fresh.forEach((message) => {
      const legs = legsIn(message);
      const opening = legs.filter((leg) => !leg.closed);
      const used = opening.length ? opening : legs;
      if (!used.length) return;
      const dated = messageDate(message);
      const stamp = dated ? prettyISO(isoFromDate(dated)) : "";
      groupRows(used).forEach((group) => {
        if (stamp && !group.when) group.when = stamp;
        groups.push(group);
      });
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

  function parseCsv(raw) {
    const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i += 1;
          } else quoted = false;
        } else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else cell += ch;
    }
    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter((cells) => cells.some((value) => value.trim()));
  }

  function looksLikeCsv(raw) {
    const line = raw.split(/\n/, 1)[0].toLowerCase();
    return line.indexOf("strike price") !== -1 && line.indexOf("call/put") !== -1 && line.indexOf(",") !== -1;
  }

  function csvEscape(value) {
    return /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
  }

  function stripAccountColumn(raw) {
    if (!looksLikeCsv(raw)) return raw;
    const table = parseCsv(raw);
    if (!table.length) return raw;
    const drop = [];
    table[0].forEach((cell, index) => {
      if (/account/i.test(cell.trim())) drop.push(index);
    });
    if (!drop.length) return raw;
    return table.map((cells) => cells.filter((_, index) => drop.indexOf(index) === -1).map(csvEscape).join(",")).join("\n");
  }

  function csvNumber(value) {
    if (value == null) return null;
    const cleaned = String(value).replace(/[$,%\s]/g, "").replace(/d$/i, "");
    if (!cleaned) return null;
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : null;
  }

  function qtyAgrees(a, b) {
    if (!a.qty || !b.qty) return true;
    return a.qty === b.qty;
  }

  function opposed(a, b) {
    return (a.side === "long" && b.side === "short") || (a.side === "short" && b.side === "long");
  }

  function takePairs(pool, scoreOf) {
    const taken = [];
    let guard = 0;
    while (guard < 40) {
      guard += 1;
      let best = null;
      for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
          const score = scoreOf(pool[i], pool[j]);
          if (score == null) continue;
          if (!best || score < best.score) best = { i: i, j: j, score: score };
        }
      }
      if (!best) break;
      const left = pool[best.i];
      const right = pool[best.j];
      pool.splice(best.j, 1);
      pool.splice(best.i, 1);
      taken.push([left, right]);
    }
    return taken;
  }

  function splitBook(bucket) {
    const pool = bucket.legs.slice();
    const made = [];
    function push(legs) {
      const dtes = legs.map((leg) => leg.dte).filter((days) => days != null);
      made.push({
        symbol: bucket.symbol,
        when: bucket.daysOpen == null ? "" : "Open " + bucket.daysOpen + (bucket.daysOpen === 1 ? " day" : " days"),
        order: "",
        legs: legs,
        tape: {
          fileSpot: bucket.fileSpot,
          ivRank: bucket.ivRank,
          daysOpen: bucket.daysOpen,
          dte: dtes.length ? Math.min.apply(null, dtes) : null
        }
      });
    }
    function sameKind(a, b) {
      return a.kind === b.kind && a.kind !== "stock" && opposed(a, b) && qtyAgrees(a, b);
    }
    takePairs(pool, (a, b) => {
      if (!sameKind(a, b) || !a.expiration || a.expiration !== b.expiration) return null;
      if (a.strike == null || b.strike == null || a.strike === b.strike) return null;
      return Math.abs(a.strike - b.strike);
    }).forEach(push);
    takePairs(pool, (a, b) => {
      if (!sameKind(a, b) || !a.expiration || !b.expiration || a.expiration === b.expiration) return null;
      if (a.strike == null || a.strike !== b.strike) return null;
      return 0;
    }).forEach(push);
    takePairs(pool, (a, b) => {
      if (!sameKind(a, b) || !a.expiration || !b.expiration || a.expiration === b.expiration) return null;
      if (a.strike == null || b.strike == null || a.strike === b.strike) return null;
      return Math.abs(a.strike - b.strike);
    }).forEach(push);
    if (pool.length) push(pool.slice());
    return made;
  }

  function readCsv(raw) {
    const table = parseCsv(raw);
    if (table.length < 2) return [];
    const header = table[0].map((cell) => cell.trim().toLowerCase());
    const at = (name) => header.indexOf(name);
    const symbolAt = at("symbol");
    const qtyAt = at("quantity");
    const strikeAt = at("strike price");
    const cpAt = at("call/put");
    if (symbolAt < 0 || qtyAt < 0 || strikeAt < 0 || cpAt < 0) return null;
    const expAt = at("exp date");
    const spotAt = at("underlying last price");
    const ivAt = at("iv rank");
    const priceAt = at("trade price");
    const typeAt = at("type");
    const dteAt = header.findIndex((name) => name === "dte" || name === "days to expiration");
    const openAt = header.findIndex((name) => name.indexOf("opn") !== -1);
    const buckets = [];
    const index = {};
    table.slice(1).forEach((cells) => {
      const occ = occOf(text(cells[symbolAt]).toUpperCase().replace(/\s+/g, ""));
      const qtyRaw = csvNumber(cells[qtyAt]);
      const type = typeAt >= 0 ? lower(cells[typeAt]) : "";
      const cp = lower(cells[cpAt] || "");
      let kind = occ ? occ.kind : "";
      if (cp.indexOf("call") !== -1) kind = "call";
      else if (cp.indexOf("put") !== -1) kind = "put";
      else if (/stock|equity|share/.test(type)) kind = "stock";
      if (!kind || qtyRaw === 0) return;
      const symbol = (occ && occ.root) || text(cells[symbolAt]).split(/\s+/)[0].toUpperCase();
      if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)) return;
      const signed = qtyRaw == null ? 1 : qtyRaw;
      const daysOpen = openAt >= 0 ? csvNumber(cells[openAt]) : null;
      const strike = csvNumber(cells[strikeAt]);
      const leg = {
        side: signed < 0 ? "short" : "long",
        kind: kind,
        qty: Math.abs(signed),
        strike: strike != null ? strike : (occ ? occ.strike : null),
        expiration: (occ && occ.expiration) || (expAt >= 0 ? dateOf(text(cells[expAt])) : ""),
        price: priceAt >= 0 && csvNumber(cells[priceAt]) != null ? String(Math.abs(csvNumber(cells[priceAt]))) : "",
        dte: dteAt >= 0 ? csvNumber(cells[dteAt]) : null,
        symbol: symbol
      };
      const key = symbol + "|" + (daysOpen == null ? "" : daysOpen);
      if (!index[key]) {
        index[key] = {
          symbol: symbol,
          daysOpen: daysOpen,
          fileSpot: spotAt >= 0 ? csvNumber(cells[spotAt]) : null,
          ivRank: ivAt >= 0 ? csvNumber(cells[ivAt]) : null,
          legs: []
        };
        buckets.push(index[key]);
      }
      const bucket = index[key];
      if (bucket.fileSpot == null && spotAt >= 0) bucket.fileSpot = csvNumber(cells[spotAt]);
      if (bucket.ivRank == null && ivAt >= 0) bucket.ivRank = csvNumber(cells[ivAt]);
      bucket.legs.push(leg);
    });
    const symbolOrder = [];
    buckets.forEach((bucket) => {
      if (symbolOrder.indexOf(bucket.symbol) === -1) symbolOrder.push(bucket.symbol);
    });
    const groups = [];
    buckets.forEach((bucket) => splitBook(bucket).forEach((group) => groups.push(group)));
    groups.sort((a, b) => {
      const order = symbolOrder.indexOf(a.symbol) - symbolOrder.indexOf(b.symbol);
      if (order) return order;
      return (a.tape.daysOpen || 0) - (b.tape.daysOpen || 0);
    });
    return groups;
  }

  function readPaste(raw) {
    const trimmed = stripAccountColumn(raw).trim();
    if (trimmed !== raw.trim()) pasteInput.value = trimmed;
    if (!trimmed) {
      results.replaceChildren();
      statusEl.textContent = "Choose the positions file, or paste a saved message.";
      return;
    }
    if (looksLikeCsv(trimmed)) {
      const groups = readCsv(trimmed);
      if (!groups || !groups.length) {
        results.replaceChildren();
        statusEl.textContent = groups ? "That file had no option rows to read." : "That file has the positions headers, but the columns this page needs are missing.";
        return;
      }
      render(groups);
      statusEl.textContent = groups.length + (groups.length === 1 ? " open shape from the file." : " open shapes from the file.");
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

  function ingestFiles(files) {
    Promise.all(files.map((file) => file.text())).then((texts) => {
      pasteInput.value = texts.join("\n\n");
      readPaste(pasteInput.value);
      fileInput.value = "";
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    readPaste(pasteInput.value);
  });

  chooseBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;
    ingestFiles(files);
  });

  form.addEventListener("dragover", (event) => {
    if (event.dataTransfer && Array.from(event.dataTransfer.types || []).indexOf("Files") !== -1) event.preventDefault();
  });

  form.addEventListener("drop", (event) => {
    const files = Array.from(event.dataTransfer.files || []);
    if (!files.length) return;
    event.preventDefault();
    ingestFiles(files);
  });

  sampleBtn.addEventListener("click", () => {
    pasteInput.value = sampleMail();
    statusEl.textContent = "Sample loaded. These are the lesson’s Coca-Cola shapes, written as mail, not an account.";
    pasteInput.focus();
  });
})();
