import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";

import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import {
  Home,
  Plus,
  ListTree,
  BarChart2,
  Settings as SettingsIcon,
  Trash2,
  X,
  Zap,
  Droplet,
  Gauge,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Check,
  Wallet,
} from "lucide-react";

/* ================================
   STORAGE
================================ */

const STORAGE_KEY = "utility-tracker-v2";
const MONTH_WINDOW = 9;

/* ================================
   COLORS
================================ */

const C = {
  bg: "#F7F4FC",
  card: "#FFFFFF",
  cardTint: "#FBF9FE",

  ink: "#3A3550",
  inkSoft: "#7A7390",
  inkFaint: "#AAA2C4",

  border: "#ECE6F8",

  primary: "#8E7CC3",
  primaryDeep: "#5B4E9E",
  primaryPale: "#E8E1FA",

  mint: "#5FAE88",
  mintPale: "#DEF3E9",

  amber: "#C99A3E",
  amberPale: "#FBEED4",

  coral: "#D97862",
  coralPale: "#FBE1DC",

  chart: [
    "#8FB8E0",
    "#E3A6C9",
    "#7FCBAE",
    "#E3B764",
  ],

  white: "#FFFFFF",
};

const FONT_HEAD =
  "'Quicksand', ui-sans-serif, system-ui, sans-serif";

const FONT_MONO =
  "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

/* ================================
   HELPERS
================================ */

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function fmtMoney(n, currency = "¥") {
  const value = Number.isFinite(Number(n))
    ? Number(n)
    : 0;

  const sign = value < 0 ? "-" : "";

  return (
    sign +
    currency +
    Math.abs(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function fmtNum(n, digits = 1) {
  const value = Number.isFinite(Number(n))
    ? Number(n)
    : 0;

  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function monthLabel(monthKey) {
  if (!monthKey) return "";

  const [year, month] = monthKey
    .split("-")
    .map(Number);

  return new Date(
    year,
    month - 1,
    1
  ).toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
  });
}

function todayISO() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/* ================================
   TIER CALCULATION
================================ */

/*
  All three utility tariffs are
  annual cumulative tiers.

  baseline = usage already recorded
  earlier in the same calendar year.
*/

function calcTierCost(
  usage,
  tiers,
  baseline = 0
) {
  let remaining = Number(usage) || 0;

  if (
    remaining <= 0 ||
    !tiers ||
    !tiers.length
  ) {
    return 0;
  }

  let cost = 0;
  let cursor = baseline;

  for (const tier of tiers) {
    const cap =
      tier.upTo === null ||
      tier.upTo === undefined ||
      tier.upTo === ""
        ? Infinity
        : Number(tier.upTo);

    if (cursor >= cap) continue;

    const available = cap - cursor;

    const amount = Math.min(
      remaining,
      available
    );

    if (amount > 0) {
      cost +=
        amount *
        Number(tier.rate || 0);

      cursor += amount;
      remaining -= amount;
    }

    if (remaining <= 1e-9) break;
  }

  return cost;
}

function tierBreakdown(
  usage,
  tiers,
  baseline = 0
) {
  let remaining = Number(usage) || 0;
  const rows = [];

  if (
    remaining <= 0 ||
    !tiers ||
    !tiers.length
  ) {
    return rows;
  }

  let cursor = baseline;

  for (const tier of tiers) {
    const cap =
      tier.upTo === null ||
      tier.upTo === undefined ||
      tier.upTo === ""
        ? Infinity
        : Number(tier.upTo);

    if (cursor >= cap) continue;

    const available = cap - cursor;

    const amount = Math.min(
      remaining,
      available
    );

    if (amount > 0) {
      rows.push({
        amount,
        rate: Number(tier.rate || 0),
        cost:
          amount *
          Number(tier.rate || 0),
      });
    }

    cursor += amount;
    remaining -= amount;

    if (remaining <= 1e-9) break;
  }

  return rows;
}

/* ================================
   DEFAULT APARTMENT DATA
================================ */

function defaultData() {
  return {
    currency: "¥",

    roommates: [
      "You",
      "Roommate B",
      "Roommate C",
    ],

    utilities: [
      {
        id: "elec",
        name: "Electricity",
        unit: "kWh",

        tiers: [
          {
            upTo: 2760,
            rate: 0.5283,
          },
          {
            upTo: 4800,
            rate: 0.5783,
          },
          {
            upTo: null,
            rate: 0.8283,
          },
        ],
      },

      {
        id: "water",
        name: "Tap Water",
        unit: "m³",

        tiers: [
          {
            upTo: 216,
            rate: 2.91,
          },
          {
            upTo: 300,
            rate: 3.71,
          },
          {
            upTo: null,
            rate: 6.11,
          },
        ],
      },

      {
        id: "gas",
        name: "Natural Pipe Gas",
        unit: "m³",

        tiers: [
          {
            upTo: 400,
            rate: 2.99,
          },
          {
            upTo: 1000,
            rate: 3.59,
          },
          {
            upTo: null,
            rate: 4.49,
          },
        ],
      },
    ],

    logs: [],
  };
}

/* ================================
   LOCAL STORAGE
================================ */

/*
  GitHub Pages is a static website,
  so data is stored locally in the
  browser on this device.
*/

function loadData() {
  try {
    const saved =
      localStorage.getItem(
        STORAGE_KEY
      );

    if (!saved) {
      return defaultData();
    }

    const parsed = JSON.parse(saved);

    return {
      ...defaultData(),
      ...parsed,

      utilities:
        Array.isArray(
          parsed.utilities
        )
          ? parsed.utilities
          : defaultData().utilities,

      roommates:
        Array.isArray(
          parsed.roommates
        )
          ? parsed.roommates
          : defaultData().roommates,

      logs:
        Array.isArray(parsed.logs)
          ? parsed.logs
          : [],
    };
  } catch (error) {
    console.error(
      "Could not load utility data:",
      error
    );

    return defaultData();
  }
}

function saveData(data) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(data)
    );

    return true;
  } catch (error) {
    console.error(
      "Could not save utility data:",
      error
    );

    return false;
  }
}

/* ================================
   UTILITY ICON
================================ */

function utilityIcon(name = "") {
  const lower =
    name.toLowerCase();

  if (
    lower.includes("elec") ||
    lower.includes("power")
  ) {
    return Zap;
  }

  if (lower.includes("water")) {
    return Droplet;
  }

  if (lower.includes("gas")) {
    return Gauge;
  }

  return Gauge;
}
