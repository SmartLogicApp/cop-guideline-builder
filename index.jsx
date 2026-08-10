import { useState, useEffect } from "react";
import * as XLSX from "xlsx";

// ─── Constants ───────────────────────────────────────────────────────────────

const INSTITUTION_TYPES = [
  { value: "hospital",  label: "Hospital",                    cfr: "42 CFR 482" },
  { value: "cah",       label: "Critical Access Hospital",    cfr: "42 CFR 485 Subpart F" },
  { value: "snf",       label: "Skilled Nursing Facility",    cfr: "42 CFR 483 Subpart B" },
  { value: "hha",       label: "Home Health Agency",          cfr: "42 CFR 484" },
  { value: "hospice",   label: "Hospice",                     cfr: "42 CFR 418" },
  { value: "asc",       label: "Ambulatory Surgery Center",   cfr: "42 CFR 416" },
  { value: "esrd",      label: "ESRD Facility",               cfr: "42 CFR 494" },
  { value: "rhc",       label: "Rural Health Clinic / FQHC", cfr: "42 CFR 491" },
];

const TOPICS = [
  "Infection Control & Prevention",
  "Patient Rights & Grievances",
  "Quality Assessment & Performance Improvement",
  "Nursing Services",
  "Medical Staff",
  "Medication Management",
  "Medical Records",
  "Emergency Preparedness",
  "Physical Environment & Safety",
  "Discharge Planning",
  "Surgical Services",
  "Anesthesia Services",
  "Governing Body Oversight",
  "Staff Competency & Training",
  "Patient Safety & Fall Prevention",
  "Restraint & Seclusion",
  "Laboratory Services",
];

const DEPARTMENTS = [
  "Nursing / Patient Care",
  "Infection Prevention & Control",
  "Quality & Compliance",
  "Medical Records / HIM",
  "Pharmacy",
  "Laboratory",
  "Radiology / Imaging",
  "Surgery / Operating Room",
  "Emergency Department",
  "ICU / Critical Care",
  "Rehabilitation Services",
  "Food & Nutrition",
  "Environmental Services",
  "Maintenance / Facilities",
  "Administration",
  "Human Resources",
];

// Regulatory body display config
const BODIES = [
  { key: "cms",  label: "CMS Conditions of Participation", color: "#1E40AF", bg: "#EFF6FF" },
  { key: "tjc",  label: "Joint Commission",                color: "#5B21B6", bg: "#F5F3FF" },
  { key: "dnv",  label: "DNV NIAHO",                       color: "#065F46", bg: "#ECFDF5" },
  { key: "iso",  label: "ISO 9001:2015",                   color: "#92400E", bg: "#FFFBEB" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function repairJson(raw) {
  const s = raw.replace(/```json\n?|```/g, "").trim();
  try { return JSON.parse(s); } catch {}

  const stack = [];
  let inStr = false, esc = false, lastSafe = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\" && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") { stack.pop(); if (!stack.length) lastSafe = i + 1; }
  }

  const close = stack.slice().reverse().join("");
  const stripped = s
    .replace(/,\s*"[^"]*"\s*:\s*(?:"[^"]*)?$/, "")
    .replace(/,\s*"[^"]*"\s*:?\s*$/, "");
  try { return JSON.parse(stripped + close); } catch {}
  if (lastSafe > 0) { try { return JSON.parse(s.slice(0, lastSafe)); } catch {} }
  throw new Error("Response was not valid JSON — please try again");
}

async function callApi(systemPrompt, userContent, maxTokens) {
  const startRes = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt, userContent, maxTokens }),
  });
  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({}));
    throw new Error(err.error || `Server error (${startRes.status})`);
  }
  const { jobId } = await startRes.json();
  if (!jobId) throw new Error("Server did not return a job ID");

  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const poll = await fetch(`/api/generate/result?jobId=${jobId}`);
    const job = await poll.json();
    if (job.status === "error") throw new Error(job.error);
    if (job.status === "done") return job.content?.[0]?.text ?? "";
  }
  throw new Error("Request timed out — please try again");
}

/** Like callApi but passes institutionValue so the server can pre-fetch live eCFR text.
 *  Returns { text, dataSource } where dataSource is { kind: "ecfr", fetchDate } or { kind: "ai" }. */
async function callApiWithSource(systemPrompt, userContent, maxTokens, institutionValue) {
  const startRes = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt, userContent, maxTokens, institutionValue }),
  });
  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({}));
    throw new Error(err.error || `Server error (${startRes.status})`);
  }
  const { jobId } = await startRes.json();
  if (!jobId) throw new Error("Server did not return a job ID");

  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const poll = await fetch(`/api/generate/result?jobId=${jobId}`);
    const job = await poll.json();
    if (job.status === "error") throw new Error(job.error);
    if (job.status === "done") {
      return {
        text: job.content?.[0]?.text ?? "",
        dataSource: job.dataSource ?? { kind: "ai" },
      };
    }
  }
  throw new Error("Request timed out — please try again");
}

// ─── Excel helpers ────────────────────────────────────────────────────────────

function downloadXlsx(sheets, filename) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    // Auto-width columns
    const colWidths = Object.keys(rows[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String(r[key] ?? "").length)) + 2,
    }));
    ws["!cols"] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

function exportGuidelinesXlsx(result, inst, topic) {
  const rows = [];
  result.sources?.forEach((src) => {
    src.standards?.forEach((std) => {
      rows.push({
        "Regulatory Body": src.body,
        "CFR / Reference": src.cfr || "",
        "Standard Code": std.code || "",
        "Tag": std.tag || "",
        "Title": std.title || "",
        "Requirement": std.requirement || "",
        "Surveyor Focus": std.surveyorFocus || "",
      });
    });
  });
  const overview = [{ "Overview": result.overview || "" }];
  downloadXlsx(
    [{ name: "Standards", rows }, { name: "Overview", rows: overview }],
    `${inst.label.replace(/\s+/g, "_")}_${topic.replace(/\s+/g, "_")}_Guidelines.xlsx`,
  );
}

function exportPolicyXlsx(text, inst, topic) {
  // Split the policy text into sections by all-caps headings
  const lines = text.split("\n");
  const rows = lines.map((line) => ({ "Policy Content": line }));
  downloadXlsx(
    [{ name: "Policy Template", rows }],
    `${inst.label.replace(/\s+/g, "_")}_${topic.replace(/\s+/g, "_")}_Policy.xlsx`,
  );
}

function exportInspectionXlsx(items, responses, inst, dept) {
  const rows = items.map((item) => ({
    "#": item.id,
    "Risk Level": item.riskLevel || "",
    "Area": item.area || "",
    "Surveyor Question": item.question || "",
    "Regulatory Basis": item.regulatoryBasis || "",
    "Common Deficiency": item.commonDeficiency || "",
    "Recommendation": item.recommendation || "",
    "Self-Assessment": responses[item.id] === "yes" ? "Ready" : responses[item.id] === "no" ? "Gap" : responses[item.id] === "na" ? "N/A" : "Not Assessed",
  }));
  downloadXlsx(
    [{ name: "Checklist", rows }],
    `${inst.label.replace(/\s+/g, "_")}_${dept.replace(/\s+/g, "_")}_Inspection.xlsx`,
  );
}

// Plain-text summary of inspection checklist for clipboard
function inspectionToText(items, responses, inst, dept) {
  const lines = [
    `INSPECTION READINESS CHECKLIST`,
    `Institution: ${inst.label} (${inst.cfr})`,
    `Department: ${dept}`,
    `Generated: ${new Date().toLocaleDateString()}`,
    "",
  ];
  items.forEach((item, i) => {
    lines.push(`${i + 1}. [${item.riskLevel} Risk] ${item.area}`);
    lines.push(`   Q: ${item.question}`);
    lines.push(`   Regulatory Basis: ${item.regulatoryBasis || "—"}`);
    lines.push(`   Common Deficiency: ${item.commonDeficiency || "—"}`);
    lines.push(`   Recommendation: ${item.recommendation || "—"}`);
    const resp = responses[item.id];
    if (resp) lines.push(`   Self-Assessment: ${resp === "yes" ? "Ready" : resp === "no" ? "Gap" : "N/A"}`);
    lines.push("");
  });
  return lines.join("\n");
}

// ─── PDF.js loader (CDN, no extra package needed) ────────────────────────────

async function extractTextFromPdf(file) {
  const pdfjsLib = await new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("Failed to load PDF.js"));
    document.head.appendChild(script);
  });

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    pages.push(content.items.map((i) => i.str).join(" "));
  }
  return pages.join("\n");
}

async function extractTextFromFile(file) {
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    return extractTextFromPdf(file);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

// ─── Gap Analysis History (localStorage) ─────────────────────────────────────

const GAP_HISTORY_KEY = "cop_gap_analysis_history";
const GAP_HISTORY_MAX = 50; // cap stored entries

function loadGapHistory() {
  try {
    const raw = localStorage.getItem(GAP_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGapEntry(entry) {
  try {
    const existing = loadGapHistory();
    const updated = [entry, ...existing].slice(0, GAP_HISTORY_MAX);
    localStorage.setItem(GAP_HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

function deleteGapEntry(id) {
  try {
    const existing = loadGapHistory();
    const updated = existing.filter((e) => e.id !== id);
    localStorage.setItem(GAP_HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

// ─── Gap Scanner helpers ──────────────────────────────────────────────────────

function exportGapXlsx(result, inst, topic) {
  const rows = [];
  const statusMap = { met: "✅ Met", weak: "⚠️ Weak/Partial", missing: "❌ Missing" };
  ["met", "weak", "missing"].forEach((status) => {
    (result[status] || []).forEach((item) => {
      rows.push({
        "Status": statusMap[status],
        "Regulatory Body": item.body || "",
        "Code / Reference": item.code || "",
        "Requirement Title": item.title || "",
        "Finding": item.finding || "",
        "Recommended Fix": item.recommendation || "",
      });
    });
  });
  downloadXlsx(
    [{ name: "Gap Analysis", rows }],
    `${inst.label.replace(/\s+/g, "_")}_${(topic || "Policy").replace(/\s+/g, "_")}_GapAnalysis.xlsx`,
  );
}

function gapToText(result, inst, topic) {
  const lines = [
    `POLICY COMPLIANCE GAP ANALYSIS`,
    `Institution: ${inst.label} (${inst.cfr})`,
    `Topic: ${topic || "General Policy"}`,
    `Generated: ${new Date().toLocaleDateString()}`,
    "",
    result.summary || "",
    "",
    "── ✅ MET REQUIREMENTS ──",
  ];
  (result.met || []).forEach((item) => {
    lines.push(`  [${item.code}] ${item.title} — ${item.finding}`);
  });
  lines.push("", "── ⚠️ WEAK / PARTIAL COVERAGE ──");
  (result.weak || []).forEach((item) => {
    lines.push(`  [${item.code}] ${item.title}`);
    lines.push(`  Finding: ${item.finding}`);
    lines.push(`  Fix: ${item.recommendation}`);
    lines.push("");
  });
  lines.push("── ❌ MISSING REQUIREMENTS ──");
  (result.missing || []).forEach((item) => {
    lines.push(`  [${item.code}] ${item.title}`);
    lines.push(`  Gap: ${item.finding}`);
    lines.push(`  Fix: ${item.recommendation}`);
    lines.push("");
  });
  return lines.join("\n");
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  page: { minHeight: "100vh", background: "#F4F7FA", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1A2332" },
  header: { background: "#0D5C6B", color: "#fff", padding: "20px 32px" },
  headerTitle: { margin: 0, fontSize: "22px", fontWeight: 700, letterSpacing: "-0.3px" },
  headerSub: { margin: "4px 0 0", fontSize: "13px", opacity: 0.75 },
  disclaimer: { background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: "6px", padding: "10px 14px", marginTop: "14px", fontSize: "11.5px", color: "#78350F", lineHeight: 1.5 },
  container: { maxWidth: "960px", margin: "0 auto", padding: "24px 24px 48px" },
  card: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "20px", marginBottom: "16px" },
  label: { display: "block", fontSize: "11px", fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" },
  select: { width: "100%", padding: "9px 12px", fontSize: "13px", border: "1px solid #CBD5E1", borderRadius: "6px", background: "#fff", boxSizing: "border-box", color: "#1A2332" },
  input: { width: "100%", padding: "9px 12px", fontSize: "13px", border: "1px solid #CBD5E1", borderRadius: "6px", boxSizing: "border-box", color: "#1A2332" },
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" },
  row3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "16px" },
  btnPrimary: (loading) => ({ width: "100%", padding: "12px", background: loading ? "#64748B" : "#0D5C6B", color: "#fff", border: "none", borderRadius: "7px", fontSize: "14px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", marginTop: "4px" }),
  btnSm: { padding: "6px 12px", fontSize: "12px", fontWeight: 600, border: "1px solid #CBD5E1", borderRadius: "5px", background: "#fff", cursor: "pointer", color: "#475569" },
  btnSmGreen: { padding: "6px 12px", fontSize: "12px", fontWeight: 600, border: "1px solid #A7F3D0", borderRadius: "5px", background: "#ECFDF5", cursor: "pointer", color: "#065F46" },
  error: { color: "#DC2626", fontSize: "13px", marginTop: "10px", padding: "10px 12px", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "6px" },
  tabs: { display: "flex", gap: "4px", marginBottom: "20px", overflowX: "auto", paddingBottom: "4px" },
  tag: (color, bg) => ({ display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, color, background: bg }),
  riskBadge: (level) => ({
    display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700,
    color: level === "High" ? "#991B1B" : level === "Medium" ? "#92400E" : "#065F46",
    background: level === "High" ? "#FEE2E2" : level === "Medium" ? "#FEF3C7" : "#D1FAE5",
  }),
  sectionHead: (color, bg) => ({ background: bg, borderLeft: `4px solid ${color}`, padding: "10px 14px", borderRadius: "0 6px 6px 0", marginBottom: "10px" }),
  sectionTitle: (color) => ({ margin: 0, fontSize: "13px", fontWeight: 700, color }),
  standardCard: { border: "1px solid #E2E8F0", borderRadius: "7px", padding: "12px 14px", marginBottom: "8px", background: "#FAFAFA" },
  fieldLabel: { fontSize: "10.5px", fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "2px" },
  fieldValue: { fontSize: "13px", color: "#1A2332", lineHeight: 1.55 },
  pre: { whiteSpace: "pre-wrap", fontFamily: "system-ui, -apple-system, sans-serif", fontSize: "13px", lineHeight: 1.65, color: "#1A2332", margin: 0 },
  divider: { border: "none", borderTop: "1px solid #E2E8F0", margin: "12px 0" },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function Tab({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "9px 18px", fontSize: "13px", fontWeight: 600, border: "none", borderRadius: "7px", cursor: "pointer",
      background: active ? "#0D5C6B" : "#E2E8F0", color: active ? "#fff" : "#475569",
      transition: "all 0.15s",
    }}>{label}</button>
  );
}

function LoadingSpinner({ message }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px" }}>
      <div style={{ width: "36px", height: "36px", border: "3px solid #E2E8F0", borderTop: "3px solid #0D5C6B", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 14px" }} />
      <p style={{ color: "#64748B", fontSize: "13px", margin: 0 }}>{message}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button style={{ ...S.btnSm, color: copied ? "#065F46" : "#475569", borderColor: copied ? "#A7F3D0" : "#CBD5E1", background: copied ? "#ECFDF5" : "#fff" }}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}>
      {copied ? "✓ Copied" : label}
    </button>
  );
}

function ExcelButton({ onClick, label = "↓ Excel" }) {
  return (
    <button style={S.btnSmGreen} onClick={onClick}>{label}</button>
  );
}

// ─── Guidelines Tab ──────────────────────────────────────────────────────────

function GuidelinesTab({ institution }) {
  const [topic, setTopic] = useState(TOPICS[0]);
  const [customTopic, setCustomTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [dataSource, setDataSource] = useState(null); // { kind: "ecfr", fetchDate } | { kind: "ai" } | null

  const inst = INSTITUTION_TYPES.find((i) => i.value === institution);

  async function generate() {
    const topicFinal = customTopic.trim() || topic;
    setLoading(true); setError(null); setResult(null); setDataSource(null);

    const systemPrompt = `You are a healthcare regulatory compliance expert with deep knowledge of CMS Conditions of Participation, Joint Commission, DNV NIAHO, and ISO 9001:2015.

Output ONLY valid JSON with this exact structure:
{
  "overview": "2-3 sentence summary of the regulatory landscape for this topic",
  "sources": [
    {
      "key": "cms",
      "body": "CMS Conditions of Participation",
      "cfr": "${inst.cfr}",
      "standards": [
        {
          "code": "§482.XX",
          "tag": "A-XXXX",
          "title": "Standard title",
          "requirement": "Core requirement in 1-2 sentences",
          "surveyorFocus": "What surveyors look for in 1 sentence"
        }
      ]
    },
    {
      "key": "tjc",
      "body": "Joint Commission",
      "standards": [
        {
          "code": "IC.01.01.01",
          "title": "Standard title",
          "requirement": "Core requirement in 1-2 sentences",
          "surveyorFocus": "What reviewers look for in 1 sentence"
        }
      ]
    },
    {
      "key": "dnv",
      "body": "DNV NIAHO",
      "standards": [
        {
          "code": "IC.1",
          "title": "Standard title",
          "requirement": "Core requirement in 1-2 sentences",
          "surveyorFocus": "What reviewers look for in 1 sentence"
        }
      ]
    },
    {
      "key": "iso",
      "body": "ISO 9001:2015",
      "standards": [
        {
          "code": "Clause 8.5",
          "title": "Clause title",
          "requirement": "How this clause applies to healthcare compliance in 1-2 sentences",
          "surveyorFocus": "Key evidence/documentation required in 1 sentence"
        }
      ]
    }
  ]
}

Include 3-4 standards per source. Use real, accurate regulatory codes and citations. Be concise but specific.`;

    const userContent = `Institution: ${inst.label} (${inst.cfr})\nCompliance Topic: ${topicFinal}`;

    try {
      const { text, dataSource: ds } = await callApiWithSource(systemPrompt, userContent, 3000, institution);
      setResult(repairJson(text));
      setDataSource(ds);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const topicFinal = customTopic.trim() || topic;

  // Build plain-text copy string
  function buildCopyText() {
    const lines = [
      `COMPLIANCE GUIDELINES — ${inst.label} (${inst.cfr})`,
      `Topic: ${topicFinal}`,
      "",
      result.overview,
      "",
    ];
    result.sources?.forEach((src) => {
      lines.push(`── ${src.body} ${src.cfr ? `(${src.cfr})` : ""} ──`);
      src.standards?.forEach((std) => {
        lines.push(`  ${std.code}${std.tag ? ` [${std.tag}]` : ""} — ${std.title}`);
        lines.push(`  Requirement: ${std.requirement}`);
        if (std.surveyorFocus) lines.push(`  Surveyor Focus: ${std.surveyorFocus}`);
        lines.push("");
      });
    });
    return lines.join("\n");
  }

  return (
    <div>
      {/* Form */}
      <div style={S.card}>
        <div style={S.row}>
          <div>
            <label style={S.label}>Topic Preset</label>
            <select style={S.select} value={topic} onChange={(e) => { setTopic(e.target.value); setCustomTopic(""); }}>
              {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Custom Topic (overrides preset)</label>
            <input style={S.input} type="text" value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder="e.g. Hand Hygiene Compliance" />
          </div>
        </div>
        <button style={S.btnPrimary(loading)} onClick={generate} disabled={loading}>
          {loading ? "Generating…" : "Generate Compliance Guidelines"}
        </button>
        {error && <div style={S.error}>⚠️ {error}</div>}
      </div>

      {/* Loading */}
      {loading && <div style={S.card}><LoadingSpinner message="Fetching live regulatory data and compiling standards…" /></div>}

      {/* Results */}
      {result && !loading && (
        <div>
          {/* Overview + action buttons */}
          <div style={{ ...S.card, borderLeft: "4px solid #0D5C6B" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#0D5C6B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {inst.label} · {topicFinal}
                </div>
                <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>{inst.cfr}</div>
                {/* Data source badge */}
                <div style={{ marginTop: "6px" }}>
                  {dataSource?.kind === "ecfr" ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, background: "#ECFDF5", color: "#065F46", border: "1px solid #6EE7B7" }}>
                      📡 Live eCFR · {dataSource.fetchDate}
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, background: "#F1F5F9", color: "#475569", border: "1px solid #CBD5E1" }}>
                      🤖 AI Knowledge
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <CopyButton text={buildCopyText()} />
                <ExcelButton onClick={() => exportGuidelinesXlsx(result, inst, topicFinal)} />
              </div>
            </div>
            <p style={{ margin: 0, fontSize: "14px", color: "#334155", lineHeight: 1.6 }}>{result.overview}</p>
          </div>

          {/* Standards by body */}
          {result.sources?.map((src) => {
            const bodyConfig = BODIES.find((b) => b.key === src.key) || BODIES[0];
            // CMS uses live eCFR when available; JC/DNV/ISO always use AI knowledge (copyrighted)
            const srcBadge = (src.key === "cms" && dataSource?.kind === "ecfr")
              ? { label: `📡 Live eCFR · ${dataSource.fetchDate}`, bg: "#ECFDF5", color: "#065F46", border: "#6EE7B7" }
              : { label: "🤖 AI Knowledge", bg: "#F1F5F9", color: "#475569", border: "#CBD5E1" };
            return (
              <div key={src.key} style={S.card}>
                <div style={S.sectionHead(bodyConfig.color, bodyConfig.bg)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                    <div>
                      <h3 style={{ ...S.sectionTitle(bodyConfig.color), fontSize: "14px" }}>{src.body}</h3>
                      {src.cfr && <div style={{ fontSize: "11px", color: bodyConfig.color, opacity: 0.75, marginTop: "2px" }}>{src.cfr}</div>}
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ padding: "2px 7px", borderRadius: "4px", fontSize: "10.5px", fontWeight: 700, background: srcBadge.bg, color: srcBadge.color, border: `1px solid ${srcBadge.border}` }}>
                        {srcBadge.label}
                      </span>
                      <span style={S.tag(bodyConfig.color, bodyConfig.bg)}>{src.standards?.length || 0} standards</span>
                    </div>
                  </div>
                </div>

                {src.standards?.map((std, idx) => (
                  <div key={idx} style={S.standardCard}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: bodyConfig.color }}>{std.code}</span>
                      {std.tag && <span style={S.tag(bodyConfig.color, bodyConfig.bg)}>{std.tag}</span>}
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#1A2332" }}>{std.title}</span>
                    </div>
                    <div style={{ marginBottom: "6px" }}>
                      <div style={S.fieldLabel}>Requirement</div>
                      <div style={S.fieldValue}>{std.requirement}</div>
                    </div>
                    {std.surveyorFocus && (
                      <div>
                        <div style={S.fieldLabel}>Surveyor Focus</div>
                        <div style={{ ...S.fieldValue, color: "#475569" }}>🔍 {std.surveyorFocus}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Policy Tab ──────────────────────────────────────────────────────────────

function PolicyTab({ institution }) {
  const [topic, setTopic] = useState(TOPICS[0]);
  const [customTopic, setCustomTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const inst = INSTITUTION_TYPES.find((i) => i.value === institution);

  async function generate() {
    const topicFinal = customTopic.trim() || topic;
    setLoading(true); setError(null); setResult(null);

    const systemPrompt = `You are a healthcare compliance policy expert. Generate a complete, professional policy template that a ${inst.label} can immediately adopt and customize.

Use [BRACKETED PLACEHOLDERS IN CAPS] where the institution must enter specific information.

Structure the policy as follows:
POLICY TITLE
Policy Number: [POLICY-XXX] | Effective Date: [DATE] | Review Date: [DATE] | Approved By: [TITLE]

PURPOSE
Cite the regulatory basis (CMS §, Joint Commission, DNV NIAHO, ISO 9001:2015).

SCOPE
Define who and what this policy covers.

POLICY STATEMENT
The core policy commitment.

DEFINITIONS
Key terms.

PROCEDURE
Numbered step-by-step procedures.

ROLES AND RESPONSIBILITIES
Bullet list by role/title.

MONITORING AND COMPLIANCE
How compliance will be measured and reported.

REFERENCES
Exact regulatory citations: CMS CFR, Joint Commission standard codes, DNV NIAHO codes, ISO 9001:2015 clauses.

DOCUMENT HISTORY
Version table.

Output as plain text only (no JSON, no markdown headers with #).`;

    const userContent = `Institution: ${inst.label} (${inst.cfr})\nPolicy Topic: ${topicFinal}`;

    try {
      const text = await callApi(systemPrompt, userContent, 4000);
      setResult(text.replace(/```[\w]*\n?|```/g, "").trim());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const topicFinal = customTopic.trim() || topic;

  function downloadTxt() {
    const blob = new Blob([result], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inst.label.replace(/\s+/g, "_")}_${topicFinal.replace(/\s+/g, "_")}_Policy.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={S.card}>
        <div style={S.row}>
          <div>
            <label style={S.label}>Topic Preset</label>
            <select style={S.select} value={topic} onChange={(e) => { setTopic(e.target.value); setCustomTopic(""); }}>
              {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Custom Topic (overrides preset)</label>
            <input style={S.input} type="text" value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder="e.g. Sharps Safety Program" />
          </div>
        </div>
        <button style={S.btnPrimary(loading)} onClick={generate} disabled={loading}>
          {loading ? "Generating…" : "Generate Policy Template"}
        </button>
        {error && <div style={S.error}>⚠️ {error}</div>}
      </div>

      {loading && <div style={S.card}><LoadingSpinner message="Drafting policy template with regulatory references…" /></div>}

      {result && !loading && (
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D5C6B" }}>Policy Template</div>
              <div style={{ fontSize: "11px", color: "#64748B" }}>{inst.label} · {topicFinal}</div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <CopyButton text={result} />
              <button style={S.btnSm} onClick={downloadTxt}>↓ .txt</button>
              <ExcelButton onClick={() => exportPolicyXlsx(result, inst, topicFinal)} />
            </div>
          </div>
          <hr style={S.divider} />
          <pre style={S.pre}>{result}</pre>
        </div>
      )}
    </div>
  );
}

// ─── Inspection Tab ──────────────────────────────────────────────────────────

function InspectionTab({ institution }) {
  const [dept, setDept] = useState(DEPARTMENTS[0]);
  const [govBodies, setGovBodies] = useState({ cms: true, tjc: false, dnv: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [responses, setResponses] = useState({});

  const inst = INSTITUTION_TYPES.find((i) => i.value === institution);
  const selectedBodies = Object.entries(govBodies).filter(([, v]) => v).map(([k]) => k.toUpperCase());

  async function generate() {
    setLoading(true); setError(null); setResult(null); setResponses({});

    const systemPrompt = `You are a healthcare inspection readiness expert. Generate a practical inspection readiness checklist.

Output ONLY valid JSON:
{
  "items": [
    {
      "id": "1",
      "area": "Documentation",
      "question": "Specific question a surveyor will ask or verify",
      "riskLevel": "High",
      "regulatoryBasis": "§482.42(a) / IC.01.01.01",
      "commonDeficiency": "What typically fails during surveys",
      "recommendation": "Specific action to prepare"
    }
  ]
}

Generate exactly 12 items. Cover these areas proportionally: Documentation, Policies & Procedures, Staff Training & Competency, Physical Environment, Patient Safety, and Ongoing Monitoring. Include a mix of High (4), Medium (5), and Low (3) risk items. Use real regulatory codes from the selected governing bodies.`;

    const bodies = selectedBodies.length ? selectedBodies.join(", ") : "CMS";
    const userContent = `Institution: ${inst.label} (${inst.cfr})\nDepartment: ${dept}\nGoverning Bodies: ${bodies}`;

    try {
      const raw = await callApi(systemPrompt, userContent, 3000);
      const data = repairJson(raw);
      setResult(data.items || data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const riskOrder = { High: 0, Medium: 1, Low: 2 };
  const sorted = result ? [...result].sort((a, b) => (riskOrder[a.riskLevel] ?? 3) - (riskOrder[b.riskLevel] ?? 3)) : [];

  const score = sorted.length
    ? Math.round((Object.values(responses).filter((v) => v === "yes").length / sorted.length) * 100)
    : null;

  return (
    <div>
      <div style={S.card}>
        <div style={S.row}>
          <div>
            <label style={S.label}>Department / Service Area</label>
            <select style={S.select} value={dept} onChange={(e) => setDept(e.target.value)}>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Governing Bodies</label>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", paddingTop: "6px" }}>
              {[["cms", "CMS"], ["tjc", "Joint Commission"], ["dnv", "DNV NIAHO"]].map(([key, lbl]) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                  <input type="checkbox" checked={govBodies[key]} onChange={(e) => setGovBodies({ ...govBodies, [key]: e.target.checked })} />
                  {lbl}
                </label>
              ))}
            </div>
          </div>
        </div>
        <button style={S.btnPrimary(loading)} onClick={generate} disabled={loading}>
          {loading ? "Generating…" : "Generate Inspection Readiness Checklist"}
        </button>
        {error && <div style={S.error}>⚠️ {error}</div>}
      </div>

      {loading && <div style={S.card}><LoadingSpinner message="Building inspection readiness checklist…" /></div>}

      {sorted.length > 0 && !loading && (
        <div>
          {/* Score bar */}
          <div style={{ ...S.card, borderLeft: "4px solid #0D5C6B" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: Object.keys(responses).length > 0 ? "8px" : 0 }}>
              <div>
                <span style={{ fontSize: "13px", fontWeight: 600 }}>Inspection Readiness Checklist</span>
                <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>{inst.label} · {dept}</div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {Object.keys(responses).length > 0 && (
                  <span style={{ fontSize: "20px", fontWeight: 700, color: score >= 80 ? "#065F46" : score >= 60 ? "#92400E" : "#991B1B" }}>{score}%</span>
                )}
                <CopyButton text={inspectionToText(sorted, responses, inst, dept)} label="Copy" />
                <ExcelButton onClick={() => exportInspectionXlsx(sorted, responses, inst, dept)} />
              </div>
            </div>
            {Object.keys(responses).length > 0 && (
              <>
                <div style={{ background: "#E2E8F0", borderRadius: "4px", height: "8px" }}>
                  <div style={{ background: score >= 80 ? "#10B981" : score >= 60 ? "#F59E0B" : "#EF4444", borderRadius: "4px", height: "8px", width: `${score}%`, transition: "width 0.4s" }} />
                </div>
                <div style={{ fontSize: "11px", color: "#64748B", marginTop: "6px" }}>
                  {Object.values(responses).filter((v) => v === "yes").length} of {sorted.length} items ready
                </div>
              </>
            )}
          </div>

          {/* Checklist items */}
          {sorted.map((item) => (
            <div key={item.id} style={{ ...S.card, borderLeft: `4px solid ${item.riskLevel === "High" ? "#DC2626" : item.riskLevel === "Medium" ? "#F59E0B" : "#10B981"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "6px" }}>
                    <span style={S.riskBadge(item.riskLevel)}>{item.riskLevel} Risk</span>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748B" }}>{item.area}</span>
                    {item.regulatoryBasis && <span style={{ fontSize: "11px", color: "#94A3B8", fontFamily: "monospace" }}>{item.regulatoryBasis}</span>}
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#1A2332", marginBottom: "10px" }}>{item.question}</div>

                  {item.commonDeficiency && (
                    <div style={{ marginBottom: "6px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#DC2626" }}>⚠ Common Deficiency: </span>
                      <span style={{ fontSize: "12px", color: "#475569" }}>{item.commonDeficiency}</span>
                    </div>
                  )}
                  {item.recommendation && (
                    <div>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#065F46" }}>✓ Recommendation: </span>
                      <span style={{ fontSize: "12px", color: "#475569" }}>{item.recommendation}</span>
                    </div>
                  )}
                </div>

                {/* Response buttons */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0 }}>
                  {[["yes", "✓ Ready", "#065F46", "#D1FAE5"], ["no", "✗ Gap", "#991B1B", "#FEE2E2"], ["na", "N/A", "#475569", "#F1F5F9"]].map(([val, lbl, color, bg]) => (
                    <button key={val} onClick={() => setResponses({ ...responses, [item.id]: val })}
                      style={{ padding: "5px 10px", fontSize: "11px", fontWeight: 700, border: `1px solid ${responses[item.id] === val ? color : "#CBD5E1"}`, borderRadius: "5px", cursor: "pointer", background: responses[item.id] === val ? bg : "#fff", color: responses[item.id] === val ? color : "#475569", minWidth: "70px" }}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Gap Scanner Tab ─────────────────────────────────────────────────────────

function GapScannerTab({ institution }) {
  const [topic, setTopic] = useState(TOPICS[0]);
  const [customTopic, setCustomTopic] = useState("");
  const [policyText, setPolicyText] = useState("");
  const [fileName, setFileName] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [resultMeta, setResultMeta] = useState(null); // { institution, topic, timestamp }
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadedEntryId, setLoadedEntryId] = useState(null); // which history entry is currently shown

  // Load history from localStorage on mount
  useEffect(() => {
    setHistory(loadGapHistory());
  }, []);

  const inst = INSTITUTION_TYPES.find((i) => i.value === institution);
  const topicFinal = customTopic.trim() || topic;

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    setFileLoading(true);
    setFileName(file.name);
    try {
      const text = await extractTextFromFile(file);
      setPolicyText(text);
    } catch (err) {
      setFileError(err.message);
      setFileName(null);
    } finally {
      setFileLoading(false);
    }
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  async function analyze() {
    if (!policyText.trim()) {
      setError("Please paste policy text or upload a document before analyzing.");
      return;
    }
    setLoading(true); setError(null); setResult(null);

    const systemPrompt = `You are a senior healthcare regulatory compliance auditor with expert knowledge of CMS Conditions of Participation, Joint Commission, DNV NIAHO, and ISO 9001:2015.

A user will provide an existing policy document. Your job is to identify compliance gaps against the regulatory standards that apply to the given institution type and policy topic.

Output ONLY valid JSON with this exact structure:
{
  "summary": "2-3 sentence executive summary of overall compliance posture",
  "score": 72,
  "met": [
    {
      "body": "CMS",
      "code": "§482.42(a)(1)",
      "title": "Requirement title",
      "finding": "Brief note on how the policy meets this requirement"
    }
  ],
  "weak": [
    {
      "body": "Joint Commission",
      "code": "IC.02.02.01",
      "title": "Requirement title",
      "finding": "Specific weakness or gap in the existing text",
      "recommendation": "Concrete action to strengthen coverage"
    }
  ],
  "missing": [
    {
      "body": "CMS",
      "code": "§482.42(b)",
      "title": "Requirement title",
      "finding": "Why this requirement is absent or completely unaddressed",
      "recommendation": "Specific language or section to add"
    }
  ]
}

Rules:
- "score" is an integer 0-100 representing overall compliance (0=nothing met, 100=fully compliant).
- Include 2-5 items per category (met/weak/missing), covering multiple regulatory bodies.
- Use real, accurate regulatory codes — CMS CFR section numbers, Joint Commission standard codes (e.g. IC.01.01.01), DNV NIAHO codes, ISO 9001:2015 clause numbers.
- "finding" should cite specific phrases or the absence of content from the uploaded policy.
- "recommendation" should be actionable — what exact language or element is needed.
- Do NOT fabricate citations. If a standard clearly does not apply, omit it.`;

    const charLimit = 12000;
    const truncated = policyText.length > charLimit
      ? policyText.slice(0, charLimit) + "\n[... document truncated for analysis ...]"
      : policyText;

    const userContent = `Institution Type: ${inst.label} (${inst.cfr})
Policy Topic: ${topicFinal}

POLICY TEXT TO ANALYZE:
${truncated}`;

    try {
      const raw = await callApi(systemPrompt, userContent, 4000);
      const parsed = repairJson(raw);
      setResult(parsed);
      const meta = { institution, topic: topicFinal };
      setResultMeta(meta);
      setLoadedEntryId(null); // fresh scan, not a loaded entry
      // Persist to localStorage
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        institution,
        institutionLabel: inst.label,
        topic: topicFinal,
        score: parsed.score ?? null,
        timestamp: new Date().toISOString(),
        result: parsed,
      };
      const updated = saveGapEntry(entry);
      setHistory(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function loadHistoryEntry(entry) {
    setResult(entry.result);
    setResultMeta({ institution: entry.institution, topic: entry.topic });
    setLoadedEntryId(entry.id);
    setShowHistory(false);
    // Sync selectors to match the loaded entry
    const matchedTopic = TOPICS.includes(entry.topic) ? entry.topic : TOPICS[0];
    setTopic(matchedTopic);
    setCustomTopic(TOPICS.includes(entry.topic) ? "" : entry.topic);
    setError(null);
  }

  function handleDeleteEntry(e, id) {
    e.stopPropagation();
    const updated = deleteGapEntry(id);
    setHistory(updated);
    if (loadedEntryId === id) {
      setResult(null);
      setResultMeta(null);
      setLoadedEntryId(null);
    }
  }

  const metCount    = result?.met?.length     || 0;
  const weakCount   = result?.weak?.length    || 0;
  const missingCount = result?.missing?.length || 0;
  const score       = result?.score           ?? null;

  const scoreColor = score === null ? "#64748B" : score >= 75 ? "#065F46" : score >= 50 ? "#92400E" : "#991B1B";
  const scoreBg    = score === null ? "#F1F5F9"  : score >= 75 ? "#D1FAE5"  : score >= 50 ? "#FEF3C7"  : "#FEE2E2";

  // Resolve institution + topic from saved metadata (used for display, copy, and export)
  // so that loading a historical entry from a different institution produces correct labels.
  const effectiveInst = resultMeta
    ? (INSTITUTION_TYPES.find((i) => i.value === resultMeta.institution) || inst)
    : inst;
  const effectiveTopic = resultMeta?.topic || topicFinal;

  const GapItem = ({ item, status }) => {
    const colors = {
      met:     { icon: "✅", color: "#065F46", bg: "#D1FAE5", border: "#6EE7B7" },
      weak:    { icon: "⚠️", color: "#92400E", bg: "#FEF3C7", border: "#FCD34D" },
      missing: { icon: "❌", color: "#991B1B", bg: "#FEE2E2", border: "#FCA5A5" },
    }[status];

    return (
      <div style={{ border: `1px solid ${colors.border}`, borderLeft: `4px solid ${colors.color === "#065F46" ? "#10B981" : colors.color === "#92400E" ? "#F59E0B" : "#EF4444"}`, borderRadius: "7px", padding: "12px 14px", marginBottom: "8px", background: "#FAFAFA" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "6px" }}>
          <span style={{ fontSize: "14px" }}>{colors.icon}</span>
          <span style={{ fontFamily: "monospace", fontSize: "11.5px", fontWeight: 700, color: "#475569", background: "#F1F5F9", padding: "1px 6px", borderRadius: "3px" }}>{item.code}</span>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748B", background: "#F1F5F9", padding: "1px 8px", borderRadius: "10px" }}>{item.body}</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#1A2332" }}>{item.title}</span>
        </div>
        <div style={{ marginBottom: status === "met" ? 0 : "6px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.4px" }}>Finding: </span>
          <span style={{ fontSize: "12.5px", color: "#334155" }}>{item.finding}</span>
        </div>
        {item.recommendation && (
          <div style={{ marginTop: "6px", padding: "7px 10px", background: "#F0FDF4", borderRadius: "5px", borderLeft: "3px solid #10B981" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#065F46" }}>RECOMMENDED FIX: </span>
            <span style={{ fontSize: "12.5px", color: "#1A2332" }}>{item.recommendation}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Input form */}
      <div style={S.card}>
        <div style={S.row}>
          <div>
            <label style={S.label}>Policy Topic</label>
            <select style={S.select} value={topic} onChange={(e) => { setTopic(e.target.value); setCustomTopic(""); }}>
              {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Custom Topic (overrides preset)</label>
            <input style={S.input} type="text" value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder="e.g. Hand Hygiene Compliance" />
          </div>
        </div>

        {/* Upload area */}
        <div style={{ marginBottom: "12px" }}>
          <label style={S.label}>Upload Policy Document (PDF or .txt)</label>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <label style={{ ...S.btnSm, display: "inline-block", cursor: "pointer", padding: "8px 14px", background: "#F8FAFC", borderStyle: "dashed" }}>
              {fileLoading ? "Reading…" : "📎 Choose File"}
              <input type="file" accept=".pdf,.txt,.doc,.docx,text/plain,application/pdf" style={{ display: "none" }} onChange={handleFile} disabled={fileLoading} />
            </label>
            {fileName && !fileLoading && (
              <span style={{ fontSize: "12px", color: "#065F46", fontWeight: 600 }}>✓ {fileName}</span>
            )}
            {fileLoading && <span style={{ fontSize: "12px", color: "#64748B" }}>Extracting text…</span>}
            {fileError && <span style={{ fontSize: "12px", color: "#DC2626" }}>⚠ {fileError}</span>}
          </div>
        </div>

        {/* Text area */}
        <div style={{ marginBottom: "14px" }}>
          <label style={S.label}>Or Paste Policy Text Directly</label>
          <textarea
            style={{ ...S.input, minHeight: "160px", resize: "vertical", lineHeight: 1.55, fontFamily: "system-ui, -apple-system, sans-serif" }}
            value={policyText}
            onChange={(e) => { setPolicyText(e.target.value); if (e.target.value !== policyText) setFileName(null); }}
            placeholder="Paste your existing policy document here…"
          />
          {policyText.length > 0 && (
            <div style={{ fontSize: "11px", color: "#94A3B8", marginTop: "4px", textAlign: "right" }}>
              {policyText.length.toLocaleString()} characters{policyText.length > 12000 ? " (will be truncated to ~12,000 for analysis)" : ""}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button style={{ ...S.btnPrimary(loading || fileLoading), flex: 1, marginTop: 0 }} onClick={analyze} disabled={loading || fileLoading}>
            {loading ? "Analyzing…" : "🔍 Scan for Compliance Gaps"}
          </button>
          <button
            style={{ padding: "12px 16px", fontSize: "13px", fontWeight: 600, border: "1px solid #CBD5E1", borderRadius: "7px", background: showHistory ? "#0D5C6B" : "#fff", color: showHistory ? "#fff" : "#475569", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
            onClick={() => setShowHistory((v) => !v)}
          >
            🕒 History{history.length > 0 ? ` (${history.length})` : ""}
          </button>
        </div>
        {error && <div style={S.error}>⚠️ {error}</div>}
      </div>

      {/* History panel */}
      {showHistory && (
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#1A2332" }}>Past Gap Analyses</div>
            <div style={{ fontSize: "11px", color: "#94A3B8" }}>Click a row to reload a result</div>
          </div>
          {history.length === 0 ? (
            <div style={{ color: "#94A3B8", fontSize: "13px", textAlign: "center", padding: "20px 0" }}>No saved analyses yet. Run a scan to start tracking history.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {history.map((entry) => {
                const scoreColor = entry.score === null ? "#64748B" : entry.score >= 75 ? "#065F46" : entry.score >= 50 ? "#92400E" : "#991B1B";
                const scoreBg   = entry.score === null ? "#F1F5F9"  : entry.score >= 75 ? "#D1FAE5"  : entry.score >= 50 ? "#FEF3C7"  : "#FEE2E2";
                const isLoaded  = loadedEntryId === entry.id;
                const instLabel = INSTITUTION_TYPES.find((i) => i.value === entry.institution)?.label || entry.institutionLabel || entry.institution;
                const date = new Date(entry.timestamp);
                const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
                const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                return (
                  <div
                    key={entry.id}
                    onClick={() => loadHistoryEntry(entry)}
                    style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "7px", border: `1px solid ${isLoaded ? "#0D5C6B" : "#E2E8F0"}`, background: isLoaded ? "#E8F4F5" : "#FAFAFA", cursor: "pointer", transition: "border-color 0.15s" }}
                  >
                    {entry.score !== null && (
                      <div style={{ padding: "4px 10px", borderRadius: "6px", background: scoreBg, color: scoreColor, fontWeight: 700, fontSize: "15px", flexShrink: 0, minWidth: "52px", textAlign: "center" }}>
                        {entry.score}%
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#1A2332", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.topic}</div>
                      <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>{instLabel}</div>
                    </div>
                    <div style={{ fontSize: "11px", color: "#94A3B8", flexShrink: 0, textAlign: "right" }}>
                      <div>{dateStr}</div>
                      <div>{timeStr}</div>
                    </div>
                    {isLoaded && <span style={{ fontSize: "11px", fontWeight: 700, color: "#0D5C6B", background: "#E8F4F5", padding: "2px 7px", borderRadius: "4px", border: "1px solid #0D5C6B", flexShrink: 0 }}>Loaded</span>}
                    <button
                      onClick={(e) => handleDeleteEntry(e, entry.id)}
                      style={{ padding: "3px 7px", fontSize: "11px", border: "1px solid #FCA5A5", borderRadius: "4px", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", flexShrink: 0 }}
                      title="Delete this entry"
                    >✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading && <div style={S.card}><LoadingSpinner message="Comparing policy against CMS, Joint Commission, DNV, and ISO 9001 standards…" /></div>}

      {result && !loading && (
        <div>
          {/* History banner when viewing a loaded entry */}
          {loadedEntryId && (() => {
            const entry = history.find((e) => e.id === loadedEntryId);
            if (!entry) return null;
            const date = new Date(entry.timestamp);
            const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
            const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
            return (
              <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "7px", padding: "10px 14px", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <span style={{ fontSize: "12.5px", color: "#1E40AF", fontWeight: 600 }}>
                  📂 Viewing saved result from {dateStr} at {timeStr}
                </span>
                <button
                  onClick={() => { setResult(null); setResultMeta(null); setLoadedEntryId(null); }}
                  style={{ padding: "4px 10px", fontSize: "12px", fontWeight: 600, border: "1px solid #93C5FD", borderRadius: "5px", background: "#DBEAFE", color: "#1E40AF", cursor: "pointer" }}
                >
                  Clear
                </button>
              </div>
            );
          })()}

          {/* Score summary */}
          <div style={{ ...S.card, borderLeft: "4px solid #0D5C6B" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#0D5C6B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Gap Analysis — {effectiveInst.label} · {effectiveTopic}
                </div>
                <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>{effectiveInst.cfr}</div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <CopyButton text={gapToText(result, effectiveInst, effectiveTopic)} />
                <ExcelButton onClick={() => exportGapXlsx(result, effectiveInst, effectiveTopic)} />
              </div>
            </div>

            {/* Scorecard row */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
              {score !== null && (
                <div style={{ padding: "8px 16px", borderRadius: "8px", background: scoreBg, color: scoreColor, fontWeight: 700, fontSize: "22px", minWidth: "80px", textAlign: "center" }}>
                  {score}%
                  <div style={{ fontSize: "10px", fontWeight: 600, opacity: 0.8, marginTop: "2px" }}>Compliance Score</div>
                </div>
              )}
              {[["✅", metCount, "Met", "#D1FAE5", "#065F46"], ["⚠️", weakCount, "Weak", "#FEF3C7", "#92400E"], ["❌", missingCount, "Missing", "#FEE2E2", "#991B1B"]].map(([icon, count, label, bg, color]) => (
                <div key={label} style={{ padding: "8px 16px", borderRadius: "8px", background: bg, color, fontWeight: 700, fontSize: "18px", minWidth: "70px", textAlign: "center" }}>
                  {icon} {count}
                  <div style={{ fontSize: "10px", fontWeight: 600, opacity: 0.8, marginTop: "2px" }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            {score !== null && (
              <div style={{ background: "#E2E8F0", borderRadius: "4px", height: "8px", marginBottom: "10px" }}>
                <div style={{ background: score >= 75 ? "#10B981" : score >= 50 ? "#F59E0B" : "#EF4444", borderRadius: "4px", height: "8px", width: `${score}%`, transition: "width 0.5s" }} />
              </div>
            )}

            <p style={{ margin: 0, fontSize: "13.5px", color: "#334155", lineHeight: 1.6 }}>{result.summary}</p>
          </div>

          {/* Met requirements */}
          {result.met?.length > 0 && (
            <div style={S.card}>
              <div style={{ ...S.sectionHead("#065F46", "#D1FAE5"), marginBottom: "12px" }}>
                <h3 style={{ ...S.sectionTitle("#065F46"), fontSize: "13px" }}>✅ Requirements Met ({metCount})</h3>
              </div>
              {result.met.map((item, idx) => <GapItem key={idx} item={item} status="met" />)}
            </div>
          )}

          {/* Weak coverage */}
          {result.weak?.length > 0 && (
            <div style={S.card}>
              <div style={{ ...S.sectionHead("#92400E", "#FEF3C7"), marginBottom: "12px" }}>
                <h3 style={{ ...S.sectionTitle("#92400E"), fontSize: "13px" }}>⚠️ Weak / Partial Coverage ({weakCount})</h3>
              </div>
              {result.weak.map((item, idx) => <GapItem key={idx} item={item} status="weak" />)}
            </div>
          )}

          {/* Missing requirements */}
          {result.missing?.length > 0 && (
            <div style={S.card}>
              <div style={{ ...S.sectionHead("#991B1B", "#FEE2E2"), marginBottom: "12px" }}>
                <h3 style={{ ...S.sectionTitle("#991B1B"), fontSize: "13px" }}>❌ Missing Requirements ({missingCount})</h3>
              </div>
              {result.missing.map((item, idx) => <GapItem key={idx} item={item} status="missing" />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function CoPGuidelineBuilder() {
  const [tab, setTab] = useState("guidelines");
  const [institution, setInstitution] = useState("hospital");

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ maxWidth: "960px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={S.headerTitle}>CMS CoP Compliance Suite</h1>
            <span style={{ fontSize: "11px", fontWeight: 700, background: "#F59E0B", color: "#78350F", padding: "2px 8px", borderRadius: "10px", letterSpacing: "0.5px" }}>BETA</span>
          </div>
          <p style={S.headerSub}>Guidelines · Policy Templates · Inspection Readiness · Policy Gap Scanner — CMS, Joint Commission, DNV NIAHO, ISO 9001:2015</p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ ...S.disclaimer, flex: 1, marginTop: "14px" }}>
              <strong>⚠ Important Disclaimer:</strong> This tool generates AI-assisted content for educational and preparation purposes only.
              Output is <strong>not legal advice</strong> and must be reviewed by qualified compliance counsel before implementation.
              Regulatory citations should be verified against current official sources. User assumes all liability.
            </div>
            <a href="mailto:HectorSamlut@outlook.com?subject=CMS CoP Compliance Suite Feedback&body=Institution type tested:%0ATabs used:%0AWhat worked well:%0AWhat could be improved:%0AOther suggestions:"
              style={{ display: "inline-block", marginTop: "14px", padding: "8px 14px", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "6px", color: "#fff", fontSize: "12px", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
              ✉ Share Feedback
            </a>
          </div>
        </div>
      </div>

      <div style={S.container}>
        {/* Institution selector */}
        <div style={{ ...S.card, marginBottom: "20px" }}>
          <label style={S.label}>Institution Type</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px" }}>
            {INSTITUTION_TYPES.map((inst) => (
              <button key={inst.value} onClick={() => setInstitution(inst.value)} style={{
                padding: "10px 12px", fontSize: "12px", fontWeight: 600, textAlign: "left",
                border: `2px solid ${institution === inst.value ? "#0D5C6B" : "#E2E8F0"}`,
                borderRadius: "7px", cursor: "pointer",
                background: institution === inst.value ? "#E8F4F5" : "#fff",
                color: institution === inst.value ? "#0D5C6B" : "#475569",
              }}>
                <div>{inst.label}</div>
                <div style={{ fontSize: "10px", fontWeight: 400, marginTop: "2px", opacity: 0.7 }}>{inst.cfr}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          <Tab label="📋 Compliance Guidelines" active={tab === "guidelines"} onClick={() => setTab("guidelines")} />
          <Tab label="📄 Policy Templates" active={tab === "policy"} onClick={() => setTab("policy")} />
          <Tab label="🔍 Inspection Readiness" active={tab === "inspection"} onClick={() => setTab("inspection")} />
          <Tab label="🩺 Policy Gap Scanner" active={tab === "gap"} onClick={() => setTab("gap")} />
        </div>

        {/* Tab content */}
        {tab === "guidelines" && <GuidelinesTab institution={institution} />}
        {tab === "policy"     && <PolicyTab     institution={institution} />}
        {tab === "inspection" && <InspectionTab institution={institution} />}
        {tab === "gap"        && <GapScannerTab institution={institution} />}
      </div>
    </div>
  );
}
