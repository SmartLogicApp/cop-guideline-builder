import { useState, useEffect } from "react";

const INSTITUTION_TYPES = [
  { value: "hospital", label: "Hospital", cfr: "42 CFR 482" },
  {
    value: "cah",
    label: "Critical Access Hospital",
    cfr: "42 CFR 485 Subpart F",
  },
  {
    value: "snf",
    label: "Skilled Nursing Facility",
    cfr: "42 CFR 483 Subpart B",
  },
  { value: "hha", label: "Home Health Agency", cfr: "42 CFR 484" },
  { value: "hospice", label: "Hospice", cfr: "42 CFR 418" },
  { value: "asc", label: "Ambulatory Surgical Center", cfr: "42 CFR 416" },
  { value: "esrd", label: "ESRD Facility", cfr: "42 CFR 494" },
  { value: "opt", label: "Rural Health Clinic", cfr: "42 CFR 491" },
];

const TOPIC_PRESETS = [
  "Infection Control & Prevention",
  "Quality Assessment & Performance Improvement",
  "Nursing Services",
  "Patient Rights",
  "Medical Records",
  "Emergency Preparedness",
  "Medication Management",
  "Discharge Planning",
];

const DEPARTMENTS_BY_INSTITUTION = {
  hospital: [
    "Nursing Services",
    "Emergency Department",
    "Intensive Care Unit (ICU)",
    "Psychiatric/Behavioral Health",
    "Surgery / Operating Room",
    "Medical Records / HIM",
    "Quality & Performance Improvement",
    "Infection Prevention & Control",
    "Laboratory",
    "Imaging / Radiology",
    "Interventional Radiology (IVR)",
    "Oncology",
    "Pharmacy",
    "Medical Staff Office",
    "Respiratory / Pulmonary",
    "Rehabilitation Services",
    "Nutrition / Dietary",
    "Administration & Governance",
  ],
  cah: [
    "Nursing Services",
    "Emergency Department",
    "Medical Records / HIM",
    "Quality & Performance Improvement",
    "Infection Prevention & Control",
    "Laboratory",
    "Imaging",
    "Medical Staff Office",
    "Administration & Governance",
  ],
  snf: [
    "Nursing Services",
    "Medical Records / HIM",
    "Quality & Performance Improvement",
    "Infection Prevention & Control",
    "Dietary Services",
    "Rehabilitation Services",
    "Medical Staff Office",
    "Administration & Governance",
  ],
  hha: [
    "Nursing Services",
    "Therapy Services",
    "Medical Records / HIM",
    "Infection Prevention & Control",
    "Quality & Performance Improvement",
    "Administration & Governance",
  ],
  hospice: [
    "Nursing Services",
    "Medical Records / HIM",
    "Social Services",
    "Spiritual Care",
    "Quality & Performance Improvement",
    "Administration & Governance",
  ],
  asc: [
    "Nursing Services",
    "Surgical Services / OR",
    "Medical Records / HIM",
    "Anesthesia",
    "Quality & Performance Improvement",
    "Infection Prevention & Control",
    "Administration & Governance",
  ],
  esrd: [
    "Nursing Services",
    "Dialysis Operations",
    "Vascular Access Management",
    "Medical Records / HIM",
    "Quality & Performance Improvement",
    "Infection Prevention & Control",
    "Administration & Governance",
  ],
  opt: [
    "Clinical Services",
    "Medical Records / HIM",
    "Quality & Performance Improvement",
    "Administration & Governance",
  ],
};

async function callModelForJson(systemPrompt, userContent, maxTokens) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  const responseText = await response.text();
  if (!responseText || !responseText.trim()) {
    throw new Error("Empty response from API");
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new Error("API response wasn't valid JSON");
  }

  if (data.error) throw new Error(data.error.message);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!data.content) throw new Error("No content in response");

  const textBlock = data.content.find((c) => c.type === "text");
  if (!textBlock) throw new Error("No text in response");

  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error("Generated text wasn't valid JSON");
  }
}

export default function CoPGuidelineBuilder() {
  const [activeTab, setActiveTab] = useState("guidelines");
  const [institutionType, setInstitutionType] = useState("hospital");
  const [topic, setTopic] = useState(TOPIC_PRESETS[0]);
  const [customTopic, setCustomTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [inspectionInstitution, setInspectionInstitution] =
    useState("hospital");
  const [inspectionDepartment, setInspectionDepartment] =
    useState("Nursing Services");
  const [inspectionCustomDepartment, setInspectionCustomDepartment] =
    useState("");
  const [inspectionAdditionalBody, setInspectionAdditionalBody] =
    useState("none");
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [inspectionError, setInspectionError] = useState(null);
  const [inspectionSurvey, setInspectionSurvey] = useState(null);
  const [surveyResponses, setSurveyResponses] = useState({});

  async function generateGuideline() {
    const inst = INSTITUTION_TYPES.find((i) => i.value === institutionType);
    const topicFinal = customTopic.trim() || topic;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const systemPrompt = `You are a CMS compliance expert. Generate a structured CoP guideline breakdown.

Output ONLY valid JSON, no preamble. Schema:
{
  "citationBase": "42 CFR 482",
  "topicSummary": "2-3 sentences",
  "conditions": [{
    "code": "§482.23",
    "title": "string",
    "summary": "2-4 sentences",
    "standards": [{
      "code": "§482.23(b)",
      "title": "string",
      "requirement": "2-3 sentences",
      "guideline": "2-4 sentences"
    }]
  }],
  "verificationNote": "brief note"
}

Include 2-4 conditions with 2-4 standards each.`;

      const userContent = `Institution: ${inst.label} (${inst.cfr})\nTopic: ${topicFinal}`;

      const data = await callModelForJson(systemPrompt, userContent, 3500);
      setResult(data);
    } catch (e) {
      setError(`Failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function generateInspectionSurvey() {
    const inst = INSTITUTION_TYPES.find(
      (i) => i.value === inspectionInstitution,
    );
    const deptFinal = inspectionCustomDepartment.trim() || inspectionDepartment;
    setInspectionLoading(true);
    setInspectionError(null);
    setSurveyResponses({});

    try {
      const bodies = ["CMS"];
      if (inspectionAdditionalBody !== "none") {
        bodies.push(inspectionAdditionalBody === "tjc" ? "TJC" : "DNV NIAHO");
      }

      const systemPrompt = `Generate an inspection readiness survey for a healthcare facility.

Output ONLY valid JSON:
{
  "surveyItems": [{
    "id": "item-1",
    "copCode": "§482.23",
    "question": "specific question",
    "riskLevel": "High|Medium|Low",
    "commonDeficiencies": ["issue1"],
    "recommendedActions": ["action1"]
  }]
}

Generate 15-20 items focused on this specific department.`;

      const userContent = `Institution: ${inst.label}\nDepartment: ${deptFinal}\nGoverning Bodies: ${bodies.join(", ")}`;

      const survey = await callModelForJson(systemPrompt, userContent, 4000);

      if (!survey.surveyItems || !Array.isArray(survey.surveyItems)) {
        throw new Error("Invalid survey structure");
      }

      setInspectionSurvey({
        institution: inst.label,
        department: deptFinal,
        governingBodies: bodies,
        items: survey.surveyItems,
      });
    } catch (e) {
      setInspectionError(`Failed: ${e.message}`);
    } finally {
      setInspectionLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F7F6F2",
        color: "#1C2B33",
        fontFamily: "-apple-system, sans-serif",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid #D9D5C7",
          padding: "28px 32px",
          background: "#F7F6F2",
        }}
      >
        <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
          <div
            style={{
              background: "#FBE9E7",
              border: "1px solid #D7CCC8",
              borderRadius: "6px",
              padding: "12px 16px",
              marginBottom: "16px",
              fontSize: "11px",
              lineHeight: 1.6,
              color: "#3E2C2C",
            }}
          >
            <strong>⚠️ IMPORTANT DISCLAIMER:</strong> This tool generates AI
            content. Output is <strong>NOT legal advice</strong>. Must be
            reviewed by compliance counsel before use. User assumes all
            liability.
          </div>

          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "28px",
              fontWeight: 700,
              margin: "0 0 16px",
            }}
          >
            CMS CoP Guideline Builder & Inspection Readiness
          </h1>

          <div style={{ display: "flex", gap: "2px", marginBottom: "16px" }}>
            {["guidelines", "inspection"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: activeTab === tab ? "#2C6E6E" : "#EDEAE0",
                  color: activeTab === tab ? "#F7F6F2" : "#1C2B33",
                  border: "none",
                  borderRadius: "5px 5px 0 0",
                  padding: "10px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {tab === "guidelines"
                  ? "Generate Guidelines"
                  : "Inspection Readiness"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div
        style={{ maxWidth: "1000px", margin: "0 auto", padding: "28px 32px" }}
      >
        {activeTab === "guidelines" ? (
          <div>
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #D9D5C7",
                borderRadius: "6px",
                padding: "20px",
                marginBottom: "20px",
              }}
            >
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    color: "#5C6B72",
                    marginBottom: "6px",
                  }}
                >
                  Institution
                </label>
                <select
                  value={institutionType}
                  onChange={(e) => setInstitutionType(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    fontSize: "13px",
                    border: "1px solid #D9D5C7",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                >
                  {INSTITUTION_TYPES.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    color: "#5C6B72",
                    marginBottom: "6px",
                  }}
                >
                  Topic
                </label>
                <select
                  value={topic}
                  onChange={(e) => {
                    setTopic(e.target.value);
                    setCustomTopic("");
                  }}
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    fontSize: "13px",
                    border: "1px solid #D9D5C7",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                    marginBottom: "8px",
                  }}
                >
                  {TOPIC_PRESETS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  placeholder="Or enter custom topic..."
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    fontSize: "13px",
                    border: "1px solid #D9D5C7",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                    marginBottom: "16px",
                  }}
                />
              </div>

              <button
                onClick={generateGuideline}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: loading ? "#8A8272" : "#2C6E6E",
                  color: "#F7F6F2",
                  border: "none",
                  borderRadius: "5px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {loading ? "Generating..." : "Generate guideline"}
              </button>

              {error && (
                <div
                  style={{
                    color: "#A8390A",
                    fontSize: "13px",
                    marginTop: "10px",
                  }}
                >
                  {error}
                </div>
              )}
            </div>

            {result && (
              <div
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #D9D5C7",
                  borderRadius: "6px",
                  padding: "20px",
                }}
              >
                <h2 style={{ margin: "0 0 12px 0", fontSize: "18px" }}>
                  {result.citationBase}
                </h2>
                <p
                  style={{
                    margin: "0 0 16px 0",
                    fontSize: "13px",
                    color: "#5C6B72",
                    lineHeight: 1.6,
                  }}
                >
                  {result.topicSummary}
                </p>

                {result.conditions &&
                  result.conditions.map((cond, cIdx) => (
                    <div
                      key={cIdx}
                      style={{
                        marginBottom: "18px",
                        paddingBottom: "18px",
                        borderBottom: "1px solid #EDEAE0",
                      }}
                    >
                      <div
                        style={{
                          background: "#DDE7E6",
                          display: "inline-block",
                          padding: "4px 8px",
                          borderRadius: "3px",
                          fontSize: "10px",
                          fontWeight: 700,
                          marginBottom: "6px",
                        }}
                      >
                        {cond.code}
                      </div>
                      <h3 style={{ margin: "6px 0", fontSize: "15px" }}>
                        {cond.title}
                      </h3>
                      <p
                        style={{
                          margin: "8px 0",
                          fontSize: "13px",
                          color: "#5C6B72",
                          lineHeight: 1.6,
                        }}
                      >
                        {cond.summary}
                      </p>

                      {cond.standards &&
                        cond.standards.map((std, sIdx) => (
                          <div
                            key={sIdx}
                            style={{
                              marginLeft: "16px",
                              marginBottom: "12px",
                              padding: "10px",
                              background: "#FBFAF7",
                              borderRadius: "4px",
                              borderLeft: "3px solid #2C6E6E",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "11px",
                                fontFamily: "monospace",
                                color: "#5C6B72",
                                fontWeight: 600,
                                marginBottom: "4px",
                              }}
                            >
                              {std.code}
                            </div>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: "12px",
                                marginBottom: "6px",
                              }}
                            >
                              {std.title}
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#333",
                                lineHeight: 1.5,
                                marginBottom: "4px",
                              }}
                            >
                              <strong>Requirement:</strong> {std.requirement}
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#333",
                                lineHeight: 1.5,
                              }}
                            >
                              <strong>Guideline:</strong> {std.guideline}
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}

                {result.verificationNote && (
                  <div
                    style={{
                      padding: "12px",
                      background: "#FBF3E4",
                      border: "1px solid #E8D9B5",
                      borderRadius: "5px",
                      fontSize: "12px",
                      color: "#6B4E1E",
                    }}
                  >
                    <strong>⚠️ Verify:</strong> {result.verificationNote}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #D9D5C7",
                borderRadius: "6px",
                padding: "20px",
                marginBottom: "20px",
              }}
            >
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    color: "#5C6B72",
                    marginBottom: "6px",
                  }}
                >
                  Institution
                </label>
                <select
                  value={inspectionInstitution}
                  onChange={(e) => {
                    setInspectionInstitution(e.target.value);
                    setInspectionDepartment(
                      DEPARTMENTS_BY_INSTITUTION[e.target.value][0],
                    );
                  }}
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    fontSize: "13px",
                    border: "1px solid #D9D5C7",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                >
                  {INSTITUTION_TYPES.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    color: "#5C6B72",
                    marginBottom: "6px",
                  }}
                >
                  Department
                </label>
                <select
                  value={inspectionDepartment}
                  onChange={(e) => {
                    setInspectionDepartment(e.target.value);
                    setInspectionCustomDepartment("");
                  }}
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    fontSize: "13px",
                    border: "1px solid #D9D5C7",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                    marginBottom: "8px",
                  }}
                >
                  {(
                    DEPARTMENTS_BY_INSTITUTION[inspectionInstitution] || []
                  ).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={inspectionCustomDepartment}
                  onChange={(e) =>
                    setInspectionCustomDepartment(e.target.value)
                  }
                  placeholder="Or enter custom department..."
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    fontSize: "13px",
                    border: "1px solid #D9D5C7",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                    marginBottom: "16px",
                  }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    color: "#5C6B72",
                    marginBottom: "6px",
                  }}
                >
                  Additional Governing Body
                </label>
                <select
                  value={inspectionAdditionalBody}
                  onChange={(e) => setInspectionAdditionalBody(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    fontSize: "13px",
                    border: "1px solid #D9D5C7",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="none">None (CMS only)</option>
                  <option value="tjc">The Joint Commission (TJC)</option>
                  <option value="dnv">DNV NIAHO</option>
                </select>
              </div>

              <button
                onClick={generateInspectionSurvey}
                disabled={inspectionLoading}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: inspectionLoading ? "#8A8272" : "#2C6E6E",
                  color: "#F7F6F2",
                  border: "none",
                  borderRadius: "5px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {inspectionLoading
                  ? "Generating survey..."
                  : "Generate inspection readiness survey"}
              </button>

              {inspectionError && (
                <div
                  style={{
                    color: "#A8390A",
                    fontSize: "13px",
                    marginTop: "10px",
                  }}
                >
                  {inspectionError}
                </div>
              )}
            </div>

            {inspectionSurvey && (
              <div
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #D9D5C7",
                  borderRadius: "6px",
                  padding: "20px",
                }}
              >
                <h2 style={{ margin: "0 0 6px 0", fontSize: "18px" }}>
                  {inspectionSurvey.institution}
                </h2>
                <p
                  style={{
                    margin: "0 0 16px 0",
                    fontSize: "12px",
                    color: "#5C6B72",
                  }}
                >
                  <strong>Department:</strong> {inspectionSurvey.department} |{" "}
                  <strong>Bodies:</strong>{" "}
                  {inspectionSurvey.governingBodies.join(", ")}
                </p>

                <div
                  style={{
                    padding: "12px",
                    background: "#F0F7F6",
                    border: "1px solid #B8DCC8",
                    borderRadius: "5px",
                    fontSize: "12px",
                    marginBottom: "16px",
                  }}
                >
                  📋 <strong>Instructions:</strong> Rate each item. Red flags
                  show common deficiency areas.
                </div>

                <div
                  style={{
                    maxHeight: "600px",
                    overflowY: "auto",
                    marginBottom: "16px",
                  }}
                >
                  {inspectionSurvey.items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        marginBottom: "12px",
                        padding: "12px",
                        border: "1px solid #D9D5C7",
                        borderLeft: `4px solid ${item.riskLevel === "High" ? "#A8390A" : item.riskLevel === "Medium" ? "#C85A00" : "#2C6E6E"}`,
                        borderRadius: "4px",
                        background: "#FBFAF7",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "12px",
                          marginBottom: "6px",
                        }}
                      >
                        {item.copCode}: {item.question}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#5C6B72",
                          marginBottom: "8px",
                        }}
                      >
                        Risk: <strong>{item.riskLevel}</strong>
                      </div>
                      {item.commonDeficiencies &&
                        item.commonDeficiencies.length > 0 && (
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#A8390A",
                              marginBottom: "8px",
                            }}
                          >
                            🚩 {item.commonDeficiencies.join(", ")}
                          </div>
                        )}
                      <div style={{ display: "flex", gap: "6px" }}>
                        {["notReady", "partiallyReady", "ready"].map(
                          (level) => (
                            <button
                              key={level}
                              onClick={() =>
                                setSurveyResponses({
                                  ...surveyResponses,
                                  [item.id]: level,
                                })
                              }
                              style={{
                                padding: "4px 8px",
                                fontSize: "10px",
                                fontWeight: 600,
                                background:
                                  surveyResponses[item.id] === level
                                    ? "#2C6E6E"
                                    : "#F7F6F2",
                                color:
                                  surveyResponses[item.id] === level
                                    ? "#F7F6F2"
                                    : "#2C6E6E",
                                border: "1px solid #2C6E6E",
                                borderRadius: "3px",
                                cursor: "pointer",
                              }}
                            >
                              {level === "notReady"
                                ? "Not Ready"
                                : level === "partiallyReady"
                                  ? "Partially Ready"
                                  : "Ready"}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  style={{
                    width: "100%",
                    padding: "12px",
                    background: "#2C6E6E",
                    color: "#F7F6F2",
                    border: "none",
                    borderRadius: "5px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  📊 Export as PDF / Excel (coming soon)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
