# OPALSTAYS Smart Package Engine

Internal tool for OPALSTAYS. You enter a customer's trip and it builds **Budget / Premium / Luxury** packages with an exact price, a day-by-day itinerary, and a customer quote you can print or send on WhatsApp. Cost and profit are shown only in admin mode.

```
OPALSTAYS Database → Pricing Engine → Transport/Timing rules → Itinerary scheduler → (optional) AI writer → Package
```

**Rules calculate the price. AI only writes words.**

| Part | Who does it | Notes |
|---|---|---|
| Hotel cost, room configuration, season rates, extra beds | Rules | `₹2,500 × 2 rooms × 3 nights = ₹15,000`, exact |
| Train/bus/cab choice, pickup/drop, local cab days | Rules | From your timetable and rate cards |
| Day-by-day timing (check-in, sightseeing slots, meals) | Rules | Deterministic scheduler |
| Food, activities, contingency, markup, GST, rounding, commission, profit | Rules | Unit-tested, always adds up: `cost + profit + GST + commission = final` |
| Package title, day stories, tips, add-on suggestions (English / Gujarati / Hindi) | AI (optional) | Claude sees only customer-safe data, never costs or profit |

## Features

- **Database (Admin):** properties (Hotel/Resort/Villa/Homestay/Camp/Heritage), room types, B2B and B2C rates, meal plan (EP/CP/MAP/AP), max guests, extra beds, season pricing, rate expiry. Also trains (timings, run days, class-wise fares), buses, cabs (capacity, ₹/km, min km, driver allowance, local day rate, transfer rate), road distances, and activities (safari, boating, entry tickets, guides, local experiences).
- **Quote:** route with any number of stops, auto or fixed nights per stop, members, dates, budget, AC, meals, and notes for the AI.
- **3 options at once.** The admin sees profit per option and which one is the best fit for the budget.
- **Customer mode** (optionally locked with a PIN) hides every internal number, so you can share your screen with a customer.
- **Customer quote:** print or save as PDF, and copy WhatsApp text.
- **Saved quotes** with status (draft/sent/confirmed/lost) and confirmed profit.
- **Backup / restore** the whole database as a JSON file.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # pricing engine tests
npm run build      # production build in dist/
```

## Put it on GitHub Pages

1. Push to `main`.
2. In GitHub, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow `.github/workflows/deploy.yml` tests, builds and deploys. The site URL appears in the Actions run.

Things to know:

- **Your data stays in your browser** (localStorage), not on GitHub. Each browser or computer has its own copy. Use **Admin → Backup** to move data between them, and download a backup regularly.
- The *code and sample data* on a Pages site are public, even if nobody knows the link. Your real rates are not, because you enter them in the browser. Don't commit real rates into `src/data/seed.ts` if the repo or site is public.
- GitHub Pages from a **private** repo needs a paid GitHub plan. You can also just run it locally.

## AI (optional)

Go to Admin → Pricing & settings and paste an Anthropic API key. The key is stored only in that browser. Without a key, the app uses a standard description, and prices and timings are exactly the same. The default model is `claude-opus-5-5`, and it is called with a server-side fallback in case a request is declined.

## Sample data

Everything in `src/data/seed.ts` is **placeholder data**: hotel names marked "(sample)", train numbers `SAMPLE-xxx`, approximate fares. Replace it with your contracted rates and verified timetables in Admin before sending quotes.

## Known limits

1. **No live availability.** Trains and hotels come from your own tables. Real-time seats need an authorized railway/IRCTC partner API, and real-time rooms need a channel manager or OTA integration. Quotes say "subject to availability".
2. **Rates must be kept up to date.** The app warns when a property's "rates valid till" date has passed.
3. Weather, traffic and operator delays can't be guaranteed. They are listed in the exclusions and terms.
4. **GST:** the default is 5% on the total package value (a common setup for tour operators without ITC). Confirm with your CA and change it in settings.

## Code map

```
src/engine/   types, hotel pricing, transport, itinerary scheduler, price summary, package generator (+ tests)
src/data/     sample database
src/store/    localStorage, backup/restore
src/ai/       customer-safe copy + Claude writer
src/ui/       quote form, options, customer quote / admin breakdown, history, admin database editor
```
