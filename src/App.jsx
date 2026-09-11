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

const STORAGE_KEY = "utility-tracker-v3";
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
   GENERAL HELPERS
================================ */

function uid() {
  return Math.random()
    .toString(36)
    .slice(2, 10);
}

function fmtMoney(
  n,
  currency = "¥"
) {
  const value =
    Number.isFinite(Number(n))
      ? Number(n)
      : 0;

  const sign =
    value < 0 ? "-" : "";

  return (
    sign +
    currency +
    Math.abs(value).toLocaleString(
      undefined,
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )
  );
}

function fmtNum(
  n,
  digits = 1
) {
  const value =
    Number.isFinite(Number(n))
      ? Number(n)
      : 0;

  return value.toLocaleString(
    undefined,
    {
      minimumFractionDigits: 0,
      maximumFractionDigits:
        digits,
    }
  );
}

function monthLabel(
  monthKey
) {
  if (!monthKey) return "";

  const [year, month] =
    monthKey
      .split("-")
      .map(Number);

  return new Date(
    year,
    month - 1,
    1
  ).toLocaleDateString(
    undefined,
    {
      month: "short",
      year: "2-digit",
    }
  );
}

function todayISO() {
  const date =
    new Date();

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/* ================================
   FORWARD TIER CALCULATION

   usage -> RMB cost
================================ */

function calcTierCost(
  usage,
  tiers,
  baseline = 0
) {
  let remaining =
    Number(usage) || 0;

  if (
    remaining <= 0 ||
    !tiers ||
    !tiers.length
  ) {
    return 0;
  }

  let cost = 0;
  let cursor =
    Number(baseline) || 0;

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

    const available =
      cap - cursor;

    const amount =
      Math.min(
        remaining,
        available
      );

    if (amount > 0) {
      cost +=
        amount * rate;

      cursor += amount;
      remaining -= amount;
    }

    if (remaining <= 1e-9) {
      break;
    }
  }

  return cost;
}

/* ================================
   TIER BREAKDOWN
================================ */

function tierBreakdown(
  usage,
  tiers,
  baseline = 0
) {
  let remaining =
    Number(usage) || 0;

  const rows = [];

  if (
    remaining <= 0 ||
    !tiers ||
    !tiers.length
  ) {
    return rows;
  }

  let cursor =
    Number(baseline) || 0;

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

    const available =
      cap - cursor;

    const amount =
      Math.min(
        remaining,
        available
      );

    if (amount > 0) {
      rows.push({
        amount,
        rate,
        cost:
          amount * rate,
      });
    }

    cursor += amount;
    remaining -= amount;

    if (remaining <= 1e-9) {
      break;
    }
  }

  return rows;
}

/* ================================
   REVERSE TIER CALCULATION

   RMB cost -> estimated usage

   Used automatically for:
   - Electricity
   - Water
================================ */

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

  let cursor =
    Number(baseline) || 0;

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

    cursor +=
      availableUsage;
  }

  return usage;
}

/* ================================
   DEFAULT DATA
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

        autoUsage: true,

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

        autoUsage: true,

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

        autoUsage: false,

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
    ],

    logs: [],
  };
}

/* ================================
   DATA MIGRATION
================================ */

function normalizeData(
  parsed
) {
  const base =
    defaultData();

  const utilities =
    Array.isArray(
      parsed?.utilities
    )
      ? parsed.utilities.map(
          (utility) => {
            const fallback =
              base.utilities.find(
                (u) =>
                  u.id ===
                  utility.id
              );

            return {
              ...fallback,
              ...utility,

              autoUsage:
                utility.autoUsage ??
                fallback?.autoUsage ??
                false,

              startingAnnualUsage:
                Number(
                  utility.startingAnnualUsage ??
                    fallback?.startingAnnualUsage ??
                    0
                ),

              tiers:
                Array.isArray(
                  utility.tiers
                )
                  ? utility.tiers
                  : fallback?.tiers ||
                    [],
            };
          }
        )
      : base.utilities;

  return {
    ...base,
    ...parsed,

    currency:
      parsed?.currency ||
      base.currency,

    roommates:
      Array.isArray(
        parsed?.roommates
      )
        ? parsed.roommates
        : base.roommates,

    utilities,

    logs:
      Array.isArray(
        parsed?.logs
      )
        ? parsed.logs
        : [],
  };
}

/* ================================
   LOCAL STORAGE
================================ */

function loadData() {
  try {
    const saved =
      localStorage.getItem(
        STORAGE_KEY
      );

    if (!saved) {
      return defaultData();
    }

    const parsed =
      JSON.parse(saved);

    return normalizeData(
      parsed
    );
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

function utilityIcon(
  name = ""
) {
  const lower =
    name.toLowerCase();

  if (
    lower.includes("elec") ||
    lower.includes("power")
  ) {
    return Zap;
  }

  if (
    lower.includes("water")
  ) {
    return Droplet;
  }

  if (
    lower.includes("gas")
  ) {
    return Gauge;
  }

  return Gauge;
}
/* ================================
   SHARED UI COMPONENTS
================================ */

function Field({
  label,
  children,
  hint,
}) {
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
            fontSize: 11,
            color: C.inkFaint,
            marginTop: 5,
            lineHeight: 1.5,
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

const ghostAddStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
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
};

function IconButton({
  onClick,
  children,
  title,
  danger = false,
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      type="button"
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
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  onClick,
  children,
  disabled = false,
  full = false,
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      type="button"
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

function Card({
  children,
  style,
}) {
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

function EmptyState({
  text,
}) {
  return (
    <div
      style={{
        fontFamily: FONT_HEAD,
        fontWeight: 600,
        fontSize: 13,
        color: C.inkFaint,
        padding: 18,
        background:
          C.primaryPale,
        borderRadius: 18,
        margin: "10px 0",
        textAlign: "center",
        lineHeight: 1.5,
      }}
    >
      {text}
    </div>
  );
}

function SectionTitle({
  children,
}) {
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

function MiniStat({
  label,
  value,
  tone = "default",
}) {
  let background =
    C.cardTint;

  let color =
    C.ink;

  if (tone === "mint") {
    background =
      C.mintPale;
    color =
      C.mint;
  }

  if (tone === "coral") {
    background =
      C.coralPale;
    color =
      C.coral;
  }

  if (tone === "amber") {
    background =
      C.amberPale;
    color =
      C.amber;
  }

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: "11px 12px",
        borderRadius: 15,
        background,
      }}
    >
      <div
        style={{
          fontFamily: FONT_HEAD,
          fontSize: 10,
          fontWeight: 700,
          color: C.inkFaint,
          marginBottom: 4,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 13,
          fontWeight: 700,
          color,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* ================================
   METER CARD
================================ */

function MeterCard({
  utility,
  totals,
  currency,
}) {
  const Icon =
    utilityIcon(
      utility.name
    );

  const status =
    totals.status;

  const tone =
    status === "red"
      ? {
          text: C.coral,
          bg: C.coralPale,
          label:
            "balance owing",
        }
      : status === "amber"
      ? {
          text: C.amber,
          bg: C.amberPale,
          label:
            "running low",
        }
      : {
          text: C.mint,
          bg: C.mintPale,
          label:
            "balance ok",
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
          alignItems:
            "flex-start",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems:
              "center",
            minWidth: 0,
          }}
        >
          <div
            style={{
              background:
                C.white,
              borderRadius: 14,
              padding: 9,
              display: "flex",
              flexShrink: 0,
            }}
          >
            <Icon
              size={18}
              color={
                tone.text
              }
            />
          </div>

          <div
            style={{
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontFamily:
                  FONT_HEAD,
                fontWeight: 700,
                fontSize: 15,
                color: C.ink,
              }}
            >
              {utility.name}
            </div>

            <div
              style={{
                fontFamily:
                  FONT_MONO,
                fontSize: 10,
                color:
                  C.inkSoft,
                marginTop: 2,
              }}
            >
              {totals.lastDate
                ? `updated ${totals.lastDate}`
                : "no records yet"}
            </div>
          </div>
        </div>

        <div
          style={{
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontFamily:
                FONT_MONO,
              fontWeight: 700,
              fontSize: 20,
              color:
                tone.text,
            }}
          >
            {fmtMoney(
              totals.balance,
              currency
            )}
          </div>

          <div
            style={{
              fontFamily:
                FONT_HEAD,
              fontSize: 10,
              fontWeight: 700,
              color:
                tone.text,
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
          gap: 8,
          marginTop: 14,
        }}
      >
        <MiniStat
          label="TOPPED UP"
          value={fmtMoney(
            totals.topupSum,
            currency
          )}
          tone="mint"
        />

        <MiniStat
          label="CONSUMED"
          value={fmtMoney(
            totals.costSum,
            currency
          )}
          tone="coral"
        />
      </div>

      {totals.usageSum > 0 && (
        <div
          style={{
            marginTop: 9,
            fontFamily:
              FONT_MONO,
            fontSize: 11,
            color:
              C.inkSoft,
          }}
        >
          Tracked usage:{" "}
          <strong>
            {fmtNum(
              totals.usageSum,
              1
            )}{" "}
            {utility.unit}
          </strong>
        </div>
      )}
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
          combined prepaid balance
        </div>

        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 38,
            fontWeight: 700,
            lineHeight: 1.15,
            marginTop: 2,
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
            opacity: 0.82,
            marginTop: 6,
            lineHeight: 1.4,
          }}
        >
          Electricity, water and gas
          balances in one place.
        </div>
      </div>

      <SectionTitle>
        Utilities
      </SectionTitle>

      {perUtility.length === 0 && (
        <EmptyState text="No utilities are set up yet. You can add them in Settings." />
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
          marginTop: 24,
        }}
      >
        <SectionTitle>
          Recent activity
        </SectionTitle>

        {recent.length === 0 && (
          <EmptyState text="No records yet. Tap the + button to enter your first prepaid balance." />
        )}

        {recent.map((log) => {
          const Icon =
            utilityIcon(
              log.utilityName
            );

          return (
            <Card
              key={log.id}
              style={{
                marginBottom: 10,
                padding: 15,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "flex-start",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      background:
                        C.primaryPale,
                      display: "flex",
                      alignItems:
                        "center",
                      justifyContent:
                        "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon
                      size={17}
                      color={
                        C.primaryDeep
                      }
                    />
                  </div>

                  <div
                    style={{
                      minWidth: 0,
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
                      {
                        log.utilityName
                      }
                    </div>

                    <div
                      style={{
                        fontFamily:
                          FONT_MONO,
                        fontSize: 10,
                        color:
                          C.inkFaint,
                        marginTop: 2,
                      }}
                    >
                      {log.date}
                    </div>
                  </div>
                </div>

                {log.topupAmount >
                  0 && (
                  <div
                    style={{
                      fontFamily:
                        FONT_MONO,
                      fontWeight: 700,
                      fontSize: 12,
                      color: C.mint,
                      flexShrink: 0,
                    }}
                  >
                    +
                    {fmtMoney(
                      log.topupAmount,
                      currency
                    )}
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  gap: 8,
                }}
              >
                <MiniStat
                  label="BEFORE"
                  value={fmtMoney(
                    log.currentBalance,
                    currency
                  )}
                />

                <MiniStat
                  label="AFTER"
                  value={fmtMoney(
                    log.balanceAfter,
                    currency
                  )}
                  tone="mint"
                />
              </div>

              {log.cost > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems:
                      "center",
                    gap: 10,
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: `1px solid ${C.border}`,
                  }}
                >
                  <div
                    style={{
                      fontFamily:
                        FONT_HEAD,
                      fontSize: 11,
                      fontWeight: 600,
                      color:
                        C.inkSoft,
                    }}
                  >
                    Since previous
                    checkpoint
                  </div>

                  <div
                    style={{
                      textAlign:
                        "right",
                    }}
                  >
                    <div
                      style={{
                        fontFamily:
                          FONT_MONO,
                        fontWeight: 700,
                        fontSize: 12,
                        color:
                          C.coral,
                      }}
                    >
                      {fmtMoney(
                        log.cost,
                        currency
                      )}
                    </div>

                    {log.usage !=
                      null && (
                      <div
                        style={{
                          fontFamily:
                            FONT_MONO,
                          fontSize: 10,
                          color:
                            C.inkSoft,
                          marginTop: 2,
                        }}
                      >
                        {log.usageSource ===
                        "estimated"
                          ? "~"
                          : ""}
                        {fmtNum(
                          log.usage,
                          1
                        )}{" "}
                        {log.unit}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {log.note && (
                <div
                  style={{
                    marginTop: 10,
                    fontFamily:
                      FONT_HEAD,
                    fontSize: 11,
                    lineHeight: 1.5,
                    color:
                      C.inkFaint,
                  }}
                >
                  {log.note}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card
        style={{
          marginTop: 22,
          background:
            C.cardTint,
        }}
      >
        <div
          style={{
            fontFamily: FONT_HEAD,
            fontWeight: 700,
            fontSize: 12,
            color: C.primaryDeep,
            marginBottom: 5,
          }}
        >
          How physical usage works
        </div>

        <div
          style={{
            fontFamily: FONT_HEAD,
            fontSize: 11,
            lineHeight: 1.55,
            color: C.inkSoft,
          }}
        >
          Electricity and water usage
          are estimated automatically
          from the RMB consumed and
          your annual tariff tier.
          Gas usage is entered manually
          from the meter.
        </div>
      </Card>
    </div>
  );
}
/* ================================
   ADD ENTRY
================================ */

function AddEntry({
  data,
  onSave,
  onClose,
}) {
  const [utilityId, setUtilityId] =
    useState(
      data.utilities[0]?.id || ""
    );

  const [date, setDate] =
    useState(todayISO());

  const [currentBalance, setCurrentBalance] =
    useState("");

  const [topupAmount, setTopupAmount] =
    useState("");

  const [usage, setUsage] =
    useState("");

  const [person, setPerson] =
    useState(
      data.roommates[0] || "You"
    );

  const [note, setNote] =
    useState("");

  const utility =
    data.utilities.find(
      (u) => u.id === utilityId
    );

  const utilityLogs =
    useMemo(() => {
      return data.logs
        .filter(
          (log) =>
            log.utilityId === utilityId
        )
        .sort(
          (a, b) =>
            new Date(a.date) -
            new Date(b.date)
        );
    }, [
      data.logs,
      utilityId,
    ]);

  const previousLog =
    utilityLogs.length > 0
      ? utilityLogs[
          utilityLogs.length - 1
        ]
      : null;

  const expectedPreviousBalance =
    previousLog
      ? Number(
          previousLog.balanceAfter || 0
        )
      : null;

  const cb =
    Number(
      currentBalance || 0
    );

  const top =
    Number(
      topupAmount || 0
    );

  const balanceAfter =
    cb + top;

  const hasPreviousLog =
    previousLog !== null;

  const rawDifference =
    hasPreviousLog
      ? expectedPreviousBalance - cb
      : 0;

  const impliedCost =
    hasPreviousLog
      ? Math.max(
          0,
          rawDifference
        )
      : 0;

  const isAutoUsage =
    utility?.autoUsage === true;

  /* ================================
     YEAR BASELINE
  ================================ */

  const yearBaseline =
    useMemo(() => {
      if (!utility) {
        return 0;
      }

      const year =
        (date || "").slice(
          0,
          4
        );

      const currentYear =
        String(
          new Date().getFullYear()
        );

      const startingUsage =
        year === currentYear
          ? Number(
              utility.startingAnnualUsage ||
                0
            )
          : 0;

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
              Number(
                log.usage || 0
              ),
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
     AUTO USAGE

     Electricity + water:
     RMB consumed -> physical usage
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

  const effectiveUsage =
    isAutoUsage
      ? calculatedUsage
      : usage === ""
      ? null
      : Number(usage);

  const tierEstimate =
    utility &&
    effectiveUsage != null &&
    effectiveUsage > 0
      ? calcTierCost(
          effectiveUsage,
          utility.tiers,
          yearBaseline
        )
      : 0;

  const tierRows =
    utility &&
    effectiveUsage != null &&
    effectiveUsage > 0
      ? tierBreakdown(
          effectiveUsage,
          utility.tiers,
          yearBaseline
        )
      : [];

  /* ================================
     SAVE
  ================================ */

  function handleSave() {
    if (!utility) {
      return;
    }

    if (
      currentBalance === "" ||
      Number.isNaN(cb) ||
      cb < 0
    ) {
      return;
    }

    if (
      topupAmount !== "" &&
      (
        Number.isNaN(top) ||
        top < 0
      )
    ) {
      return;
    }

    if (
      !isAutoUsage &&
      usage !== "" &&
      (
        Number.isNaN(
          Number(usage)
        ) ||
        Number(usage) < 0
      )
    ) {
      return;
    }

    const record = {
      id: uid(),

      utilityId:
        utility.id,

      utilityName:
        utility.name,

      unit:
        utility.unit,

      date,

      month:
        date.slice(0, 7),

      currentBalance:
        cb,

      topupAmount:
        top,

      balanceAfter,

      cost:
        impliedCost,

      usage:
        effectiveUsage,

      usageSource:
        isAutoUsage
          ? "estimated"
          : effectiveUsage != null
          ? "meter"
          : null,

      person:
        top > 0
          ? person
          : null,

      note:
        note.trim(),

      previousCheckpointDate:
        previousLog?.date ||
        null,

      previousBalanceAfter:
        hasPreviousLog
          ? expectedPreviousBalance
          : null,
    };

    onSave(record);

    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background:
          "rgba(58,53,80,0.24)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent:
          "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          maxHeight: "92vh",
          overflowY: "auto",
          background: C.bg,
          borderRadius:
            "28px 28px 0 0",
          padding:
            "18px 18px 28px",
          boxShadow:
            "0 -10px 40px rgba(58,53,80,0.16)",
        }}
      >
        {/* HEADER */}

        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems:
              "center",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div>
            <div
              style={{
                fontFamily:
                  FONT_HEAD,
                fontWeight: 700,
                fontSize: 20,
                color: C.ink,
              }}
            >
              Add checkpoint
            </div>

            <div
              style={{
                fontFamily:
                  FONT_HEAD,
                fontSize: 11,
                color:
                  C.inkFaint,
                marginTop: 2,
              }}
            >
              Record today's
              prepaid balance
            </div>
          </div>

          <IconButton
            onClick={onClose}
            title="Close"
          >
            <X size={18} />
          </IconButton>
        </div>

        {/* UTILITY */}

        <Field label="Utility">
          <select
            style={selectStyle}
            value={utilityId}
            onChange={(e) => {
              setUtilityId(
                e.target.value
              );

              setCurrentBalance(
                ""
              );

              setTopupAmount(
                ""
              );

              setUsage("");
            }}
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

        {/* DATE */}

        <Field label="Date">
          <input
            style={inputStyle}
            type="date"
            value={date}
            onChange={(e) =>
              setDate(
                e.target.value
              )
            }
          />
        </Field>

        {/* PREVIOUS CHECKPOINT */}

        {previousLog ? (
          <Card
            style={{
              padding: 14,
              marginBottom: 16,
              background:
                C.primaryPale,
              border: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                gap: 12,
                alignItems:
                  "center",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily:
                      FONT_HEAD,
                    fontWeight: 700,
                    fontSize: 11,
                    color:
                      C.primaryDeep,
                  }}
                >
                  Previous
                  balance after top-up
                </div>

                <div
                  style={{
                    fontFamily:
                      FONT_HEAD,
                    fontSize: 10,
                    color:
                      C.inkSoft,
                    marginTop: 2,
                  }}
                >
                  {
                    previousLog.date
                  }
                </div>
              </div>

              <div
                style={{
                  fontFamily:
                    FONT_MONO,
                  fontWeight: 700,
                  fontSize: 16,
                  color:
                    C.primaryDeep,
                }}
              >
                {fmtMoney(
                  expectedPreviousBalance,
                  data.currency
                )}
              </div>
            </div>
          </Card>
        ) : (
          <Card
            style={{
              padding: 14,
              marginBottom: 16,
              background:
                C.amberPale,
              border: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 9,
                alignItems:
                  "flex-start",
              }}
            >
              <AlertTriangle
                size={16}
                color={C.amber}
                style={{
                  flexShrink: 0,
                  marginTop: 1,
                }}
              />

              <div
                style={{
                  fontFamily:
                    FONT_HEAD,
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: C.inkSoft,
                }}
              >
                This is the first
                checkpoint for{" "}
                <strong>
                  {utility?.name}
                </strong>
                . No consumption
                will be calculated
                yet. The next
                checkpoint will
                calculate usage
                since this one.
              </div>
            </div>
          </Card>
        )}

        {/* CURRENT BALANCE */}

        <Field
          label="Current balance"
          hint="Enter the prepaid balance shown before topping up."
        >
          <input
            style={inputStyle}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={
              currentBalance
            }
            onChange={(e) =>
              setCurrentBalance(
                e.target.value
              )
            }
            placeholder="e.g. 120"
          />
        </Field>

        {/* TOP UP */}

        <Field
          label="Top-up amount"
          hint="Enter 0 if you only want to record the balance."
        >
          <input
            style={inputStyle}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={
              topupAmount
            }
            onChange={(e) =>
              setTopupAmount(
                e.target.value
              )
            }
            placeholder="e.g. 300"
          />
        </Field>

        {/* WHO PAID */}

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

        {/* BALANCE WARNING */}

        {hasPreviousLog &&
          currentBalance !== "" &&
          rawDifference <
            -0.01 && (
            <div
              style={{
                display: "flex",
                gap: 9,
                padding: 13,
                borderRadius: 16,
                background:
                  C.amberPale,
                marginBottom: 16,
              }}
            >
              <AlertTriangle
                size={17}
                color={C.amber}
                style={{
                  flexShrink: 0,
                }}
              />

              <div
                style={{
                  fontFamily:
                    FONT_HEAD,
                  fontSize: 11,
                  lineHeight: 1.5,
                  color:
                    C.inkSoft,
                }}
              >
                The current balance
                is higher than the
                previous recorded
                balance after top-up.
                This usually means
                there was an
                unrecorded top-up.
                Consumption cannot
                be calculated
                accurately for this
                checkpoint.
              </div>
            </div>
          )}

        {/* CALCULATION SUMMARY */}

        <Card
          style={{
            marginBottom: 18,
            background:
              C.cardTint,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
            }}
          >
            <MiniStat
              label="CONSUMED"
              value={
                hasPreviousLog &&
                rawDifference >=
                  0
                  ? fmtMoney(
                      impliedCost,
                      data.currency
                    )
                  : "—"
              }
              tone="coral"
            />

            <MiniStat
              label="AFTER TOP-UP"
              value={fmtMoney(
                balanceAfter,
                data.currency
              )}
              tone="mint"
            />
          </div>
        </Card>

        {/* AUTO ELECTRICITY / WATER */}

        {isAutoUsage ? (
          <div
            style={{
              background:
                C.mintPale,
              borderRadius: 20,
              padding: 16,
              marginBottom: 18,
            }}
          >
            <div
              style={{
                fontFamily:
                  FONT_HEAD,
                fontSize: 11,
                fontWeight: 700,
                color: C.mint,
                marginBottom: 5,
              }}
            >
              Estimated physical
              usage
            </div>

            <div
              style={{
                fontFamily:
                  FONT_MONO,
                fontWeight: 700,
                fontSize: 24,
                color: C.ink,
              }}
            >
              {calculatedUsage !=
              null
                ? `${fmtNum(
                    calculatedUsage,
                    2
                  )} ${
                    utility.unit
                  }`
                : `— ${
                    utility?.unit ||
                    ""
                  }`}
            </div>

            <div
              style={{
                fontFamily:
                  FONT_HEAD,
                fontSize: 11,
                color:
                  C.inkSoft,
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              Calculated from RMB
              consumed using your
              annual tier position.
            </div>

            {yearBaseline > 0 && (
              <div
                style={{
                  marginTop: 9,
                  paddingTop: 9,
                  borderTop:
                    "1px solid rgba(95,174,136,0.25)",
                  fontFamily:
                    FONT_MONO,
                  fontSize: 10,
                  color:
                    C.inkSoft,
                }}
              >
                Annual usage before
                this checkpoint:{" "}
                {fmtNum(
                  yearBaseline,
                  2
                )}{" "}
                {utility.unit}
              </div>
            )}
          </div>
        ) : (
          /* GAS MANUAL USAGE */

          <Field
            label={`Gas usage (${utility?.unit || "m³"})`}
            hint="Optional. Enter the actual usage from the gas meter."
          >
            <input
              style={inputStyle}
              type="number"
              inputMode="decimal"
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

        {/* TIER BREAKDOWN */}

        {effectiveUsage != null &&
          effectiveUsage > 0 &&
          tierRows.length >
            0 && (
            <Card
              style={{
                marginBottom: 18,
                padding: 15,
              }}
            >
              <div
                style={{
                  fontFamily:
                    FONT_HEAD,
                  fontWeight: 700,
                  fontSize: 12,
                  color: C.ink,
                  marginBottom: 10,
                }}
              >
                Tier calculation
              </div>

              {tierRows.map(
                (
                  row,
                  index
                ) => (
                  <div
                    key={index}
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      gap: 12,
                      marginBottom:
                        7,
                      fontFamily:
                        FONT_MONO,
                      fontSize: 10,
                      color:
                        C.inkSoft,
                    }}
                  >
                    <span>
                      {fmtNum(
                        row.amount,
                        2
                      )}{" "}
                      {
                        utility.unit
                      }{" "}
                      ×{" "}
                      {fmtMoney(
                        row.rate,
                        data.currency
                      )}
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
                  borderTop: `1px solid ${C.border}`,
                  paddingTop: 9,
                  marginTop: 7,
                  display: "flex",
                  justifyContent:
                    "space-between",
                  fontFamily:
                    FONT_MONO,
                  fontWeight: 700,
                  fontSize: 11,
                  color: C.ink,
                }}
              >
                <span>
                  Tier cost
                </span>

                <span>
                  {fmtMoney(
                    tierEstimate,
                    data.currency
                  )}
                </span>
              </div>
            </Card>
          )}

        {/* NOTE */}

        <Field
          label="Note"
          hint="Optional."
        >
          <input
            style={{
              ...inputStyle,
              fontFamily:
                FONT_HEAD,
            }}
            type="text"
            value={note}
            onChange={(e) =>
              setNote(
                e.target.value
              )
            }
            placeholder="e.g. monthly top-up"
          />
        </Field>

        {/* SAVE */}

        <PrimaryButton
          full
          onClick={
            handleSave
          }
          disabled={
            !utility ||
            !date ||
            currentBalance === ""
          }
        >
          Save checkpoint
        </PrimaryButton>
      </div>
    </div>
  );
}
/* ================================
   HISTORY
================================ */

function History({
  data,
  onDelete,
}) {
  const [utilityFilter, setUtilityFilter] =
    useState("all");

  const [monthFilter, setMonthFilter] =
    useState("all");

  const months =
    useMemo(() => {
      const unique =
        Array.from(
          new Set(
            data.logs
              .map(
                (log) =>
                  log.month ||
                  (log.date || "").slice(
                    0,
                    7
                  )
              )
              .filter(Boolean)
          )
        );

      return unique.sort().reverse();
    }, [data.logs]);

  const filteredLogs =
    useMemo(() => {
      return [...data.logs]
        .filter((log) => {
          const matchesUtility =
            utilityFilter === "all" ||
            log.utilityId === utilityFilter;

          const logMonth =
            log.month ||
            (log.date || "").slice(
              0,
              7
            );

          const matchesMonth =
            monthFilter === "all" ||
            logMonth === monthFilter;

          return (
            matchesUtility &&
            matchesMonth
          );
        })
        .sort(
          (a, b) =>
            new Date(b.date) -
            new Date(a.date)
        );
    }, [
      data.logs,
      utilityFilter,
      monthFilter,
    ]);

  return (
    <div>
      <div
        style={{
          margin:
            "18px 0 18px",
        }}
      >
        <div
          style={{
            fontFamily: FONT_HEAD,
            fontSize: 24,
            fontWeight: 700,
            color: C.ink,
          }}
        >
          History
        </div>

        <div
          style={{
            fontFamily: FONT_HEAD,
            fontSize: 12,
            color: C.inkSoft,
            marginTop: 3,
          }}
        >
          Review every prepaid
          checkpoint.
        </div>
      </div>

      {/* FILTERS */}

      <Card
        style={{
          marginBottom: 16,
          padding: 14,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: 10,
          }}
        >
          <div>
            <div
              style={{
                fontFamily:
                  FONT_HEAD,
                fontWeight: 700,
                fontSize: 10,
                color:
                  C.inkFaint,
                marginBottom: 5,
              }}
            >
              UTILITY
            </div>

            <select
              style={{
                ...selectStyle,
                minHeight: 44,
                padding:
                  "10px 11px",
                fontSize: 12,
              }}
              value={
                utilityFilter
              }
              onChange={(e) =>
                setUtilityFilter(
                  e.target.value
                )
              }
            >
              <option value="all">
                All utilities
              </option>

              {data.utilities.map(
                (utility) => (
                  <option
                    key={
                      utility.id
                    }
                    value={
                      utility.id
                    }
                  >
                    {
                      utility.name
                    }
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <div
              style={{
                fontFamily:
                  FONT_HEAD,
                fontWeight: 700,
                fontSize: 10,
                color:
                  C.inkFaint,
                marginBottom: 5,
              }}
            >
              MONTH
            </div>

            <select
              style={{
                ...selectStyle,
                minHeight: 44,
                padding:
                  "10px 11px",
                fontSize: 12,
              }}
              value={monthFilter}
              onChange={(e) =>
                setMonthFilter(
                  e.target.value
                )
              }
            >
              <option value="all">
                All months
              </option>

              {months.map(
                (month) => (
                  <option
                    key={month}
                    value={month}
                  >
                    {monthLabel(
                      month
                    )}
                  </option>
                )
              )}
            </select>
          </div>
        </div>
      </Card>

      {/* EMPTY */}

      {filteredLogs.length ===
        0 && (
        <EmptyState text="No matching checkpoints yet." />
      )}

      {/* LOG CARDS */}

      {filteredLogs.map(
        (log) => {
          const utility =
            data.utilities.find(
              (u) =>
                u.id ===
                log.utilityId
            );

          const Icon =
            utilityIcon(
              log.utilityName ||
                utility?.name
            );

          const isEstimated =
            log.usageSource ===
            "estimated";

          return (
            <Card
              key={log.id}
              style={{
                marginBottom: 12,
                padding: 16,
              }}
            >
              {/* HEADER */}

              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  gap: 12,
                  alignItems:
                    "flex-start",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems:
                      "center",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 13,
                      background:
                        C.primaryPale,
                      display: "flex",
                      justifyContent:
                        "center",
                      alignItems:
                        "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon
                      size={18}
                      color={
                        C.primaryDeep
                      }
                    />
                  </div>

                  <div
                    style={{
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontFamily:
                          FONT_HEAD,
                        fontWeight: 700,
                        fontSize: 14,
                        color: C.ink,
                      }}
                    >
                      {log.utilityName ||
                        utility?.name ||
                        "Utility"}
                    </div>

                    <div
                      style={{
                        fontFamily:
                          FONT_MONO,
                        fontSize: 10,
                        color:
                          C.inkFaint,
                        marginTop: 2,
                      }}
                    >
                      {log.date}
                    </div>
                  </div>
                </div>

                <IconButton
                  danger
                  onClick={() =>
                    onDelete(
                      log.id
                    )
                  }
                  title="Delete checkpoint"
                >
                  <Trash2
                    size={16}
                  />
                </IconButton>
              </div>

              {/* BALANCE */}

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 14,
                }}
              >
                <MiniStat
                  label="BALANCE BEFORE"
                  value={fmtMoney(
                    log.currentBalance,
                    data.currency
                  )}
                />

                <MiniStat
                  label="TOP-UP"
                  value={fmtMoney(
                    log.topupAmount,
                    data.currency
                  )}
                  tone="mint"
                />
              </div>

              <div
                style={{
                  marginTop: 8,
                }}
              >
                <MiniStat
                  label="BALANCE AFTER"
                  value={fmtMoney(
                    log.balanceAfter,
                    data.currency
                  )}
                  tone="mint"
                />
              </div>

              {/* CONSUMPTION */}

              <div
                style={{
                  marginTop: 14,
                  paddingTop: 13,
                  borderTop: `1px solid ${C.border}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems:
                      "flex-start",
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily:
                          FONT_HEAD,
                        fontWeight: 700,
                        fontSize: 11,
                        color:
                          C.inkSoft,
                      }}
                    >
                      Consumption
                    </div>

                    {log.previousCheckpointDate && (
                      <div
                        style={{
                          fontFamily:
                            FONT_MONO,
                          fontSize: 9,
                          color:
                            C.inkFaint,
                          marginTop: 3,
                        }}
                      >
                        {
                          log.previousCheckpointDate
                        }{" "}
                        → {log.date}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      textAlign:
                        "right",
                    }}
                  >
                    <div
                      style={{
                        fontFamily:
                          FONT_MONO,
                        fontSize: 15,
                        fontWeight: 700,
                        color:
                          log.cost > 0
                            ? C.coral
                            : C.inkFaint,
                      }}
                    >
                      {log.cost > 0
                        ? fmtMoney(
                            log.cost,
                            data.currency
                          )
                        : "—"}
                    </div>

                    {log.usage !=
                      null && (
                      <div
                        style={{
                          fontFamily:
                            FONT_MONO,
                          fontSize: 11,
                          color:
                            C.inkSoft,
                          marginTop: 3,
                        }}
                      >
                        {isEstimated
                          ? "~"
                          : ""}
                        {fmtNum(
                          log.usage,
                          2
                        )}{" "}
                        {log.unit ||
                          utility?.unit}
                      </div>
                    )}
                  </div>
                </div>

                {isEstimated &&
                  log.usage !=
                    null && (
                    <div
                      style={{
                        display:
                          "inline-block",
                        marginTop: 8,
                        padding:
                          "5px 8px",
                        borderRadius: 10,
                        background:
                          C.mintPale,
                        fontFamily:
                          FONT_HEAD,
                        fontWeight: 700,
                        fontSize: 9,
                        color:
                          C.mint,
                      }}
                    >
                      ESTIMATED FROM
                      RMB
                    </div>
                  )}

                {log.usageSource ===
                  "meter" &&
                  log.usage !=
                    null && (
                    <div
                      style={{
                        display:
                          "inline-block",
                        marginTop: 8,
                        padding:
                          "5px 8px",
                        borderRadius: 10,
                        background:
                          C.primaryPale,
                        fontFamily:
                          FONT_HEAD,
                        fontWeight: 700,
                        fontSize: 9,
                        color:
                          C.primaryDeep,
                      }}
                    >
                      METER ENTRY
                    </div>
                  )}
              </div>

              {/* PAYER */}

              {log.person && (
                <div
                  style={{
                    display: "flex",
                    alignItems:
                      "center",
                    gap: 7,
                    marginTop: 13,
                    paddingTop: 11,
                    borderTop: `1px solid ${C.border}`,
                  }}
                >
                  <Wallet
                    size={14}
                    color={
                      C.inkFaint
                    }
                  />

                  <div
                    style={{
                      fontFamily:
                        FONT_HEAD,
                      fontSize: 10,
                      color:
                        C.inkSoft,
                    }}
                  >
                    Top-up paid by{" "}
                    <strong>
                      {log.person}
                    </strong>
                  </div>
                </div>
              )}

              {/* NOTE */}

              {log.note && (
                <div
                  style={{
                    marginTop: 11,
                    padding: 11,
                    background:
                      C.cardTint,
                    borderRadius: 13,
                    fontFamily:
                      FONT_HEAD,
                    fontSize: 11,
                    lineHeight: 1.5,
                    color:
                      C.inkSoft,
                  }}
                >
                  {log.note}
                </div>
              )}
            </Card>
          );
        }
      )}
    </div>
  );
}
/* ================================
   INSIGHTS
================================ */

function Insights({
  data,
}) {
  const monthlyRows =
    useMemo(() => {
      const map =
        new Map();

      data.logs.forEach(
        (log) => {
          const month =
            log.month ||
            (log.date || "").slice(
              0,
              7
            );

          if (!month) return;

          if (!map.has(month)) {
            map.set(month, {
              month,
              label:
                monthLabel(
                  month
                ),

              cost: 0,
              topup: 0,

              elecUsage: 0,
              waterUsage: 0,
              gasUsage: 0,
            });
          }

          const row =
            map.get(month);

          row.cost +=
            Number(
              log.cost || 0
            );

          row.topup +=
            Number(
              log.topupAmount ||
                0
            );

          if (
            log.usage != null
          ) {
            const amount =
              Number(
                log.usage || 0
              );

            if (
              log.utilityId ===
              "elec"
            ) {
              row.elecUsage +=
                amount;
            }

            if (
              log.utilityId ===
              "water"
            ) {
              row.waterUsage +=
                amount;
            }

            if (
              log.utilityId ===
              "gas"
            ) {
              row.gasUsage +=
                amount;
            }
          }
        }
      );

      return Array.from(
        map.values()
      )
        .sort(
          (a, b) =>
            a.month.localeCompare(
              b.month
            )
        )
        .slice(-MONTH_WINDOW);
    }, [data.logs]);

  /* ================================
     CURRENT BALANCES
  ================================ */

  const balanceRows =
    useMemo(() => {
      return data.utilities.map(
        (utility) => {
          const logs =
            data.logs
              .filter(
                (log) =>
                  log.utilityId ===
                  utility.id
              )
              .sort(
                (a, b) =>
                  new Date(
                    a.date
                  ) -
                  new Date(
                    b.date
                  )
              );

          const last =
            logs[
              logs.length - 1
            ];

          return {
            name:
              utility.name,

            balance:
              last
                ? Number(
                    last.balanceAfter ||
                      0
                  )
                : 0,
          };
        }
      );
    }, [
      data.logs,
      data.utilities,
    ]);

  const totalConsumed =
    data.logs.reduce(
      (sum, log) =>
        sum +
        Number(
          log.cost || 0
        ),
      0
    );

  const totalTopups =
    data.logs.reduce(
      (sum, log) =>
        sum +
        Number(
          log.topupAmount ||
            0
        ),
      0
    );

  const totalBalance =
    balanceRows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.balance || 0
        ),
      0
    );

  /* ================================
     ROOMMATE CONTRIBUTIONS
  ================================ */

  const roommateRows =
    useMemo(() => {
      return data.roommates.map(
        (roommate) => {
          const paid =
            data.logs
              .filter(
                (log) =>
                  log.person ===
                  roommate
              )
              .reduce(
                (sum, log) =>
                  sum +
                  Number(
                    log.topupAmount ||
                      0
                  ),
                0
              );

          return {
            roommate,
            paid,
          };
        }
      );
    }, [
      data.logs,
      data.roommates,
    ]);

  const expectedPerPerson =
    data.roommates.length > 0
      ? totalTopups /
        data.roommates.length
      : 0;

  return (
    <div>
      <div
        style={{
          margin:
            "18px 0 18px",
        }}
      >
        <div
          style={{
            fontFamily:
              FONT_HEAD,
            fontSize: 24,
            fontWeight: 700,
            color: C.ink,
          }}
        >
          Insights
        </div>

        <div
          style={{
            fontFamily:
              FONT_HEAD,
            fontSize: 12,
            color:
              C.inkSoft,
            marginTop: 3,
          }}
        >
          See how much you top up
          and consume over time.
        </div>
      </div>

      {/* SUMMARY */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "1fr 1fr",
          gap: 10,
          marginBottom: 18,
        }}
      >
        <Card
          style={{
            padding: 14,
          }}
        >
          <div
            style={{
              fontFamily:
                FONT_HEAD,
              fontSize: 10,
              fontWeight: 700,
              color:
                C.inkFaint,
            }}
          >
            TOTAL CONSUMED
          </div>

          <div
            style={{
              fontFamily:
                FONT_MONO,
              fontWeight: 700,
              fontSize: 18,
              color: C.coral,
              marginTop: 5,
            }}
          >
            {fmtMoney(
              totalConsumed,
              data.currency
            )}
          </div>
        </Card>

        <Card
          style={{
            padding: 14,
          }}
        >
          <div
            style={{
              fontFamily:
                FONT_HEAD,
              fontSize: 10,
              fontWeight: 700,
              color:
                C.inkFaint,
            }}
          >
            TOTAL TOP-UPS
          </div>

          <div
            style={{
              fontFamily:
                FONT_MONO,
              fontWeight: 700,
              fontSize: 18,
              color: C.mint,
              marginTop: 5,
            }}
          >
            {fmtMoney(
              totalTopups,
              data.currency
            )}
          </div>
        </Card>
      </div>

      <Card
        style={{
          marginBottom: 18,
          padding: 15,
        }}
      >
        <div
          style={{
            fontFamily:
              FONT_HEAD,
            fontSize: 10,
            fontWeight: 700,
            color:
              C.inkFaint,
          }}
        >
          CURRENT COMBINED BALANCE
        </div>

        <div
          style={{
            fontFamily:
              FONT_MONO,
            fontSize: 24,
            fontWeight: 700,
            color:
              C.primaryDeep,
            marginTop: 4,
          }}
        >
          {fmtMoney(
            totalBalance,
            data.currency
          )}
        </div>
      </Card>

      {/* NO DATA */}

      {monthlyRows.length ===
        0 && (
        <EmptyState text="Add at least two checkpoints for a utility before consumption insights become useful." />
      )}

      {/* RMB CHART */}

      {monthlyRows.length >
        0 && (
        <>
          <SectionTitle>
            Monthly RMB
          </SectionTitle>

          <Card
            style={{
              padding:
                "16px 10px 10px",
              marginBottom: 22,
            }}
          >
            <div
              style={{
                width: "100%",
                height: 250,
              }}
            >
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <BarChart
                  data={
                    monthlyRows
                  }
                  margin={{
                    top: 10,
                    right: 8,
                    left: -18,
                    bottom: 0,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={
                      C.border
                    }
                  />

                  <XAxis
                    dataKey="label"
                    tick={{
                      fontSize: 10,
                      fill:
                        C.inkSoft,
                    }}
                    axisLine={
                      false
                    }
                    tickLine={
                      false
                    }
                  />

                  <YAxis
                    tick={{
                      fontSize: 10,
                      fill:
                        C.inkSoft,
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
                      value,
                      name
                    ) => [
                      fmtMoney(
                        value,
                        data.currency
                      ),
                      name ===
                      "cost"
                        ? "Consumed"
                        : "Top-up",
                    ]}
                  />

                  <Legend
                    formatter={(
                      value
                    ) =>
                      value ===
                      "cost"
                        ? "Consumed"
                        : "Top-up"
                    }
                  />

                  <Bar
                    dataKey="cost"
                    fill={
                      C.chart[1]
                    }
                    radius={[
                      8,
                      8,
                      0,
                      0,
                    ]}
                  />

                  <Bar
                    dataKey="topup"
                    fill={
                      C.chart[2]
                    }
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
        </>
      )}

      {/* ELECTRICITY */}

      {monthlyRows.some(
        (row) =>
          row.elecUsage > 0
      ) && (
        <>
          <SectionTitle>
            Electricity usage
          </SectionTitle>

          <Card
            style={{
              padding:
                "16px 10px 10px",
              marginBottom: 22,
            }}
          >
            <div
              style={{
                width: "100%",
                height: 220,
              }}
            >
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <AreaChart
                  data={
                    monthlyRows
                  }
                  margin={{
                    top: 10,
                    right: 8,
                    left: -18,
                    bottom: 0,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="elecGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={
                          C.chart[0]
                        }
                        stopOpacity={
                          0.6
                        }
                      />

                      <stop
                        offset="95%"
                        stopColor={
                          C.chart[0]
                        }
                        stopOpacity={
                          0.05
                        }
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={
                      C.border
                    }
                  />

                  <XAxis
                    dataKey="label"
                    tick={{
                      fontSize: 10,
                      fill:
                        C.inkSoft,
                    }}
                    axisLine={
                      false
                    }
                    tickLine={
                      false
                    }
                  />

                  <YAxis
                    tick={{
                      fontSize: 10,
                      fill:
                        C.inkSoft,
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
                        value,
                        2
                      )} kWh`,
                      "Estimated usage",
                    ]}
                  />

                  <Area
                    type="monotone"
                    dataKey="elecUsage"
                    stroke={
                      C.chart[0]
                    }
                    fill="url(#elecGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}

      {/* WATER */}

      {monthlyRows.some(
        (row) =>
          row.waterUsage > 0
      ) && (
        <>
          <SectionTitle>
            Water usage
          </SectionTitle>

          <Card
            style={{
              padding:
                "16px 10px 10px",
              marginBottom: 22,
            }}
          >
            <div
              style={{
                width: "100%",
                height: 220,
              }}
            >
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <AreaChart
                  data={
                    monthlyRows
                  }
                  margin={{
                    top: 10,
                    right: 8,
                    left: -18,
                    bottom: 0,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="waterGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={
                          C.chart[2]
                        }
                        stopOpacity={
                          0.6
                        }
                      />

                      <stop
                        offset="95%"
                        stopColor={
                          C.chart[2]
                        }
                        stopOpacity={
                          0.05
                        }
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={
                      C.border
                    }
                  />

                  <XAxis
                    dataKey="label"
                    tick={{
                      fontSize: 10,
                      fill:
                        C.inkSoft,
                    }}
                    axisLine={
                      false
                    }
                    tickLine={
                      false
                    }
                  />

                  <YAxis
                    tick={{
                      fontSize: 10,
                      fill:
                        C.inkSoft,
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
                        value,
                        2
                      )} m³`,
                      "Estimated usage",
                    ]}
                  />

                  <Area
                    type="monotone"
                    dataKey="waterUsage"
                    stroke={
                      C.chart[2]
                    }
                    fill="url(#waterGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}

      {/* GAS */}

      {monthlyRows.some(
        (row) =>
          row.gasUsage > 0
      ) && (
        <>
          <SectionTitle>
            Gas usage
          </SectionTitle>

          <Card
            style={{
              padding:
                "16px 10px 10px",
              marginBottom: 22,
            }}
          >
            <div
              style={{
                width: "100%",
                height: 220,
              }}
            >
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <BarChart
                  data={
                    monthlyRows
                  }
                  margin={{
                    top: 10,
                    right: 8,
                    left: -18,
                    bottom: 0,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={
                      C.border
                    }
                  />

                  <XAxis
                    dataKey="label"
                    tick={{
                      fontSize: 10,
                      fill:
                        C.inkSoft,
                    }}
                    axisLine={
                      false
                    }
                    tickLine={
                      false
                    }
                  />

                  <YAxis
                    tick={{
                      fontSize: 10,
                      fill:
                        C.inkSoft,
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
                        value,
                        2
                      )} m³`,
                      "Meter usage",
                    ]}
                  />

                  <Bar
                    dataKey="gasUsage"
                    fill={
                      C.chart[3]
                    }
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
        </>
      )}

      {/* ROOMMATE CONTRIBUTIONS */}

      {data.roommates.length >
        0 && (
        <>
          <SectionTitle>
            Top-up contributions
          </SectionTitle>

          <Card>
            {roommateRows.map(
              (row) => {
                const difference =
                  row.paid -
                  expectedPerPerson;

                const ahead =
                  difference >
                  0.01;

                const behind =
                  difference <
                  -0.01;

                return (
                  <div
                    key={
                      row.roommate
                    }
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      gap: 12,
                      alignItems:
                        "center",
                      padding:
                        "11px 0",
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily:
                            FONT_HEAD,
                          fontWeight: 700,
                          fontSize: 12,
                          color:
                            C.ink,
                        }}
                      >
                        {
                          row.roommate
                        }
                      </div>

                      <div
                        style={{
                          fontFamily:
                            FONT_MONO,
                          fontSize: 10,
                          color:
                            C.inkFaint,
                          marginTop: 2,
                        }}
                      >
                        Paid{" "}
                        {fmtMoney(
                          row.paid,
                          data.currency
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        display:
                          "flex",
                        alignItems:
                          "center",
                        gap: 5,
                        fontFamily:
                          FONT_MONO,
                        fontSize: 10,
                        fontWeight: 700,
                        color: ahead
                          ? C.mint
                          : behind
                          ? C.coral
                          : C.inkSoft,
                      }}
                    >
                      {ahead && (
                        <ArrowUpRight
                          size={14}
                        />
                      )}

                      {behind && (
                        <ArrowDownRight
                          size={14}
                        />
                      )}

                      {!ahead &&
                      !behind ? (
                        <>
                          <Check
                            size={14}
                          />
                          even
                        </>
                      ) : (
                        fmtMoney(
                          Math.abs(
                            difference
                          ),
                          data.currency
                        )
                      )}
                    </div>
                  </div>
                );
              }
            )}

            <div
              style={{
                marginTop: 12,
                fontFamily:
                  FONT_HEAD,
                fontSize: 10,
                lineHeight: 1.5,
                color:
                  C.inkFaint,
              }}
            >
              This only compares who
              paid the top-ups. It
              does not automatically
              calculate how much each
              roommate owes.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
/* ================================
   SETTINGS
================================ */

function SettingsPanel({
  data,
  setData,
}) {
  const updateUtility = (
    utilityId,
    patch
  ) => {
    setData((prev) => ({
      ...prev,
      utilities:
        prev.utilities.map(
          (utility) =>
            utility.id ===
            utilityId
              ? {
                  ...utility,
                  ...patch,
                }
              : utility
        ),
    }));
  };

  const updateTier = (
    utilityId,
    tierIndex,
    patch
  ) => {
    setData((prev) => ({
      ...prev,
      utilities:
        prev.utilities.map(
          (utility) => {
            if (
              utility.id !==
              utilityId
            ) {
              return utility;
            }

            const tiers =
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
              );

            return {
              ...utility,
              tiers,
            };
          }
        ),
    }));
  };

  const addTier = (
    utilityId
  ) => {
    setData((prev) => ({
      ...prev,
      utilities:
        prev.utilities.map(
          (utility) =>
            utility.id ===
            utilityId
              ? {
                  ...utility,
                  tiers: [
                    ...utility.tiers,
                    {
                      upTo: null,
                      rate: 0,
                    },
                  ],
                }
              : utility
        ),
    }));
  };

  const deleteTier = (
    utilityId,
    tierIndex
  ) => {
    setData((prev) => ({
      ...prev,
      utilities:
        prev.utilities.map(
          (utility) => {
            if (
              utility.id !==
              utilityId
            ) {
              return utility;
            }

            if (
              utility.tiers.length <=
              1
            ) {
              return utility;
            }

            return {
              ...utility,
              tiers:
                utility.tiers.filter(
                  (
                    _,
                    index
                  ) =>
                    index !==
                    tierIndex
                ),
            };
          }
        ),
    }));
  };

  const addRoommate = () => {
    setData((prev) => ({
      ...prev,
      roommates: [
        ...prev.roommates,
        `Roommate ${
          prev.roommates.length +
          1
        }`,
      ],
    }));
  };

  const updateRoommate = (
    index,
    value
  ) => {
    setData((prev) => ({
      ...prev,
      roommates:
        prev.roommates.map(
          (
            roommate,
            i
          ) =>
            i === index
              ? value
              : roommate
        ),
    }));
  };

  const deleteRoommate = (
    index
  ) => {
    setData((prev) => ({
      ...prev,
      roommates:
        prev.roommates.filter(
          (_, i) =>
            i !== index
        ),
    }));
  };

  const resetData = () => {
    const confirmed =
      window.confirm(
        "Reset all utility data and checkpoints? This cannot be undone."
      );

    if (!confirmed) {
      return;
    }

    setData(
      defaultData()
    );
  };

  return (
    <div>
      <div
        style={{
          margin:
            "18px 0 18px",
        }}
      >
        <div
          style={{
            fontFamily:
              FONT_HEAD,
            fontSize: 24,
            fontWeight: 700,
            color: C.ink,
          }}
        >
          Settings
        </div>

        <div
          style={{
            fontFamily:
              FONT_HEAD,
            fontSize: 12,
            color:
              C.inkSoft,
            marginTop: 3,
          }}
        >
          Edit your utility
          rates and apartment
          setup.
        </div>
      </div>

      {/* CURRENCY */}

      <SectionTitle>
        General
      </SectionTitle>

      <Card
        style={{
          marginBottom: 22,
        }}
      >
        <Field
          label="Currency symbol"
          hint="Usually ¥ for your utilities in China."
        >
          <input
            style={inputStyle}
            type="text"
            maxLength={4}
            value={
              data.currency
            }
            onChange={(e) =>
              setData(
                (prev) => ({
                  ...prev,
                  currency:
                    e.target
                      .value,
                })
              )
            }
          />
        </Field>
      </Card>

      {/* ROOMMATES */}

      <SectionTitle>
        Roommates
      </SectionTitle>

      <Card
        style={{
          marginBottom: 22,
        }}
      >
        {data.roommates.map(
          (
            roommate,
            index
          ) => (
            <div
              key={index}
              style={{
                display: "flex",
                gap: 8,
                alignItems:
                  "center",
                marginBottom: 9,
              }}
            >
              <input
                style={{
                  ...inputStyle,
                  flex: 1,
                }}
                value={
                  roommate
                }
                onChange={(e) =>
                  updateRoommate(
                    index,
                    e.target
                      .value
                  )
                }
              />

              {data.roommates
                .length >
                1 && (
                <IconButton
                  danger
                  onClick={() =>
                    deleteRoommate(
                      index
                    )
                  }
                  title="Delete roommate"
                >
                  <Trash2
                    size={16}
                  />
                </IconButton>
              )}
            </div>
          )
        )}

        <button
          type="button"
          style={
            ghostAddStyle
          }
          onClick={
            addRoommate
          }
        >
          <Plus size={15} />
          Add roommate
        </button>
      </Card>

      {/* UTILITIES */}

      <SectionTitle>
        Utilities & tariff tiers
      </SectionTitle>

      {data.utilities.map(
        (utility) => (
          <Card
            key={utility.id}
            style={{
              marginBottom: 16,
            }}
          >
            {/* NAME + UNIT */}

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1.5fr 0.7fr",
                gap: 9,
                marginBottom: 14,
              }}
            >
              <Field label="Utility name">
                <input
                  style={
                    inputStyle
                  }
                  value={
                    utility.name
                  }
                  onChange={(e) =>
                    updateUtility(
                      utility.id,
                      {
                        name:
                          e
                            .target
                            .value,
                      }
                    )
                  }
                />
              </Field>

              <Field label="Unit">
                <input
                  style={
                    inputStyle
                  }
                  value={
                    utility.unit
                  }
                  onChange={(e) =>
                    updateUtility(
                      utility.id,
                      {
                        unit:
                          e
                            .target
                            .value,
                      }
                    )
                  }
                />
              </Field>
            </div>

            {/* STARTING ANNUAL USAGE */}

            {(utility.id ===
              "elec" ||
              utility.id ===
                "water") && (
              <div
                style={{
                  background:
                    C.primaryPale,
                  borderRadius: 18,
                  padding: 14,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    fontFamily:
                      FONT_HEAD,
                    fontWeight: 700,
                    fontSize: 12,
                    color:
                      C.primaryDeep,
                    marginBottom: 5,
                  }}
                >
                  Starting annual usage
                </div>

                <div
                  style={{
                    fontFamily:
                      FONT_HEAD,
                    fontSize: 11,
                    color:
                      C.inkSoft,
                    lineHeight: 1.5,
                    marginBottom: 9,
                  }}
                >
                  Enter how much
                  electricity or
                  water was already
                  used earlier in
                  this calendar year
                  before you started
                  using the tracker.
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems:
                      "center",
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
                      utility.startingAnnualUsage ??
                      0
                    }
                    onChange={(e) =>
                      updateUtility(
                        utility.id,
                        {
                          startingAnnualUsage:
                            Math.max(
                              0,
                              Number(
                                e
                                  .target
                                  .value ||
                                  0
                              )
                            ),
                        }
                      )
                    }
                  />

                  <span
                    style={{
                      fontFamily:
                        FONT_MONO,
                      fontSize: 12,
                      color:
                        C.inkSoft,
                      minWidth: 44,
                    }}
                  >
                    {utility.unit}
                  </span>
                </div>

                <div
                  style={{
                    fontFamily:
                      FONT_HEAD,
                    fontSize: 10,
                    lineHeight: 1.5,
                    color:
                      C.inkFaint,
                    marginTop: 7,
                  }}
                >
                  Leave this as 0 if
                  you do not know the
                  earlier annual
                  usage. The physical
                  usage estimate can
                  be less accurate
                  near a tier
                  boundary.
                </div>
              </div>
            )}

            {/* AUTO USAGE INFO */}

            <div
              style={{
                display: "flex",
                gap: 9,
                alignItems:
                  "flex-start",
                padding: 12,
                borderRadius: 15,
                background:
                  utility.autoUsage
                    ? C.mintPale
                    : C.cardTint,
                marginBottom: 16,
              }}
            >
              {utility.autoUsage ? (
                <Check
                  size={16}
                  color={C.mint}
                  style={{
                    marginTop: 1,
                    flexShrink: 0,
                  }}
                />
              ) : (
                <Gauge
                  size={16}
                  color={
                    C.primaryDeep
                  }
                  style={{
                    marginTop: 1,
                    flexShrink: 0,
                  }}
                />
              )}

              <div
                style={{
                  fontFamily:
                    FONT_HEAD,
                  fontSize: 10,
                  lineHeight: 1.5,
                  color:
                    C.inkSoft,
                }}
              >
                {utility.autoUsage
                  ? "Physical usage is calculated automatically from RMB consumption and the tariff tiers."
                  : "Physical usage is entered manually from the meter."}
              </div>
            </div>

            {/* TIER HEADER */}

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "0.55fr 1fr 1fr 36px",
                gap: 6,
                alignItems:
                  "center",
                marginBottom: 7,
                padding:
                  "0 2px",
              }}
            >
              <div
                style={{
                  fontFamily:
                    FONT_HEAD,
                  fontSize: 9,
                  fontWeight: 700,
                  color:
                    C.inkFaint,
                }}
              >
                TIER
              </div>

              <div
                style={{
                  fontFamily:
                    FONT_HEAD,
                  fontSize: 9,
                  fontWeight: 700,
                  color:
                    C.inkFaint,
                }}
              >
                UP TO
              </div>

              <div
                style={{
                  fontFamily:
                    FONT_HEAD,
                  fontSize: 9,
                  fontWeight: 700,
                  color:
                    C.inkFaint,
                }}
              >
                RATE /{" "}
                {utility.unit}
              </div>

              <div />
            </div>

            {/* TIERS */}

            {utility.tiers.map(
              (
                tier,
                index
              ) => {
                const isLast =
                  index ===
                  utility.tiers
                    .length -
                    1;

                return (
                  <div
                    key={index}
                    style={{
                      display:
                        "grid",
                      gridTemplateColumns:
                        "0.55fr 1fr 1fr 36px",
                      gap: 6,
                      alignItems:
                        "center",
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        fontFamily:
                          FONT_MONO,
                        fontWeight: 700,
                        fontSize: 11,
                        color:
                          C.primaryDeep,
                      }}
                    >
                      {index + 1}
                    </div>

                    <input
                      style={{
                        ...inputStyle,
                        padding:
                          "10px 9px",
                        minHeight: 42,
                        fontSize: 11,
                      }}
                      type="number"
                      min="0"
                      step="0.1"
                      disabled={
                        isLast &&
                        tier.upTo ===
                          null
                      }
                      value={
                        tier.upTo ===
                        null
                          ? ""
                          : tier.upTo
                      }
                      placeholder={
                        isLast
                          ? "∞"
                          : ""
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
                        padding:
                          "10px 9px",
                        minHeight: 42,
                        fontSize: 11,
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
                            rate:
                              Number(
                                e
                                  .target
                                  .value ||
                                  0
                              ),
                          }
                        )
                      }
                    />

                    {utility.tiers
                      .length >
                      1 && (
                      <IconButton
                        danger
                        onClick={() =>
                          deleteTier(
                            utility.id,
                            index
                          )
                        }
                        title="Delete tier"
                      >
                        <Trash2
                          size={
                            14
                          }
                        />
                      </IconButton>
                    )}
                  </div>
                );
              }
            )}

            <button
              type="button"
              style={{
                ...ghostAddStyle,
                marginTop: 4,
              }}
              onClick={() =>
                addTier(
                  utility.id
                )
              }
            >
              <Plus
                size={14}
              />
              Add tier
            </button>
          </Card>
        )
      )}

      {/* CURRENT RATE REFERENCE */}

      <Card
        style={{
          marginTop: 6,
          marginBottom: 22,
          background:
            C.cardTint,
        }}
      >
        <div
          style={{
            fontFamily:
              FONT_HEAD,
            fontSize: 12,
            fontWeight: 700,
            color:
              C.primaryDeep,
            marginBottom: 8,
          }}
        >
          Your current tariff setup
        </div>

        <div
          style={{
            fontFamily:
              FONT_HEAD,
            fontSize: 10,
            lineHeight: 1.7,
            color:
              C.inkSoft,
          }}
        >
          <strong>
            Electricity:
          </strong>{" "}
          ≤2760 kWh ¥0.5283,
          2760–4800 kWh ¥0.5783,
          above 4800 kWh ¥0.8283.
          <br />

          <strong>
            Water:
          </strong>{" "}
          ≤216 m³ ¥2.91,
          216–300 m³ ¥3.71,
          above 300 m³ ¥6.11.
          <br />

          <strong>
            Gas:
          </strong>{" "}
          ≤400 m³ ¥2.99,
          400–1000 m³ ¥3.59,
          above 1000 m³ ¥4.49.
        </div>
      </Card>

      {/* RESET */}

      <SectionTitle>
        Data
      </SectionTitle>

      <Card
        style={{
          marginBottom: 32,
        }}
      >
        <div
          style={{
            fontFamily:
              FONT_HEAD,
            fontSize: 11,
            lineHeight: 1.5,
            color:
              C.inkSoft,
            marginBottom: 12,
          }}
        >
          Your records are stored
          only in this browser on
          this device.
        </div>

        <button
          type="button"
          onClick={
            resetData
          }
          style={{
            width: "100%",
            border: "none",
            borderRadius: 16,
            padding: "13px 16px",
            background:
              C.coralPale,
            color: C.coral,
            fontFamily:
              FONT_HEAD,
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Reset all data
        </button>
      </Card>
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
    useState("home");

  const [showAdd, setShowAdd] =
    useState(false);

  /* ================================
     SAVE TO LOCAL STORAGE
  ================================ */

  useEffect(() => {
    saveData(data);
  }, [data]);

  /* ================================
     SAVE NEW CHECKPOINT
  ================================ */

  const addLog =
    useCallback(
      (record) => {
        setData((prev) => ({
          ...prev,
          logs: [
            ...prev.logs,
            record,
          ],
        }));
      },
      []
    );

  /* ================================
     DELETE CHECKPOINT
  ================================ */

  const deleteLog =
    useCallback(
      (id) => {
        const confirmed =
          window.confirm(
            "Delete this checkpoint?"
          );

        if (!confirmed) {
          return;
        }

        setData((prev) => ({
          ...prev,
          logs:
            prev.logs.filter(
              (log) =>
                log.id !== id
            ),
        }));
      },
      []
    );

  /* ================================
     PER-UTILITY SUMMARY
  ================================ */

  const perUtility =
    useMemo(() => {
      return data.utilities.map(
        (utility) => {
          const logs =
            data.logs
              .filter(
                (log) =>
                  log.utilityId ===
                  utility.id
              )
              .sort(
                (a, b) =>
                  new Date(
                    a.date
                  ) -
                  new Date(
                    b.date
                  )
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

          const usageSum =
            logs.reduce(
              (sum, log) =>
                sum +
                Number(
                  log.usage || 0
                ),
              0
            );

          let status =
            "green";

          if (balance < 0) {
            status = "red";
          } else if (
            balance < 50
          ) {
            status = "amber";
          }

          return {
            utility,
            balance,
            topupSum,
            costSum,
            usageSum,
            lastDate:
              last?.date ||
              null,
            status,
          };
        }
      );
    }, [
      data.logs,
      data.utilities,
    ]);

  /* ================================
     COMBINED BALANCE
  ================================ */

  const overallBalance =
    useMemo(() => {
      return perUtility.reduce(
        (sum, row) =>
          sum +
          Number(
            row.balance || 0
          ),
        0
      );
    }, [perUtility]);

  /* ================================
     RECENT ACTIVITY
  ================================ */

  const recent =
    useMemo(() => {
      return [...data.logs]
        .sort(
          (a, b) =>
            new Date(b.date) -
            new Date(a.date)
        )
        .slice(0, 5);
    }, [data.logs]);

  /* ================================
     SCREEN
  ================================ */

  let content = null;

  if (tab === "home") {
    content = (
      <Dashboard
        data={data}
        perUtility={
          perUtility
        }
        overallBalance={
          overallBalance
        }
        recent={recent}
        currency={
          data.currency
        }
      />
    );
  }

  if (tab === "history") {
    content = (
      <History
        data={data}
        onDelete={
          deleteLog
        }
      />
    );
  }

  if (tab === "insights") {
    content = (
      <Insights
        data={data}
      />
    );
  }

  if (tab === "settings") {
    content = (
      <SettingsPanel
        data={data}
        setData={setData}
      />
    );
  }

  /* ================================
     NAV ITEM
  ================================ */

  function NavItem({
    id,
    icon: Icon,
    label,
  }) {
    const active =
      tab === id;

    return (
      <button
        type="button"
        onClick={() =>
          setTab(id)
        }
        style={{
          flex: 1,
          border: "none",
          background:
            "transparent",
          display: "flex",
          flexDirection:
            "column",
          alignItems:
            "center",
          justifyContent:
            "center",
          gap: 3,
          padding:
            "8px 2px",
          cursor: "pointer",
          color: active
            ? C.primaryDeep
            : C.inkFaint,
        }}
      >
        <Icon
          size={19}
          strokeWidth={
            active
              ? 2.5
              : 2
          }
        />

        <span
          style={{
            fontFamily:
              FONT_HEAD,
            fontSize: 9,
            fontWeight:
              active
                ? 700
                : 600,
          }}
        >
          {label}
        </span>
      </button>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.ink,
        fontFamily:
          FONT_HEAD,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          margin: "0 auto",
          minHeight: "100vh",
          padding:
            "0 16px 100px",
        }}
      >
        {/* APP HEADER */}

        <div
          style={{
            paddingTop: 18,
            display: "flex",
            alignItems:
              "center",
            justifyContent:
              "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontFamily:
                  FONT_HEAD,
                fontSize: 20,
                fontWeight: 700,
                color: C.ink,
              }}
            >
              Utility Balance
            </div>

            <div
              style={{
                fontFamily:
                  FONT_HEAD,
                fontSize: 10,
                color:
                  C.inkFaint,
                marginTop: 2,
              }}
            >
              shared apartment
              prepaid tracker
            </div>
          </div>

          <div
            style={{
              width: 39,
              height: 39,
              borderRadius: 14,
              background:
                C.primaryPale,
              display: "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
            }}
          >
            <Wallet
              size={18}
              color={
                C.primaryDeep
              }
            />
          </div>
        </div>

        {/* PAGE */}

        {content}
      </div>

      {/* BOTTOM NAV */}

      <div
        style={{
          position: "fixed",
          left: "50%",
          transform:
            "translateX(-50%)",
          bottom: 0,
          width: "100%",
          maxWidth: 460,
          background:
            "rgba(255,255,255,0.96)",
          backdropFilter:
            "blur(14px)",
          WebkitBackdropFilter:
            "blur(14px)",
          borderTop: `1px solid ${C.border}`,
          display: "flex",
          alignItems:
            "center",
          padding:
            "7px 8px calc(7px + env(safe-area-inset-bottom))",
          zIndex: 50,
          boxShadow:
            "0 -6px 25px rgba(58,53,80,0.07)",
        }}
      >
        <NavItem
          id="home"
          icon={Home}
          label="Home"
        />

        <NavItem
          id="history"
          icon={ListTree}
          label="History"
        />

        {/* CENTER ADD BUTTON */}

        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent:
              "center",
            position:
              "relative",
          }}
        >
          <button
            type="button"
            onClick={() =>
              setShowAdd(
                true
              )
            }
            aria-label="Add checkpoint"
            style={{
              width: 54,
              height: 54,
              borderRadius: 20,
              border: `5px solid ${C.bg}`,
              background:
                C.primary,
              color: C.white,
              display: "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              cursor: "pointer",
              position:
                "relative",
              top: -15,
              boxShadow:
                "0 8px 20px rgba(91,78,158,0.25)",
            }}
          >
            <Plus
              size={24}
              strokeWidth={2.5}
            />
          </button>
        </div>

        <NavItem
          id="insights"
          icon={
            BarChart2
          }
          label="Insights"
        />

        <NavItem
          id="settings"
          icon={
            SettingsIcon
          }
          label="Settings"
        />
      </div>

      {/* ADD ENTRY SHEET */}

      {showAdd && (
        <AddEntry
          data={data}
          onSave={
            addLog
          }
          onClose={() =>
            setShowAdd(
              false
            )
          }
        />
      )}
    </div>
  );
}
