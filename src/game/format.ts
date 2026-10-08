// Formats d'affichage (français).

/** 500000 → « 500 000 FCFA » (espaces insécables). */
export function fcfa(amount: number): string {
  const sign = amount < 0 ? "−" : "";
  const digits = Math.abs(Math.round(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${digits} FCFA`;
}

/** Libellé de métier accordé au sexe du personnage. */
export function jobName(job: { name: string; name_feminine: string | null }, gender: string): string {
  return gender === "femme" && job.name_feminine ? job.name_feminine : job.name;
}

/** « +40 » / « −12 » / « −18,3 » */
export function signed(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const abs = String(Math.abs(rounded)).replace(".", ",");
  return rounded > 0 ? `+${abs}` : rounded < 0 ? `−${abs}` : "0";
}
