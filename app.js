(function () {
  const list = document.querySelector(".trade-list");
  const copy = document.querySelector(".lesson-copy");
  const proof = document.querySelector(".proof");
  const title = document.getElementById("trade-title");

  const MARKS = [
    { id: "-2", num: "−2", name: "Hard drop" },
    { id: "-1", num: "−1", name: "Ordinary drop" },
    { id: "0", num: "0", name: "Sideways" },
    { id: "+1", num: "+1", name: "Ordinary rise" },
    { id: "+2", num: "+2", name: "Hard rise" }
  ];

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([key, value]) => {
        if (value == null) return;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else node.setAttribute(key, value);
      });
    }
    (children || []).forEach((child) => {
      if (child) node.append(child);
    });
    return node;
  }

  function tradeById(id) {
    return TRADES.find((trade) => trade.id === id) || TRADES[0];
  }

  function currentId() {
    const hash = location.hash.replace("#", "");
    return tradeById(hash).id;
  }

  function renderList(activeId, fromButton) {
    list.replaceChildren();
    TRADES.forEach((trade, index) => {
      const btn = el("button", {
        class: "trade-btn",
        type: "button",
        "data-id": trade.id,
        "aria-current": trade.id === activeId ? "true" : "false"
      }, [
        el("span", { class: "num", text: String(index + 1).padStart(2, "0") }),
        el("span", { text: trade.name })
      ]);
      btn.addEventListener("click", () => select(trade.id));
      list.append(el("li", null, [btn]));
    });
    const current = list.querySelector('[aria-current="true"]');
    if (current && fromButton) current.focus();
  }

  function section(heading, text) {
    return el("section", { class: "section" }, [
      el("h2", { text: heading }),
      el("p", { text: text })
    ]);
  }

  function whatSection(trade) {
    const names = el("ul", { class: "names" });
    (trade.also || []).forEach((item) => {
      const name = el("span", { class: "name", text: item.name });
      names.append(el("li", null, [
        name,
        document.createTextNode(". " + item.note)
      ]));
    });
    return el("section", { class: "section" }, [
      el("h2", { text: "What it is" }),
      el("p", { text: trade.what }),
      el("h3", { text: "Also called" }),
      names
    ]);
  }

  function renderCopy(trade) {
    const index = TRADES.findIndex((item) => item.id === trade.id);
    const prev = TRADES[index - 1];
    const next = TRADES[index + 1];

    const switches = el("ul", { class: "switches" });
    trade.switches.forEach((item) => {
      const target = tradeById(item.id);
      const link = el("a", {
        class: "switch",
        href: "#" + target.id,
        text: target.name
      });
      link.addEventListener("click", (event) => {
        event.preventDefault();
        select(target.id);
      });
      const line = el("li", null, [
        link,
        document.createTextNode(" — " + item.when + ".")
      ]);
      switches.append(line);
    });

    const best = el("section", { class: "section" }, [
      el("h2", { text: "The best way" }),
      el("p", { text: trade.best }),
      switches
    ]);

    const pager = el("nav", { class: "pager", "aria-label": "Adjacent trades" });
    if (prev) pager.append(pagerLink(prev, "Previous"));
    if (next) pager.append(pagerLink(next, "Next"));

    copy.classList.remove("is-on");
    copy.replaceChildren(
      el("p", { class: "flow", text: trade.flow }),
      whatSection(trade),
      section("Where it is used", trade.where),
      section("Why it is used", trade.why),
      section("How it is used", trade.how),
      best,
      pager
    );
    void copy.offsetWidth;
    copy.classList.add("is-on");
  }

  function pagerLink(trade, label) {
    const link = el("a", { href: "#" + trade.id }, [
      el("small", { text: label }),
      document.createTextNode(trade.name)
    ]);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      select(trade.id);
    });
    return link;
  }

  function xOf(price, chart, width) {
    const [min, max] = chart.domain;
    const left = 36;
    const right = width - 16;
    return left + ((price - min) / (max - min)) * (right - left);
  }

  function yScale(chart) {
    const values = chart.points.map((point) => point[1]);
    let minY = Math.min(0, ...values);
    let maxY = Math.max(0, ...values);
    const pad = Math.max(12, (maxY - minY) * 0.16);
    return { minY: minY - pad, maxY: maxY + pad };
  }

  function yOf(value, height, scale) {
    const top = 28;
    const bottom = height - 40;
    const t = (value - scale.minY) / (scale.maxY - scale.minY);
    return bottom - t * (bottom - top);
  }

  function renderChart(trade) {
    const chart = trade.chart;
    const width = 640;
    const height = 340;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("class", "chart-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-labelledby", "chart-title chart-desc");

    const title = document.createElementNS(ns, "title");
    title.setAttribute("id", "chart-title");
    title.textContent = trade.name + " payoff";
    const desc = document.createElementNS(ns, "desc");
    desc.setAttribute("id", "chart-desc");
    desc.textContent = chart.note;
    svg.append(title, desc);

    const defs = document.createElementNS(ns, "defs");
    defs.innerHTML =
      '<pattern id="gain-fill" patternUnits="userSpaceOnUse" width="8" height="8">' +
      '<rect width="8" height="8" fill="var(--color-gain-wash)"/>' +
      '<circle cx="2" cy="2" r="0.9" fill="var(--color-gain)"/>' +
      "</pattern>" +
      '<pattern id="loss-fill" patternUnits="userSpaceOnUse" width="7" height="7">' +
      '<rect width="7" height="7" fill="var(--color-loss-wash)"/>' +
      '<path d="M0 7 L7 0" stroke="var(--color-loss)" stroke-width="0.8"/>' +
      "</pattern>";
    svg.append(defs);

    const scale = yScale(chart);
    const zero = yOf(0, height, scale);
    const axis = document.createElementNS(ns, "line");
    axis.setAttribute("x1", "36");
    axis.setAttribute("x2", String(width - 16));
    axis.setAttribute("y1", String(zero));
    axis.setAttribute("y2", String(zero));
    axis.setAttribute("stroke", "var(--color-rule)");
    axis.setAttribute("stroke-width", "1");
    svg.append(axis);

    const spotX = xOf(chart.spot, chart, width);
    const spot = document.createElementNS(ns, "line");
    spot.setAttribute("x1", String(spotX));
    spot.setAttribute("x2", String(spotX));
    spot.setAttribute("y1", "16");
    spot.setAttribute("y2", String(height - 32));
    spot.setAttribute("stroke", "var(--color-neutral)");
    spot.setAttribute("stroke-width", "1");
    spot.setAttribute("stroke-dasharray", "2 3");
    svg.append(spot);

    const mapped = chart.points.map(([price, value]) => ({
      x: xOf(price, chart, width),
      y: yOf(value, height, scale),
      value: value
    }));

    function addPoly(points, fill) {
      const d = points
        .map((point, index) => (index === 0 ? "M" : "L") + point.x.toFixed(1) + " " + point.y.toFixed(1))
        .join(" ") + " Z";
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", fill);
      svg.append(path);
    }

    for (let i = 0; i < mapped.length - 1; i += 1) {
      const a = mapped[i];
      const b = mapped[i + 1];
      const split = (y) => {
        const t = (zero - a.y) / (b.y - a.y);
        return { x: a.x + t * (b.x - a.x), y: zero, value: 0 };
      };
      if ((a.value >= 0 && b.value >= 0) || (a.value <= 0 && b.value <= 0)) {
        const sign = a.value > 0 || b.value > 0 ? 1 : -1;
        if (sign === 0) continue;
        addPoly(
          [a, b, { x: b.x, y: zero }, { x: a.x, y: zero }],
          sign > 0 ? "url(#gain-fill)" : "url(#loss-fill)"
        );
      } else {
        const mid = split();
        addPoly(
          [a, mid, { x: a.x, y: zero }],
          a.value > 0 ? "url(#gain-fill)" : "url(#loss-fill)"
        );
        addPoly(
          [mid, b, { x: b.x, y: zero }],
          b.value > 0 ? "url(#gain-fill)" : "url(#loss-fill)"
        );
      }
    }

    const line = document.createElementNS(ns, "path");
    line.setAttribute(
      "d",
      mapped
        .map((point, index) => (index === 0 ? "M" : "L") + point.x.toFixed(1) + " " + point.y.toFixed(1))
        .join(" ")
    );
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "var(--color-ink)");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("stroke-linecap", "round");
    svg.append(line);

    function label(text, x, y, anchor) {
      const node = document.createElementNS(ns, "text");
      node.setAttribute("x", String(x));
      node.setAttribute("y", String(y));
      node.setAttribute("fill", "var(--color-ink)");
      node.setAttribute("font-family", "var(--font-figure)");
      node.setAttribute("font-size", "14");
      node.setAttribute("text-anchor", anchor || "middle");
      node.textContent = text;
      svg.append(node);
    }

    label("Even", 40, zero - 8, "start");
    label("Now", spotX, 14, "middle");
    chart.pins.forEach((pin) => {
      label(pin.label, xOf(pin.price, chart, width), height - 12, "middle");
    });

    return svg;
  }

  function renderProof(trade) {
    const figure = el("figure", null, [renderChart(trade)]);
    const caption = el("p", { class: "chart-note", text: trade.chart.note });
    const legend = el("div", { class: "legend" }, [
      el("span", null, [el("i", { class: "swatch gain" }), document.createTextNode("Gain")]),
      el("span", null, [el("i", { class: "swatch loss" }), document.createTextNode("Loss")])
    ]);

    const spec = el("dl", { class: "spec" });
    const rows = trade.spec.slice();
    if (trade.also && trade.also.length) {
      rows.splice(1, 0, ["Also called", trade.also.map((item) => item.name).join(", ")]);
    }
    rows.forEach(([term, value]) => {
      spec.append(
        el("div", null, [
          el("dt", { text: term }),
          el("dd", { text: value })
        ])
      );
    });

    const scale = el("ol", { class: "scale", "aria-label": "Five outlooks" });
    MARKS.forEach((mark) => {
      const on = trade.outlook.includes(mark.id);
      scale.append(
        el("li", { "data-on": on ? "true" : "false" }, [
          el("i", { class: "mark", "aria-hidden": "true" }),
          el("span", { class: "mark-num", text: mark.num }),
          el("span", { class: "mark-name", text: mark.name })
        ])
      );
    });

    proof.replaceChildren(
      figure,
      legend,
      caption,
      spec,
      scale,
      el("p", {
        class: "scale-key",
        text: "Filled marks are this trade. −1, 0, and +1 sit inside the usual range. −2 and +2 sit outside it."
      })
    );
  }

  function select(id, fromHash) {
    const trade = tradeById(id);
    const fromButton = document.activeElement && document.activeElement.closest(".trade-btn");
    if (!fromHash) {
      history.replaceState(null, "", "#" + trade.id);
    }
    document.title = trade.name + " — Five answers";
    title.textContent = trade.name;
    renderList(trade.id, fromButton);
    renderCopy(trade);
    renderProof(trade);
  }

  document.addEventListener("keydown", (event) => {
    const tag = event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || event.metaKey || event.altKey || event.ctrlKey) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "j" && event.key !== "k") return;
    event.preventDefault();
    const index = TRADES.findIndex((trade) => trade.id === currentId());
    const delta = event.key === "ArrowDown" || event.key === "j" ? 1 : -1;
    const next = TRADES[index + delta];
    if (next) select(next.id);
  });

  window.addEventListener("hashchange", () => select(currentId(), true));
  select(currentId(), true);
})();
