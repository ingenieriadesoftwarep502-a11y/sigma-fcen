/** How the catalog screens count things, in Spanish. */

const numberFormat = new Intl.NumberFormat("es-CO");

export function formatCount(value: number): string {
  return numberFormat.format(value);
}

/** e.g. "1 curso", "1.204 cursos". */
export function countLabel(count: number, singular: string, plural: string): string {
  return `${numberFormat.format(count)} ${count === 1 ? singular : plural}`;
}

export function creditsLabel(credits: number): string {
  return countLabel(credits, "crédito", "créditos");
}

export function monitorsLabel(count: number): string {
  return count === 0 ? "Sin monitores este período" : countLabel(count, "monitor", "monitores");
}

/** Committed hours of a monitor, e.g. "6 h". */
export function hoursLabel(hours: number): string {
  return `${numberFormat.format(hours)} h`;
}
