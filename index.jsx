import React, { useState, useEffect } from "react";

const INSTITUTION_TYPES = [
  { value: "hospital", label: "Hospital", cfr: "42 CFR 482" },
  { value: "cah", label: "Critical Access Hospital", cfr: "42 CFR 485" },
  { value: "snf", label: "Skilled Nursing Facility", cfr: "42 CFR 483" },
  { value: "hh", label: "Home Health Agency", cfr: "42 CFR 484" },
  { value: "hospice", label: "Hospice", cfr: "42 CFR 418" },
  { value: "asc", label: "Ambulatory Surgery Center", cfr: "42 CFR 416" },
  { value: "esrd", label: "ESRD Facility", cfr: "42 CFR 494" },
  { value: "rhc", label: "Rural Health Clinic/FQHC", cfr: "42 CFR 491" },
];

const TOPIC_PRESETS = [
  "Infection Control & Prevention",
  "Handwashing & Hand Hygiene",
  "Patient Safety & Fall Prevention",
  "Staff Competency & Training",
  "Medical Records & Documentation",
  "Medication Management",
  "Quality Assurance & Performance Improvement",
  "Governing Body Oversight",
];

const DEPARTMENTS = [
  "Nursing Services",
  "Quality & Compliance",
  "Infection Prevention",
  "Medical Records",
  "Pharmacy",
  "Laboratory",
  "Radiology",
  "Surgery",
  "Emergency Department",
  "ICU",
  "Maternal/Child Health",
  "Rehabilitation Services",
  "Food & Nutrition",
  "Environmental Services",
  "Maintenance",
  "Administration",
  "Human Resources",
  "Finance",
];

export default function CoPGuidelineBuilder() {
  const [activeTab, setActiveTab] = useState("guidelines");

  // Guidelines state
  const [guidelineInst, setGuidelineInst] = useState("hospital");
  const [guidelineTopic, setGuidelineTopic] = useState(TOPIC_PRESETS[0]);
  const [guidelineCustomTopic, setGuidelineCustomTopic] = useState("");
  const [guidelineLoading, setGuidelineLoading] = useState(false);
  const [guidelineError, setGuidelineError] = useState(null);
  const [guidelineResult, setGuidelineResult] = useState(null);
  const [guidelineJobId, setGuidelineJobId] = useState(null);

  // Inspection state
  const [inspectionInst, setInspectionInst] = useState("hospital");
  const [inspectionDept, setInspectionDept] = useState(DEPARTMENTS[0]);
  const [inspectionGovBodies, setInspectionGovBodies] = useState(["cms"]);
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [inspectionError, setInspectionError] = useState(null);
  const [inspectionResult, setInspectionResult] = useState(null);
  const [inspectionJobId, setInspectionJobId] = useState(null);

  // Policy state
  const [policyInst, setPolicyInst] = useState("hospital");
  const [policyTopic, setPolicyTopic] = useState(TOPIC_PRESETS[0]);
  const [policyCustomTopic, setPolicyCustomTopic] = useState("");
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState(null);
  const [policyResult, setPolicyResult] = useState(null);
  const [policyJobId, setPolicyJobId] = useState(null);

  // Poll for job results
  useEffect(() => {
    if (!guidelineJobId) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/generate/result?jobId=${guidelineJobId}`);
        const job = await res.json();
        if (job.status === "done") {
          const text = job.content[0].text;
          const cleaned = text.replace(/```json|```/g, "").trim();
          setGuidelineResult(JSON.parse(cleaned));
          setGuidelineLoading(false);
          setGuidelineJobId(null);
          clearInterval(poll);
        } else if (job.status === "error") {
          setGuidelineError(job.error);
          setGuidelineLoading(false);
          setGuidelineJobId(null);
          clearInterval(poll);
        }
      } catch (e) {
        setGuidelineError(e.message);
        setGuidelineLoading(false);
        setGuidelineJobId(null);
        clearInterval(poll);
      }
    }, 1000);
    return () => clearInterval(poll);
  }, [guidelineJobId]);

  useEffect(() => {
    if (!inspectionJobId) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/generate/result?jobId=${inspectionJobId}`,
        );
        const job = await res.json();
        if (job.status === "done") {
          const text = job.content[0].text;
          const cleaned = text.replace(/```json|```/g, "").trim();
          setInspectionResult(JSON.parse(cleaned));
          setInspectionLoading(false);
          setInspectionJobId(null);
          clearInterval(poll);
        } else if (job.status === "error") {
          setInspectionError(job.error);
          setInspectionLoading(false);
          setInspectionJobId(null);
          clearInterval(poll);
        }
      } catch (e) {
        setInspectionError(e.message);
        setInspectionLoading(false);
        setInspectionJobId(null);
        clearInterval(poll);
      }
    }, 1000);
    return () => clearInterval(poll);
  }, [inspectionJobId]);

  useEffect(() => {
    if (!policyJobId) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/generate/result?jobId=${policyJobId}`);
        const job = await res.json();
        if (job.status === "done") {
          const text = job.content[0].text;
          setPolicyResult(text);
          setPolicyLoading(false);
          setPolicyJobId(null);
          clearInterval(poll);
        } else if (job.status === "error") {
          setPolicyError(job.error);
          setPolicyLoading(false);
          setPolicyJobId(null);
          clearInterval(poll);
        }
      } catch (e) {
        setPolicyError(e.message);
        setPolicyLoading(false);
        setPolicyJobId(null);
        clearInterval(poll);
      }
    }, 1000);
    return () => clearInterval(poll);
  }, [policyJobId]);

  async function generateGuideline() {
    const inst = INSTITUTION_TYPES.find((i) => i.value === guidelineInst);
    const topicFinal = guidelineCustomTopic.trim() || guidelineTopic;
    setGuidelineLoading(true);
    setGuidelineError(null);
    setGuidelineResult(null);

    const systemPrompt = `You are a healthcare compliance expert specializing in CMS Conditions of Participation, Joint Commission standards, DNV NIAHO, and ISO 9001:2015.

Generate a comprehensive guideline covering the topic with:
1. 15-20+ standards from multiple sources
2. Each standard must cite: CMS CFR section, Joint Commission standard code, DNV NIAHO standard, and ISO 9001 clause
3. For each standard: requirement and practical implementation guideline
4. Include surveyor expectations and deficiency risks
5. Reference exact regulatory text and current industry best practices

Output ONLY valid JSON:
{
  "standards": [
    {
      "number": "482.42(a)",
      "title": "Standard Title",
      "sources": ["CMS §482.42(a)", "JC IC.01.01.01", "DNV NIAHO 4.1.2", "ISO 9001:2015 8.5"],
      "requirement": "...",
      "practicalGuideline": "...",
      "surveyorExpectations": "...",
      "commonDeficiencies": ["..."]
    }
  ]
}`;

    const userContent = `Institution: ${inst.label} (${inst.cfr})\nTopic: ${topicFinal}\n\nGenerate comprehensive, detailed guidelines covering all applicable CMS, Joint Commission, DNV, and ISO standards for this topic.`;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt,
          userContent,
          maxTokens: 7000,
        }),
      });
      const { jobId } = await res.json();
      setGuidelineJobId(jobId);
    } catch (e) {
      setGuidelineError(`Failed: ${e.message}`);
      setGuidelineLoading(false);
    }
  }

  async function generateInspection() {
    const inst = INSTITUTION_TYPES.find((i) => i.value === inspectionInst);
    const deptFinal = inspectionDept;
    const bodies = inspectionGovBodies.map((b) => {
      if (b === "cms") return "CMS";
      if (b === "tjc") return "Joint Commission";
      if (b === "dnv") return "DNV NIAHO";
      return b;
    });

    setInspectionLoading(true);
    setInspectionError(null);
    setInspectionResult(null);

    const systemPrompt = `You are a healthcare inspection compliance expert. Generate an inspection readiness survey.

Output ONLY valid JSON:
{
  "surveyItems": [
    {
      "id": "item-1",
      "question": "specific question",
      "riskLevel": "High|Medium|Low",
      "governingBody": "CMS|JC|DNV",
      "standard": "exact standard reference",
      "commonDeficiencies": ["issue1"],
      "readinessChecklist": ["check1"]
    }
  ]
}

Generate 15-20 items distributed across ALL selected governing bodies.`;

    const userContent = `Institution: ${inst.label}\nDepartment: ${deptFinal}\nGoverning Bodies: ${bodies.join(", ")}\n\nGenerate inspection readiness items covering EACH governing body with clear attribution.`;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt,
          userContent,
          maxTokens: 5000,
        }),
      });
      const { jobId } = await res.json();
      setInspectionJobId(jobId);
    } catch (e) {
      setInspectionError(`Failed: ${e.message}`);
      setInspectionLoading(false);
    }
  }

  async function generatePolicy() {
    const inst = INSTITUTION_TYPES.find((i) => i.value === policyInst);
    const topicFinal = policyCustomTopic.trim() || policyTopic;
    setPolicyLoading(true);
    setPolicyError(null);
    setPolicyResult(null);

    const systemPrompt = `You are a healthcare compliance policy expert. Generate a professional, comprehensive policy template that institutions can immediately adopt and customize.

The policy must include:
1. Header with [INSTITUTION NAME] and [DATE] placeholders
2. Purpose section citing CMS §482, Joint Commission, DNV NIAHO, ISO 9001:2015
3. Scope with [SPECIFY DEPARTMENTS/ROLES] placeholders
4. Detailed policy requirements with [INSTITUTION-SPECIFIC] sections for customization
5. Compliance monitoring and audit procedures
6. Reference to exact regulatory standards with CFR citations
7. Roles and responsibilities with [TITLE] placeholders
8. Documentation and record-keeping requirements

Format as a professional, ready-to-use policy document. Use [BRACKETED PLACEHOLDERS IN CAPS] where the institution must enter their own information.`;

    const userContent = `Institution Type: ${inst.label} (${inst.cfr})\nTopic: ${topicFinal}\n\nGenerate a complete, professional policy template that this institution can adopt, customize, and implement immediately.`;

    try {
      const res = await fetch("/api/generate-policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt,
          userContent,
          maxTokens: 6000,
        }),
      });
      const { jobId } = await res.json();
      setPolicyJobId(jobId);
    } catch (e) {
      setPolicyError(`Failed: ${e.message}`);
      setPolicyLoading(false);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  }

  function downloadAsText(text, filename) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F7F6F2",
        padding: "20px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Disclaimer Banner */}
      <div
        style={{
          background: "#FDB913",
          border: "1px solid #F59E0B",
          borderRadius: "6px",
          padding: "12px 16px",
          marginBottom: "20px",
          color: "#78350F",
          fontSize: "12px",
          lineHeight: 1.5,
        }}
      >
        ⚠️ <strong>AI-Generated Content Disclaimer:</strong> This tool generates
        compliance guidance based on AI analysis. It is NOT legal advice. All
        output must be reviewed and approved by qualified healthcare compliance
        counsel and legal advisors before implementation.
      </div>

      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "8px" }}>
          CMS CoP Guideline Builder & Inspection Readiness
        </h1>
        <p style={{ fontSize: "14px", color: "#5C6B72", marginBottom: "20px" }}>
          Generate compliance guidelines, inspection checklists, and policy
          templates
        </p>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "20px",
            borderBottom: "2px solid #D9D5C7",
          }}
        >
          <button
            onClick={() => setActiveTab("guidelines")}
            style={{
              padding: "12px 16px",
              fontSize: "13px",
              fontWeight: 600,
              background:
                activeTab === "guidelines" ? "#2C6E6E" : "transparent",
              color: activeTab === "guidelines" ? "#F7F6F2" : "#5C6B72",
              border: "none",
              borderBottom:
                activeTab === "guidelines" ? "2px solid #2C6E6E" : "none",
              cursor: "pointer",
            }}
          >
            Generate Guidelines
          </button>
          <button
            onClick={() => setActiveTab("inspection")}
            style={{
              padding: "12px 16px",
              fontSize: "13px",
              fontWeight: 600,
              background:
                activeTab === "inspection" ? "#2C6E6E" : "transparent",
              color: activeTab === "inspection" ? "#F7F6F2" : "#5C6B72",
              border: "none",
              borderBottom:
                activeTab === "inspection" ? "2px solid #2C6E6E" : "none",
              cursor: "pointer",
            }}
          >
            Inspection Readiness
          </button>
          <button
            onClick={() => setActiveTab("policy")}
            style={{
              padding: "12px 16px",
              fontSize: "13px",
              fontWeight: 600,
              background: activeTab === "policy" ? "#2C6E6E" : "transparent",
              color: activeTab === "policy" ? "#F7F6F2" : "#5C6B72",
              border: "none",
              borderBottom:
                activeTab === "policy" ? "2px solid #2C6E6E" : "none",
              cursor: "pointer",
            }}
          >
            Generate Policy
          </button>
        </div>

        {/* Guidelines Tab */}
        {activeTab === "guidelines" && (
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
                  Institution Type
                </label>
                <select
                  value={guidelineInst}
                  onChange={(e) => setGuidelineInst(e.target.value)}
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
                  value={guidelineTopic}
                  onChange={(e) => {
                    setGuidelineTopic(e.target.value);
                    setGuidelineCustomTopic("");
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
                  value={guidelineCustomTopic}
                  onChange={(e) => setGuidelineCustomTopic(e.target.value)}
                  placeholder="Or enter custom topic..."
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    fontSize: "13px",
                    border: "1px solid #D9D5C7",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                onClick={generateGuideline}
                disabled={guidelineLoading}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: guidelineLoading ? "#8A8272" : "#2C6E6E",
                  color: "#F7F6F2",
                  border: "none",
                  borderRadius: "5px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {guidelineLoading ? "Generating..." : "Generate guideline"}
              </button>

              {guidelineError && (
                <div
                  style={{
                    color: "#A8390A",
                    fontSize: "13px",
                    marginTop: "10px",
                  }}
                >
                  {guidelineError}
                </div>
              )}
            </div>

            {guidelineResult && (
              <div
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #D9D5C7",
                  borderRadius: "6px",
                  padding: "20px",
                }}
              >
                <div
                  style={{ display: "flex", gap: "8px", marginBottom: "16px" }}
                >
                  <button
                    onClick={() =>
                      copyToClipboard(JSON.stringify(guidelineResult, null, 2))
                    }
                    style={{
                      padding: "8px 12px",
                      fontSize: "12px",
                      background: "#2C6E6E",
                      color: "#F7F6F2",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Copy Full Text
                  </button>
                  <button
                    onClick={() =>
                      downloadAsText(
                        JSON.stringify(guidelineResult, null, 2),
                        "guidelines.txt",
                      )
                    }
                    style={{
                      padding: "8px 12px",
                      fontSize: "12px",
                      background: "#5C6B72",
                      color: "#F7F6F2",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Download .txt
                  </button>
                </div>

                {guidelineResult.standards &&
                  guidelineResult.standards.map((std, idx) => (
                    <div
                      key={idx}
                      style={{
                        marginBottom: "24px",
                        borderBottom: "1px solid #D9D5C7",
                        paddingBottom: "16px",
                      }}
                    >
                      <h3
                        style={{
                          fontSize: "14px",
                          fontWeight: 700,
                          marginBottom: "6px",
                        }}
                      >
                        {std.number} — {std.title}
                      </h3>
                      <p
                        style={{
                          fontSize: "12px",
                          color: "#5C6B72",
                          marginBottom: "8px",
                        }}
                      >
                        <strong>Sources:</strong> {std.sources.join(" • ")}
                      </p>
                      <p
                        style={{
                          fontSize: "12px",
                          lineHeight: 1.6,
                          marginBottom: "8px",
                        }}
                      >
                        <strong>Requirement:</strong> {std.requirement}
                      </p>
                      <p
                        style={{
                          fontSize: "12px",
                          lineHeight: 1.6,
                          marginBottom: "8px",
                        }}
                      >
                        <strong>Practical Guideline:</strong>{" "}
                        {std.practicalGuideline}
                      </p>
                      <p
                        style={{
                          fontSize: "12px",
                          lineHeight: 1.6,
                          marginBottom: "8px",
                        }}
                      >
                        <strong>Surveyor Expectations:</strong>{" "}
                        {std.surveyorExpectations}
                      </p>
                      {std.commonDeficiencies &&
                        std.commonDeficiencies.length > 0 && (
                          <p
                            style={{
                              fontSize: "12px",
                              lineHeight: 1.6,
                              color: "#A8390A",
                            }}
                          >
                            <strong>Common Deficiencies:</strong>{" "}
                            {std.commonDeficiencies.join(", ")}
                          </p>
                        )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Inspection Tab */}
        {activeTab === "inspection" && (
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
                  Institution Type
                </label>
                <select
                  value={inspectionInst}
                  onChange={(e) => setInspectionInst(e.target.value)}
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
                  value={inspectionDept}
                  onChange={(e) => setInspectionDept(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    fontSize: "13px",
                    border: "1px solid #D9D5C7",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
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
                  Governing Bodies
                </label>
                <div>
                  {["cms", "tjc", "dnv"].map((body) => (
                    <label
                      key={body}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: "8px",
                        fontSize: "12px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={inspectionGovBodies.includes(body)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setInspectionGovBodies([
                              ...inspectionGovBodies,
                              body,
                            ]);
                          } else {
                            setInspectionGovBodies(
                              inspectionGovBodies.filter((b) => b !== body),
                            );
                          }
                        }}
                        style={{ marginRight: "8px" }}
                      />
                      {body === "cms" && "CMS"}
                      {body === "tjc" && "Joint Commission"}
                      {body === "dnv" && "DNV NIAHO"}
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={generateInspection}
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
                {inspectionLoading ? "Generating..." : "Generate survey"}
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

            {inspectionResult && (
              <div
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #D9D5C7",
                  borderRadius: "6px",
                  padding: "20px",
                }}
              >
                <div
                  style={{ display: "flex", gap: "8px", marginBottom: "16px" }}
                >
                  <button
                    onClick={() =>
                      copyToClipboard(JSON.stringify(inspectionResult, null, 2))
                    }
                    style={{
                      padding: "8px 12px",
                      fontSize: "12px",
                      background: "#2C6E6E",
                      color: "#F7F6F2",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Copy Full Text
                  </button>
                  <button
                    onClick={() =>
                      downloadAsText(
                        JSON.stringify(inspectionResult, null, 2),
                        "inspection-survey.txt",
                      )
                    }
                    style={{
                      padding: "8px 12px",
                      fontSize: "12px",
                      background: "#5C6B72",
                      color: "#F7F6F2",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Download .txt
                  </button>
                </div>

                {inspectionResult.surveyItems &&
                  inspectionResult.surveyItems.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        marginBottom: "16px",
                        borderBottom: "1px solid #D9D5C7",
                        paddingBottom: "12px",
                      }}
                    >
                      <h4
                        style={{
                          fontSize: "13px",
                          fontWeight: 700,
                          marginBottom: "4px",
                        }}
                      >
                        {item.question}
                      </h4>
                      <p
                        style={{
                          fontSize: "11px",
                          color: "#5C6B72",
                          marginBottom: "4px",
                        }}
                      >
                        <strong>Risk:</strong>{" "}
                        <span
                          style={{
                            color:
                              item.riskLevel === "High"
                                ? "#A8390A"
                                : item.riskLevel === "Medium"
                                  ? "#F59E0B"
                                  : "#059669",
                          }}
                        >
                          {item.riskLevel}
                        </span>
                        {" | "}
                        <strong>Body:</strong> {item.governingBody}
                        {" | "}
                        <strong>Standard:</strong> {item.standard}
                      </p>
                      {item.readinessChecklist &&
                        item.readinessChecklist.length > 0 && (
                          <ul
                            style={{
                              fontSize: "11px",
                              marginTop: "6px",
                              paddingLeft: "16px",
                            }}
                          >
                            {item.readinessChecklist.map((check, cidx) => (
                              <li key={cidx}>{check}</li>
                            ))}
                          </ul>
                        )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Policy Tab */}
        {activeTab === "policy" && (
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
                  Institution Type
                </label>
                <select
                  value={policyInst}
                  onChange={(e) => setPolicyInst(e.target.value)}
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
                  value={policyTopic}
                  onChange={(e) => {
                    setPolicyTopic(e.target.value);
                    setPolicyCustomTopic("");
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
                  value={policyCustomTopic}
                  onChange={(e) => setPolicyCustomTopic(e.target.value)}
                  placeholder="Or enter custom topic..."
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    fontSize: "13px",
                    border: "1px solid #D9D5C7",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                onClick={generatePolicy}
                disabled={policyLoading}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: policyLoading ? "#8A8272" : "#2C6E6E",
                  color: "#F7F6F2",
                  border: "none",
                  borderRadius: "5px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {policyLoading ? "Generating..." : "Generate policy template"}
              </button>

              {policyError && (
                <div
                  style={{
                    color: "#A8390A",
                    fontSize: "13px",
                    marginTop: "10px",
                  }}
                >
                  {policyError}
                </div>
              )}
            </div>

            {policyResult && (
              <div
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #D9D5C7",
                  borderRadius: "6px",
                  padding: "20px",
                }}
              >
                <div
                  style={{ display: "flex", gap: "8px", marginBottom: "16px" }}
                >
                  <button
                    onClick={() => copyToClipboard(policyResult)}
                    style={{
                      padding: "8px 12px",
                      fontSize: "12px",
                      background: "#2C6E6E",
                      color: "#F7F6F2",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Copy Full Text
                  </button>
                  <button
                    onClick={() =>
                      downloadAsText(policyResult, "policy-template.txt")
                    }
                    style={{
                      padding: "8px 12px",
                      fontSize: "12px",
                      background: "#5C6B72",
                      color: "#F7F6F2",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Download .txt
                  </button>
                </div>
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    lineHeight: 1.6,
                    color: "#2C3E50",
                  }}
                >
                  {policyResult}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
