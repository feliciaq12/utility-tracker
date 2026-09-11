# Utility Balance Tracker

A simple mobile-friendly prepaid utility tracker for a shared apartment.

It tracks:

- ⚡ Electricity
- 💧 Tap Water
- 🔥 Natural Pipeline Gas
- Current prepaid balances
- Utility top-ups
- Monthly consumption
- Physical usage
- Tiered utility rates
- Roommate contributions
- Monthly trends and insights

## How it works

At each monthly checkpoint, enter:

1. The current prepaid balance before topping up
2. The amount you top up

The app automatically calculates:

**Balance after top-up = Current balance + Top-up**

At the next checkpoint, it can calculate the amount consumed since the previous entry.

Example:

- September 5 balance: ¥60
- Top-up: ¥300
- Balance after top-up: ¥360
- October 5 balance: ¥120

Consumption between September 5 and October 5:

**¥360 − ¥120 = ¥240**

## Utility Rates

### Electricity

Annual cumulative household usage:

- ≤ 2760 kWh — ¥0.5283/kWh
- 2760–4800 kWh — ¥0.5783/kWh
- > 4800 kWh — ¥0.8283/kWh

### Tap Water

Annual cumulative household usage:

- ≤ 216 m³ — ¥2.91/m³
- 216–300 m³ — ¥3.71/m³
- > 300 m³ — ¥6.11/m³

### Natural Pipeline Gas

Annual cumulative household usage:

- 0–400 m³ — ¥2.99/m³
- 400–1000 m³ — ¥3.59/m³
- > 1000 m³ — ¥4.49/m³

## Data Storage

This GitHub Pages version stores data using your browser's local storage.

That means:

- Your data stays on the device/browser where you entered it.
- Refreshing or closing the website normally does not erase the data.
- Different devices do not automatically share the same data.
- Clearing browser/site data may delete the saved records.

A cloud database such as Supabase or Firebase can be added later if synchronized roommate access is needed.

## Built With

- React
- Vite
- Recharts
- Lucide React
- GitHub Pages
