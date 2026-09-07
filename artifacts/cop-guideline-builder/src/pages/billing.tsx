import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";

interface TokenUsageData {
  currentMonth: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    requestCount: number;
    totalAdditionalChargeUsd: number;
    monthLabel: string;
  };
}

const cardStyle = {
  background: "#fff",
  border: "1.5px solid #E2E8F0",
  borderRadius: "12px",
  padding: "24px 28px",
  boxShadow: "0 2px 8px rgba(11,61,142,0.05)",
} as const;

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function formatCharge(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export default function BillingPage() {
  const { data } = useQuery<TokenUsageData>({
    queryKey: ["/api/billing/token-usage"],
    queryFn: () => apiFetch("/api/billing/token-usage"),
  });
  const usage = data?.currentMonth;

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#F0F4F8",
        padding: "40px 24px",
        fontFamily: "var(--app-font-sans, 'Inter', system-ui, sans-serif)",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h1
          style={{
            margin: "0 0 8px",
            color: "hsl(213 58% 11%)",
            fontSize: "28px",
          }}
        >
          Billing
        </h1>
        <p style={{ margin: "0 0 28px", color: "#64748B", fontSize: "14px" }}>
          Review your subscription and monthly AI usage.
        </p>

        {/* Keep the current-month usage meter at the top of the Billing page. */}
        <section style={{ ...cardStyle, marginBottom: "20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "20px",
              marginBottom: "20px",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  color: "hsl(213 58% 11%)",
                  fontSize: "17px",
                }}
              >
                AI Token Usage
              </h2>
              <p
                style={{
                  margin: "4px 0 0",
                  color: "#94A3B8",
                  fontSize: "12px",
                }}
              >
                {usage?.monthLabel ?? "This month"} · Billed in addition to your
                base plan
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <strong
                style={{
                  display: "block",
                  color: "hsl(213 76% 29%)",
                  fontSize: "28px",
                  lineHeight: 1,
                }}
              >
                ${usage ? formatCharge(usage.totalAdditionalChargeUsd) : "—"}
              </strong>
              <span style={{ color: "#94A3B8", fontSize: "11px" }}>
                additional charge
              </span>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
            }}
          >
            {[
              {
                label: "AI requests",
                value: usage ? formatNumber(usage.requestCount) : "—",
                detail: "generations this month",
              },
              {
                label: "Total tokens",
                value: usage ? formatNumber(usage.totalTokens) : "—",
                detail: usage
                  ? `${formatNumber(usage.inputTokens)} input · ${formatNumber(usage.outputTokens)} output`
                  : "— input · — output",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  padding: "14px",
                  background: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: "8px",
                }}
              >
                <div
                  style={{
                    marginBottom: "5px",
                    color: "#94A3B8",
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.8px",
                    textTransform: "uppercase",
                  }}
                >
                  {stat.label}
                </div>
                <div
                  style={{
                    color: "hsl(213 58% 11%)",
                    fontSize: "19px",
                    fontWeight: 800,
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    marginTop: "3px",
                    color: "#94A3B8",
                    fontSize: "11px",
                  }}
                >
                  {stat.detail}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="ai-billing-heading" style={cardStyle}>
          <h2
            id="ai-billing-heading"
            style={{
              margin: "0 0 10px",
              color: "hsl(213 76% 29%)",
              fontSize: "20px",
            }}
          >
            How AI usage billing works
          </h2>
          <p
            style={{
              margin: "0 0 20px",
              color: "#475569",
              fontSize: "14px",
              lineHeight: 1.7,
            }}
          >
            Each time you generate guidelines, the tool calls an AI model that
            charges by token (a unit of text). We pass that cost to you at cost
            + 50% to cover infrastructure.
          </p>

          <div style={{ overflowX: "auto", marginBottom: "20px" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                color: "#334155",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr style={{ background: "#F8FAFC", textAlign: "left" }}>
                  <th
                    style={{
                      padding: "11px 14px",
                      border: "1px solid #E2E8F0",
                    }}
                  >
                    Token type
                  </th>
                  <th
                    style={{
                      padding: "11px 14px",
                      border: "1px solid #E2E8F0",
                    }}
                  >
                    Your rate
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    style={{
                      padding: "11px 14px",
                      border: "1px solid #E2E8F0",
                    }}
                  >
                    Input tokens
                  </td>
                  <td
                    style={{
                      padding: "11px 14px",
                      border: "1px solid #E2E8F0",
                      fontWeight: 700,
                    }}
                  >
                    $4.50 per 1 million
                  </td>
                </tr>
                <tr>
                  <td
                    style={{
                      padding: "11px 14px",
                      border: "1px solid #E2E8F0",
                    }}
                  >
                    Output tokens
                  </td>
                  <td
                    style={{
                      padding: "11px 14px",
                      border: "1px solid #E2E8F0",
                      fontWeight: 700,
                    }}
                  >
                    $22.50 per 1 million
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div
            style={{
              padding: "14px 16px",
              background: "#EFF6FF",
              border: "1px solid #BFDBFE",
              borderRadius: "8px",
              color: "#1E3A5F",
              fontSize: "13px",
              lineHeight: 1.6,
            }}
          >
            <strong>Example:</strong> A typical gap scan generates ~2,000 input
            tokens and ~1,500 output tokens — about $0.04 per run. You control
            costs by choosing how often to run AI generations, and your
            current-month usage is always shown above.
          </div>

          <p
            style={{
              margin: "16px 0 0",
              color: "#64748B",
              fontSize: "13px",
              lineHeight: 1.6,
            }}
          >
            Charges are tallied monthly and added to your next invoice.
          </p>
        </section>
      </div>
    </main>
  );
}
