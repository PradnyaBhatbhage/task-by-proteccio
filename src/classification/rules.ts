import type { SensitiveCategory } from "../discovery";
import type { ClassificationLabel, ClassificationRuleId } from "./types";

export interface CategoryToLabelRule {
  ruleId: ClassificationRuleId;
  label: ClassificationLabel;
  /**
   * Multiplier applied to discovery confidence score (0..1) to produce
   * assignment-level confidence.
   */
  confidenceMultiplier: number;
  why: string;
}

const RULE_ID: ClassificationRuleId = "discovery_category_mapping";

/**
 * Deterministic mapping from discovery-sensitive categories to enterprise
 * privacy classification labels (supports multi-label output).
 */
export const CATEGORY_TO_LABEL_RULES: Record<SensitiveCategory, CategoryToLabelRule[]> = {
  // Direct identifiers used to contact or identify a person.
  email: [
    {
      ruleId: RULE_ID,
      label: "Personal Data",
      confidenceMultiplier: 1.0,
      why: "Email address is a direct personal identifier used for communication and account linking."
    }
  ],
  phone: [
    {
      ruleId: RULE_ID,
      label: "Personal Data",
      confidenceMultiplier: 0.98,
      why: "Phone numbers uniquely identify individuals and are commonly used for authentication and contact."
    }
  ],

  // Government IDs (strongly sensitive identifiers).
  aadhaar: [
    {
      ruleId: RULE_ID,
      label: "Sensitive Personal Data",
      confidenceMultiplier: 1.0,
      why: "Aadhaar is a government-issued unique identifier and is treated as highly sensitive personal data."
    },
    {
      ruleId: RULE_ID,
      label: "Personal Data",
      confidenceMultiplier: 0.7,
      why: "Government identifiers relate to an identifiable individual."
    }
  ],
  pan: [
    {
      ruleId: RULE_ID,
      label: "Sensitive Personal Data",
      confidenceMultiplier: 0.96,
      why: "PAN is a government-issued tax identifier that can directly identify an individual."
    },
    {
      ruleId: RULE_ID,
      label: "Personal Data",
      confidenceMultiplier: 0.7,
      why: "Tax identifiers belong to an identifiable person."
    }
  ],
  passport: [
    {
      ruleId: RULE_ID,
      label: "Sensitive Personal Data",
      confidenceMultiplier: 0.92,
      why: "Passport numbers are government-issued identifiers and are treated as highly sensitive personal data."
    },
    {
      ruleId: RULE_ID,
      label: "Personal Data",
      confidenceMultiplier: 0.65,
      why: "Passport identifiers relate to an identifiable individual."
    }
  ],

  // Infrastructure identifiers can be personal data (depending on context).
  ip_address: [
    {
      ruleId: RULE_ID,
      label: "Personal Data",
      confidenceMultiplier: 0.82,
      why: "IP addresses can be used to identify or profile individuals when linked to network activity."
    }
  ],

  // Payment instruments and banking information.
  payment_card: [
    {
      ruleId: RULE_ID,
      label: "Financial Data",
      confidenceMultiplier: 1.0,
      why: "Payment card numbers are financial account identifiers and are strongly sensitive."
    },
    {
      ruleId: RULE_ID,
      label: "Sensitive Personal Data",
      confidenceMultiplier: 0.94,
      why: "Payment card data is highly sensitive and can be used to carry out fraud and account takeover."
    },
    {
      ruleId: RULE_ID,
      label: "Personal Data",
      confidenceMultiplier: 0.65,
      why: "Financial instruments typically relate to an identifiable person or organization."
    }
  ],
  bank_account: [
    {
      ruleId: RULE_ID,
      label: "Financial Data",
      confidenceMultiplier: 1.0,
      why: "Bank account identifiers represent financial account information."
    },
    {
      ruleId: RULE_ID,
      label: "Sensitive Personal Data",
      confidenceMultiplier: 0.92,
      why: "Bank account details are sensitive and can enable financial theft or impersonation."
    },
    {
      ruleId: RULE_ID,
      label: "Personal Data",
      confidenceMultiplier: 0.65,
      why: "Bank account information relates to an identifiable account holder."
    }
  ],

  // Names and profile attributes.
  person_name: [
    {
      ruleId: RULE_ID,
      label: "Personal Data",
      confidenceMultiplier: 1.0,
      why: "Names are direct personal identifiers."
    }
  ],
  address: [
    {
      ruleId: RULE_ID,
      label: "Personal Data",
      confidenceMultiplier: 0.96,
      why: "Addresses are personal identifiers that can uniquely locate or identify individuals."
    },
    {
      ruleId: RULE_ID,
      label: "Sensitive Personal Data",
      confidenceMultiplier: 0.62,
      why: "Physical addresses can be treated as sensitive because they increase risk of targeting and harm."
    }
  ],
  date_of_birth: [
    {
      ruleId: RULE_ID,
      label: "Personal Data",
      confidenceMultiplier: 0.95,
      why: "Date of birth is an attribute used to identify and distinguish individuals."
    },
    {
      ruleId: RULE_ID,
      label: "Sensitive Personal Data",
      confidenceMultiplier: 0.6,
      why: "DOB can be sensitive as it helps uniquely identify a person and may be used for identity verification."
    }
  ],

  // Authentication secrets and tokens.
  authentication_field: [
    {
      ruleId: RULE_ID,
      label: "Authentication Data",
      confidenceMultiplier: 1.0,
      why: "Credentials or authentication tokens enable account access and must be treated as authentication data."
    },
    {
      ruleId: RULE_ID,
      label: "Sensitive Personal Data",
      confidenceMultiplier: 0.96,
      why: "Authentication data is highly sensitive because it can directly allow account compromise."
    },
    {
      ruleId: RULE_ID,
      label: "Personal Data",
      confidenceMultiplier: 0.68,
      why: "Authentication artifacts typically relate to an account holder."
    }
  ]
};

