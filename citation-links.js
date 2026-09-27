export function citationToUrl(citation) {
  const sectionMatch = citation.match(/§\s*(\d+)\.(\d+)((?:\([a-zA-Z0-9]+\))*)/);
  if (sectionMatch) {
    const section = `${sectionMatch[1]}.${sectionMatch[2]}`;
    const suffix = sectionMatch[3];
    return `https://www.ecfr.gov/current/title-42/section-${section}${suffix ? `#p-${section}${suffix}` : ""}`;
  }

  const partMatch = citation.match(/\b42\s+CFR\s+(\d+)\b/i);
  if (partMatch) {
    return `https://www.ecfr.gov/current/title-42/part-${partMatch[1]}`;
  }

  const standardCode = citation.split(/\s+[–—-]\s+/)[0].trim();
  return `https://www.jointcommission.org/search/#q=${encodeURIComponent(standardCode)}`;
}