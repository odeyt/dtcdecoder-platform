export type DtcDifficulty = "easy" | "moderate" | "hard" | "professional";

export interface DtcFaqEntry {
  q: string;
  a: string;
}

export interface DtcCode {
  id: string;
  code: string;
  make: string | null;
  model: string | null;
  engine_code: string | null;
  slug: string;
  title: string;
  meta_description: string | null;
  meaning: string;
  symptoms: string[];
  causes: string[];
  diagnostic_steps: string[];
  common_mistakes: string | null;
  difficulty: DtcDifficulty;
  related_makes: string[];
  faq: DtcFaqEntry[];
  pdf_url: string | null;
  youtube_url: string | null;
  search_count: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export type BlogCategory =
  | "dtc_guides"
  | "check_engine_light"
  | "limp_mode"
  | "can_bus_diagnostics"
  | "ev_diagnostics"
  | "transmission_faults"
  | "immobilizer_problems"
  | "bmw_diagnostics"
  | "land_rover_diagnostics"
  | "toyota_diagnostics";

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  category: BlogCategory;
  excerpt: string | null;
  content: string;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SubscriptionPlan = "free" | "pro" | "workshop";
export type SubscriptionStatus = "active" | "past_due" | "canceled";

export interface Subscription {
  id: string;
  user_id: string | null;
  email: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  creem_subscription_id: string | null;
  creem_customer_id: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailSignup {
  id: string;
  name: string | null;
  email: string;
  created_at: string;
}
