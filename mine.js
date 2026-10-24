(function () {
  const form = document.getElementById("pull");
  const pasteInput = document.getElementById("paste");
  const fileInput = document.getElementById("files");
  const chooseBtn = document.getElementById("choose");
  const statusEl = document.getElementById("status");
  const results = document.getElementById("results");
  const sampleBtn = document.getElementById("sample");
  const sorts = document.getElementById("sorts");
  const sortNote = document.getElementById("sort-note");
  const sortButtons = {
    opened: document.getElementById("sort-opened"),
    expires: document.getElementById("sort-expires"),
    result: document.getElementById("sort-result")
  };
  let cards = [];
  let sortMode = "";
  let sortDir = 1;

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

  function premiumOf(leg) {
    const trade = leg.trade != null ? leg.trade : (leg.price !== "" && leg.price != null ? Number(leg.price) : null);
    if (trade == null || !Number.isFinite(trade)) return null;
    return Math.abs(trade);
  }

  function outcomeNote(legs) {
    const options = legs.filter((leg) => (leg.kind === "call" || leg.kind === "put") && leg.strike != null);
    if (!options.length) return "";
    const stock = legs.filter((leg) => leg.kind === "stock");
    const priced = options.every((leg) => premiumOf(leg) != null) && stock.every((leg) => premiumOf(leg) != null);
    const line = priced
      ? "Green is a gain at expiration. Red is a loss. The color changes at the breakeven from the trade price in the file."
      : "Green is a gain at expiration. Red is a loss. The file has no trade price, so the color changes at the strike.";
    return stock.length && !priced ? line + " The shares are not in that color." : line;
  }

  function money(value) {
    if (value == null || !Number.isFinite(value)) return "";
    return "$" + value.toFixed(2);
  }

  function signedMoney(value) {
    const abs = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (value < 0) return "−$" + abs;
    if (value > 0) return "+$" + abs;
    return "$" + abs;
  }

  function contractMult(leg) {
    return leg.kind === "call" || leg.kind === "put" ? 100 : 1;
  }

  function legResult(leg) {
    if (leg.plOpen != null && Number.isFinite(leg.plOpen)) return leg.plOpen;
    const trade = leg.trade != null ? leg.trade : (leg.price !== "" && leg.price != null ? Number(leg.price) : null);
    if (trade == null || !Number.isFinite(trade) || leg.bid == null || leg.ask == null) return null;
    const mid = (leg.bid + leg.ask) / 2;
    const sign = leg.side === "short" ? -1 : 1;
    return (mid - Math.abs(trade)) * leg.qty * contractMult(leg) * sign;
  }

  function groupResult(group) {
    if (!group.legs.length) return null;
    let sum = 0;
    for (let i = 0; i < group.legs.length; i++) {
      const part = legResult(group.legs[i]);
      if (part == null) return null;
      sum += part;
    }
    return sum;
  }

  function expiryValue(legs, spot) {
    if (spot == null || !legs.length) return null;
    let total = 0;
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const premium = premiumOf(leg);
      if (premium == null) return null;
      const qty = leg.qty || 1;
      const sign = leg.side === "short" ? -1 : 1;
      if (leg.kind === "stock") {
        total += sign * (spot - premium) * qty;
        continue;
      }
      if ((leg.kind !== "call" && leg.kind !== "put") || leg.strike == null) return null;
      const intrinsic = leg.kind === "call" ? Math.max(0, spot - leg.strike) : Math.max(0, leg.strike - spot);
      total += sign * (intrinsic - premium) * qty * 100;
    }
    return total;
  }

  function openedValue(group) {
    if (group.tape && group.tape.daysOpen != null) return -group.tape.daysOpen;
    const iso = whenISO(group.when);
    const date = iso ? parseISO(iso) : null;
    return date ? date.getTime() : null;
  }

  function resultNote(groups) {
    const legs = [];
    groups.forEach((group) => group.legs.forEach((leg) => legs.push(leg)));
    const hasOpen = legs.some((leg) => leg.plOpen != null);
    const hasMid = legs.some((leg) => leg.bid != null && leg.ask != null && legResult(leg) != null && leg.plOpen == null);
    if (hasOpen && hasMid) return "Result uses P/L Open from the file when that column is filled. Otherwise it is the bid/ask middle against the trade price. An option uses 100 shares a contract. A card the file cannot price stays at the end.";
    if (hasOpen) return "Result is P/L Open from the file. A card the file cannot price stays at the end.";
    if (hasMid) return "Result is the bid/ask middle against the trade price in the file. An option uses 100 shares a contract. The file has no P/L Open column. A card the file cannot price stays at the end.";
    return "This file has no P/L Open column and no bid and ask, so there is no result to sort.";
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
    const sentences = [];
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

  function barsFromYahoo(payload) {
    const result = (((payload || {}).chart || {}).result || [null])[0] || {};
    const stamps = result.timestamp || [];
    const closes = (((result.indicators || {}).quote || [{}])[0].close) || [];
    const chosen = {};
    for (let i = 0; i < stamps.length; i++) {
      const stamp = stamps[i];
      const close = closes[i];
      if (stamp == null || close == null || !(close > 0)) continue;
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date(stamp * 1000));
      chosen[date] = Math.round(close * 10000) / 10000;
    }
    return Object.keys(chosen).sort().map((date) => ({ date: date, close: chosen[date] }));
  }

  function keepBars(bars) {
    return bars && bars.length >= 8 ? bars : null;
  }

  function loadBars(symbol) {
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)) return Promise.resolve(null);
    if (Object.prototype.hasOwnProperty.call(quoteCache, symbol)) return Promise.resolve(quoteCache[symbol]);
    function remember(bars) {
      const kept = keepBars(bars);
      if (kept) quoteCache[symbol] = kept;
      return kept;
    }
    function fromYahoo() {
      const yahoo = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) + "?range=2y&interval=1d";
      return fetch("https://proxy.cors.dev/" + yahoo, { signal: AbortSignal.timeout(15000) }).then((response) => {
        if (!response.ok) throw new Error("status");
        return response.json();
      }).then((payload) => remember(barsFromYahoo(payload))).catch(() => null);
    }
    function start() {
      quoteActive += 1;
      return fetch("quote?symbol=" + encodeURIComponent(symbol)).then((response) => {
        if (!response.ok) throw new Error("status");
        return response.json();
      }).then((data) => remember(data && data.bars)).catch(() => fromYahoo()).then((bars) => {
        quoteActive -= 1;
        const next = quoteWait.shift();
        if (next) next();
        return bars;
      });
    }
    if (quoteActive >= 4) return new Promise((resolve) => quoteWait.push(() => resolve(start())));
    return start();
  }

  const SHAPES = {
    "long-call": [[0.04, -0.42], [0.46, -0.42], [0.94, 0.74]],
    "long-put": [[0.06, 0.74], [0.54, -0.42], [0.96, -0.42]],
    "covered-call": [[0.04, -0.78], [0.5, 0.36], [0.96, 0.36]],
    "cash-secured-put": [[0.04, -0.78], [0.5, 0.36], [0.96, 0.36]],
    "wheel": [[0.04, -0.78], [0.5, 0.36], [0.96, 0.36]],
    "protective-put": [[0.04, -0.38], [0.44, -0.38], [0.96, 0.74]],
    "bull-call": [[0.04, -0.46], [0.34, -0.46], [0.64, 0.4], [0.96, 0.4]],
    "bear-put": [[0.04, 0.4], [0.36, 0.4], [0.66, -0.46], [0.96, -0.46]],
    "iron-condor": [[0.04, -0.4], [0.18, -0.4], [0.34, 0.4], [0.66, 0.4], [0.82, -0.4], [0.96, -0.4]],
    "straddle": [[0.08, 0.74], [0.5, -0.58], [0.92, 0.74]],
    "strangle": [[0.06, 0.7], [0.28, -0.42], [0.72, -0.42], [0.94, 0.7]],
    "calendar": [[0.08, -0.36], [0.26, -0.06], [0.38, 0.28], [0.5, 0.58], [0.62, 0.28], [0.74, -0.06], [0.92, -0.36]],
    "short-call": [[0.04, 0.36], [0.5, 0.36], [0.96, -0.78]],
    "short-put": [[0.04, -0.78], [0.5, 0.36], [0.96, 0.36]],
    "put-credit": [[0.04, -0.46], [0.34, -0.46], [0.66, 0.4], [0.96, 0.4]],
    "call-credit": [[0.04, 0.4], [0.36, 0.4], [0.66, -0.46], [0.96, -0.46]],
    "short-strangle": [[0.06, -0.7], [0.28, 0.42], [0.72, 0.42], [0.94, -0.7]],
    "short-calendar": [[0.08, 0.36], [0.26, 0.06], [0.38, -0.28], [0.5, -0.58], [0.62, -0.28], [0.74, 0.06], [0.92, 0.36]],
    "diagonal": [[0.06, -0.4], [0.34, -0.4], [0.66, 0.36], [0.94, 0.36]],
    "collar": [[0.06, -0.36], [0.28, -0.36], [0.72, 0.36], [0.94, 0.36]],
    "stock-sale": [[0.08, 0.7], [0.92, -0.7]],
    "shares": [[0.08, -0.7], [0.92, 0.7]]
  };

  const LESSON_SHAPE = {
    "long-call": true, "long-put": true, "covered-call": true, "cash-secured-put": true,
    "wheel": true, "protective-put": true, "bull-call": true, "bear-put": true,
    "iron-condor": true, "straddle": true, "strangle": true, "calendar": true
  };

  const GLOSSARY = {
    "one usual 20-session moves": "The size of an ordinary 20-session move, set by realized volatility. The lesson’s hard rise or hard drop finishes outside one of these.",
    "one usual 20-session move": "The size of an ordinary 20-session move, set by realized volatility. The lesson’s hard rise or hard drop finishes outside one of these.",
    "two standard deviations": "Twice the width of the usual range. The pale band on the price picture is this width.",
    "one standard deviation": "The lesson’s usual range. About 68% of finishes land inside a band this wide. The deeper band on the picture is this range. The lesson’s hard move is a finish outside it.",
    "one-standard-deviation": "The lesson’s usual range. About 68% of finishes land inside a band this wide. The deeper band on the picture is this range. The lesson’s hard move is a finish outside it.",
    "standard deviations": "How far finishes scatter around the price. One standard deviation is the lesson’s usual range.",
    "standard deviation": "How far finishes scatter around the price. One standard deviation is the lesson’s usual range.",
    "realized volatility": "How much the stock has actually moved. Here it is the annualized size of the daily closes, and it sets how wide one usual move is.",
    "implied volatility": "The move the option’s price is charging for. It is in the premium, not in the daily closes. Realized volatility is the move that already happened.",
    "volatility crush": "The drop in an option’s price when implied volatility falls, even if the stock itself has barely moved.",
    "out-of-the-money": "The strike is on the side that expires worthless if the stock stays here. A call is out of the money when its strike is above the price. A put is out of the money when its strike is below the price.",
    "out of the money": "The strike is on the side that expires worthless if the stock stays here. A call is out of the money when its strike is above the price. A put is out of the money when its strike is below the price.",
    "in-the-money": "The strike is already on the paying side. A call is in the money when its strike is below the price. A put is in the money when its strike is above the price.",
    "in the money": "The strike is already on the paying side. A call is in the money when its strike is below the price. A put is in the money when its strike is above the price.",
    "at-the-money": "The strike and the price are the same. The lesson’s straddle buys the call and the put there.",
    "at the money": "The strike and the price are the same. The lesson’s straddle buys the call and the put there.",
    "usual ranges": "One standard deviation. About 68% of finishes land inside it. The lesson’s hard move is a finish outside it.",
    "usual range": "One standard deviation. About 68% of finishes land inside it. The lesson’s hard move is a finish outside it.",
    "usual moves": "The distance realized volatility says the stock tends to travel over the days left. One usual move is that distance.",
    "usual move": "The distance realized volatility says the stock tends to travel over the days left. One usual move is that distance.",
    "time decay": "The premium an option loses as expiration gets closer, when the stock has not moved enough to replace it.",
    "iv rank": "A reading from the file of where implied volatility sits against that name’s own range. High means the option is expensive versus that history. Low means it is cheap versus that history.",
    "assignment": "The short option is exercised. A short put becomes a purchase of shares at the strike. A short call becomes a sale of shares at the strike.",
    "annualized": "A daily move scaled up to a year. Here, realized volatility is the standard deviation of daily log returns, times the square root of 252.",
    "breakevens": "The price at expiration where the trade is neither ahead nor behind. A long call breaks even at the strike plus the premium.",
    "breakeven": "The price at expiration where the trade is neither ahead nor behind. A long call breaks even at the strike plus the premium.",
    "premiums": "The price of the option. A debit pays it. A credit receives it.",
    "premium": "The price of the option. A debit pays it. A credit receives it.",
    "debits": "Cash leaves the account to open the trade. On a long option, the most you can lose is that debit.",
    "debit": "Cash leaves the account to open the trade. On a long option, the most you can lose is that debit.",
    "credits": "Cash comes in to open the trade. If the options expire worthless, the gain stops at that credit.",
    "credit": "Cash comes in to open the trade. If the options expire worthless, the gain stops at that credit.",
    "expirations": "The date the contract ends. After that, the option is exercised or it expires worthless.",
    "expiration": "The date the contract ends. After that, the option is exercised or it expires worthless.",
    "strikes": "The share price written into the contract. A call pays above it. A put pays below it.",
    "strike": "The share price written into the contract. A call pays above it. A put pays below it."
  };

  const TERM_SOURCE = "\\b(?:" + Object.keys(GLOSSARY).sort((a, b) => b.length - a.length).map((phrase) => {
    return phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("|") + ")\\b";

  let tipSeq = 0;

  function termControl(label, tipText, href) {
    const wrap = el("span", "term");
    const control = document.createElement(href ? "a" : "button");
    if (href) control.href = href;
    else control.type = "button";
    control.className = "term-btn";
    control.textContent = label;
    const tip = el("span", "term-tip");
    const tipId = "tip-" + (++tipSeq);
    tip.id = tipId;
    tip.setAttribute("role", "tooltip");
    tip.textContent = tipText;
    control.setAttribute("aria-describedby", tipId);
    wrap.append(control, tip);
    return wrap;
  }

  function linkTerms(text) {
    const frag = document.createDocumentFragment();
    const pattern = new RegExp(TERM_SOURCE, "gi");
    let last = 0;
    let match = pattern.exec(text);
    while (match) {
      if (match.index > last) frag.append(document.createTextNode(text.slice(last, match.index)));
      const tipText = GLOSSARY[match[0].toLowerCase()];
      if (tipText) frag.append(termControl(match[0], tipText));
      else frag.append(document.createTextNode(match[0]));
      last = match.index + match[0].length;
      match = pattern.exec(text);
    }
    if (last < text.length) frag.append(document.createTextNode(text.slice(last)));
    return frag;
  }

  function setLinked(node, text) {
    node.replaceChildren(linkTerms(text || ""));
  }

  function placeTip(term) {
    const tip = term.querySelector(".term-tip");
    const anchor = term.querySelector(".term-btn");
    if (!tip || !anchor) return;
    const box = anchor.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight || box.width === 0) {
      term.classList.remove("placed");
      return;
    }
    const margin = 8;
    const tipWidth = tip.offsetWidth;
    const tipHeight = tip.offsetHeight;
    let left = box.left;
    if (left + tipWidth > window.innerWidth - margin) left = window.innerWidth - margin - tipWidth;
    if (left < margin) left = margin;
    const article = term.closest("article");
    const articleBox = article ? article.getBoundingClientRect() : null;
    let top = box.bottom - 2;
    const pastArticle = articleBox && top + tipHeight > articleBox.bottom - margin;
    const pastView = top + tipHeight > window.innerHeight - margin;
    if ((pastArticle || pastView) && box.top - tipHeight >= margin) top = box.top - tipHeight + 2;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
    term.classList.add("placed");
  }

  function closeTips(except) {
    results.querySelectorAll(".term.placed, .term.open").forEach((node) => {
      if (node === except) return;
      node.classList.remove("placed", "open");
    });
  }

  function joinAnd(parts) {
    if (parts.length < 2) return parts[0] || "";
    if (parts.length === 2) return parts[0] + " and " + parts[1];
    return parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1];
  }

  function expirationDates(legs) {
    const dates = [];
    legs.forEach((leg) => {
      if (leg.expiration && dates.indexOf(leg.expiration) === -1) dates.push(leg.expiration);
    });
    dates.sort();
    return dates;
  }

  function expirationNote(id, legs) {
    const dates = expirationDates(legs);
    if (dates.length < 2) return "";
    const list = joinAnd(dates.map(prettyISO));
    if (id === "strangle") return "The lesson’s strangle keeps one expiration. These legs expire on " + list + ". The flat bottom is the shape of the two strikes.";
    if (id === "straddle") return "The lesson’s straddle keeps one expiration. These legs expire on " + list + ".";
    if (id === "diagonal") return "The lesson’s calendar keeps one strike and changes the month. These legs change the strike and the month. They expire on " + list + ".";
    if (id === "calendar" || id === "short-calendar") return "";
    return "These legs expire on " + list + ". The band uses the nearer date.";
  }

  function shapeNote(id, legs) {
    if (!SHAPES[id]) return "The study page has no payoff picture for these legs. The band below still marks the strikes against the price.";
    let note = LESSON_SHAPE[id]
      ? "The payoff shape from the study page and the scenario deck. "
      : "The payoff shape for these legs. ";
    note += "The drawing shows the shape.";
    if (id === "wheel") note += " One phase, the same shape as the cash-secured put.";
    const extra = expirationNote(id, legs);
    if (extra) note += " " + extra;
    return note;
  }

  function moneySide(leg, spot) {
    if (leg.strike === spot) return "at the money";
    if (leg.kind === "call") return leg.strike < spot ? "in the money" : "out of the money";
    if (leg.kind === "put") return leg.strike > spot ? "in the money" : "out of the money";
    return "";
  }

  function fillReading(options, spot, source) {
    if (options.length <= 6) {
      return "Against " + source + " of " + money(spot) + ", " + joinAnd(options.map((leg) => {
        return "the " + leg.side + " " + leg.strike + " " + leg.kind + " is " + moneySide(leg, spot);
      })) + ".";
    }
    const groups = [];
    const index = {};
    options.forEach((leg) => {
      const side = moneySide(leg, spot);
      const key = leg.side + "|" + leg.kind + "|" + side;
      if (!index[key]) {
        index[key] = { side: leg.side, kind: leg.kind, money: side, strikes: [] };
        groups.push(index[key]);
      }
      index[key].strikes.push(leg.strike);
    });
    const parts = groups.map((group) => {
      group.strikes.sort((a, b) => a - b);
      const many = group.strikes.length > 1;
      return "the " + group.side + " " + (many ? group.kind + "s" : group.kind) + " at " + listStrikes(group.strikes) + " " + (many ? "are" : "is") + " " + group.money;
    });
    return "Against " + source + " of " + money(spot) + ", " + joinAnd(parts) + ".";
  }

  function bandFacts(group, bars) {
    const tape = group.tape || {};
    const spotFile = Number.isFinite(tape.fileSpot) ? tape.fileSpot : null;
    const loaded = !!(bars && bars.length);
    let spotNow = null;
    let rv = null;
    let asOf = "";
    if (loaded) {
      const last = bars[bars.length - 1];
      spotNow = last.close;
      asOf = last.date;
      rv = realizedVol(bars, bars.length - 1);
    }
    return {
      spot: spotNow != null ? spotNow : spotFile,
      rv: rv,
      asOf: asOf,
      left: daysLeft(group, asOf),
      nearer: expirationDates(group.legs)[0] || "",
      loaded: loaded,
      waiting: bars === undefined,
      datesDiffer: expirationDates(group.legs).length > 1
    };
  }

  function sdWhere(which, facts) {
    if (facts.waiting) return "The daily closes are still loading, so this mark is not on the picture yet.";
    if (!facts.loaded) return "The daily closes did not load, so this mark is not on the picture.";
    if (facts.spot == null) return "The price did not load, so this mark is not on the picture.";
    if (!facts.rv) return "Realized volatility did not compute from the daily closes, so this mark is not on the picture.";
    if (!facts.left.days) return "No days are left to the nearer expiration, so this mark is not a band on the picture.";
    const width = facts.spot * facts.rv * Math.sqrt(facts.left.days / 365) * which;
    const dayWord = facts.left.days === 1 ? " day" : " days";
    const when = facts.left.fromFile
      ? "over the " + facts.left.days + dayWord + " left in the file"
      : "over the " + facts.left.days + dayWord + " left";
    const date = facts.nearer ? ", to " + prettyISO(facts.nearer) : "";
    const nearer = facts.datesDiffer ? " Measured to the nearer expiration." : "";
    return "From the last close it runs from " + money(facts.spot - width) + " to " + money(facts.spot + width) + ", " + when + date + "." + nearer;
  }

  function svgEl(name, attrs) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.keys(attrs).forEach((key) => node.setAttribute(key, attrs[key]));
    return node;
  }

  function payoffArrow(svg, x, y, dx, dy) {
    const len = 8;
    const wing = 3.6;
    const points = [
      [x, y],
      [x - dx * len + -dy * wing, y - dy * len + dx * wing],
      [x - dx * len - -dy * wing, y - dy * len - dx * wing]
    ].map((pair) => pair[0].toFixed(1) + "," + pair[1].toFixed(1)).join(" ");
    svg.append(svgEl("polygon", { points: points, fill: "var(--color-ink)" }));
  }

  function drawPayoff(host, id, prefix, name) {
    host.replaceChildren();
    const points = SHAPES[id];
    if (!points) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    const left = 52;
    const right = 184;
    const top = 36;
    const bottom = 180;
    const zero = (top + bottom) / 2;
    const span = (bottom - top) / 2;
    const clipId = prefix + "-clip";
    const svg = svgEl("svg", {
      viewBox: "0 0 220 220",
      class: "fit-svg",
      role: "img",
      "aria-label": name + " payoff at expiration"
    });
    const defs = svgEl("defs", {});
    const clip = svgEl("clipPath", { id: clipId });
    clip.append(svgEl("circle", { cx: "110", cy: "108", r: "84" }));
    defs.append(clip);
    svg.append(defs);
    function X(t) { return left + t * (right - left); }
    function Y(value) { return zero - value * span * 0.92; }
    const mapped = points.map((pair) => ({ x: X(pair[0]), y: Y(pair[1]), v: pair[1] }));
    const plot = svgEl("g", { "clip-path": "url(#" + clipId + ")" });
    function poly(pts, fill) {
      const d = pts.map((point, index) => (index ? "L" : "M") + point.x.toFixed(1) + " " + point.y.toFixed(1)).join(" ") + " Z";
      plot.append(svgEl("path", { d: d, fill: fill }));
    }
    for (let i = 0; i < mapped.length - 1; i += 1) {
      const a = mapped[i];
      const b = mapped[i + 1];
      const sameSide = (a.v >= 0 && b.v >= 0) || (a.v <= 0 && b.v <= 0);
      if (sameSide) {
        const sign = a.v > 0 || b.v > 0 ? 1 : -1;
        if (a.v === 0 && b.v === 0) continue;
        poly([a, b, { x: b.x, y: zero }, { x: a.x, y: zero }], sign > 0 ? "var(--color-gain-wash)" : "var(--color-loss-wash)");
      } else {
        const t = (0 - a.v) / (b.v - a.v);
        const mid = { x: a.x + t * (b.x - a.x), y: zero, v: 0 };
        poly([a, mid, { x: a.x, y: zero }], a.v > 0 ? "var(--color-gain-wash)" : "var(--color-loss-wash)");
        poly([mid, b, { x: b.x, y: zero }], b.v > 0 ? "var(--color-gain-wash)" : "var(--color-loss-wash)");
      }
    }
    plot.append(svgEl("path", {
      d: mapped.map((point, index) => (index ? "L" : "M") + point.x.toFixed(1) + " " + point.y.toFixed(1)).join(" "),
      fill: "none",
      stroke: "var(--color-ink)",
      "stroke-width": "2.5",
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    }));
    svg.append(plot);
    svg.append(svgEl("circle", {
      cx: "110", cy: "108", r: "86", fill: "none", stroke: "var(--color-ink)", "stroke-width": "3"
    }));
    const axisX = left + 4;
    svg.append(svgEl("line", {
      x1: String(axisX), y1: String(top + 10), x2: String(axisX), y2: String(bottom - 8),
      stroke: "var(--color-ink)", "stroke-width": "1.6"
    }));
    payoffArrow(svg, axisX, top + 2, 0, -1);
    payoffArrow(svg, axisX, bottom, 0, 1);
    svg.append(svgEl("line", {
      x1: String(left), y1: String(zero), x2: String(right - 10), y2: String(zero),
      stroke: "var(--color-ink)", "stroke-width": "1.6", "stroke-dasharray": "2 3"
    }));
    payoffArrow(svg, right, zero, 1, 0);
    host.append(svg);
  }

  function textWidth(text) {
    return String(text).length * 10.2;
  }

  function labelBox(x, w, anchor) {
    if (anchor === "start") return { left: x, right: x + w };
    if (anchor === "end") return { left: x - w, right: x };
    return { left: x - w / 2, right: x + w / 2 };
  }

  function layoutCallouts(items, left, right) {
    const gap = 10;
    const sorted = items.slice().sort((a, b) => a.x - b.x || String(a.text).localeCompare(String(b.text)));
    const rows = [];
    sorted.forEach((item, index) => {
      const prevX = index > 0 ? sorted[index - 1].x : null;
      const nextX = index < sorted.length - 1 ? sorted[index + 1].x : null;
      let row = 0;
      let placed = false;
      while (row < 6 && !placed) {
        const corridor = row === 0 && !item.lockX;
        const lo = corridor && prevX != null ? Math.max(left, prevX + 4) : left;
        const hi = corridor && nextX != null ? Math.min(right, nextX - 4) : right;
        const anchors = item.lockX ? [["middle", item.x]] : [["middle", item.x], ["start", item.x], ["end", item.x]];
        const rowItems = rows[row] || [];
        const candidates = [];
        const shifted = [];
        anchors.forEach((pair) => {
          candidates.push({ anchor: pair[0], x: pair[1] });
          let x = pair[1];
          let box = labelBox(x, item.w, pair[0]);
          if (box.left < lo) x += lo - box.left;
          box = labelBox(x, item.w, pair[0]);
          if (box.right > hi) x -= box.right - hi;
          if (Math.abs(x - pair[1]) > 0.5) shifted.push({ anchor: pair[0], x: x });
        });
        shifted.forEach((candidate) => candidates.push(candidate));
        for (let c = 0; c < candidates.length; c++) {
          const candidate = candidates[c];
          const box = labelBox(candidate.x, item.w, candidate.anchor);
          if (box.left < lo - 0.5 || box.right > hi + 0.5) continue;
          let hit = false;
          for (let i = 0; i < rowItems.length; i++) {
            const other = rowItems[i];
            if (box.left < other.edge + gap && box.right > other.left - gap) hit = true;
          }
          if (hit) continue;
          item.labelX = candidate.x;
          item.anchor = candidate.anchor;
          item.row = row;
          item.left = box.left;
          item.edge = box.right;
          if (!rows[row]) rows[row] = [];
          rows[row].push(item);
          placed = true;
          break;
        }
        if (!placed) row += 1;
      }
      if (!placed) {
        const box = labelBox(item.x, item.w, "middle");
        item.labelX = item.x;
        item.anchor = "middle";
        item.row = row;
        item.left = box.left;
        item.edge = box.right;
      }
    });
  }

  function fitCallouts(marks, left, right) {
    function apply(wide) {
      const items = marks.map((mark) => {
        const brief = mark.leg.strike + " " + mark.leg.kind;
        const text = wide ? mark.leg.side + " " + brief : brief;
        return {
          leg: mark.leg,
          text: text,
          x: mark.x,
          w: textWidth(text),
          lockX: !!mark.lockX
        };
      });
      layoutCallouts(items, left, right);
      const rows = items.reduce((max, item) => Math.max(max, (item.row || 0) + 1), 1);
      return { items: items, rows: rows };
    }
    const full = apply(true);
    if (full.rows <= 1) return full;
    const brief = apply(false);
    return brief.rows < full.rows ? brief : full;
  }

  function drawBand(host, facts, legs) {
    host.replaceChildren();
    if (facts.spot == null) return;
    const spot = facts.spot;
    const days = facts.left && facts.left.days;
    const move = facts.rv && days ? spot * facts.rv * Math.sqrt(days / 365) : null;
    const options = [];
    const seen = {};
    legs.forEach((leg) => {
      if ((leg.kind !== "call" && leg.kind !== "put") || leg.strike == null) return;
      const key = leg.strike + "|" + leg.kind;
      if (seen[key]) return;
      seen[key] = true;
      options.push(leg);
    });
    const book = legs.filter((leg) => leg.kind === "stock" || ((leg.kind === "call" || leg.kind === "put") && leg.strike != null));
    const priced = book.length > 0 && book.every((leg) => premiumOf(leg) != null);
    let longQty = 0;
    let shortQty = 0;
    options.forEach((leg) => {
      if (leg.side === "short") shortQty += leg.qty || 1;
      else longQty += leg.qty || 1;
    });
    const bias = shortQty > 0 && longQty === 0 ? "credit" : (longQty > 0 && shortQty === 0 ? "debit" : "mixed");
    function valueAt(price) {
      let total = 0;
      book.forEach((leg) => {
        const qty = leg.qty || 1;
        const sign = leg.side === "short" ? -1 : 1;
        if (leg.kind === "stock") {
          if (!priced) return;
          total += sign * (price - premiumOf(leg)) * qty;
          return;
        }
        const intrinsic = leg.kind === "call" ? Math.max(0, price - leg.strike) : Math.max(0, leg.strike - price);
        total += sign * (intrinsic - (priced ? premiumOf(leg) : 0)) * qty;
      });
      if (!priced && Math.abs(total) < 1e-9) {
        if (bias === "credit") return 1;
        if (bias === "debit") return -1;
      }
      return total;
    }
    const prices = [spot].concat(options.map((leg) => leg.strike));
    if (move) prices.push(spot - 2 * move, spot + 2 * move);
    if (options.length) {
      const strikes = options.map((leg) => leg.strike).sort((a, b) => a - b);
      const span = Math.max(strikes[strikes.length - 1] - strikes[0], spot * 0.02, 1);
      const knots = [strikes[0] - span, strikes[strikes.length - 1] + span].concat(strikes);
      knots.sort((a, b) => a - b);
      for (let i = 0; i < knots.length - 1; i++) {
        const va = valueAt(knots[i]);
        const vb = valueAt(knots[i + 1]);
        if ((va > 0 && vb < 0) || (va < 0 && vb > 0)) {
          prices.push(knots[i] + (0 - va) / (vb - va) * (knots[i + 1] - knots[i]));
        }
      }
    }
    let lo = Math.min.apply(null, prices);
    let hi = Math.max.apply(null, prices);
    if (!(hi > lo)) {
      lo = spot * 0.98;
      hi = spot * 1.02;
    }
    const pad = (hi - lo) * 0.1;
    lo -= pad;
    hi += pad;
    const width = 420;
    const plotL = 16;
    const plotR = 404;
    function X(price) { return plotL + (price - lo) / (hi - lo) * (plotR - plotL); }
    const strikeCount = {};
    options.forEach((leg) => {
      strikeCount[leg.strike] = (strikeCount[leg.strike] || 0) + 1;
    });
    const marks = options.map((leg) => ({
      leg: leg,
      x: X(leg.strike),
      lockX: strikeCount[leg.strike] > 1
    })).sort((a, b) => a.x - b.x || (a.leg.kind === "put" ? -1 : 1));
    // Dots this size sit on each other when the gap is under 28. Those strikes share an enlarged strip.
    const groups = [];
    marks.forEach((mark) => {
      const last = groups[groups.length - 1];
      const samePrice = last && last[last.length - 1].leg.strike === mark.leg.strike;
      if (last && !samePrice && mark.x - last[last.length - 1].x < 28) last.push(mark);
      else groups.push([mark]);
    });
    const zoom = [];
    const singles = [];
    groups.forEach((group) => {
      const span = group[group.length - 1].leg.strike - group[0].leg.strike;
      if (group.length > 1 && span > 0) zoom.push.apply(zoom, group);
      else group.forEach((mark) => singles.push(mark));
    });
    zoom.sort((a, b) => a.leg.strike - b.leg.strike || (a.leg.kind === "put" ? -1 : 1));

    const axisY = move ? 124 : 56;
    const bandH = 22;
    const bandTop = axisY - bandH / 2;
    const bandBottom = axisY + bandH / 2;
    const stripH = 9;
    const stripTop = bandBottom + 2;
    const stripBottom = stripTop + stripH;
    const labelPitch = 22;
    let inset = null;
    if (zoom.length) {
      const strikes = zoom.map((mark) => mark.leg.strike);
      let zLo = Math.min.apply(null, strikes);
      let zHi = Math.max.apply(null, strikes);
      const span = Math.max(zHi - zLo, 1);
      const zPad = Math.max(span * 0.28, 1);
      zLo -= zPad;
      zHi += zPad;
      function ZX(price) { return plotL + (price - zLo) / (zHi - zLo) * (plotR - plotL); }
      const zoomMarks = zoom.map((mark) => ({
        leg: mark.leg,
        x: ZX(mark.leg.strike),
        lockX: strikeCount[mark.leg.strike] > 1
      }));
      const fit = fitCallouts(zoomMarks, plotL, plotR);
      inset = { lo: zLo, hi: zHi, X: ZX, fit: fit, h: bandH + 3 + stripH + 16 + fit.rows * labelPitch };
    }
    let stemL = plotL;
    let stemR = plotR;
    if (zoom.length) {
      stemL = Math.min.apply(null, zoom.map((mark) => mark.x));
      stemR = Math.max.apply(null, zoom.map((mark) => mark.x));
      const stemMid = (stemL + stemR) / 2;
      if (stemR - stemL < 16) {
        stemL = stemMid - 8;
        stemR = stemMid + 8;
      }
      stemL = Math.max(plotL, stemL);
      stemR = Math.min(plotR, stemR);
    }
    const leftSingles = inset ? singles.filter((mark) => mark.x < stemL) : [];
    const rightSingles = inset ? singles.filter((mark) => mark.x > stemR) : [];
    const leftFit = leftSingles.length && stemL - 8 > plotL + 24 ? fitCallouts(leftSingles, plotL, stemL - 8) : null;
    const rightFit = rightSingles.length && stemR + 8 < plotR - 24 ? fitCallouts(rightSingles, stemR + 8, plotR) : null;
    const singleFit = !inset && singles.length ? fitCallouts(singles, plotL, plotR) : null;
    let cursor = stripBottom + 4;
    let funnelTop = 0;
    let funnelNeck = 0;
    let funnelBottom = 0;
    let insetTop = 0;
    let insetBottom = 0;
    let calloutTop = 0;
    if (inset && (leftFit || rightFit)) {
      const besideRows = Math.max(leftFit ? leftFit.rows : 0, rightFit ? rightFit.rows : 0);
      calloutTop = stripBottom + 4;
      funnelTop = stripBottom + 2;
      funnelNeck = calloutTop + besideRows * labelPitch + 4;
      funnelBottom = funnelNeck + 16;
      insetTop = funnelBottom;
      insetBottom = insetTop + inset.h;
      cursor = insetBottom + 8;
    } else if (inset) {
      funnelTop = cursor;
      funnelNeck = funnelTop;
      funnelBottom = funnelTop + 16;
      insetTop = funnelBottom;
      insetBottom = insetTop + inset.h;
      cursor = insetBottom + 2;
    }
    if (singleFit) {
      calloutTop = cursor + 8;
      cursor = calloutTop + singleFit.rows * labelPitch;
    }
    const height = Math.max(cursor + 8, bandBottom + 14);
    const aria = (move
      ? "Price band. The deeper blue is one standard deviation, the usual range, from " + money(spot - move) + " to " + money(spot + move) + ". The pale blue is two standard deviations, from " + money(spot - 2 * move) + " to " + money(spot + 2 * move) + ". "
      : "Price band. ")
      + "The marked price is " + money(spot) + ". "
      + "Green is a gain at expiration. Red is a loss. A filled dot is long and an open dot is short. Strikes that land on the same spot are enlarged below.";
    const svg = svgEl("svg", {
      viewBox: "0 0 " + width + " " + height,
      class: "band-svg",
      role: "img",
      "aria-label": aria
    });
    function n1(value) { return value.toFixed(1); }
    function paintLabel(text, x, y, anchor, fill, size, family) {
      const node = svgEl("text", {
        x: n1(x),
        y: String(y),
        "text-anchor": anchor || "middle",
        fill: fill || "var(--color-ink)",
        "font-family": family || "IBM Plex Mono, ui-monospace, monospace",
        "font-size": size || "16"
      });
      node.textContent = text;
      svg.append(node);
    }
    function addLine(x1, y1, x2, y2, color, sw) {
      svg.append(svgEl("line", {
        x1: n1(x1), y1: n1(y1), x2: n1(x2), y2: n1(y2),
        stroke: color, "stroke-width": String(sw), "stroke-linecap": "butt"
      }));
    }
    function addRect(x, y, w, h, fill) {
      if (!(w > 0) || !(h > 0)) return;
      svg.append(svgEl("rect", {
        x: n1(x), y: n1(y), width: n1(w), height: n1(h), fill: fill
      }));
    }
    function paintZones(xOf, y, h, zoneLo, zoneHi) {
      const cuts = [zoneLo, zoneHi];
      if (move) {
        [spot - 2 * move, spot - move, spot + move, spot + 2 * move].forEach((price) => {
          if (price > zoneLo && price < zoneHi) cuts.push(price);
        });
      }
      cuts.sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i];
        const b = cuts[i + 1];
        const mid = (a + b) / 2;
        let fill = "var(--color-band-out)";
        if (move) {
          const dist = Math.abs(mid - spot);
          if (dist <= move) fill = "var(--color-sd-1)";
          else if (dist <= 2 * move) fill = "var(--color-sd-2)";
        }
        const x1 = xOf(a);
        const x2 = xOf(b);
        addRect(Math.min(x1, x2) - 0.4, y, Math.abs(x2 - x1) + 0.8, h, fill);
      }
    }
    function paintOutcome(xOf, y, h, zoneLo, zoneHi) {
      const cuts = [zoneLo, zoneHi];
      book.forEach((leg) => {
        if (leg.strike != null && leg.strike > zoneLo && leg.strike < zoneHi) cuts.push(leg.strike);
      });
      cuts.sort((a, b) => a - b);
      const points = [];
      cuts.forEach((price) => {
        if (!points.length || price - points[points.length - 1] > 1e-4) points.push(price);
      });
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const va = valueAt(a);
        const vb = valueAt(b);
        const pieces = [];
        if ((va > 0 && vb < 0) || (va < 0 && vb > 0)) {
          const zero = a + (0 - va) / (vb - va) * (b - a);
          pieces.push([a, zero, va], [zero, b, vb]);
        } else pieces.push([a, b, valueAt((a + b) / 2)]);
        pieces.forEach((piece) => {
          if (!(piece[2] > 0) && !(piece[2] < 0)) return;
          const x1 = xOf(piece[0]);
          const x2 = xOf(piece[1]);
          addRect(Math.min(x1, x2), y, Math.abs(x2 - x1), h, piece[2] > 0 ? "var(--color-gain)" : "var(--color-loss)");
        });
      }
    }
    function strikeDot(x, y, leg) {
      svg.append(svgEl("circle", {
        cx: n1(x), cy: n1(y), r: "8.5", fill: "var(--color-paper)"
      }));
      if (leg.side === "short") {
        svg.append(svgEl("circle", {
          cx: n1(x), cy: n1(y), r: "5.5",
          fill: "var(--color-paper)", stroke: "var(--color-ink)", "stroke-width": "2.25"
        }));
      } else {
        svg.append(svgEl("circle", {
          cx: n1(x), cy: n1(y), r: "6", fill: "var(--color-ink)"
        }));
      }
    }
    function leader(x1, y1, x2, yText) {
      const yRail = yText - 11;
      const yStart = Math.min(y1, yRail);
      const path = Math.abs(x1 - x2) < 4
        ? "M " + n1(x1) + " " + n1(yStart) + " L " + n1(x2) + " " + n1(yText)
        : "M " + n1(x1) + " " + n1(yStart) + " L " + n1(x1) + " " + n1(yRail)
          + " L " + n1(x2) + " " + n1(yRail) + " L " + n1(x2) + " " + n1(yText);
      svg.append(svgEl("path", {
        d: path, fill: "none", stroke: "var(--color-neutral)",
        "stroke-width": "1.25", "stroke-linejoin": "round", "stroke-linecap": "round"
      }));
    }
    function paintCallouts(fit, yStart, fromY) {
      fit.items.forEach((item) => {
        const baseline = yStart + 16 + item.row * labelPitch;
        leader(item.x, fromY, item.labelX, baseline - 16);
        paintLabel(item.text, item.labelX, baseline, item.anchor || "middle", "var(--color-ink)");
      });
    }

    function chipWidth(text) {
      return Math.max(64, text.length * 6.7 + 16);
    }
    function paintChip(text, center, anchorX, top, fill, ink, tick) {
      const w = chipWidth(text);
      const h = 22;
      let x = center - w / 2;
      if (x < 2) x = 2;
      if (x + w > width - 2) x = width - 2 - w;
      svg.append(svgEl("rect", {
        x: n1(x), y: n1(top), width: n1(w), height: n1(h),
        rx: "4", ry: "4", fill: fill
      }));
      paintLabel(text, x + w / 2, top + 15, "middle", ink, "12");
      const tickX = Math.max(x + 7, Math.min(x + w - 7, anchorX));
      addLine(tickX, top + h, tickX, top + h + 8, tick, 1.75);
    }
    function paintLegend(mult, name, top, fill, ink, tick) {
      const xL = X(spot - mult * move);
      const xR = X(spot + mult * move);
      const leftText = name + "-(" + money(spot - mult * move) + ")";
      const rightText = name + "-(" + money(spot + mult * move) + ")";
      const widthOf = chipWidth;
      const lw = widthOf(leftText);
      const rw = widthOf(rightText);
      const gap = 8;
      let cL = xL;
      let cR = xR;
      if (cL + lw / 2 + gap > cR - rw / 2) {
        const mid = (xL + xR) / 2;
        cL = mid - gap / 2 - lw / 2;
        cR = mid + gap / 2 + rw / 2;
      }
      if (cL - lw / 2 < 2) cL = 2 + lw / 2;
      if (cR + rw / 2 > width - 2) cR = width - 2 - rw / 2;
      if (cL + lw / 2 + gap > cR - rw / 2) {
        cL = 2 + lw / 2;
        cR = width - 2 - rw / 2;
      }
      paintChip(leftText, cL, xL, top, fill, ink, tick);
      paintChip(rightText, cR, xR, top, fill, ink, tick);
    }
    if (move) {
      paintLegend(2, "2SD", 0, "var(--color-sd-2)", "var(--color-sd-2-ink)", "var(--color-sd-2-ink)");
      paintLegend(1, "1SD", 32, "var(--color-sd-1)", "var(--color-paper)", "var(--color-sd-1)");
    }
    const spotX = X(spot);
    const priceY = move ? 100 : 36;
    const capAnchor = spotX < 70 ? "start" : (spotX > width - 70 ? "end" : "middle");
    paintLabel(money(spot), spotX, priceY, spotX < 56 ? "start" : (spotX > width - 56 ? "end" : "middle"), "var(--color-ink)");
    paintLabel("(Current Price)", spotX, move ? 78 : 14, capAnchor, "var(--color-muted)", "11", "IBM Plex Sans, sans-serif");
    paintZones(X, bandTop, bandH, lo, hi);
    paintOutcome(X, stripTop, stripH, lo, hi);
    addLine(plotL, axisY, plotR, axisY, "var(--color-ink)", 1.25);
    addLine(spotX, priceY + 4, spotX, stripBottom, "var(--color-ink)", 2.2);
    marks.forEach((mark) => strikeDot(mark.x, axisY, mark.leg));

    if (inset) {
      const mouth = funnelNeck > funnelTop + 1
        ? [[stemL, funnelTop], [stemR, funnelTop], [stemR, funnelNeck], [plotR, funnelBottom], [plotL, funnelBottom], [stemL, funnelNeck]]
        : [[stemL, funnelTop], [stemR, funnelTop], [plotR, funnelBottom], [plotL, funnelBottom]];
      svg.append(svgEl("polygon", {
        points: mouth.map((pair) => n1(pair[0]) + "," + n1(pair[1])).join(" "),
        fill: "var(--color-paper-2)",
        stroke: "var(--color-rule)",
        "stroke-width": "1"
      }));
      paintZones(inset.X, insetTop, bandH, inset.lo, inset.hi);
      paintOutcome(inset.X, insetTop + bandH + 3, stripH, inset.lo, inset.hi);
      addLine(plotL, insetTop + bandH / 2, plotR, insetTop + bandH / 2, "var(--color-ink)", 1.25);
      inset.fit.items.forEach((item) => strikeDot(item.x, insetTop + bandH / 2, item.leg));
      paintCallouts(inset.fit, insetTop + bandH + stripH + 7, insetTop + bandH / 2 + 10);
    }
    if (leftFit) paintCallouts(leftFit, calloutTop, axisY + 12);
    if (rightFit) paintCallouts(rightFit, calloutTop, axisY + 12);
    if (singleFit) paintCallouts(singleFit, calloutTop, axisY + 12);
    host.append(svg);
  }

  function settleRow(label, value, missing) {
    const row = el("p", "settle-row");
    row.append(el("span", "", label));
    const num = el("span", "settle-num", value == null ? missing : signedMoney(value));
    if (value > 0) num.classList.add("up");
    else if (value < 0) num.classList.add("down");
    row.append(num);
    return row;
  }

  function paintSettle(node, legs, spot) {
    node.replaceChildren();
    const book = legs.filter((leg) => leg.kind === "stock" || leg.kind === "call" || leg.kind === "put");
    if (!book.length) return;
    const today = groupResult({ legs: legs });
    const expiry = expiryValue(legs, spot);
    node.append(settleRow("P/L if closed today", today, "Not in the file"));
    node.append(settleRow("P/L if closed at expiration", expiry, spot == null ? "Price has not loaded" : "No trade price"));
    if (expiry != null) node.append(el("p", "settle-note", "Expiration is if the stock finishes at the marked price."));
  }

  function paintFacts(slot, bars) {
    const facts = bandFacts(slot.group, bars);
    const options = slot.group.legs.filter((leg) => (leg.kind === "call" || leg.kind === "put") && leg.strike != null)
      .slice().sort((a, b) => a.strike - b.strike || (a.kind === "put" ? -1 : 1));
    if (!options.length) slot.read.textContent = "";
    else if (facts.spot == null) {
      slot.read.textContent = facts.waiting
        ? "The price has not loaded, so these strikes are not marked in or out of the money yet."
        : "The price did not load, so these strikes are not marked in or out of the money.";
    } else slot.read.textContent = fillReading(options, facts.spot, facts.loaded ? "the last close" : "the file’s price");
    slot.sd1.textContent = sdWhere(1, facts);
    slot.sd2.textContent = sdWhere(2, facts);
    if (slot.outcome) slot.outcome.textContent = outcomeNote(slot.group.legs);
    if (slot.settle) paintSettle(slot.settle, slot.group.legs, facts.spot);
    drawBand(slot.band, facts, slot.group.legs);
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
        setLinked(slot.guess, tapeGuess(slot.group, slot.id, bars));
        paintFacts(slot, bars);
        done += 1;
        if (done < slots.length || token !== guessToken) return;
        if (failed === slots.length) {
          const extra = " Daily history did not load, so the trend is left out.";
          if (statusEl.textContent.indexOf("Daily history did not load") === -1) statusEl.textContent += extra;
        }
      });
    });
  }

  function factParts(group) {
    let opened = "";
    if (group.tape && group.tape.daysOpen != null) {
      const days = group.tape.daysOpen;
      opened = "Opened " + days + (days === 1 ? " day" : " days") + " ago";
    } else {
      const iso = whenISO(group.when);
      if (iso) opened = "Opened " + prettyISO(iso);
    }
    const dates = expirationDates(group.legs);
    let expires = "";
    if (dates.length === 1) expires = "Expires " + prettyISO(dates[0]);
    else if (dates.length > 1) expires = "Expires " + dates.map(prettyISO).join(", then ");
    const result = groupResult(group);
    return {
      opened: opened,
      expires: expires,
      result: result == null ? "No result in the file" : "Result " + signedMoney(result)
    };
  }

  function orderedCards() {
    const list = cards.slice();
    if (!sortMode) return list.sort((a, b) => a.index - b.index);
    const sense = (sortMode === "expires" ? 1 : -1) * sortDir;
    list.sort((a, b) => {
      const av = a[sortMode];
      const bv = b[sortMode];
      if (av == null && bv == null) return a.index - b.index;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -sense;
      if (av > bv) return sense;
      return a.index - b.index;
    });
    return list;
  }

  function paintSort() {
    Object.keys(sortButtons).forEach((mode) => {
      const button = sortButtons[mode];
      const on = sortMode === mode;
      button.setAttribute("aria-pressed", on ? "true" : "false");
      if (!on) button.textContent = mode === "opened" ? "Opened" : mode === "expires" ? "Expires" : "Result";
      else if (mode === "opened") button.textContent = sortDir === -1 ? "Opened, oldest first" : "Opened, newest first";
      else if (mode === "expires") button.textContent = sortDir === -1 ? "Expires, latest first" : "Expires, soonest first";
      else button.textContent = sortDir === -1 ? "Result, smallest first" : "Result, largest first";
    });
  }

  function applySort() {
    sorts.hidden = cards.length < 2;
    paintSort();
    orderedCards().forEach((card) => results.append(card.article));
  }

  function chooseSort(mode) {
    if (sortMode === mode) sortDir = -sortDir;
    else {
      sortMode = mode;
      sortDir = 1;
    }
    applySort();
  }

  function setOpen(article, open) {
    const body = article.querySelector(".position-body");
    const button = article.querySelector(".position-toggle");
    if (!body || !button) return;
    body.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
    const name = article.querySelector("h2").textContent;
    button.querySelector(".toggle-mark").textContent = open ? "\u2212" : "+";
    button.setAttribute("aria-label", (open ? "Hide " : "Show ") + name);
  }

  function paintShowAll() {
    const button = document.getElementById("show-all");
    if (!button) return;
    const bodies = [...results.querySelectorAll(".position-body")];
    const allOpen = bodies.length > 0 && bodies.every((body) => !body.hidden);
    button.textContent = allOpen ? "Hide all" : "Show all";
    button.setAttribute("aria-pressed", allOpen ? "true" : "false");
  }

  function render(groups) {
    const token = ++guessToken;
    results.replaceChildren();
    cards = [];
    if (!groups.length) {
      sorts.hidden = true;
      statusEl.textContent = "That paste had no positions to read.";
      return;
    }
    sortNote.textContent = resultNote(groups);
    statusEl.textContent = groups.length + (groups.length === 1 ? " position." : " positions.");
    const slots = [];
    groups.forEach((group, index) => {
      const id = classify(group.legs);
      const trade = profile(id, group.legs);
      const prefix = "t" + index;
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
      const what = el("p");
      setLinked(what, trade.what || trade.where);
      const goal = el("p");
      setLinked(goal, trade.best || trade.why || "");
      const where = el("p");
      if (trade.id && trade.where) setLinked(where, trade.where);
      const why = el("p");
      const whyBody = trade.best ? trade.why : "The guess below reads the price, the trend, and the volatility.";
      setLinked(why, "The structure the legs make is " + label + ". " + whyBody);
      const guess = el("p", "guess");
      setLinked(guess, tapeGuess(group, id));
      const slotFig = el("figure", "strategy-slot");
      slotFig.id = prefix + "-picture";
      const payoff = el("div", "fit");
      drawPayoff(payoff, id, prefix, trade.name);
      const slotCaption = el("figcaption");
      const slotNote = el("p", "slot-note");
      setLinked(slotNote, shapeNote(id, group.legs));
      slotCaption.append(el("p", "slot-name", trade.name), slotNote);
      slotFig.append(payoff, slotCaption);
      const figure = el("figure", "proof-mini");
      const band = el("div", "band");
      const settle = el("div", "settle");
      const outcome = el("p", "sd-where");
      const read = el("p", "fill-read");
      const terms = el("ul", "term-list");
      const sd1 = el("span");
      const sd2 = el("span");
      [
        ["In the money", "The strike is already on the paying side. A call is in the money when its strike is below the price. A put is in the money when its strike is above the price."],
        ["Out of the money", "The strike is on the side that expires worthless if the stock stays here. A call is out of the money when its strike is above the price. A put is out of the money when its strike is below the price."],
        ["At the money", "The strike and the price are the same. The lesson’s straddle buys the call and the put there."],
        ["One standard deviation", "The lesson’s usual range. About 68% of finishes land inside a band this wide. The deeper band on the picture is this range. The lesson’s hard move is a finish outside it."],
        ["Two standard deviations", "Twice the width of the usual range. The pale band on the picture is this range."]
      ].forEach((pair) => {
        const li = document.createElement("li");
        li.append(termControl(pair[0], pair[1]));
        terms.append(li);
      });
      read.id = prefix + "-read";
      read.tabIndex = -1;
      function whereLine(key, lead, span) {
        const line = el("p", "sd-where");
        line.id = prefix + "-" + key;
        line.tabIndex = -1;
        line.append(document.createTextNode(lead), span);
        return line;
      }
      const sd1Line = whereLine("sd1", "One standard deviation is the lesson’s usual range. ", sd1);
      const sd2Line = whereLine("sd2", "Two standard deviations are the wider band. ", sd2);
      const proofGrid = el("div", "proof-grid");
      const proofCopy = el("div", "proof-copy");
      proofCopy.append(settle, outcome, read, sd1Line, sd2Line, terms);
      proofGrid.append(band, proofCopy);
      figure.append(el("h3", "", "Where this fill sits"), proofGrid);
      const slot = { guess: guess, group: group, id: id, prefix: prefix, band: band, settle: settle, outcome: outcome, sd1: sd1, sd2: sd2, read: read };
      paintFacts(slot, undefined);
      const head = el("div", "position-head");
      const idBlock = el("div", "position-id");
      const toggle = el("button", "position-toggle");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", prefix + "-body");
      toggle.setAttribute("aria-label", "Show " + heading);
      const mark = el("span", "toggle-mark", "+");
      mark.setAttribute("aria-hidden", "true");
      toggle.append(mark);
      const parts = factParts(group);
      const facts = el("div", "position-facts");
      facts.append(el("p", "position-fact", parts.opened), el("p", "position-fact", parts.expires), el("p", "position-fact", parts.result));
      idBlock.append(title, facts);
      head.append(toggle, idBlock);
      const body = el("div", "position-body");
      body.id = prefix + "-body";
      body.hidden = true;
      const story = el("div", "position-story");
      const notes = el("div", "position-notes");
      story.append(slotFig, legs, el("h3", "", "What the legs are"), what, el("h3", "", "The goal"), goal);
      if (trade.id && trade.where) story.append(el("h3", "", "Where the lesson uses it"), where);
      story.append(
        el("h3", "", "Why this was chosen"),
        why,
        el("h3", "", "Best guess"),
        guess
      );
      const alts = el("ul", "alts");
      (trade.switches || []).forEach((item) => {
        const li = document.createElement("li");
        const name = byId[item.id] ? byId[item.id].name : item.id;
        const about = byId[item.id] && byId[item.id].what ? byId[item.id].what : "";
        const rest = el("span");
        setLinked(rest, ". " + item.when + ".");
        li.append(termControl(name, about, "index.html#" + item.id), rest);
        alts.append(li);
      });
      notes.append(el("h3", "", "Other strategies that could be used"), alts.childElementCount ? alts : el("p", "", "The lesson does not name another strategy for this shape."));
      body.append(figure, story, notes);
      article.append(head, body);
      toggle.addEventListener("click", () => {
        setOpen(article, body.hidden);
        paintShowAll();
      });
      results.append(article);
      cards.push({
        article: article,
        index: index,
        opened: openedValue(group),
        expires: expirationDates(group.legs)[0] || null,
        result: groupResult(group)
      });
      slots.push(slot);
    });
    applySort();
    paintShowAll();
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

  function clearResults() {
    results.replaceChildren();
    cards = [];
    sorts.hidden = true;
  }

  function readMail(raw) {
    const messages = messagesOf(raw);
    const fresh = messages.filter((message) => recentEnough(messageDate(message)));
    if (!fresh.length) {
      clearResults();
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
      clearResults();
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
    const openAt = header.findIndex((name) => name.indexOf("opn") !== -1 && name.indexOf("p/l") === -1);
    const bidAt = header.findIndex((name) => name === "bid (sell)" || name === "bid");
    const askAt = header.findIndex((name) => name === "ask (buy)" || name === "ask");
    const plAt = header.findIndex((name) => name === "p/l open");
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
        trade: priceAt >= 0 ? csvNumber(cells[priceAt]) : null,
        bid: bidAt >= 0 ? csvNumber(cells[bidAt]) : null,
        ask: askAt >= 0 ? csvNumber(cells[askAt]) : null,
        plOpen: plAt >= 0 ? csvNumber(cells[plAt]) : null,
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
      clearResults();
      statusEl.textContent = "Choose the positions file, or paste a saved message.";
      return;
    }
    if (looksLikeCsv(trimmed)) {
      const groups = readCsv(trimmed);
      if (!groups || !groups.length) {
        clearResults();
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

  let tipTimer = 0;

  results.addEventListener("mouseover", (event) => {
    const term = event.target.closest(".term");
    if (!term || !results.contains(term)) return;
    window.clearTimeout(tipTimer);
    closeTips(term);
    placeTip(term);
  });

  results.addEventListener("mouseout", (event) => {
    const term = event.target.closest(".term");
    if (!term || term.contains(event.relatedTarget)) return;
    window.clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => {
      if (!term.classList.contains("open") && !term.contains(document.activeElement)) term.classList.remove("placed");
    }, 220);
  });

  results.addEventListener("focusin", (event) => {
    const term = event.target.closest(".term");
    if (!term || !results.contains(term)) return;
    closeTips(term);
    placeTip(term);
  });

  results.addEventListener("focusout", (event) => {
    const term = event.target.closest(".term");
    if (!term || term.contains(event.relatedTarget)) return;
    if (!term.classList.contains("open")) term.classList.remove("placed");
  });

  results.addEventListener("click", (event) => {
    const term = event.target.closest(".term");
    if (!term || !results.contains(term)) {
      closeTips(null);
      return;
    }
    if (event.target.closest(".term-tip")) return;
    const anchor = term.querySelector(".term-btn");
    if (!anchor || !anchor.contains(event.target)) return;
    if (anchor.tagName === "A") {
      if (window.matchMedia("(hover: none)").matches && !term.classList.contains("open")) {
        event.preventDefault();
        closeTips(term);
        term.classList.add("open");
        placeTip(term);
      }
      return;
    }
    event.preventDefault();
    const willOpen = !term.classList.contains("open");
    closeTips(term);
    if (willOpen) {
      term.classList.add("open");
      placeTip(term);
    } else {
      term.classList.remove("open", "placed");
      anchor.blur();
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".term")) closeTips(null);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeTips(null);
  });

  window.addEventListener("scroll", () => {
    results.querySelectorAll(".term.placed").forEach(placeTip);
  }, true);

  window.addEventListener("resize", () => {
    results.querySelectorAll(".term.placed").forEach(placeTip);
  });

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

  Object.keys(sortButtons).forEach((mode) => {
    sortButtons[mode].addEventListener("click", () => chooseSort(mode));
  });

  document.getElementById("show-all").addEventListener("click", () => {
    const bodies = [...results.querySelectorAll(".position-body")];
    const open = bodies.some((body) => body.hidden);
    results.querySelectorAll("article.position").forEach((article) => setOpen(article, open));
    paintShowAll();
  });

  sampleBtn.addEventListener("click", () => {
    pasteInput.value = sampleMail();
    statusEl.textContent = "Sample loaded. These are the lesson’s Coca-Cola shapes, written as mail, not an account.";
    pasteInput.focus();
  });
})();
