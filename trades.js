/* Figures follow The Cashflow Academy, "Every Options Trading Strategy Explained".
   Premiums and strikes the lesson never named are left unnamed. */
const TRADES = [
  {
    id: "long-call",
    name: "Long call",
    flow: "Debit",
    shares: "No",
    outlook: ["+2"],
    what: "Buy one call. Cash leaves the account. If the stock is crushed, the loss stops at the premium. If the stock keeps rising, the gain line does not flatten.",
    also: [
      { name: "Buying a call", note: "The plain description of the order. You are the buyer." },
      { name: "Long call", note: "Long means you bought it. The call is the contract." },
      { name: "Stock replacement", note: "The lesson’s name for the job, not a second structure. Same trade: a call instead of the shares." }
    ],
    where: "A +2 outlook: a rise that leaves the usual range. On the lesson’s Wynn Resorts example, the shares sit near $100 and the one-standard-deviation band is about $91 to $111. A run toward $113–$115 is the +2. A 2% lift can still lose. The call may need something closer to a 5–7% move, and it needs it before time decay eats the premium.",
    why: "Stock replacement. You keep the upside of owning the shares, and you do not ride the stock all the way to zero. The trade is directional. Paying for it means you have to be right about direction, and right by enough.",
    how: "Buy the call. Max loss is the premium. Max gain is open to the upside. Breakeven is the strike plus that premium. The lesson does not price a specific call, so this page does not invent one.",
    best: "Use it when you are very bullish and you want the gain left open. A normal rise inside the range is a bull call spread. Shares you already own, and would sell higher, are a covered call.",
    switches: [
      { id: "bull-call", when: "A normal rise would be enough" },
      { id: "covered-call", when: "You already own the shares" }
    ],
    spec: [
      ["Money flow", "Debit"],
      ["Shares required", "No"],
      ["Outlook", "+2"],
      ["Structure", "Buy one call"],
      ["Max loss", "The premium"],
      ["Max gain", "Open as the stock rises"],
      ["Breakeven", "Strike plus the premium"]
    ],
    chart: {
      domain: [70, 140],
      spot: 100,
      points: [[70, -36], [100, -36], [140, 78]],
      pins: [
        { price: 100, label: "Strike" }
      ],
      note: "At expiration. The flat is the premium, lost if the stock finishes at or below the strike. The rise has no cap."
    }
  },
  {
    id: "long-put",
    name: "Long put",
    flow: "Debit",
    shares: "No",
    outlook: ["-2"],
    what: "Buy one put. Cash leaves the account. The most you lose is that premium, the flat part of the graph. As the stock falls, the gain keeps extending.",
    also: [
      { name: "Buying a put", note: "The plain description. You are the buyer." },
      { name: "Long put", note: "Long means you bought the put." },
      { name: "Short-stock replacement", note: "The job. You want the decline without borrowing shares. The structure is still a long put." }
    ],
    where: "A −2 outlook: a drop that leaves the usual range. Sideways loses. A rise loses. A small decline can lose too. That is time decay, and a volatility crush, working against a long option.",
    why: "An alternative to shorting the stock. Short shares keep losing if the price climbs. The put still wants a decline, and the loss stops at what you paid.",
    how: "Buy the put. Max loss is the premium. The gain grows as the stock falls, down toward zero. Breakeven is the strike minus the premium. The lesson does not price a specific put.",
    best: "Use it when you expect a hard drop and you want the loss defined. A decline that should stay inside the usual range is a bear put spread.",
    switches: [
      { id: "bear-put", when: "You only need an ordinary decline" }
    ],
    spec: [
      ["Money flow", "Debit"],
      ["Shares required", "No"],
      ["Outlook", "−2"],
      ["Structure", "Buy one put"],
      ["Max loss", "The premium"],
      ["Max gain", "Open as the stock falls"],
      ["Breakeven", "Strike minus the premium"]
    ],
    chart: {
      domain: [40, 120],
      spot: 100,
      points: [[40, 82], [80, -34], [120, -34]],
      pins: [{ price: 80, label: "Strike" }],
      note: "At expiration. The flat is the premium. The gain line keeps climbing as price falls. It does not flatten."
    }
  },
  {
    id: "covered-call",
    name: "Covered call",
    flow: "Credit",
    shares: "Yes, 100 shares",
    outlook: ["0", "+1"],
    what: "You already own 100 shares. You sell a call above the market and collect cash. You are offering those shares at the higher price, and you are paid for the offer.",
    also: [
      { name: "Covered write", note: "Write means you sold the option. Covered means the shares are already there to deliver." },
      { name: "Buy-write", note: "You buy the shares and sell the call in the same step. Once it is on, it is the same position." },
      { name: "Overwrite", note: "You already held the shares, and then you sold the call against them." }
    ],
    where: "Zero to +1. Sideways is a win. A mild rise is still a win. You do not need a violent rally, and a violent rally is the part you have sold away.",
    why: "The shares can go nowhere and the call can still pay you. You give up the move above the strike. Someone else takes that.",
    how: "Coca-Cola at $70. Sell the 75 call for $2, which is $200 on one contract. If the stock finishes the month back at $70, the shares are unchanged and the call expires. You keep the $200. At $75 or above, the shares can be called away.",
    best: "Use it when you own the shares and a quiet tape, or a small climb, is a fine outcome. If you will sell a put again after the shares are called away, that cycle is the wheel. Fear of a collapse, with the shares staying in the account, is a protective put. Open upside without owning shares is a long call.",
    switches: [
      { id: "wheel", when: "You will sell puts again once the shares are called away" },
      { id: "protective-put", when: "You need the shares insured" },
      { id: "long-call", when: "You want the upside left open" }
    ],
    spec: [
      ["Money flow", "Credit"],
      ["Shares required", "100 shares you already own"],
      ["Outlook", "0 to +1"],
      ["Example", "Coke at $70, sell the 75 call for $2"],
      ["If unchanged", "Keep the $200"],
      ["Max gain", "Capped once the stock clears 75"],
      ["Max loss", "The shares falling, reduced by the $200"]
    ],
    chart: {
      domain: [40, 100],
      spot: 70,
      points: [[40, -72], [75, 36], [100, 36]],
      pins: [
        { price: 70, label: "70" },
        { price: 75, label: "75" }
      ],
      note: "Same shape as the cash-secured put. Profit flattens above the call you sold. The $200 is the lesson’s premium, not a live quote."
    }
  },
  {
    id: "cash-secured-put",
    name: "Cash-secured put",
    flow: "Credit",
    shares: "Cash set aside to buy",
    outlook: ["0", "+1"],
    what: "Sell a put. Cash comes in. You take the risk that the stock falls, and nothing else in the trade offsets that fall. The graph matches the covered call. The two are synthetically equal: the reward stops at the credit, and the violent risk is a falling stock.",
    also: [
      { name: "Secured put", note: "Short for cash-secured. The cash to buy the shares is reserved." },
      { name: "Cash-covered put", note: "Same idea. The cash covers the purchase if you are assigned." },
      { name: "Short put", note: "You sold the put. Also called selling a put, or a put write. “Write” means you sold it." },
      { name: "Naked put", note: "People use this when no stock position offsets the downside. The lesson used it that way. A desk that says naked often means only margin is posted, not the full cash. Same payoff. The collateral is the difference." }
    ],
    where: "Neutral to mildly bullish. Zero, +1, and even a sharp rally can still finish with the put expired. The outcome that hurts is the fifth one, the −2 drop. A normal dip can still expire worthless.",
    why: "An investor uses it to get paid while waiting to buy shares. A trader uses it because four of the five outcomes can still pay. A rally you truly believe will be violent has a better tool.",
    how: "Stock at $62. The lesson’s usual range runs down toward $56 and up toward $68. Sell the 55 put, outside that band. Up a lot, sideways, up a little, or down to $56: the put can still expire and you keep the credit. The lesson does not name that credit. The loss is a real break down through 55.",
    best: "Use it when you are willing to own the stock and you expect it to avoid a collapse. If you will sell calls after you are assigned, and sell this put again after the shares are called away, that cycle is the wheel. Shares you already hold are the covered call, the same shape. A rise you need to be violent is a long call.",
    switches: [
      { id: "wheel", when: "You will keep selling calls after you are assigned" },
      { id: "covered-call", when: "You already own the shares" },
      { id: "long-call", when: "You want a violent rally" }
    ],
    spec: [
      ["Money flow", "Credit"],
      ["Shares required", "Cash to buy if assigned"],
      ["Outlook", "0 to +1"],
      ["Example", "Stock at $62, sell the 55 put"],
      ["Still expires", "Up, sideways, or a normal dip to about 56"],
      ["Max gain", "The credit, which the lesson did not price"],
      ["Max loss", "A break down through 55"]
    ],
    chart: {
      domain: [30, 90],
      spot: 62,
      points: [[30, -78], [55, 34], [90, 34]],
      pins: [
        { price: 55, label: "55" },
        { price: 62, label: "62" }
      ],
      note: "At expiration. The plateau is the credit. The slope is the stock you may be forced to buy as it falls."
    }
  },
  {
    id: "wheel",
    name: "The wheel",
    flow: "Credit, then credit",
    shares: "None until the put assigns",
    outlook: ["0", "+1"],
    what: "Two credits, in order. Sell a cash-secured put. If it expires, sell it again. If you are assigned, you own the shares, and you sell a covered call against them. If the shares are called away, you are back in cash, and you sell the put again. Each phase is a credit. You are not paying a debit for a spread.",
    also: [
      { name: "Put then call", note: "The order. The put is how the shares are acquired. The call is how they are sold." },
      { name: "Covered strangle", same: false, note: "Not the cycle. A covered strangle is the short put, the shares, and the short call open together. The wheel can look like that for a stretch. The strategy itself is one side at a time." },
      { name: "Short strangle", same: false, note: "Not this. A short strangle sells a call and a put with no shares covering the call. The wheel’s call is covered, and the two sales are usually not on together." }
    ],
    where: "Zero to +1, the same band as the cash-secured put and the covered call. You are willing to own the shares, and willing to sell them at the call. You do not need a move outside the usual range. You are selling premium, so a calm tape is the one that pays. A −2 drop through the put is the loss. A +2 rally is the gain you sold away once the call is on.",
    why: "A cash-secured put pays you once while you wait. A covered call pays you once while you hold. The wheel is the job of selling the next credit after the first one finishes. It improves on either trade used alone, because assignment is not the end of the plan, and a call-away is not the end of it either.",
    how: "The lesson priced the two phases on different stocks, so this is the order, not one combined trade. Phase one is the cash-secured put: stock at $62, usual range about $56 to $68, sell the 55 put. The credit is not named. If that put assigns, you own the shares. Phase two is the covered call: the lesson’s version is Coca-Cola at $70, sell the 75 call for $2, which is $200 on the contract. Unchanged at $70, you keep the $200. At $75 or above, the shares can be called away, and the next order is the put again. Do not add the $2 to the unnamed put credit. They are two illustrations.",
    best: "Use it when you want to be paid to buy the shares and then paid to sell them, and a quiet tape or a mild rise is enough. If you will not accept assignment, that is a long call, with the upside left open. If you will keep the shares through a violent tape, the call comes off and the insurance is a protective put.",
    switches: [
      { id: "cash-secured-put", when: "You will stop if the put assigns" },
      { id: "covered-call", when: "You already own the shares and you will not sell a put after they are called away" },
      { id: "long-call", when: "You want the upside left open" },
      { id: "protective-put", when: "You will keep the shares and the next move may explode" }
    ],
    spec: [
      ["Money flow", "Credit, then another credit"],
      ["Shares required", "None until the put assigns"],
      ["Outlook", "0 to +1"],
      ["Phase one", "Stock at $62, sell the 55 put. Credit unnamed"],
      ["Phase two", "Coke at $70, sell the 75 call for $2"],
      ["If the call assigns", "Back to cash, sell the put again"],
      ["Max gain", "The credit of the phase that is on. The two examples are not one number"],
      ["Max loss", "A break down through the put, or the shares falling while the call is on"]
    ],
    chart: {
      domain: [30, 90],
      spot: 62,
      points: [[30, -78], [55, 34], [90, 34]],
      pins: [
        { price: 55, label: "55" },
        { price: 62, label: "62" }
      ],
      note: "One phase, at expiration. The cash-secured put and the covered call share this shape. The wheel is those two phases in order. The plateau is the credit of the phase that is on. The lesson priced that credit only for the Coke covered call, at $2. It did not price the put."
    }
  },
  {
    id: "protective-put",
    name: "Protective put",
    flow: "Debit",
    shares: "Yes, 100 shares",
    outlook: ["-2", "+2"],
    what: "You own the shares and you buy a put against them. The name is protective, not a long put, because the option is partnered with stock you intend to keep. Upside stays open. Downside is cut off.",
    also: [
      { name: "Married put", note: "You buy the shares and the put together. Once it is on, it is the same position: long stock, long put." },
      { name: "Protective put", note: "You already own the shares, then you buy the put. That is the lesson’s case." },
      { name: "Synthetic long call", note: "The payoff shape matches a long call. You still hold shares plus a put. The call is the cousin, not this position." }
    ],
    where: "You already own the shares, and you think the next move is an explosion, up or down. A calm market does not need this insurance.",
    why: "If the stock rips higher, the shares more than pay for the put. If it tanks, you lose less than the unprotected holder, and you still own the same number of shares. The lesson’s point: the put’s profit is new cash, and it can buy more shares at the lower price while you wait for a recovery.",
    how: "Coca-Cola owned at $70, 100 shares. The stock falls to $55. The shares are down $1,500. In the lesson’s illustration, a put at the 70 strike makes about $900. The net is about a $600 loss, against $1,500 with no put. The premium paid is not stated.",
    best: "Use it when you will keep the shares through a violent tape. If you would rather be paid to sell them higher, that is a covered call. Downside without owning shares is a long put.",
    switches: [
      { id: "covered-call", when: "You would sell the shares higher" },
      { id: "long-put", when: "You do not own the shares" }
    ],
    spec: [
      ["Money flow", "Debit, against shares you own"],
      ["Shares required", "Yes"],
      ["Outlook", "Explosion either way"],
      ["Example", "Coke at $70 falls to $55"],
      ["Shares alone", "Down $1,500"],
      ["Lesson’s put illustration", "About $900 back, net loss about $600"],
      ["Premium paid", "Not priced in the lesson"]
    ],
    chart: {
      domain: [40, 110],
      spot: 70,
      points: [[40, -28], [70, -28], [110, 74]],
      pins: [
        { price: 70, label: "70" }
      ],
      note: "Stock plus put. The floor is the insured loss. Above the strike the shares still participate. Shape only. The $900 is an illustration, not a quote."
    }
  },
  {
    id: "bull-call",
    name: "Bull call spread",
    flow: "Debit",
    shares: "No",
    outlook: ["+1"],
    what: "Buy a call and sell a higher strike. It is a debit because the call you buy costs more than the call you sell. You need the stock to rise. The most you can lose is the debit. The gain stops at the short strike.",
    also: [
      { name: "Bull call debit spread", note: "Debit names the cash flow. Bull names the direction." },
      { name: "Call debit spread", note: "The usual desk shorthand. A call spread you pay for." },
      { name: "Long call spread", note: "Long because you paid. A vertical, because the strikes differ and the expiration does not." },
      { name: "Long call vertical", note: "Same structure. Vertical means different strikes, same month." }
    ],
    where: "A +1 outlook. Bullish, and a rise inside the usual range is enough. You do not need the melt-up.",
    why: "The same direction as a long call, with less cash in the trade and a smaller move required. In the lesson’s arithmetic you spend 40% of the naked call. The cost of that is a capped gain. The lesson’s view: this is why professionals live in spreads. Lower risk, and you can be right without an extreme.",
    how: "Stock at $90. Buy the 90 call for $5 ($500). Sell the 95 call for $3 ($300). Net debit $2, so $200 at risk. Breakeven is $92. At $95 and above the spread is worth the $5 width, and the profit is $300. Reward is one and a half times the risk.",
    best: "Use it when you are bullish and a normal climb finishes the job. An uncapped spike is a long call. Shares you would be glad to sell into strength are a covered call.",
    switches: [
      { id: "long-call", when: "You need the gain uncapped" },
      { id: "covered-call", when: "You already own the shares" }
    ],
    spec: [
      ["Money flow", "Debit of $2"],
      ["Shares required", "No"],
      ["Outlook", "+1"],
      ["Example", "Buy the 90 call at $5, sell the 95 call at $3"],
      ["Max loss", "$200, at or below 90"],
      ["Max gain", "$300, at or above 95"],
      ["Breakeven", "$92"]
    ],
    chart: {
      domain: [80, 105],
      spot: 90,
      points: [[80, -40], [90, -40], [95, 60], [105, 60]],
      pins: [
        { price: 90, label: "90" },
        { price: 92, label: "92" },
        { price: 95, label: "95" }
      ],
      note: "At expiration. Loss is flat below 90. The $300 gain is flat from 95 up. Breakeven is 92, the strike plus the $2 debit."
    }
  },
  {
    id: "bear-put",
    name: "Bear put spread",
    flow: "Debit",
    shares: "No",
    outlook: ["-1"],
    what: "Buy a higher-strike put and sell a lower-strike put. It is a debit because the put you buy is the expensive one. Sister of the bull call spread. Loss and gain are both capped.",
    also: [
      { name: "Bear put debit spread", note: "Debit names the cash flow. Bear names the direction." },
      { name: "Put debit spread", note: "The usual shorthand. A put spread you pay for." },
      { name: "Long put spread", note: "Long because you paid." },
      { name: "Long put vertical", note: "Same structure. Different strikes, same month." }
    ],
    where: "A −1 outlook. You want a decline that stays inside the usual range. You do not need the stock to fall apart.",
    why: "Against a long put, you spend less, so a rally costs you less, and the stock does not have to fall as far before the trade works. What you give up is the open-ended gain if the decline becomes a collapse. The lesson treats that tradeoff as the professional default, and the naked long put as the harder, more aggressive trade.",
    how: "Stock at $150. The lesson’s expected range is about $135 to $165. Buy a higher-strike put and sell the 135 put. The long strike and the debit are not named. Max loss is whatever debit you pay. Max gain is the distance between the strikes minus that debit.",
    best: "Use it when a normal decline is the whole idea. A drop you expect to be violent, with the gain left open, is a long put.",
    switches: [
      { id: "long-put", when: "You need an open-ended collapse" }
    ],
    spec: [
      ["Money flow", "Debit"],
      ["Shares required", "No"],
      ["Outlook", "−1"],
      ["Example", "Stock at $150, sell the 135 put, buy a higher put"],
      ["Long strike", "Not named in the lesson"],
      ["Max loss", "The debit"],
      ["Max gain", "Width between strikes, minus the debit"]
    ],
    chart: {
      domain: [120, 170],
      spot: 150,
      points: [[120, 62], [135, 62], [148, -38], [170, -38]],
      pins: [
        { price: 135, label: "135" },
        { price: 150, label: "150" }
      ],
      note: "Shape at expiration. The long strike is drawn above 135 and is not a number from the lesson. Both ends are capped."
    }
  },
  {
    id: "iron-condor",
    name: "Iron condor",
    flow: "Two credits",
    shares: "No",
    outlook: ["0"],
    what: "A credit spread on the call side and a credit spread on the put side, opened together. You collect twice. The short strikes sit inside. The long strikes sit outside and define the loss.",
    also: [
      { name: "Short iron condor", note: "Short means you collected the credit. This is the condor the lesson teaches." },
      { name: "Selling an iron condor", note: "The verb form of the same trade." },
      { name: "Defined-risk short strangle", note: "A short strangle is the two short options. The long wings you buy outside them are what make the loss finite. That package is the iron condor." },
      { name: "Long iron condor", same: false, note: "The opposite trade. You pay a debit and you want a large move. Same family name, flipped cash flow. If a desk does not say long or short, ask which way the cash moved." }
    ],
    where: "Zero. You want the stock to finish inside its usual range. +2 and −2 are the failures. The lesson adds a second condition: volatility is high, and you expect it to get crushed. Earnings, a Fed meeting, an analyst day, when the fear or the hope looks overdone.",
    why: "You are paid for a market that chops, from both directions at once. The range is the trade. An extreme move is the loss, and that loss is limited by the wings you bought.",
    how: "The lesson does not price an iron condor and does not name strikes. Max gain is the two credits, if the stock finishes between the short strikes. Max loss is the width of a wing minus the total credit, if price finishes outside a long strike.",
    best: "Use it when you are neutral and you expect a nervous market to calm down. A storm you think is about to break the range is a long straddle.",
    switches: [
      { id: "straddle", when: "You expect the range to break" },
      { id: "calendar", when: "You want to harvest time near one strike" }
    ],
    spec: [
      ["Money flow", "Two credits"],
      ["Shares required", "No"],
      ["Outlook", "0"],
      ["Structure", "Put credit spread plus call credit spread"],
      ["Max gain", "Both credits, between the short strikes"],
      ["Max loss", "Wing width minus the credit"],
      ["Strikes and credit", "Not priced in the lesson"]
    ],
    chart: {
      domain: [70, 130],
      spot: 100,
      points: [[70, -48], [82, -48], [90, 42], [110, 42], [118, -48], [130, -48]],
      pins: [
        { price: 90, label: "Short" },
        { price: 110, label: "Short" }
      ],
      note: "Shape only. Profit is the plateau between the short strikes. Loss flattens outside the long strikes. No strikes were named in the lesson."
    }
  },
  {
    id: "straddle",
    name: "Long straddle",
    flow: "Debit, twice",
    shares: "No",
    outlook: ["-2", "+2"],
    what: "Buy the call and the put at the same strike. Two debits. The options oppose each other, so one side will lose. The other side has to gain more than that loss.",
    also: [
      { name: "Buying a straddle", note: "The plain verb. You pay for both." },
      { name: "Long straddle", note: "Long means you bought the pair." },
      { name: "At-the-money straddle", note: "The strike sits on the stock price, which is the lesson’s version." },
      { name: "Short straddle", same: false, note: "The opposite bet. You sell the call and the put, and you want the stock to sit still. Same word, other side of the trade." }
    ],
    where: "+2 or −2, and you do not know which. You are confident the stock will not stay inside the usual range. A neutral finish is the loss. This is the opposite of the iron condor: there you want volatility to collapse, here you want it to expand. The lesson’s picture is a calm market before a storm.",
    why: "Direction is the unknown. Magnitude is the bet. One illustrated path: the puts lose $500 and the calls gain $1,200. The other way: the calls lose $600 and the puts make $1,100. Either path is a profit on the pair. Those dollars are the lesson’s illustration of netting, not a quoted market.",
    how: "Stock at $85. Buy the 85 call and the 85 put. Max loss is the two premiums added together, if the stock finishes at 85. The gain is open in either direction. The two breakevens sit at 85 plus the total debit, and 85 minus the total debit. The debit itself is not priced.",
    best: "Use it when a large move is coming and the direction is what you cannot call. The same idea, bought out of the money so it costs less and needs a bigger move, is a long strangle. A range you expect to hold is an iron condor.",
    switches: [
      { id: "strangle", when: "You want less cash at risk" },
      { id: "iron-condor", when: "You expect the range to hold" }
    ],
    spec: [
      ["Money flow", "Debit, twice"],
      ["Shares required", "No"],
      ["Outlook", "+2 or −2"],
      ["Example", "Stock at $85, buy the 85 call and the 85 put"],
      ["Max loss", "Both premiums, at the strike"],
      ["Max gain", "Open in either direction"],
      ["Netting", "A $500 loss on one side can be covered by $1,200 on the other"]
    ],
    chart: {
      domain: [55, 115],
      spot: 85,
      points: [[55, 80], [85, -42], [115, 80]],
      pins: [{ price: 85, label: "85" }],
      note: "At expiration. The point of the V is both premiums lost. Either wing can pay for the trade. The debit was not priced, so the breakevens are not marked."
    }
  },
  {
    id: "strangle",
    name: "Long strangle",
    flow: "Debit, twice",
    shares: "No",
    outlook: ["-2", "+2"],
    what: "Buy an out-of-the-money call and an out-of-the-money put. Still two debits. The strikes are apart, so the loss is a flat bottom instead of a point.",
    also: [
      { name: "Buying a strangle", note: "The plain verb. You pay for both, and the strikes are apart." },
      { name: "Long strangle", note: "Long means you bought the pair." },
      { name: "Out-of-the-money strangle", note: "Both strikes sit away from the stock price. That is what makes it a strangle instead of a straddle." },
      { name: "Short strangle", same: false, note: "The opposite bet. You sell both. An iron condor is that sale plus long wings outside it." }
    ],
    where: "The same violent, direction-unknown outlook as the straddle. The move has to travel farther before you are paid. You still need the stock to leave the usual range, and to leave it by more.",
    why: "You spend less than the at-the-money straddle, so the most you can lose is smaller. The band where you still lose is wider. One side expires worthless. The other has to cover both premiums and then some.",
    how: "eBay at $90. Buy the 95 call and the 85 put. The lesson does not price them. Max loss is the two premiums, if the stock finishes between 85 and 95. Gain is open beyond either strike. Breakeven on the upside is 95 plus the total debit. Breakeven on the downside is 85 minus the total debit.",
    best: "Use it when you expect an explosion and you want less cash in the trade than the straddle. If the move may be large but you need it to pay closer to the current price, buy the straddle.",
    switches: [
      { id: "straddle", when: "You need the payoff closer to the price" }
    ],
    spec: [
      ["Money flow", "Debit, twice, and less than the straddle"],
      ["Shares required", "No"],
      ["Outlook", "+2 or −2, and farther out"],
      ["Example", "eBay at $90, buy the 95 call and the 85 put"],
      ["Max loss", "Both premiums, between the strikes"],
      ["Max gain", "Open outside either strike"],
      ["Premiums", "Not priced in the lesson"]
    ],
    chart: {
      domain: [60, 120],
      spot: 90,
      points: [[60, 78], [85, -36], [95, -36], [120, 78]],
      pins: [
        { price: 85, label: "85" },
        { price: 95, label: "95" }
      ],
      note: "At expiration. The flat bottom is the band where both options expire and the debit is lost. The wings are open. Premiums were not named."
    }
  },
  {
    id: "calendar",
    name: "Calendar spread",
    flow: "Net debit, then credits",
    shares: "No",
    outlook: ["0", "+1"],
    what: "Buy a later month and sell a nearer month. The lesson’s example is a call calendar: long November, short August. August expires first. The long call is still there, so September can be sold next, then October. It is a time spread with a credit aspect, not a pure credit.",
    also: [
      { name: "Time spread", note: "The lesson’s other name. You are trading two months, not two directions." },
      { name: "Horizontal spread", note: "Same expiration distance, pictured across a calendar instead of up and down the strikes. A vertical is the strike spread. This one is the month spread." },
      { name: "Long calendar", note: "Long because you bought the later month. The lesson’s example is a call calendar." },
      { name: "Diagonal", same: false, note: "Not this trade. A diagonal changes the strike and the month. A calendar keeps the strike and changes the month." }
    ],
    where: "Zero to +1, and the path should be steady. A call calendar carries a mild bullish lean, because you want the long call to gain value while the near months pay you. A +2 spike is the wrong tape. Two charts can both be rising. The calendar wants the smooth one.",
    why: "If the stock goes nowhere, the near call can expire and you keep that premium, then sell the next month against an option you still hold. You can be right about “nothing much happens” and still hold something that benefits from a slow rise.",
    how: "Buy the November call. Sell the August call against it. If August expires with the stock near the strike, that premium is kept. The lesson does not name the strike or either premium. The chart is the shape at the near expiration: profit peaks around the strike, and the position is down if price has already run far away.",
    best: "Use it when you expect a slow, stable move, or a pin near the strike while you sell the front months. A sharp rally is a long call. A neutral view you want paid on both sides, with the loss defined today, is an iron condor.",
    switches: [
      { id: "long-call", when: "You expect a sharp rally" },
      { id: "iron-condor", when: "You want both wings defined up front" }
    ],
    spec: [
      ["Money flow", "Pay for the back month, collect for the front"],
      ["Shares required", "No"],
      ["Outlook", "0 to +1, steady"],
      ["Example", "Long November call, short August, then September, then October"],
      ["Strike and premiums", "Not priced in the lesson"],
      ["If the stock pins", "The near call can expire and be sold again"],
      ["Chart", "Shape at the near expiration, not at November"]
    ],
    chart: {
      domain: [70, 130],
      spot: 100,
      points: [[70, -34], [88, -34], [100, 70], [112, -34], [130, -34]],
      pins: [{ price: 100, label: "Strike" }],
      note: "At the near expiration. Profit peaks at the strike. A big move by August is the loss. This is not the graph of the November call held alone."
    }
  }
];
