// Types partagés entre le serveur (réponses des fonctions SQL) et l'interface.

export type NeedKey = "hunger" | "energy" | "hygiene" | "fun" | "social" | "bladder";
export type Needs = Record<NeedKey, number>;
export type Effects = Partial<Record<NeedKey, number>>;

export type AppearanceCategory = "skin" | "face" | "hair" | "outfit" | "outfit_color" | "shoes" | "accessory";
export type Appearance = Record<AppearanceCategory, string>;
export type Gender = "homme" | "femme";

export interface Clock {
  server_now: string;
  world_epoch: string;
  time_scale: number;
  start_game_minute: number;
  game_minute: number;
}

export interface CurrentActivity {
  kind: "activity" | "travel" | "work";
  code: string;
  label: string;
  effects: Effects;
  xp: number;
  cost: number;
  earn?: number;
  to_district?: string;
  started_at: string;
  ends_at: string;
}

export interface CharacterState {
  id: string;
  first_name: string;
  pseudo: string;
  gender: Gender;
  age: number;
  appearance: Appearance;
  country_code: string;
  city_code: string;
  district_code: string;
  cash: number;
  xp: number;
  level: number;
  next_level_xp: number;
  needs: Needs;
  activity: CurrentActivity | null;
}

export interface JobState {
  code: string;
  name: string;
  building_code: string;
  district_code: string;
  level: number;
  max_level: number;
  xp: number;
  next_level_xp: number | null;
  shifts: number;
  pay: number;
  shift_minutes: number;
  shift_start_hour: number;
  shift_end_hour: number;
  effects: Effects;
}

export interface HomeState {
  code: string;
  name: string;
  category: HomeCategory;
  district_code: string;
  comfort: number;
  /** Confort réduit de 1 tant qu'il reste des arriérés. */
  effective_comfort: number;
  tenure: "rental" | "owned";
  periodic_charge: number;
  deposit: number;
  purchase_price: number | null;
  resale_value: number | null;
  next_due_at: string;
  arrears: number;
  missed: number;
  max_missed: number;
}

export interface GameState {
  clock: Clock;
  character: CharacterState;
  job: JobState | null;
  careers: { code: string; level: number; xp: number; shifts: number; is_active: boolean }[];
  home: HomeState | null;
  unread_notifications: number;
  inventory: InventoryEntry[];
  missions: { code: string; progress: number; status: "locked" | "active" | "ready" | "claimed" }[];
  goals: { code: string; progress: number }[];
  sanction: { kind: "suspendu" | "banni"; until: string | null; reason: string | null } | null;
}

export interface Mission {
  code: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  reward_cash: number;
  reward_xp: number;
}
export interface Goal {
  code: string;
  title: string;
  icon: string;
  objective_type: string;
  target: number;
}

export interface InventoryEntry {
  code: string;
  quantity: number;
}

// Catalogue (tables publiques).
export interface District {
  code: string;
  name: string;
  kind: string;
  description: string;
  x_km: number;
  y_km: number;
}
export interface Building {
  code: string;
  district_code: string;
  name: string;
  kind: string;
  description: string;
  open_hour: number;
  close_hour: number;
  sort: number;
}
export interface Activity {
  code: string;
  building_code: string | null;
  name: string;
  description: string;
  duration_minutes: number;
  price: number;
  effects: Effects;
  xp: number;
  sort: number;
  required_items: string[] | null;
}
export interface Job {
  code: string;
  building_code: string;
  name: string;
  name_feminine: string | null;
  description: string;
  required_level: number;
  base_pay: number;
  shift_minutes: number;
  shift_start_hour: number;
  shift_end_hour: number;
  effects: Effects;
}
export interface TransportMode {
  code: string;
  name: string;
  icon: string;
}
export interface TravelQuote {
  to_district: string;
  mode_code: string;
  km: number;
  fare: number;
  game_minutes: number;
  effects: Effects;
}
export interface City {
  code: string;
  country_code: string;
  name: string;
  is_open: boolean;
  release_label: string | null;
}
export interface Country {
  code: string;
  name: string;
  flag: string;
  is_open: boolean;
}

export type HomeCategory = "chambre" | "studio" | "appartement" | "villa" | "maison_luxe" | "penthouse";

export interface Home {
  code: string;
  district_code: string;
  name: string;
  category: HomeCategory;
  description: string;
  comfort: number;
  capacity: number;
  required_level: number;
  rent_per_week: number;
  price: number | null;
  upkeep_per_week: number;
}
export interface HomeActivity {
  code: string;
  name: string;
  description: string;
  min_comfort: number;
  duration_minutes: number;
  price: number;
  effects: Effects;
  xp: number;
  required_items: string[] | null;
  consumes_item: string | null;
}
export type ItemCategory = "nourriture" | "ingredient" | "vetement" | "meuble" | "telephone";
export interface Item {
  code: string;
  name: string;
  category: ItemCategory;
  icon: string;
  description: string;
  use_minutes: number | null;
  effects: Effects;
  appearance_category: AppearanceCategory | null;
  appearance_code: string | null;
  max_stack: number;
}
export interface ShopItem {
  building_code: string;
  item_code: string;
  price: number;
  stock_max: number;
  stock: number;
  restocked_day: number;
}
export interface GameNotification {
  id: number;
  kind: string;
  message: string;
  created_at: string;
  read_at: string | null;
}
export interface LedgerEntry {
  id: number;
  amount: number;
  balance_after: number;
  kind: string;
  ref: string | null;
  created_at: string;
}

export interface Catalog {
  districts: District[];
  buildings: Building[];
  activities: Activity[];
  jobs: Job[];
  modes: TransportMode[];
  quotes: TravelQuote[];
  homes: Home[];
  homeActivities: HomeActivity[];
  items: Item[];
  shopItems: ShopItem[];
  missions: Mission[];
  goals: Goal[];
}

/** Résultat d'une Server Action. */
export type ActionResult = { ok: true } | { ok: false; error: string };
