// Maps the many ways someone might type a vehicle make in natural language to
// the canonical `make` slug used in dtc_codes.make (must never collide with
// RESERVED_TOP_LEVEL_SLUGS — see src/lib/reserved-slugs.ts).
const VEHICLE_MAKE_ALIASES: Record<string, string> = {
  bmw: "bmw",
  "land rover": "land-rover",
  "range rover": "land-rover",
  landrover: "land-rover",
  toyota: "toyota",
  lexus: "lexus",
  honda: "honda",
  acura: "acura",
  ford: "ford",
  chevrolet: "chevrolet",
  chevy: "chevrolet",
  gmc: "gmc",
  audi: "audi",
  volkswagen: "volkswagen",
  vw: "volkswagen",
  mercedes: "mercedes-benz",
  "mercedes-benz": "mercedes-benz",
  benz: "mercedes-benz",
  nissan: "nissan",
  infiniti: "infiniti",
  hyundai: "hyundai",
  kia: "kia",
  subaru: "subaru",
  mazda: "mazda",
  jeep: "jeep",
  dodge: "dodge",
  ram: "ram",
  chrysler: "chrysler",
  volvo: "volvo",
  porsche: "porsche",
  tesla: "tesla",
};

export function extractVehicleMake(message: string): string | null {
  const lower = message.toLowerCase();
  // Check multi-word aliases before single-word ones so "land rover" matches
  // before a hypothetical shorter overlapping alias would.
  const aliases = Object.keys(VEHICLE_MAKE_ALIASES).sort(
    (a, b) => b.length - a.length,
  );
  for (const alias of aliases) {
    if (lower.includes(alias)) return VEHICLE_MAKE_ALIASES[alias];
  }
  return null;
}
