export function policySourceDetails(dataSource) {
  if (dataSource?.kind === "ecfr") {
    return {
      kind: "Live eCFR",
      retrievalDate: dataSource.fetchDate || "",
      note: `CMS regulatory citations sourced from live eCFR as of ${dataSource.fetchDate || "date unavailable"}.`,
    };
  }

  return {
    kind: "AI Knowledge",
    retrievalDate: "",
    note: "Source: AI Knowledge.",
  };
}

export function policyToTxt(text, dataSource) {
  return `${text.trimEnd()}\n\n${policySourceDetails(dataSource).note}\n`;
}

export function policySourceRows(dataSource) {
  const { kind, retrievalDate, note } = policySourceDetails(dataSource);
  return [{ "Source Kind": kind, "Retrieval Date": retrievalDate, "Source Note": note }];
}