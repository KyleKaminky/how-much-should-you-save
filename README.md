# How Much Should You Save?

Work out the share of your income you need to invest for retirement — with your
current balance, Social Security, and every assumption made editable. Static
site, no backend: all math runs in the browser, and nothing you type leaves it.

**Live:** https://how-much-should-you-save.vercel.app

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 109 tests
npm run build    # static output in dist/
```

## Sharing a scenario

Every input is encoded in the query string, so a link carries the whole
calculation — `?age=32&inc=210000&repl=0.65`. Only values that differ from the
defaults are written, which keeps links short and hand-editable. The **Copy
link** button grabs the current one. A malformed link degrades to the default
scenario rather than breaking.

## Deploying

Static output, no server. Vercel auto-detects the Vite preset; nothing to
configure.

| Setting | Value |
|---|---|
| Framework | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` |

Pushing to `main` redeploys. If you move it to a different domain, update the
absolute `og:`/`canonical` URLs in `index.html` — link-preview scrapers reject
relative image URLs, so they have to be hardcoded.

## What it answers

Given your age, income, current savings and target retirement age: **what percentage
of gross income do you have to invest?** Plus a projection of the balance from today
through your plan-through age, so you can see whether the money actually lasts.

Set **your own savings rate** and it projects that path alongside the required one —
two curves, the shortfall in dollars and in percentage points, the income your rate
actually sustains, and the age your money runs out. The solved rate stays visible
throughout: replacing it with your number would hide the benchmark you're measuring
against.

Assumptions default to conventional retirement-planning heuristics — 80% income
replacement, 3% inflation, 3% wage growth, an age-banded safe withdrawal rate, and
a declining assumed return. Every one of them is an input.

## How the model works

Everything runs in **real (today's) dollars**, converting nominal rates with the
Fisher relation rather than subtracting inflation. The conventional version of this
calculation can leave that ambiguous because it fixes inflation and wage growth at
3% each, so they cancel; the moment those are independent inputs, "80% of income in
today's dollars" has to be pinned down.

The projection is a year-by-year loop rather than a closed form, so every return
model works identically and the chart data falls out for free. The balance at
retirement is linear in the savings rate, so the solve is two projections and a
division — no bisection.

```
target = (spending − social security) / withdrawal rate + bridge
```

The **bridge** is what most versions of this calculation leave out: retire at 55
and claim Social Security at 67, and the portfolio carries the entire spend for
twelve years. The model adds the present value of those missing benefit years.

### Where this departs from the usual rules of thumb

- **Return glide path.** The common simplification picks one rate from your age
  *today* and applies it for life, which means two people investing in the same
  calendar year are assumed to earn different returns — a declining-equity glide
  path applied at the wrong granularity. `Glide path` mode applies the curve year by
  year as you age; it's the more defensible assumption and costs noticeably more to
  save for (age 30 → 60: 34.7% vs 25.3%). Flat is the default only because it's the
  familiar convention.
- **The withdrawal rate is a rule of thumb, not a guarantee.** The 4% rule applies
  one number to everyone; this uses age bands and lets you override them. Either way
  the model also runs the drawdown forward and reports the age the portfolio
  actually runs dry.
- **Withdrawal rate follows retirement age** (under 45: 3%, 45–55: 3.5%, 56–65: 4%,
  66–70: 4.5%, 71–75: 5%, over 75: 5.5%), because retiring earlier means the money
  has to last longer.

### Social Security

Estimated with the real SSA formula on 2026 figures — bend points $1,286 / $7,749,
taxable maximum $184,500, FRA 67. Earnings are projected across a career from age
22, capped at the wage base; the top 35 years over 420 months give the AIME. The
default 25% benefit cut reflects the trust fund's projected 2035 depletion. You can
override the PIA with your real figure from ssa.gov.

## Regression guard

`tests/referenceGrid.test.ts` freezes a set of the model's own computed values as
golden numbers. If a change to the engine moves a cell, the suite fails and the
diff has to be justified — update those numbers deliberately, never just to make
the tests green. It also asserts the grid's structural properties: rates rise as
the starting age rises and fall as retirement is pushed out, and the answer is
independent of the income used to compute it.

## Not modeled

Taxes (everything is pre-tax — "25% of gross" means different things in a
traditional 401(k), a Roth, and a brokerage account), sequence-of-returns risk
(returns are smooth; there's no Monte Carlo), spousal and survivor benefits,
pensions, and healthcare cost inflation. All of these push toward saving more.

Planning tool, not financial advice.
