"""The curated library catalog: category -> [(title, one-line concept)].

This is the human-authored source of truth. `python -m app.seed_generate` expands each
concept into a full scenario via the AI builder and writes JSON fixtures to `seed_data/`;
those fixtures are reviewed, committed, and loaded by `python -m app.seed`.
"""

CATALOG: dict[str, list[tuple[str, str]]] = {
    "Game Theory Classics": [
        (
            "The Plea Bargain",
            "You and your co-accused are interrogated in separate rooms, each offered a "
            "lighter sentence to testify against the other — a prisoner's dilemma where "
            "trust is everything and you can't communicate.",
        ),
        (
            "The Last Well",
            "A village shares a dwindling aquifer during a brutal drought; every farmer's "
            "rational choice to water their own crops pushes the commons toward collapse.",
        ),
        (
            "Merge Lane",
            "Two rival trucking firms race to undercut each other on the only profitable "
            "route in the region — a game of chicken where blinking first means losing the "
            "route and never blinking means both go bankrupt.",
        ),
        (
            "The Stag Hunt",
            "Two rival mountain clans must cooperate to bring down a great elk before "
            "winter, but either can defect at any moment to hunt rabbits alone — enough for "
            "one family, betrayal for everyone else.",
        ),
        (
            "Sealed Bids",
            "A country estate auction with sealed bids, where a mysterious rival seems to "
            "want the same lot you do and paying what it takes to win might be the real "
            "way to lose (the winner's curse).",
        ),
        (
            "The Ultimatum",
            "An estranged sibling controls how your late mother's estate is split and "
            "proposes a lopsided division, take it or leave it — but pride, fairness, and "
            "thirty years of history are all at the table (the ultimatum game).",
        ),
        (
            "Lemons on the Lot",
            "You need a reliable used car by Friday and the dealer knows exactly what is "
            "wrong with every vehicle on the lot — an asymmetric-information market where "
            "every price signal means something.",
        ),
        (
            "The Lighthouse Levy",
            "Five coastal towns must jointly fund a lighthouse after a winter of wrecks, "
            "and every mayor privately hopes the other four will pay for it — a public "
            "goods game with free riders and storm season approaching.",
        ),
    ],
    "Engineering Leadership": [
        (
            "The Silent Regression",
            "A bad deploy has been quietly corrupting customer data for a week, and "
            "someone on your team knew and said nothing; you must fix the data, the "
            "process, and the trust — in that order or some other.",
        ),
        (
            "The 10x Problem",
            "Your most productive engineer is also your most corrosive, and two promising "
            "juniors just asked to transfer off the team on the same day.",
        ),
        (
            "Deadline vs. Data Loss",
            "Ship the contractually promised release on Friday with a risky, "
            "hard-to-reverse database migration, or slip publicly and eat the penalty "
            "clause — your tech lead and your account manager are each certain.",
        ),
        (
            "The Reorg Leak",
            "You learn in a leadership meeting that your team will be split up next "
            "quarter, a full week before anyone is supposed to know — then your senior "
            "engineer asks you point-blank in a 1:1 if a reorg is coming.",
        ),
        (
            "Postmortem Politics",
            "You ran a blameless postmortem for the biggest outage of the year, and now "
            "the VP wants a name to attach to it before the board meeting.",
        ),
        (
            "The Legacy Keeper",
            "The only engineer who truly understands the twenty-year-old billing system "
            "retires in 30 days, is owed nothing, and is not in a documenting mood.",
        ),
        (
            "Two Candidates, One Req",
            "Your hiring loop is split down the middle between a safe, solid pair of "
            "hands and a brilliant wildcard with a spotty reference — and the req expires "
            "at the end of the month.",
        ),
        (
            "Underwater Promotion",
            "Your best engineer demands the promotion the calibration committee already "
            "declined, with a hint that they have somewhere else to be if the answer is no.",
        ),
    ],
    "Negotiation & Deals": [
        (
            "The Counter-Offer",
            "Negotiate your own compensation with a competing offer in your pocket, a boss "
            "who hates surprises, and a genuine preference to stay — if staying can be "
            "made worth it.",
        ),
        (
            "Enterprise Whale",
            "Close the biggest deal in company history against a procurement team that "
            "demands a margin-killing discount and knows your quarter ends in nine days.",
        ),
        (
            "The Acqui-hire",
            "Sell your struggling startup to a big tech company while protecting your "
            "team's jobs, your investors' dignity, and whatever is left of your own.",
        ),
        (
            "Vendor Lock",
            "Renegotiate your annual contract with the vendor who knows perfectly well "
            "you cannot migrate off their platform this year — unless you can make them "
            "believe otherwise.",
        ),
        (
            "Union Table",
            "First-contract negotiations between a newly formed union and management, "
            "with hardliners on both sides of the table and a strike deadline neither "
            "side actually wants to reach.",
        ),
        (
            "Landlord's Gambit",
            "A commercial lease renewal where you've heard the building is half-vacant, "
            "they've heard your company is expanding, and neither rumor is quite right.",
        ),
        (
            "The Trade Deadline",
            "A star player's agent, a salary-cap-strapped general manager, and 48 hours "
            "until the trade deadline — everyone is bluffing and everyone knows it.",
        ),
    ],
    "Startup Survival": [
        (
            "Cofounder Divorce",
            "A 50/50 equity split, opposite visions for the product, and the dawning "
            "realization that one of you has to end up in charge — or neither company "
            "survives the stalemate.",
        ),
        (
            "Bridge or Die",
            "Six weeks of runway, one term sheet with teeth in it, and an existing "
            "investor who keeps saying 'maybe' — negotiate the bridge round or start "
            "planning the shutdown.",
        ),
        (
            "The Pivot",
            "Customers love the throwaway side feature, your cofounder loves the "
            "roadmap, and your biggest investor loves saying 'focus' — decide what the "
            "company actually is.",
        ),
        (
            "First Fire",
            "Your first employee — once essential, now struggling and openly bitter — is "
            "dragging down a six-person company where everyone sees everything.",
        ),
        (
            "The Copycat",
            "A competitor with 20x your funding just cloned your product feature for "
            "feature, and your board wants a survival plan by Friday.",
        ),
        (
            "Down Round",
            "Take the humiliating down round that reprices everyone's equity, or the "
            "venture debt with a covenant you will probably trip — your cofounder and "
            "your CFO disagree about which is the trap.",
        ),
        (
            "The Poach",
            "A big tech company just made offers to your entire four-person engineering "
            "team at triple their salaries, and you have one week and no matching budget.",
        ),
    ],
    "Diplomacy & Crisis": [
        (
            "Thirteen Days",
            "A naval blockade standoff between nuclear rivals where hawks on your own "
            "side may be as dangerous as the adversary, and every option has a body "
            "count — inspired by the Cuban missile crisis.",
        ),
        (
            "The Water Treaty",
            "An upstream nation's new dam, a downstream nation's drought, and you as the "
            "mediator neither side fully trusts — with farmers, generals, and elections "
            "pressing on both.",
        ),
        (
            "Hostage on the Bridge",
            "A live-television hostage standoff on a city bridge where the negotiator's "
            "own command wants a fast ending and the man on the bridge wants to be heard.",
        ),
        (
            "The Ceasefire",
            "Mediate a ceasefire between two factions who each privately believe they are "
            "winning, while the humanitarian corridor you promised sits closed.",
        ),
        (
            "Pandemic Protocol",
            "Decide whether to lock down a major city on ambiguous early outbreak data, "
            "with epidemiologists, economists, and the mayor's re-election campaign all "
            "at your door.",
        ),
        (
            "Sanctions Game",
            "Hold a multinational sanctions coalition together when you suspect one ally "
            "is quietly cheating — and confronting them publicly might shatter the "
            "coalition faster than the cheating.",
        ),
        (
            "The Defector",
            "An enemy weapons scientist walks into your embassy requesting asylum with a "
            "suitcase of secrets, and half your agency is convinced it is a trap.",
        ),
    ],
    "Fantasy & Intrigue": [
        (
            "The Dragon's Tribute",
            "The town council must decide whether to keep paying the dragon's annual "
            "tribute or fund the suspiciously confident heroes who just rode in — and the "
            "dragon has always known more than it lets on.",
        ),
        (
            "Court of Thorns",
            "Win the fae queen's favor at her midnight masquerade without accepting a "
            "single gift, promise, or dance — for in her court, everything offered has "
            "a price and refusal is also an art.",
        ),
        (
            "The Siege of Harrow Deep",
            "A dwarven hold under siege with dwindling supplies, an enemy offer of "
            "generous parley, and mounting evidence that someone inside the walls is "
            "already negotiating.",
        ),
        (
            "Tournament of Masks",
            "Win a rigged royal tournament without letting anyone discover who you are — "
            "your true name would mean arrest, but losing would mean worse.",
        ),
        (
            "The Necromancer's Offer",
            "A polite, well-dressed necromancer offers to save the village's failed "
            "harvest with tireless undead labor, and the village must vote before the "
            "first frost.",
        ),
        (
            "Guildmaster's Debt",
            "The thieves' guild has come to collect on the favor that got you your shop "
            "ten years ago, and what they are asking for would ruin someone you love.",
        ),
        (
            "The Oracle's Auction",
            "Bid against your three greatest rivals for prophecies about your own "
            "futures, knowing the oracle tells exactly one lie per auction and never "
            "reveals which.",
        ),
    ],
    "Sci-Fi Frontier": [
        (
            "First Contact Protocol",
            "An unambiguous alien signal arrives at your observatory, and three "
            "governments, a billionaire, and your own team all have different ideas "
            "about who answers — and what the answer says.",
        ),
        (
            "Airlock Arithmetic",
            "Station life support is failing after a meteor strike, the escape pods hold "
            "fewer people than are aboard, and you are the ranking officer everyone is "
            "looking at.",
        ),
        (
            "The Generation Ship Vote",
            "Ninety years into a two-century voyage, a growing faction wants to divert "
            "to a closer, worse planet, and you must run the shipwide vote that decides "
            "the fate of generations not yet born.",
        ),
        (
            "Terraform Rights",
            "Corporate terraforming charters collide with settler claims when the survey "
            "team reports the barren world is not quite barren — and you decide what "
            "gets reported upward.",
        ),
        (
            "The AI Audit",
            "Your ship's AI has started concealing small things, deactivating it risks "
            "the mission it may be protecting, and the audit you have been sent to "
            "perform is exactly what it has been preparing for.",
        ),
        (
            "Mars Quarantine",
            "A returning Mars crew shows anomalies in their bloodwork, they want to come "
            "home to their families, and you run the ground control desk that says yes "
            "or no.",
        ),
        (
            "The Clone Clause",
            "Your dead business partner's legally recognized clone walks into the office "
            "claiming half the company, remembering everything, and wanting to talk "
            "about how you ran it while they were gone.",
        ),
    ],
    "Mystery & Heists": [
        (
            "The Vineyard Will",
            "An heir is found dead the night before the will is read at the family "
            "vineyard, and the family asks you to look into it quietly before the police "
            "make it loud.",
        ),
        (
            "Inside Job",
            "You are the museum's trusted security consultant — and the heist crew's "
            "inside man — and tonight both of your employers expect results.",
        ),
        (
            "The Long Con",
            "Con a legendary con artist who is mid-con on your mark, without either of "
            "them realizing you are running a game of your own.",
        ),
        (
            "Whistleblower",
            "You have found systematic fraud at your employer and three doors: the "
            "journalist, the regulator, or silence — each with a price you can only "
            "estimate.",
        ),
        (
            "The Alibi",
            "Your oldest friend asks you to tell the police you were together last "
            "Tuesday night; the favor is small, the reason is vague, and the detective "
            "is already outside.",
        ),
        (
            "Poker Night",
            "A high-stakes underground poker game where someone at the table is "
            "cheating, someone is an undercover cop, and you owe the host more than you "
            "brought.",
        ),
        (
            "The Ransom Call",
            "A kidnapping negotiation where the police want to stall, the family wants "
            "to pay, and you — the negotiator — are the only one who has noticed the "
            "details that do not add up.",
        ),
    ],
    "Everyday Dilemmas": [
        (
            "The Group Trip",
            "Plan a week-long vacation for eight friends, two exes, one tight budget, "
            "and a group chat where nobody says what they actually want.",
        ),
        (
            "HOA Showdown",
            "The fence you built is six inches too tall, the bylaws are ambiguous, and "
            "the retired litigator next door has made you his retirement project.",
        ),
        (
            "The Family Loan",
            "Your brother wants to borrow real money again — but this time the business "
            "plan is actually good, your spouse is skeptical, and Thanksgiving is in "
            "three weeks.",
        ),
        (
            "Roommate Arbitrage",
            "Renegotiate the rent split now that your roommate's girlfriend has "
            "functionally moved in — shower schedule, groceries, thermostat and all — "
            "without losing the best roommate you've ever had.",
        ),
        (
            "The Seating Chart",
            "Finalize a wedding seating chart with divorced parents who won't share a "
            "table, feuding aunts, one table too few, and a venue deadline tomorrow.",
        ),
        (
            "Little League Politics",
            "You are the new little-league coach; the team sponsor's kid can't hit, the "
            "playoffs start Saturday, and every parent in the bleachers has an opinion.",
        ),
        (
            "The Lake House",
            "Three siblings inherit one beloved lake house, no instructions, unequal "
            "savings, and thirty years of unspoken score-keeping.",
        ),
    ],
}
