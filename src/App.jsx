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
function usageFromCost(
  cost,
  tiers,
  baseline = 0
) {
  let remainingCost =
    Number(cost) || 0;

  if (
    remainingCost <= 0 ||
    !tiers ||
    !tiers.length
  ) {
    return 0;
  }

  let usage = 0;
  let cursor = baseline;

  for (const tier of tiers) {
    const cap =
      tier.upTo === null ||
      tier.upTo === undefined ||
      tier.upTo === ""
        ? Infinity
        : Number(tier.upTo);

    if (cursor >= cap) {
      continue;
    }

    const rate =
      Number(tier.rate || 0);

    if (rate <= 0) {
      continue;
    }

    const availableUsage =
      cap - cursor;

    const availableCost =
      availableUsage === Infinity
        ? Infinity
        : availableUsage * rate;

    if (
      remainingCost <=
      availableCost
    ) {
      const amount =
        remainingCost / rate;

      usage += amount;
      remainingCost = 0;
      break;
    }

    usage += availableUsage;
    remainingCost -=
      availableCost;
    cursor += availableUsage;
  }

  return usage;
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
  startingAnnualUsage: 0,

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
  startingAnnualUsage: 0,

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
  startingAnnualUsage: 0,

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
/* ================================
   BASIC UI COMPONENTS
================================ */

function Field({ label, children, hint }) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontFamily: FONT_HEAD,
          fontSize: 13,
          color: C.inkSoft,
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        {label}
      </div>

      {children}

      {hint && (
        <div
          style={{
            fontFamily: FONT_HEAD,
            fontSize: 12,
            color: C.inkFaint,
            marginTop: 4,
          }}
        >
          {hint}
        </div>
      )}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "13px 14px",
  minHeight: 48,
  borderRadius: 16,
  border: `1.5px solid ${C.border}`,
  background: C.cardTint,
  fontFamily: FONT_MONO,
  fontSize: 14,
  color: C.ink,
  outline: "none",
};

const selectStyle = {
  ...inputStyle,
  fontFamily: FONT_HEAD,
  fontWeight: 600,
};

function IconButton({
  onClick,
  children,
  title,
  danger,
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        border: "none",
        background: danger
          ? C.coralPale
          : C.primaryPale,
        color: danger
          ? C.coral
          : C.primaryDeep,
        borderRadius: 14,
        padding: 9,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  onClick,
  children,
  disabled,
  full,
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled
          ? C.inkFaint
          : C.primary,
        color: C.white,
        border: "none",
        borderRadius: 18,
        padding: "15px 22px",
        fontFamily: FONT_HEAD,
        fontWeight: 700,
        fontSize: 15,
        cursor: disabled
          ? "default"
          : "pointer",
        width: full
          ? "100%"
          : undefined,
        minHeight: 50,
      }}
    >
      {children}
    </button>
  );
}

function Card({ children, style }) {
  return (
    <div
      style={{
        background: C.card,
        borderRadius: 22,
        padding: 18,
        border: `1px solid ${C.border}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div
      style={{
        fontFamily: FONT_HEAD,
        fontWeight: 600,
        fontSize: 13,
        color: C.inkFaint,
        padding: 18,
        background: C.primaryPale,
        borderRadius: 18,
        margin: "10px 0",
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div
      style={{
        fontFamily: FONT_HEAD,
        fontWeight: 700,
        fontSize: 15,
        color: C.ink,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

/* ================================
   UTILITY METER CARD
================================ */

function MeterCard({
  utility,
  totals,
  currency,
}) {
  const Icon =
    utilityIcon(utility.name);

  const status = totals.status;

  const tone =
    status === "red"
      ? {
          text: C.coral,
          bg: C.coralPale,
          label: "balance owing",
        }
      : status === "amber"
      ? {
          text: C.amber,
          bg: C.amberPale,
          label: "running low",
        }
      : {
          text: C.mint,
          bg: C.mintPale,
          label: "balance ok",
        };

  return (
    <Card
      style={{
        marginBottom: 14,
        background: tone.bg,
        border: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div
            style={{
              background: C.white,
              borderRadius: 14,
              padding: 9,
              display: "flex",
            }}
          >
            <Icon
              size={18}
              color={tone.text}
            />
          </div>

          <div>
            <div
              style={{
                fontFamily: FONT_HEAD,
                fontWeight: 700,
                fontSize: 15,
                color: C.ink,
              }}
            >
              {utility.name}
            </div>

            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                color: C.inkSoft,
              }}
            >
              {totals.lastDate
                ? `updated ${totals.lastDate}`
                : "no logs yet"}
            </div>
          </div>
        </div>

        <div
          style={{
            textAlign: "right",
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONO,
              fontWeight: 700,
              fontSize: 21,
              color: tone.text,
            }}
          >
            {fmtMoney(
              totals.balance,
              currency
            )}
          </div>

          <div
            style={{
              fontFamily: FONT_HEAD,
              fontSize: 10,
              fontWeight: 700,
              color: tone.text,
              marginTop: 2,
            }}
          >
            {tone.label}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          marginTop: 12,
        }}
      >
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            color: C.inkSoft,
          }}
        >
          topped up{" "}
          {fmtMoney(
            totals.topupSum,
            currency
          )}
        </span>

        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            color: C.inkSoft,
          }}
        >
          consumed{" "}
          {fmtMoney(
            totals.costSum,
            currency
          )}
        </span>
      </div>
    </Card>
  );
}

/* ================================
   HOME / DASHBOARD
================================ */

function Dashboard({
  data,
  perUtility,
  overallBalance,
  recent,
  currency,
}) {
  return (
    <div>
      <div
        style={{
          padding: "24px 20px",
          borderRadius: 24,
          background: C.primary,
          color: C.white,
          margin: "18px 0 20px",
        }}
      >
        <div
          style={{
            fontFamily: FONT_HEAD,
            fontSize: 13,
            opacity: 0.85,
            fontWeight: 600,
          }}
        >
          combined balance
        </div>

        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 38,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        >
          {fmtMoney(
            overallBalance,
            currency
          )}
        </div>

        <div
          style={{
            fontFamily: FONT_HEAD,
            fontSize: 12,
            opacity: 0.8,
            marginTop: 4,
          }}
        >
          across {data.utilities.length}{" "}
          {data.utilities.length === 1
            ? "utility"
            : "utilities"}{" "}
          · shared with{" "}
          {data.roommates.length} people
        </div>
      </div>

      {perUtility.length === 0 && (
        <EmptyState text="No utilities set up yet — add one in Settings." />
      )}

      {perUtility.map((row) => (
        <MeterCard
          key={row.utility.id}
          utility={row.utility}
          totals={row}
          currency={currency}
        />
      ))}

      <div
        style={{
          marginTop: 22,
        }}
      >
        <SectionTitle>
          Recent activity
        </SectionTitle>

        {recent.length === 0 && (
          <EmptyState text="Nothing logged yet — tap + to log your first balance." />
        )}

        {recent.map((log) => (
          <div
            key={log.id}
            style={{
              padding: "12px 16px",
              background: C.card,
              borderRadius: 16,
              marginBottom: 8,
              border: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
              }}
            >
              <div
                style={{
                  fontFamily:
                    FONT_HEAD,
                  fontWeight: 700,
                  fontSize: 13,
                  color: C.ink,
                }}
              >
                {log.utilityName}
              </div>

              <div
                style={{
                  fontFamily:
                    FONT_MONO,
                  fontSize: 11,
                  color: C.inkFaint,
                }}
              >
                {log.date}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                marginTop: 4,
                alignItems:
                  "baseline",
              }}
            >
              <span
                style={{
                  fontFamily:
                    FONT_MONO,
                  fontSize: 12,
                  color: C.inkSoft,
                }}
              >
                {fmtMoney(
                  log.currentBalance,
                  currency
                )}{" "}
                <span
                  style={{
                    color: C.inkFaint,
                  }}
                >
                  →
                </span>{" "}
                {fmtMoney(
                  log.balanceAfter,
                  currency
                )}
              </span>

              {log.topupAmount > 0 && (
                <span
                  style={{
                    fontFamily:
                      FONT_MONO,
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.mint,
                  }}
                >
                  +
                  {fmtMoney(
                    log.topupAmount,
                    currency
                  )}
                </span>
              )}
            </div>

            {log.cost > 0 && (
              <div
                style={{
                  fontFamily:
                    FONT_MONO,
                  fontSize: 11,
                  color: C.coral,
                  marginTop: 2,
                }}
              >
                consumed{" "}
                {fmtMoney(
                  log.cost,
                  currency
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
/* ================================
   ADD MONTHLY ENTRY
================================ */

function AddEntry({
  data,
  currentBalances,
  onSave,
}) {
  const [utilityId, setUtilityId] =
    useState(
      data.utilities[0]
        ? data.utilities[0].id
        : ""
    );

  const [date, setDate] =
    useState(todayISO());

  const [
    currentBalance,
    setCurrentBalance,
  ] = useState("");

  const [
    topupAmount,
    setTopupAmount,
  ] = useState("");

  const [person, setPerson] =
    useState(
      data.roommates[0] || ""
    );

  const [usage, setUsage] =
    useState("");

  const [note, setNote] =
    useState("");

  const [error, setError] =
    useState("");

  const [confirmed, setConfirmed] =
    useState(false);

  const utility =
    data.utilities.find(
      (u) => u.id === utilityId
    );

  const suggestedBalance =
    currentBalances[utilityId] || 0;

  useEffect(() => {
    setCurrentBalance(
      suggestedBalance
        ? String(
            Math.max(
              0,
              Number(
                suggestedBalance.toFixed(
                  2
                )
              )
            )
          )
        : ""
    );

    setConfirmed(false);
  }, [
    utilityId,
    suggestedBalance,
  ]);

  useEffect(() => {
    setConfirmed(false);
  }, [
    date,
    topupAmount,
    usage,
    person,
    currentBalance,
  ]);

  const cb =
    Number(currentBalance) || 0;

  const top =
    Number(topupAmount) || 0;

  const balanceAfter =
    cb + top;

  const impliedCost =
    suggestedBalance - cb;

  /* ================================
     YEARLY TIER BASELINE
  ================================ */

  const isAutoUsage =
  utilityId === "elec" ||
  utilityId === "water";

const yearBaseline =
  useMemo(() => {
    if (!utility) return 0;

    const year =
      (date || "").slice(0, 4);

    const startingUsage =
      Number(
        utility.startingAnnualUsage || 0
      );

    const trackedUsage =
      data.logs
        .filter(
          (log) =>
            log.utilityId ===
              utilityId &&
            log.usage != null &&
            (log.date || "").slice(
              0,
              4
            ) === year
        )
        .reduce(
          (sum, log) =>
            sum +
            Number(log.usage || 0),
          0
        );

    return (
      startingUsage +
      trackedUsage
    );
  }, [
    data.logs,
    utilityId,
    date,
    utility,
  ]);

/* ================================
   AUTOMATIC PHYSICAL USAGE
================================ */

const calculatedUsage =
  isAutoUsage &&
  impliedCost > 0 &&
  utility
    ? usageFromCost(
        impliedCost,
        utility.tiers,
        yearBaseline
      )
    : null;

/*
  Electricity + water:
  use automatically calculated usage.

  Gas:
  keep manual meter usage.
*/

const effectiveUsage =
  isAutoUsage
    ? calculatedUsage
    : usage === ""
    ? null
    : Number(usage);

const tierEstimate =
  utility &&
  effectiveUsage != null
    ? calcTierCost(
        effectiveUsage,
        utility.tiers,
        yearBaseline
      )
    : 0;

const tierRows =
  utility &&
  effectiveUsage != null
    ? tierBreakdown(
        effectiveUsage,
        utility.tiers,
        yearBaseline
      )
    : [];
  /* ================================
     SAVE ENTRY
  ================================ */

  function submit() {
    if (!utilityId) {
      setError(
        "Choose a utility first."
      );
      return;
    }

    if (
      currentBalance === "" ||
      cb < 0
    ) {
      setError(
        "Enter the current prepaid balance."
      );
      return;
    }

    if (top < 0) {
      setError(
        "Top-up amount can't be negative."
      );
      return;
    }

    setError("");

    onSave({
      id: uid(),

      utilityId,

      date,

      month: date.slice(0, 7),

      currentBalance: cb,

      topupAmount: top,

      balanceAfter,

      /*
        Consumption cost since
        previous logged balance.

        Example:
        Previous after-top-up = ¥360
        New current balance = ¥120
        Consumed = ¥240
      */
      cost: impliedCost,

      /*
        Physical usage is optional.
        It can be entered manually
        if known from the utility meter.
      */
      usage: effectiveUsage,

usageSource:
  isAutoUsage
    ? "estimated"
    : "meter",

      person:
        top > 0
          ? person
          : null,

      note,
    });

    setTopupAmount("");
    setUsage("");
    setNote("");
    setConfirmed(true);

    setCurrentBalance(
      String(
        Math.max(
          0,
          Number(
            balanceAfter.toFixed(2)
          )
        )
      )
    );
  }

  if (
    data.utilities.length === 0
  ) {
    return (
      <EmptyState text="Add a utility in Settings before logging entries." />
    );
  }

  return (
    <div
      style={{
        paddingTop: 18,
      }}
    >
      {/* Utility */}

      <Field label="Utility">
        <select
          style={selectStyle}
          value={utilityId}
          onChange={(e) =>
            setUtilityId(
              e.target.value
            )
          }
        >
          {data.utilities.map(
            (u) => (
              <option
                key={u.id}
                value={u.id}
              >
                {u.name}
              </option>
            )
          )}
        </select>
      </Field>

      {/* Date */}

      <Field
        label="Date"
        hint="Your usual monthly checkpoint can be around the 5th."
      >
        <input
          style={inputStyle}
          type="date"
          value={date}
          onChange={(e) =>
            setDate(e.target.value)
          }
        />
      </Field>

      {/* Current balance */}

      <Field
        label={`Current balance (${data.currency})`}
        hint="Enter the prepaid balance shown before you top up."
      >
        <input
          style={inputStyle}
          type="number"
          min="0"
          step="0.01"
          value={currentBalance}
          onChange={(e) =>
            setCurrentBalance(
              e.target.value
            )
          }
          placeholder="0.00"
        />
      </Field>

      {/* Automatic consumption */}

      {impliedCost > 0 &&
        currentBalance !== "" && (
          <div
            style={{
              background:
                C.coralPale,
              borderRadius: 16,
              padding: "12px 14px",
              marginTop: -8,
              marginBottom: 16,
              fontFamily:
                FONT_HEAD,
              fontSize: 12,
              fontWeight: 600,
              color: C.coral,
            }}
          >
            Since your previous
            checkpoint, this utility
            consumed{" "}
            <strong>
              {fmtMoney(
                impliedCost,
                data.currency
              )}
            </strong>
            .
          </div>
        )}

      {impliedCost < 0 &&
        currentBalance !== "" && (
          <div
            style={{
              background:
                C.amberPale,
              borderRadius: 16,
              padding: "12px 14px",
              marginTop: -8,
              marginBottom: 16,
              fontFamily:
                FONT_HEAD,
              fontSize: 12,
              fontWeight: 600,
              color: C.amber,
            }}
          >
            Current balance is{" "}
            {fmtMoney(
              Math.abs(
                impliedCost
              ),
              data.currency
            )}{" "}
            higher than expected.
            Check whether another
            top-up happened since the
            previous entry.
          </div>
        )}

      {/* Top up */}

      <Field
        label={`Top-up amount (${data.currency})`}
        hint="Enter 0 if you only want to record the balance."
      >
        <input
          style={inputStyle}
          type="number"
          min="0"
          step="0.01"
          value={topupAmount}
          onChange={(e) =>
            setTopupAmount(
              e.target.value
            )
          }
          placeholder="0.00"
        />
      </Field>

      {/* Payer */}

      {top > 0 && (
        <Field label="Paid by">
          <select
            style={selectStyle}
            value={person}
            onChange={(e) =>
              setPerson(
                e.target.value
              )
            }
          >
            {data.roommates.map(
              (roommate) => (
                <option
                  key={roommate}
                  value={roommate}
                >
                  {roommate}
                </option>
              )
            )}
          </select>
        </Field>
      )}

      {/* Balance after top-up */}

      <div
        style={{
          background:
            C.primaryPale,
          borderRadius: 20,
          padding: 16,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <Wallet
              size={17}
              color={
                C.primaryDeep
              }
            />

            <span
              style={{
                fontFamily:
                  FONT_HEAD,
                fontWeight: 700,
                fontSize: 13,
                color:
                  C.primaryDeep,
              }}
            >
              Balance after top-up
            </span>
          </div>

          <span
            style={{
              fontFamily:
                FONT_MONO,
              fontWeight: 700,
              fontSize: 20,
              color:
                C.primaryDeep,
            }}
          >
            {fmtMoney(
              balanceAfter,
              data.currency
            )}
          </span>
        </div>
      </div>

    {/* Physical usage */}

{isAutoUsage ? (
  <div
    style={{
      background: C.mintPale,
      borderRadius: 18,
      padding: 15,
      marginBottom: 18,
    }}
  >
    <div
      style={{
        fontFamily: FONT_HEAD,
        fontSize: 11,
        fontWeight: 700,
        color: C.mint,
        marginBottom: 5,
      }}
    >
      Estimated physical usage
    </div>

    <div
      style={{
        fontFamily: FONT_MONO,
        fontWeight: 700,
        fontSize: 22,
        color: C.ink,
      }}
    >
      {calculatedUsage != null
        ? `${fmtNum(
            calculatedUsage,
            1
          )} ${utility.unit}`
        : `— ${utility.unit}`}
    </div>

    <div
      style={{
        fontFamily: FONT_HEAD,
        fontSize: 11,
        color: C.inkSoft,
        marginTop: 5,
        lineHeight: 1.5,
      }}
    >
      Calculated automatically from
      the prepaid balance consumed
      and your annual tier position.
    </div>
  </div>
) : (
  <Field
    label={`Gas usage (${utility ? utility.unit : "m³"})`}
    hint="Enter the usage from the gas meter if you want to track physical consumption."
  >
    <input
      style={inputStyle}
      type="number"
      min="0"
      step="0.1"
      value={usage}
      onChange={(e) =>
        setUsage(
          e.target.value
        )
      }
      placeholder="e.g. 12.5"
    />
  </Field>
)}

      {/* Tier estimate */}

      {usage && utility && (
        <div
          style={{
            background:
              C.cardTint,
            border: `1px dashed ${C.border}`,
            borderRadius: 18,
            padding: 14,
            marginBottom: 18,
          }}
        >
          <div
            style={{
              fontFamily:
                FONT_HEAD,
              fontSize: 11,
              color:
                C.inkFaint,
              marginBottom: 8,
            }}
          >
            Estimated cost using
            annual tiered rates
          </div>

          {tierRows.map(
            (row, index) => (
              <div
                key={index}
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "space-between",
                  gap: 10,
                  fontFamily:
                    FONT_MONO,
                  fontSize: 12,
                  color:
                    C.inkSoft,
                  marginBottom: 4,
                }}
              >
                <span>
                  {fmtNum(
                    row.amount
                  )}{" "}
                  {utility.unit} ×{" "}
                  {data.currency}
                  {row.rate}
                </span>

                <span>
                  {fmtMoney(
                    row.cost,
                    data.currency
                  )}
                </span>
              </div>
            )
          )}

          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              marginTop: 8,
              paddingTop: 8,
              borderTop: `1px solid ${C.border}`,
              fontFamily:
                FONT_MONO,
              fontWeight: 700,
              fontSize: 13,
              color: C.ink,
            }}
          >
            <span>
              Tiered estimate
            </span>

            <span>
              {fmtMoney(
                tierEstimate,
                data.currency
              )}
            </span>
          </div>
        </div>
      )}

      {/* Note */}

      <Field label="Note — optional">
        <input
          style={{
            ...inputStyle,
            fontFamily:
              FONT_HEAD,
          }}
          type="text"
          value={note}
          onChange={(e) =>
            setNote(e.target.value)
          }
          placeholder="Anything worth remembering"
        />
      </Field>

      {/* Error */}

      {error && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            color: C.coral,
            fontFamily:
              FONT_HEAD,
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          <AlertTriangle
            size={14}
          />
          {error}
        </div>
      )}

      {/* Success */}

      {confirmed &&
        !error && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems:
                "center",
              color: C.mint,
              fontFamily:
                FONT_HEAD,
              fontWeight: 600,
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            <Check size={14} />
            Saved.
          </div>
        )}

      <PrimaryButton
        onClick={submit}
        full
      >
        Save monthly record
      </PrimaryButton>
    </div>
  );
}
/* ================================
   HISTORY
================================ */

function History({
  data,
  logs,
  onDelete,
  currency,
}) {
  const [filter, setFilter] =
    useState("all");

  const filtered =
    filter === "all"
      ? logs
      : logs.filter(
          (log) =>
            log.utilityId === filter
        );

  return (
    <div
      style={{
        paddingTop: 18,
      }}
    >
      <select
        style={{
          ...selectStyle,
          marginBottom: 16,
        }}
        value={filter}
        onChange={(e) =>
          setFilter(e.target.value)
        }
      >
        <option value="all">
          All utilities
        </option>

        {data.utilities.map(
          (utility) => (
            <option
              key={utility.id}
              value={utility.id}
            >
              {utility.name}
            </option>
          )
        )}
      </select>

      {filtered.length === 0 && (
        <EmptyState text="No entries for this filter yet." />
      )}

      {filtered.map((log) => (
        <div
          key={log.id}
          style={{
            padding: "12px 16px",
            background: C.card,
            borderRadius: 16,
            marginBottom: 8,
            border: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily:
                    FONT_HEAD,
                  fontWeight: 700,
                  fontSize: 13,
                  color: C.ink,
                }}
              >
                {log.utilityName}
              </div>

              <div
                style={{
                  fontFamily:
                    FONT_MONO,
                  fontSize: 11,
                  color: C.inkFaint,
                  marginTop: 2,
                }}
              >
                {log.date}
              </div>
            </div>

            <IconButton
              title="Delete"
              danger
              onClick={() =>
                onDelete(log.id)
              }
            >
              <Trash2 size={13} />
            </IconButton>
          </div>

          <div
            style={{
              fontFamily:
                FONT_MONO,
              fontSize: 12,
              color: C.inkSoft,
              marginTop: 8,
            }}
          >
            {fmtMoney(
              log.currentBalance,
              currency
            )}{" "}
            <span
              style={{
                color: C.inkFaint,
              }}
            >
              →
            </span>{" "}
            {fmtMoney(
              log.balanceAfter,
              currency
            )}
          </div>

          {log.topupAmount > 0 && (
            <div
              style={{
                fontFamily:
                  FONT_MONO,
                fontSize: 11,
                color: C.mint,
                marginTop: 4,
                fontWeight: 700,
              }}
            >
              +{" "}
              {fmtMoney(
                log.topupAmount,
                currency
              )}
              {log.person
                ? ` · ${log.person}`
                : ""}
            </div>
          )}

          {log.cost > 0 && (
            <div
              style={{
                fontFamily:
                  FONT_MONO,
                fontSize: 11,
                color: C.coral,
                marginTop: 4,
              }}
            >
              consumed{" "}
              {fmtMoney(
                log.cost,
                currency
              )}
            </div>
          )}

          {log.usage != null && (
            <div
              style={{
                fontFamily:
                  FONT_MONO,
                fontSize: 11,
                color: C.inkFaint,
                marginTop: 4,
              }}
            >
              {fmtNum(log.usage)}{" "}
              {log.unit}
            </div>
          )}

          {log.note && (
            <div
              style={{
                fontFamily:
                  FONT_HEAD,
                fontSize: 11,
                color: C.inkFaint,
                marginTop: 4,
              }}
            >
              {log.note}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ================================
   INSIGHTS
================================ */

function Insights({
  data,
  currency,
  monthlyCost,
  monthlyByUtility,
  fairness,
}) {
  return (
    <div
      style={{
        paddingTop: 18,
      }}
    >
      <SectionTitle>
        Monthly cost vs top-ups
      </SectionTitle>

      <Card
        style={{
          marginBottom: 24,
        }}
      >
        <div
          style={{
            height: 200,
          }}
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <BarChart
              data={monthlyCost}
              margin={{
                left: -20,
                right: 4,
              }}
            >
              <CartesianGrid
                stroke={C.border}
                vertical={false}
              />

              <XAxis
                dataKey="label"
                tick={{
                  fontFamily:
                    FONT_MONO,
                  fontSize: 11,
                  fill: C.inkFaint,
                }}
                axisLine={{
                  stroke: C.border,
                }}
                tickLine={false}
              />

              <YAxis
                tick={{
                  fontFamily:
                    FONT_MONO,
                  fontSize: 11,
                  fill: C.inkFaint,
                }}
                axisLine={false}
                tickLine={false}
              />

              <Tooltip
                formatter={(
                  value,
                  name
                ) => [
                  fmtMoney(
                    value,
                    currency
                  ),
                  name,
                ]}
                contentStyle={{
                  fontFamily:
                    FONT_HEAD,
                  fontSize: 12,
                  borderRadius: 12,
                  border: `1px solid ${C.border}`,
                }}
              />

              <Legend
                wrapperStyle={{
                  fontFamily:
                    FONT_HEAD,
                  fontSize: 12,
                }}
              />

              <Bar
                dataKey="cost"
                name="Consumed"
                fill={C.coral}
                radius={[
                  8,
                  8,
                  0,
                  0,
                ]}
              />

              <Bar
                dataKey="topups"
                name="Topped up"
                fill={C.mint}
                radius={[
                  8,
                  8,
                  0,
                  0,
                ]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Per utility charts */}

      {data.utilities.map(
        (utility, index) => {
          const rows =
            monthlyByUtility[
              utility.id
            ] || [];

          const color =
            C.chart[
              index %
                C.chart.length
            ];

          return (
            <div
              key={utility.id}
              style={{
                marginBottom: 24,
              }}
            >
              <SectionTitle>
                {utility.name}
              </SectionTitle>

              <Card
                style={{
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    fontFamily:
                      FONT_HEAD,
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.inkSoft,
                    marginBottom: 6,
                  }}
                >
                  monthly physical
                  consumption (
                  {utility.unit})
                </div>

                <div
                  style={{
                    height: 160,
                  }}
                >
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >
                    <BarChart
                      data={rows}
                      margin={{
                        left: -20,
                        right: 4,
                      }}
                    >
                      <CartesianGrid
                        stroke={
                          C.border
                        }
                        vertical={
                          false
                        }
                      />

                      <XAxis
                        dataKey="label"
                        tick={{
                          fontFamily:
                            FONT_MONO,
                          fontSize: 10,
                          fill:
                            C.inkFaint,
                        }}
                        axisLine={{
                          stroke:
                            C.border,
                        }}
                        tickLine={
                          false
                        }
                      />

                      <YAxis
                        tick={{
                          fontFamily:
                            FONT_MONO,
                          fontSize: 10,
                          fill:
                            C.inkFaint,
                        }}
                        axisLine={
                          false
                        }
                        tickLine={
                          false
                        }
                      />

                      <Tooltip
                        formatter={(
                          value
                        ) => [
                          `${fmtNum(
                            value
                          )} ${
                            utility.unit
                          }`,
                          "Usage",
                        ]}
                        contentStyle={{
                          fontFamily:
                            FONT_HEAD,
                          fontSize: 12,
                          borderRadius: 12,
                          border: `1px solid ${C.border}`,
                        }}
                      />

                      <Bar
                        dataKey="usage"
                        fill={color}
                        radius={[
                          8,
                          8,
                          0,
                          0,
                        ]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card>
                <div
                  style={{
                    fontFamily:
                      FONT_HEAD,
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.inkSoft,
                    marginBottom: 6,
                  }}
                >
                  balance at end of
                  month ({currency})
                </div>

                <div
                  style={{
                    height: 160,
                  }}
                >
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >
                    <AreaChart
                      data={rows}
                      margin={{
                        left: -20,
                        right: 4,
                      }}
                    >
                      <CartesianGrid
                        stroke={
                          C.border
                        }
                        vertical={
                          false
                        }
                      />

                      <XAxis
                        dataKey="label"
                        tick={{
                          fontFamily:
                            FONT_MONO,
                          fontSize: 10,
                          fill:
                            C.inkFaint,
                        }}
                        axisLine={{
                          stroke:
                            C.border,
                        }}
                        tickLine={
                          false
                        }
                      />

                      <YAxis
                        tick={{
                          fontFamily:
                            FONT_MONO,
                          fontSize: 10,
                          fill:
                            C.inkFaint,
                        }}
                        axisLine={
                          false
                        }
                        tickLine={
                          false
                        }
                      />

                      <Tooltip
                        formatter={(
                          value
                        ) => [
                          fmtMoney(
                            value,
                            currency
                          ),
                          "Balance",
                        ]}
                        contentStyle={{
                          fontFamily:
                            FONT_HEAD,
                          fontSize: 12,
                          borderRadius: 12,
                          border: `1px solid ${C.border}`,
                        }}
                      />

                      <Area
                        type="monotone"
                        dataKey="balance"
                        stroke={
                          C.primary
                        }
                        fill={
                          C.primaryPale
                        }
                        strokeWidth={
                          2.5
                        }
                        dot={{
                          r: 3,
                          fill:
                            C.primary,
                        }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          );
        }
      )}

      {/* Roommate settlement */}

      <SectionTitle>
        Roommate contribution
      </SectionTitle>

      <Card>
        <div
          style={{
            fontFamily: FONT_HEAD,
            fontSize: 12,
            color: C.inkSoft,
            marginBottom: 14,
          }}
        >
          This compares each
          roommate's top-ups with an
          equal share of the utility
          consumption recorded in
          the tracker.
        </div>

        {fairness.map(
          (person) => (
            <div
              key={person.name}
              style={{
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "center",
                  marginBottom: 6,
                  gap: 10,
                }}
              >
                <span
                  style={{
                    fontFamily:
                      FONT_HEAD,
                    fontWeight: 600,
                    fontSize: 14,
                    color: C.ink,
                  }}
                >
                  {person.name}
                </span>

                <span
                  style={{
                    fontFamily:
                      FONT_MONO,
                    fontSize: 12,
                    fontWeight: 700,
                    color:
                      person.net >= 0
                        ? C.mint
                        : C.coral,
                    display:
                      "inline-flex",
                    alignItems:
                      "center",
                    gap: 4,
                  }}
                >
                  {person.net >=
                  0 ? (
                    <ArrowUpRight
                      size={13}
                    />
                  ) : (
                    <ArrowDownRight
                      size={13}
                    />
                  )}

                  {person.net >= 0
                    ? `overpaid ${fmtMoney(
                        person.net,
                        currency
                      )}`
                    : `underpaid ${fmtMoney(
                        Math.abs(
                          person.net
                        ),
                        currency
                      )}`}
                </span>
              </div>

              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background:
                    C.primaryPale,
                  overflow:
                    "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(
                      100,
                      (Math.abs(
                        person.net
                      ) /
                        (person.scale ||
                          1)) *
                        100
                    )}%`,
                    background:
                      person.net >= 0
                        ? C.mint
                        : C.coral,
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
          )
        )}
      </Card>

      {/* Tariff reference */}

      <div
        style={{
          marginTop: 24,
        }}
      >
        <SectionTitle>
          Current tariff reference
        </SectionTitle>

        {data.utilities.map(
          (utility) => (
            <Card
              key={utility.id}
              style={{
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontFamily:
                    FONT_HEAD,
                  fontWeight: 700,
                  fontSize: 14,
                  color: C.ink,
                  marginBottom: 10,
                }}
              >
                {utility.name}
              </div>

              {utility.tiers.map(
                (tier, index) => {
                  const previous =
                    index === 0
                      ? 0
                      : utility.tiers[
                          index - 1
                        ].upTo;

                  let label;

                  if (
                    tier.upTo ===
                    null
                  ) {
                    label = `>${
                      previous || 0
                    } ${utility.unit}`;
                  } else if (
                    index === 0
                  ) {
                    label = `≤${tier.upTo} ${utility.unit}`;
                  } else {
                    label = `${previous}–${tier.upTo} ${utility.unit}`;
                  }

                  return (
                    <div
                      key={index}
                      style={{
                        display:
                          "flex",
                        justifyContent:
                          "space-between",
                        gap: 12,
                        marginBottom: 6,
                        fontFamily:
                          FONT_MONO,
                        fontSize: 12,
                        color:
                          C.inkSoft,
                      }}
                    >
                      <span>
                        {label}
                      </span>

                      <strong
                        style={{
                          color:
                            C.primaryDeep,
                        }}
                      >
                        {currency}
                        {tier.rate} /{" "}
                        {utility.unit}
                      </strong>
                    </div>
                  );
                }
              )}
            </Card>
          )
        )}

        <div
          style={{
            fontFamily: FONT_HEAD,
            fontSize: 11,
            color: C.inkFaint,
            lineHeight: 1.5,
            padding: "4px 4px 0",
          }}
        >
          Tier thresholds are
          cumulative annual
          household usage. If you
          start using this tracker
          midway through the year,
          physical tier estimates
          may not perfectly match
          the utility provider until
          the next calendar year.
        </div>
      </div>
    </div>
  );
}
/* ================================
   SETTINGS
================================ */

const ghostAddStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: C.card,
  border: `1.5px dashed ${C.border}`,
  borderRadius: 14,
  padding: "10px 14px",
  fontFamily: FONT_HEAD,
  fontWeight: 600,
  fontSize: 13,
  color: C.inkSoft,
  cursor: "pointer",
  marginTop: 4,
};

function SettingsPanel({
  data,
  onChange,
}) {
  const [
    confirmReset,
    setConfirmReset,
  ] = useState(false);

  function updateRoommate(
    index,
    value
  ) {
    const next = [
      ...data.roommates,
    ];

    next[index] = value;

    onChange({
      ...data,
      roommates: next,
    });
  }

  function addRoommate() {
    onChange({
      ...data,
      roommates: [
        ...data.roommates,
        "New roommate",
      ],
    });
  }

  function removeRoommate(
    index
  ) {
    onChange({
      ...data,
      roommates:
        data.roommates.filter(
          (_, i) => i !== index
        ),
    });
  }

  function updateUtility(
    id,
    patch
  ) {
    onChange({
      ...data,
      utilities:
        data.utilities.map(
          (utility) =>
            utility.id === id
              ? {
                  ...utility,
                  ...patch,
                }
              : utility
        ),
    });
  }

  function updateTier(
    utilityId,
    tierIndex,
    patch
  ) {
    onChange({
      ...data,
      utilities:
        data.utilities.map(
          (utility) => {
            if (
              utility.id !==
              utilityId
            ) {
              return utility;
            }
            {(utility.id === "elec" ||
  utility.id === "water") && (
  <div
    style={{
      background: C.primaryPale,
      borderRadius: 16,
      padding: 14,
      marginBottom: 14,
    }}
  >
    <div
      style={{
        fontFamily: FONT_HEAD,
        fontWeight: 700,
        fontSize: 12,
        color: C.primaryDeep,
        marginBottom: 6,
      }}
    >
      Starting annual usage
    </div>

    <div
      style={{
        fontFamily: FONT_HEAD,
        fontSize: 11,
        color: C.inkSoft,
        marginBottom: 8,
        lineHeight: 1.5,
      }}
    >
      Enter the usage already consumed earlier in
      the same calendar year before you started
      using this tracker.
    </div>

    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      <input
        style={{
          ...inputStyle,
          flex: 1,
        }}
        type="number"
        min="0"
        step="0.1"
        value={
          utility.startingAnnualUsage ?? 0
        }
        onChange={(e) =>
          updateUtility(
            utility.id,
            {
              startingAnnualUsage:
                Number(
                  e.target.value || 0
                ),
            }
          )
        }
      />

      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12,
          color: C.inkSoft,
          minWidth: 42,
        }}
      >
        {utility.unit}
      </span>
    </div>
  </div>
)}

            return {
              ...utility,
              tiers:
                utility.tiers.map(
                  (
                    tier,
                    index
                  ) =>
                    index ===
                    tierIndex
                      ? {
                          ...tier,
                          ...patch,
                        }
                      : tier
                ),
            };
          }
        ),
    });
  }

  function addTier(
    utilityId
  ) {
    onChange({
      ...data,
      utilities:
        data.utilities.map(
          (utility) => {
            if (
              utility.id !==
              utilityId
            ) {
              return utility;
            }

            const tiers = [
              ...utility.tiers,
            ];

            const last =
              tiers[
                tiers.length - 1
              ];

            if (last) {
              last.upTo =
                last.upTo === null
                  ? 100
                  : last.upTo;
            }

            tiers.push({
              upTo: null,
              rate: last
                ? last.rate
                : 1,
            });

            return {
              ...utility,
              tiers,
            };
          }
        ),
    });
  }

  function removeTier(
    utilityId,
    tierIndex
  ) {
    onChange({
      ...data,
      utilities:
        data.utilities.map(
          (utility) => {
            if (
              utility.id !==
                utilityId ||
              utility.tiers
                .length <= 1
            ) {
              return utility;
            }

            const tiers =
              utility.tiers.filter(
                (_, index) =>
                  index !==
                  tierIndex
              );

            tiers[
              tiers.length - 1
            ] = {
              ...tiers[
                tiers.length - 1
              ],
              upTo: null,
            };

            return {
              ...utility,
              tiers,
            };
          }
        ),
    });
  }

  function addUtility() {
    onChange({
      ...data,
      utilities: [
        ...data.utilities,
        {
          id: uid(),
          name: "New utility",
          unit: "units",
          tiers: [
            {
              upTo: 100,
              rate: 1,
            },
            {
              upTo: null,
              rate: 1.5,
            },
          ],
        },
      ],
    });
  }

  function removeUtility(id) {
    onChange({
      ...data,
      utilities:
        data.utilities.filter(
          (utility) =>
            utility.id !== id
        ),
    });
  }

  return (
    <div
      style={{
        paddingTop: 18,
        paddingBottom: 24,
      }}
    >
      <SectionTitle>
        Currency symbol
      </SectionTitle>

      <input
        style={{
          ...inputStyle,
          width: 90,
          marginBottom: 24,
        }}
        value={data.currency}
        onChange={(e) =>
          onChange({
            ...data,
            currency:
              e.target.value,
          })
        }
      />

      <SectionTitle>
        Roommates
      </SectionTitle>

      {data.roommates.map(
        (roommate, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <input
              style={{
                ...inputStyle,
                fontFamily:
                  FONT_HEAD,
              }}
              value={roommate}
              onChange={(e) =>
                updateRoommate(
                  index,
                  e.target.value
                )
              }
            />

            <IconButton
              danger
              title="Remove roommate"
              onClick={() =>
                removeRoommate(
                  index
                )
              }
            >
              <X size={14} />
            </IconButton>
          </div>
        )
      )}

      <button
        onClick={addRoommate}
        style={ghostAddStyle}
      >
        <Plus size={13} />
        Add roommate
      </button>

      <div
        style={{
          marginTop: 28,
        }}
      >
        <SectionTitle>
          Utilities and tiered
          rates
        </SectionTitle>

        <div
          style={{
            fontFamily:
              FONT_HEAD,
            fontSize: 12,
            color: C.inkFaint,
            marginBottom: 14,
          }}
        >
          These tiers are
          cumulative per calendar
          year.
        </div>

        {data.utilities.map(
          (utility) => (
            <Card
              key={utility.id}
              style={{
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  display:
                    "flex",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <input
                  style={{
                    ...inputStyle,
                    fontFamily:
                      FONT_HEAD,
                    fontWeight: 700,
                  }}
                  value={
                    utility.name
                  }
                  onChange={(e) =>
                    updateUtility(
                      utility.id,
                      {
                        name:
                          e.target
                            .value,
                      }
                    )
                  }
                />

                <input
                  style={{
                    ...inputStyle,
                    width: 90,
                  }}
                  value={
                    utility.unit
                  }
                  onChange={(e) =>
                    updateUtility(
                      utility.id,
                      {
                        unit:
                          e.target
                            .value,
                      }
                    )
                  }
                  placeholder="unit"
                />

                <IconButton
                  danger
                  title="Remove utility"
                  onClick={() =>
                    removeUtility(
                      utility.id
                    )
                  }
                >
                  <Trash2
                    size={14}
                  />
                </IconButton>
              </div>

              <div
                style={{
                  fontFamily:
                    FONT_HEAD,
                  fontSize: 11,
                  color:
                    C.inkFaint,
                  marginBottom: 8,
                }}
              >
                Tier · up to ·
                rate per{" "}
                {utility.unit}
              </div>

              {utility.tiers.map(
                (
                  tier,
                  index
                ) => (
                  <div
                    key={index}
                    style={{
                      display:
                        "flex",
                      gap: 8,
                      alignItems:
                        "center",
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontFamily:
                          FONT_MONO,
                        fontSize: 12,
                        color:
                          C.inkFaint,
                        width: 14,
                      }}
                    >
                      {index + 1}
                    </span>

                    <input
                      style={{
                        ...inputStyle,
                        flex: 1,
                      }}
                      type="number"
                      min="0"
                      value={
                        tier.upTo ===
                          null ||
                        tier.upTo ===
                          undefined
                          ? ""
                          : tier.upTo
                      }
                      placeholder={
                        index ===
                        utility
                          .tiers
                          .length -
                          1
                          ? "and above"
                          : "up to"
                      }
                      disabled={
                        index ===
                        utility
                          .tiers
                          .length -
                          1
                      }
                      onChange={(e) =>
                        updateTier(
                          utility.id,
                          index,
                          {
                            upTo:
                              e
                                .target
                                .value ===
                              ""
                                ? null
                                : Number(
                                    e
                                      .target
                                      .value
                                  ),
                          }
                        )
                      }
                    />

                    <input
                      style={{
                        ...inputStyle,
                        flex: 1,
                      }}
                      type="number"
                      min="0"
                      step="0.0001"
                      value={
                        tier.rate
                      }
                      onChange={(e) =>
                        updateTier(
                          utility.id,
                          index,
                          {
                            rate: Number(
                              e
                                .target
                                .value
                            ),
                          }
                        )
                      }
                    />

                    <IconButton
                      danger
                      title="Remove tier"
                      onClick={() =>
                        removeTier(
                          utility.id,
                          index
                        )
                      }
                    >
                      <X size={13} />
                    </IconButton>
                  </div>
                )
              )}

              <button
                onClick={() =>
                  addTier(
                    utility.id
                  )
                }
                style={
                  ghostAddStyle
                }
              >
                <Plus size={13} />
                Add tier
              </button>
            </Card>
          )
        )}

        <button
          onClick={addUtility}
          style={ghostAddStyle}
        >
          <Plus size={13} />
          Add utility
        </button>
      </div>

      {/* Reset */}

      <div
        style={{
          marginTop: 28,
          paddingTop: 20,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        {!confirmReset ? (
          <button
            onClick={() =>
              setConfirmReset(
                true
              )
            }
            style={{
              ...ghostAddStyle,
              color: C.coral,
              borderColor:
                C.coralPale,
            }}
          >
            <Trash2 size={13} />
            Reset all data
          </button>
        ) : (
          <Card
            style={{
              background:
                C.coralPale,
              border: "none",
            }}
          >
            <div
              style={{
                fontFamily:
                  FONT_HEAD,
                fontSize: 13,
                fontWeight: 600,
                color: C.coral,
                marginBottom: 10,
              }}
            >
              This will delete all
              saved utility records,
              roommate names and
              settings on this
              device.
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => {
                  onChange(
                    defaultData()
                  );
                  setConfirmReset(
                    false
                  );
                }}
                style={{
                  ...ghostAddStyle,
                  color: C.white,
                  background:
                    C.coral,
                  borderColor:
                    C.coral,
                }}
              >
                Yes, reset everything
              </button>

              <button
                onClick={() =>
                  setConfirmReset(
                    false
                  )
                }
                style={
                  ghostAddStyle
                }
              >
                Cancel
              </button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ================================
   MAIN APP
================================ */

export default function App() {
  const [data, setData] =
    useState(() => loadData());

  const [tab, setTab] =
    useState("dashboard");

  const [notice, setNotice] =
    useState("");

  const persist =
    useCallback((next) => {
      setData(next);

      const ok =
        saveData(next);

      if (!ok) {
        setNotice(
          "Could not save your latest change."
        );
      } else {
        setNotice("");
      }
    }, []);

  const addLog =
    useCallback(
      (entry) => {
        persist({
          ...data,
          logs: [
            ...data.logs,
            entry,
          ],
        });
      },
      [data, persist]
    );

  const deleteLog =
    useCallback(
      (id) => {
        persist({
          ...data,
          logs:
            data.logs.filter(
              (log) =>
                log.id !== id
            ),
        });
      },
      [data, persist]
    );

  /* ================================
     DERIVED DATA
  ================================ */

  const derived =
    useMemo(() => {
      const currency =
        data.currency || "¥";

      const utilById =
        Object.fromEntries(
          data.utilities.map(
            (utility) => [
              utility.id,
              utility,
            ]
          )
        );

      const allMonths =
        Array.from(
          new Set(
            data.logs.map(
              (log) => log.month
            )
          )
        ).sort();

      const perUtility =
        data.utilities.map(
          (utility) => {
            const logs = [
              ...data.logs.filter(
                (log) =>
                  log.utilityId ===
                  utility.id
              ),
            ].sort((a, b) =>
              (a.date || "")
                .localeCompare(
                  b.date || ""
                )
            );

            const topupSum =
              logs.reduce(
                (sum, log) =>
                  sum +
                  Number(
                    log.topupAmount ||
                      0
                  ),
                0
              );

            const costSum =
              logs.reduce(
                (sum, log) =>
                  sum +
                  Number(
                    log.cost || 0
                  ),
                0
              );

            const last =
              logs[
                logs.length - 1
              ];

            const balance =
              last
                ? Number(
                    last.balanceAfter ||
                      0
                  )
                : 0;

            const lastDate =
              last
                ? last.date
                : null;

            const byMonth = {};

            logs.forEach(
              (log) => {
                byMonth[
                  log.month
                ] =
                  (byMonth[
                    log.month
                  ] || 0) +
                  Number(
                    log.cost || 0
                  );
              }
            );

            const monthKeys =
              Object.keys(
                byMonth
              ).sort();

            const last3 =
              monthKeys.slice(-3);

            const avgMonthlyCost =
              last3.length
                ? last3.reduce(
                    (
                      sum,
                      month
                    ) =>
                      sum +
                      byMonth[
                        month
                      ],
                    0
                  ) /
                  last3.length
                : 0;

            let status =
              "green";

            if (balance < 0) {
              status = "red";
            } else if (
              avgMonthlyCost >
                0 &&
              balance <
                avgMonthlyCost
            ) {
              status =
                "amber";
            }

            return {
              utility,
              topupSum,
              costSum,
              balance,
              lastDate,
              avgMonthlyCost,
              status,
            };
          }
        );

      const overallBalance =
        perUtility.reduce(
          (sum, row) =>
            sum + row.balance,
          0
        );

      const recent = [
        ...data.logs,
      ]
        .sort((a, b) =>
          (b.date || "")
            .localeCompare(
              a.date || ""
            )
        )
        .slice(0, 6)
        .map((log) => ({
          ...log,
          utilityName:
            utilById[
              log.utilityId
            ]
              ? utilById[
                  log.utilityId
                ].name
              : "Utility",
        }));

      const displayMonths =
        allMonths.slice(-6);

      const monthlyCost =
        displayMonths.map(
          (month) => ({
            label:
              monthLabel(month),

            cost:
              data.logs
                .filter(
                  (log) =>
                    log.month ===
                    month
                )
                .reduce(
                  (sum, log) =>
                    sum +
                    Number(
                      log.cost ||
                        0
                    ),
                  0
                ),

            topups:
              data.logs
                .filter(
                  (log) =>
                    log.month ===
                    month
                )
                .reduce(
                  (sum, log) =>
                    sum +
                    Number(
                      log.topupAmount ||
                        0
                    ),
                  0
                ),
          })
        );

      const monthlyByUtility =
        {};

      data.utilities.forEach(
        (utility) => {
          let lastBalance =
            null;

          const full =
            allMonths.map(
              (month) => {
                const monthLogs =
                  data.logs.filter(
                    (log) =>
                      log.utilityId ===
                        utility.id &&
                      log.month ===
                        month
                  );

                const cost =
                  monthLogs.reduce(
                    (
                      sum,
                      log
                    ) =>
                      sum +
                      Number(
                        log.cost ||
                          0
                      ),
                    0
                  );

                const topups =
                  monthLogs.reduce(
                    (
                      sum,
                      log
                    ) =>
                      sum +
                      Number(
                        log.topupAmount ||
                          0
                      ),
                    0
                  );

                const usage =
                  monthLogs.reduce(
                    (
                      sum,
                      log
                    ) =>
                      sum +
                      Number(
                        log.usage ||
                          0
                      ),
                    0
                  );

                if (
                  monthLogs.length
                ) {
                  const lastLog =
                    [
                      ...monthLogs,
                    ]
                      .sort(
                        (
                          a,
                          b
                        ) =>
                          (
                            a.date ||
                            ""
                          ).localeCompare(
                            b.date ||
                              ""
                          )
                      )
                      .slice(-1)[0];

                  lastBalance =
                    Number(
                      lastLog.balanceAfter ||
                        0
                    );
                }

                return {
                  label:
                    monthLabel(
                      month
                    ),
                  usage,
                  cost,
                  topups,
                  balance:
                    lastBalance,
                };
              }
            );

          monthlyByUtility[
            utility.id
          ] = full.slice(
            -MONTH_WINDOW
          );
        }
      );

      const totalCostAll =
        data.logs.reduce(
          (sum, log) =>
            sum +
            Number(
              log.cost || 0
            ),
          0
        );

      const fairShare =
        data.roommates.length
          ? totalCostAll /
            data.roommates.length
          : 0;

      const netValues =
        data.roommates.map(
          (roommate) => {
            const topped =
              data.logs
                .filter(
                  (log) =>
                    log.person ===
                    roommate
                )
                .reduce(
                  (
                    sum,
                    log
                  ) =>
                    sum +
                    Number(
                      log.topupAmount ||
                        0
                    ),
                  0
                );

            return {
              name: roommate,
              net:
                topped -
                fairShare,
            };
          }
        );

      const scale =
        Math.max(
          1,
          ...netValues.map(
            (person) =>
              Math.abs(
                person.net
              )
          )
        );

      const fairness =
        netValues.map(
          (person) => ({
            ...person,
            scale,
          })
        );

      const currentBalances =
        Object.fromEntries(
          perUtility.map(
            (row) => [
              row.utility.id,
              row.balance,
            ]
          )
        );

      return {
        currency,
        perUtility,
        overallBalance,
        recent,
        monthlyCost,
        monthlyByUtility,
        fairness,
        currentBalances,
      };
    }, [data]);

  /* ================================
     NAVIGATION
  ================================ */

  const navLeft = [
    {
      key: "dashboard",
      label: "Home",
      Icon: Home,
    },
    {
      key: "history",
      label: "History",
      Icon: ListTree,
    },
  ];

  const navRight = [
    {
      key: "insights",
      label: "Insights",
      Icon: BarChart2,
    },
    {
      key: "settings",
      label: "Settings",
      Icon: SettingsIcon,
    },
  ];

  function NavButton({
    item,
  }) {
    const active =
      tab === item.key;

    return (
      <button
        onClick={() =>
          setTab(item.key)
        }
        style={{
          border: "none",
          background: "none",
          cursor: "pointer",
          display: "flex",
          flexDirection:
            "column",
          alignItems:
            "center",
          gap: 3,
          padding:
            "6px 10px",
          color: active
            ? C.primaryDeep
            : C.inkFaint,
          flex: 1,
        }}
      >
        <div
          style={{
            background: active
              ? C.primaryPale
              : "transparent",
            borderRadius: 12,
            padding: 6,
            display: "flex",
          }}
        >
          <item.Icon
            size={19}
          />
        </div>

        <span
          style={{
            fontFamily:
              FONT_HEAD,
            fontWeight: 700,
            fontSize: 10,
          }}
        >
          {item.label}
        </span>
      </button>
    );
  }

  const utilById =
    Object.fromEntries(
      data.utilities.map(
        (utility) => [
          utility.id,
          utility,
        ]
      )
    );

  const historyLogs = [
    ...data.logs,
  ]
    .sort((a, b) =>
      (b.date || "")
        .localeCompare(
          a.date || ""
        )
    )
    .map((log) => ({
      ...log,

      utilityName:
        utilById[
          log.utilityId
        ]
          ? utilById[
              log.utilityId
            ].name
          : "Utility",

      unit:
        utilById[
          log.utilityId
        ]
          ? utilById[
              log.utilityId
            ].unit
          : "",
    }));

  /* ================================
     APP UI
  ================================ */

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        display: "flex",
        flexDirection:
          "column",
      }}
    >
      <div
        style={{
          maxWidth: 460,
          margin: "0 auto",
          width: "100%",
          padding: "0 16px",
          boxSizing:
            "border-box",
          flex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems:
              "center",
            padding:
              "18px 2px 0",
          }}
        >
          <div
            style={{
              fontFamily:
                FONT_HEAD,
              fontWeight: 700,
              fontSize: 19,
              color:
                C.primaryDeep,
            }}
          >
            Utility Balance
          </div>
        </div>

        {notice && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems:
                "center",
              color: C.coral,
              fontFamily:
                FONT_HEAD,
              fontWeight: 600,
              fontSize: 12,
              padding: "8px 0",
            }}
          >
            <AlertTriangle
              size={13}
            />
            {notice}
          </div>
        )}

        {tab ===
          "dashboard" && (
          <Dashboard
            data={data}
            perUtility={
              derived.perUtility
            }
            overallBalance={
              derived.overallBalance
            }
            recent={
              derived.recent
            }
            currency={
              derived.currency
            }
          />
        )}

        {tab === "add" && (
          <AddEntry
            data={data}
            currentBalances={
              derived.currentBalances
            }
            onSave={addLog}
          />
        )}

        {tab ===
          "history" && (
          <History
            data={data}
            logs={historyLogs}
            onDelete={
              deleteLog
            }
            currency={
              derived.currency
            }
          />
        )}

        {tab ===
          "insights" && (
          <Insights
            data={data}
            currency={
              derived.currency
            }
            monthlyCost={
              derived.monthlyCost
            }
            monthlyByUtility={
              derived.monthlyByUtility
            }
            fairness={
              derived.fairness
            }
          />
        )}

        {tab ===
          "settings" && (
          <SettingsPanel
            data={data}
            onChange={persist}
          />
        )}
      </div>

      {/* Bottom mobile navigation */}

      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: C.card,
          borderTopLeftRadius:
            26,
          borderTopRightRadius:
            26,
          boxShadow:
            "0 -4px 18px rgba(91,78,158,0.10)",
          padding:
            "8px 10px calc(8px + env(safe-area-inset-bottom))",
          marginTop: 20,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 460,
            margin: "0 auto",
            display: "flex",
            alignItems:
              "center",
            position:
              "relative",
          }}
        >
          {navLeft.map(
            (item) => (
              <NavButton
                key={item.key}
                item={item}
              />
            )
          )}

          <div
            style={{
              width: 64,
              display: "flex",
              justifyContent:
                "center",
            }}
          >
            <button
              onClick={() =>
                setTab("add")
              }
              title="Add monthly record"
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                border: `4px solid ${C.bg}`,
                background:
                  C.primary,
                color: C.white,
                display: "flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
                cursor: "pointer",
                marginTop: -26,
                boxShadow:
                  "0 4px 12px rgba(91,78,158,0.35)",
              }}
            >
              <Plus size={24} />
            </button>
          </div>

          {navRight.map(
            (item) => (
              <NavButton
                key={item.key}
                item={item}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}
