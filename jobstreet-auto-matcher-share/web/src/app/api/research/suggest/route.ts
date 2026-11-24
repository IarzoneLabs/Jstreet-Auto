import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

interface RoleRule {
  trigger: RegExp;
  keyword: string;
}

const ROLE_RULES: RoleRule[] = [
  { trigger: /plant\s+maintenance/i, keyword: "Plant Maintenance" },
  { trigger: /preventive\s+maintenance|pm\s+schedule/i, keyword: "Preventive Maintenance" },
  { trigger: /predictive\s+maintenance|pdm|vibration/i, keyword: "Predictive Maintenance" },
  { trigger: /reliability|mtbf|mttr/i, keyword: "Reliability Engineer" },
  { trigger: /continuous\s+improvement|kaizen|lean\s+manufacturing/i, keyword: "Continuous Improvement" },
  { trigger: /production\s+monitoring|oee|downtime/i, keyword: "Production Monitoring" },
  { trigger: /sap\s+pm|cmms|work\s+order/i, keyword: "Maintenance Planner" },
  { trigger: /process\s+improvement|process\s+engineer|six\s+sigma|dmaic/i, keyword: "Process Engineer" },
  { trigger: /industrial\s+engineering|teknik\s+industri/i, keyword: "Industrial Engineer" },
  { trigger: /utility|boiler|chiller|hvac/i, keyword: "Utility Maintenance" },
  { trigger: /quality\s+assurance|quality\s+control|iso\s+9001/i, keyword: "Quality Control" },
  { trigger: /ppic|supply\s+chain/i, keyword: "PPIC" },
  { trigger: /power\s+bi|tableau|data\s+analy/i, keyword: "Data Analyst" },
  { trigger: /python|sql|software|developer|react|next\.js/i, keyword: "Software Engineer" },
  { trigger: /hse|k3|safety/i, keyword: "HSE" },
];

const DEFAULT_EXCLUDE_CANDIDATES: { term: string; check: RegExp }[] = [
  { term: "Tax", check: /\btax\b|\bpajak\b/i },
  { term: "Accounting", check: /\baccounting\b|\bakuntansi\b|\baccountant\b/i },
  { term: "Finance", check: /\bfinance\b|\bkeuangan\b/i },
  { term: "Sales", check: /\bsales\b|\baccount\s+executive\b/i },
  { term: "Marketing", check: /\bmarketing\b|\bbrand\s+manager\b/i },
  { term: "HRD", check: /\bhrd\b|\bhuman\s+resources\b|\brecruiter\b/i },
];

function detectLocation(text: string): string | null {
  if (/jawa\s+timur|east\s+java|surabaya|sidoarjo|gresik|pasuruan|malang|mojokerto/i.test(text)) {
    return "Jawa Timur";
  }
  if (/jakarta|jabodetabek/i.test(text)) {
    return "Jakarta Raya";
  }
  if (/jawa\s+barat|west\s+java|bandung|bekasi|cikarang|karawang|bogor|purwakarta/i.test(text)) {
    return "Jawa Barat";
  }
  if (/jawa\s+tengah|central\s+java|semarang|solo|surakarta/i.test(text)) {
    return "Jawa Tengah";
  }
  if (/banten|tangerang|serang|cilegon/i.test(text)) {
    return "Banten";
  }
  return null;
}

export async function POST() {
  try {
    const sb = getSupabaseAdmin();
    const { data: cvRows, error } = await sb
      .from("cv_profiles")
      .select("id, filename, raw_text, extracted_skills")
      .eq("is_active", true)
      .limit(1);

    if (error) throw error;
    const activeCv = cvRows?.[0];

    if (!activeCv) {
      return NextResponse.json(
        { error: "Belum ada CV aktif. Unggah CV terlebih dahulu di tab Upload CV Baru." },
        { status: 400 }
      );
    }

    const fullText = `${activeCv.raw_text || ""}\n${(activeCv.extracted_skills || []).join(" ")}`;
    const cvTopText = (activeCv.raw_text || "").slice(0, 1200);

    const suggestedKeywords: string[] = [];
    for (const rule of ROLE_RULES) {
      if (rule.trigger.test(fullText) && !suggestedKeywords.includes(rule.keyword)) {
        suggestedKeywords.push(rule.keyword);
      }
      if (suggestedKeywords.length >= 6) break;
    }

    if (suggestedKeywords.length === 0 && Array.isArray(activeCv.extracted_skills)) {
      for (const skill of activeCv.extracted_skills.slice(0, 5)) {
        suggestedKeywords.push(skill);
      }
    }

    const suggestedExcludes = DEFAULT_EXCLUDE_CANDIDATES.filter(
      (item) => !item.check.test(cvTopText)
    ).map((item) => item.term);

    const suggestedLocation = detectLocation(cvTopText);

    return NextResponse.json({
      cvFilename: activeCv.filename,
      keywords: suggestedKeywords,
      exclude_keywords: suggestedExcludes,
      location: suggestedLocation,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Gagal menganalisis rekomendasi keyword dari CV.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
