import mammoth from "mammoth";

const SKILL_CATALOG = [
  "plant maintenance", "preventive maintenance", "predictive maintenance",
  "corrective maintenance", "sap pm", "cmms", "tpm", "total productive maintenance",
  "reliability", "reliability engineering", "mtbf", "mttr", "work order",
  "spare part", "downtime", "breakdown", "asset management", "oee",
  "continuous improvement", "lean", "lean manufacturing", "six sigma", "kaizen",
  "5s", "pdca", "dmaic", "root cause analysis", "rca", "fmea", "spc",
  "vsm", "value stream mapping", "production monitoring", "industrial engineering",
  "process improvement", "troubleshooting", "calibration", "instrumentation",
  "plc", "scada", "hvac", "boiler", "chiller", "utility", "mechanical", "electrical",
  "iso 9001", "iso 14001", "iso 45001", "iso 55001", "k3", "hse", "ppic",
  "supply chain", "sap", "erp", "power bi", "tableau", "python", "sql",
  "autocad", "solidworks", "machine learning", "data analysis", "data science",
  "pandas", "javascript", "typescript", "react", "next.js", "node.js", "golang",
  "docker", "kubernetes", "aws", "gcp", "supabase", "postgresql", "mysql",
  "project management", "agile", "scrum", "quality assurance", "quality control",
  "excel", "audit", "manufacturing", "production", "operations",
  "warehouse", "logistics", "maintenance", "engineering",
];

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractCvText(filename: string, buffer: Buffer): Promise<string> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(buffer);
    return cleanText(parsed.text || "");
  }

  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return cleanText(result.value || "");
  }

  return cleanText(buffer.toString("utf-8"));
}

export function extractSkillsFromText(text: string): string[] {
  const sanitized = text
    .toLowerCase()
    .replace(/\b(?:east|west|central|south|north)\s+java\b|\bjava\s+island\b/gi, " ");
  const found: string[] = [];
  for (const skill of SKILL_CATALOG) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i");
    if (regex.test(sanitized)) {
      found.push(skill);
    }
  }
  return found;
}
