/**
 * ⚠️ ARCHIVED — NOT WIRED INTO THE ADDRESSABLE-MARKET FORMULA.
 *
 * Hair-loss prevalence by age band × sex. This was part of the LEGACY territory
 * formula and a briefly-built Task D cell formula. The v2 public-source methodology
 * (data/sources/GHMD_Territory_Methodology_Public_Sources.docx §2) defines:
 *
 *     addressable = households × income-qualified share × credit-eligible share
 *
 * — an affordability model with NO prevalence term. Ground-truth reconciliation
 * (Marin 64,194; national 69.8M @PTI8 / 56.4M @PTI5) matches exactly only WITHOUT a
 * prevalence multiplier. See ops.decision_log "Addressable Market Formula Corrected —
 * Prevalence Term Removed".
 *
 * Retained here (out of /lib/addressable-market-constants.ts and out of any active
 * import chain) for potential future use — e.g. a demand/expected-patients view.
 * Do NOT import this into the addressable-market compute path.
 *
 * Provenance for the values: male-pattern — Norwood 1975; Rhodes 1998; Gan & Sinclair
 * 2005. Female-pattern — Birch 2002; Sinclair 2011; Vary 2010. See
 * reference/prevalence-by-age-sex.json.
 */

export interface AgeGenderRate {
  male: number;
  female: number;
}

/** Hair loss prevalence by 5-year age cohort. Values are proportions (0–1). ARCHIVED. */
export const HAIR_LOSS_PREVALENCE: Record<string, AgeGenderRate> = {
  "20-24": { male: 0.05,  female: 0.005 },
  "25-29": { male: 0.20,  female: 0.02  },
  "30-34": { male: 0.20,  female: 0.02  },
  "35-39": { male: 0.30,  female: 0.15  },
  "40-44": { male: 0.30,  female: 0.20  },
  "45-49": { male: 0.45,  female: 0.22  },
  "50-54": { male: 0.45,  female: 0.25  },
  "55-59": { male: 0.50,  female: 0.30  },
  "60-64": { male: 0.50,  female: 0.40  },
  "65-69": { male: 0.55,  female: 0.45  },
  "70-74": { male: 0.60,  female: 0.50  },
  "75-79": { male: 0.70,  female: 0.55  },
  "80-84": { male: 0.75,  female: 0.60  },
  "85+":   { male: 1.00,  female: 0.60  },
} as const;
