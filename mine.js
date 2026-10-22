(function () {
  const form = document.getElementById("pull");
  const secretInput = document.getElementById("secret");
  const refreshInput = document.getElementById("refresh");
  const tastyBtn = document.getElementById("tasty");
  const pasteInput = document.getElementById("paste");
  const statusEl = document.getElementById("status");
  const results = document.getElementById("results");
  const sampleBtn = document.getElementById("sample");
  const tastyRoot = "https://api.tastyworks.com";

  const byId = {};
  TRADES.forEach((trade) => {
    byId[trade.id] = trade;
  });

  const SAMPLE = {
    positions: [
      {
        symbol: "KO",
        legs: [
          { side: "long", kind: "stock", quantity: 100 },
          { side: "short", kind: "call", strike: 75, expiration: "2026-11-20", quantity: 1 }
        ]
      },
      {
        symbol: "KO",
        legs: [
          { side: "short", kind: "put", strike: 55, expiration: "2026-11-20", quantity: 1, cash_secured: true }
        ]
      }
    ]
  };

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
      account: text(raw["account-label"] || "")
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
    const name = leg.side === "short" ? "Short" : "Long";
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
        why: "The lesson teaches those pieces apart. The short call against the shares is a covered call. The long put against the shares is a protective put. Together they are a collar, which is not one of the eleven.",
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
      name: "Not one of the eleven",
      where: "The legs do not match a structure on the study page.",
      why: "Read the legs below against What it is on each trade. A match needs the same sides, and for a spread the same relationship of strikes.",
      switches: []
    };
  }

  function profile(id, legs) {
    if (id === "shares") return sharesNote();
    if (id === "cash-secured-put") {
      const trade = byId["cash-secured-put"];
      const secured = legs.some((leg) => leg.cashSecured);
      return Object.assign({}, trade, {
        why: trade.why + (secured
          ? " This feed marks the cash as reserved."
          : " This feed does not say whether the cash is reserved or only margin is posted. The payoff is the same short put. The collateral is the difference between a cash-secured put and what a desk calls a naked put.")
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
      statusEl.textContent = "The feed returned no positions.";
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
      article.append(
        title,
        legs,
        el("h3", "", "What the legs are"),
        el("p", "", trade.what || trade.where),
        el("h3", "", "Why this shape"),
        el("p", "", "The feed does not record a motive. The structure the legs make is " + (trade.id ? "the " + trade.name.toLowerCase() : trade.name) + ". " + trade.why)
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

  function tastyError(err) {
    const body = err.body || {};
    const nested = body.error && typeof body.error === "object" ? body.error : {};
    const code = body.error_code || nested.code || "";
    if (err.status === 400 || code === "invalid_grant" || code === "invalid_scope") {
      return "tastytrade rejected that client secret or refresh token. The client scope has to be read, on the live site, and the refresh token has to come from Create Grant. Neither value was stored.";
    }
    if (err.status === 401) {
      return "tastytrade refused the token. A sandbox grant does not work against the live site. Neither value was stored.";
    }
    if (err.status === 403) {
      return "That grant can sign in, and it cannot read positions. Create the client with the read scope. Neither value was stored.";
    }
    return "The browser could not read tastytrade. Neither value was stored.";
  }

  function tastyFetch(path, options) {
    return fetch(tastyRoot + path, options).then((res) => {
      return res.json().catch(() => ({})).then((body) => {
        if (!res.ok) {
          const err = new Error("status " + res.status);
          err.status = res.status;
          err.body = body;
          throw err;
        }
        return body;
      });
    });
  }

  function positionPages(access, number, offset, rows) {
    if (offset > 20) return Promise.resolve(rows);
    const path = "/accounts/" + encodeURIComponent(number) + "/positions?page-offset=" + offset + "&per-page=100";
    return tastyFetch(path, {
      headers: { Accept: "application/json", Authorization: "Bearer " + access }
    }).then((data) => {
      const items = (data.data && data.data.items) || [];
      items.forEach((item) => rows.push(item));
      const page = data.pagination;
      if (page && page["total-pages"] && offset + 1 < page["total-pages"]) {
        return positionPages(access, number, offset + 1, rows);
      }
      return rows;
    });
  }

  function readTasty(secret, refresh) {
    results.replaceChildren();
    statusEl.textContent = "Asking tastytrade for a read token…";
    tastyFetch("/oauth/token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refresh,
        client_secret: secret,
        scope: "read"
      })
    }).then((data) => {
      const access = data.access_token;
      if (!access) throw new Error("token");
      statusEl.textContent = "Reading accounts…";
      return tastyFetch("/customers/me/accounts", {
        headers: { Accept: "application/json", Authorization: "Bearer " + access }
      }).then((payload) => ({ access: access, payload: payload }));
    }).then((got) => {
      const items = (got.payload.data && got.payload.data.items) || [];
      const seen = {};
      const accounts = [];
      items.forEach((row) => {
        const account = row.account || row;
        const number = text(account["account-number"] || account.account_number);
        if (!number || account["is-closed"] === true) return;
        let name = text(account.nickname || account["account-type-name"]) || "Account";
        if (seen[name]) name = name + " " + number.slice(-4);
        seen[name] = true;
        accounts.push({ number: number, name: name });
      });
      if (!accounts.length) {
        statusEl.textContent = "tastytrade returned no open accounts.";
        return null;
      }
      statusEl.textContent = "Reading open positions…";
      return Promise.all(accounts.map((account) => {
        return positionPages(got.access, account.number, 0, []).then((rows) => {
          rows.forEach((row) => { row["account-label"] = account.name; });
          return rows;
        });
      }));
    }).then((lists) => {
      if (!lists) return;
      render(groupRows(lists.reduce((all, rows) => all.concat(rows), [])));
    }).catch((err) => {
      results.replaceChildren();
      statusEl.textContent = tastyError(err);
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    results.replaceChildren();
    const pasted = pasteInput.value.trim();
    if (!pasted) {
      statusEl.textContent = "Paste the JSON, or use Read tastytrade.";
      return;
    }
    try {
      readJson(pasted);
    } catch (err) {
      statusEl.textContent = "That paste is not JSON the reader could use.";
    }
  });

  tastyBtn.addEventListener("click", () => {
    const secret = secretInput.value.trim();
    const refresh = refreshInput.value.trim();
    if (!secret || !refresh) {
      results.replaceChildren();
      statusEl.textContent = "Paste both the client secret and the refresh token.";
      return;
    }
    readTasty(secret, refresh);
  });

  [secretInput, refreshInput].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        tastyBtn.click();
      }
    });
  });

  sampleBtn.addEventListener("click", () => {
    pasteInput.value = JSON.stringify(SAMPLE, null, 2);
    statusEl.textContent = "Sample loaded. These are the lesson’s Coca-Cola shapes, not an account.";
    pasteInput.focus();
  });
})();
