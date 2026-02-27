import { mkdir, writeFile } from "node:fs/promises";
import { access, constants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const SOURCE_URL =
  "https://www.kfw-formularsammlung.de/KonditionenanzeigerINet/KonditionenAnzeiger";

const TARGET_VARIANTS = ["10/2/10", "25/3/10", "35/5/10"] as const;
const TARGET_VARIANT_SET = new Set<string>(TARGET_VARIANTS);

type TargetVariant = (typeof TARGET_VARIANTS)[number];

type Kfw296Rate = {
  variant: TargetVariant;
  effectiveRatePercent: number;
  validFrom: string;
};

type Kfw296Payload = {
  source: string;
  updatedAt: string;
  program: 296;
  product: "KNN Wohngebäude";
  rates: Kfw296Rate[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.resolve(__dirname, "../../data/kfw/296.json");

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseGermanPercent(input: string): number {
  const normalized = input
    .replace(/\u00a0/g, " ")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.\-]/g, "");

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) {
    throw new Error(`Ungültiger Prozentwert: ${input}`);
  }
  return value;
}

function extractVariant(rawName: string): string | null {
  const match = rawName.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (!match) return null;
  return `${match[1]}/${match[2]}/${match[3]}`;
}

function parseDateToIso(input: string): string {
  const match = input.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) {
    throw new Error(`Ungültiges Datumsformat: ${input}`);
  }

  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function ensurePlausibleRate(value: number): void {
  if (value < 0 || value > 15) {
    throw new Error(`Unplausibler Zinswert: ${value}`);
  }
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; KNN-KfW296-Bot/1.0)",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} beim Abruf von ${url}`);
  }

  return response.text();
}

function parseKfw296(html: string): Kfw296Rate[] {
  const $ = cheerio.load(html);
  const foundByVariant = new Map<TargetVariant, Kfw296Rate>();

  $("tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 5) return;

    const programText = normalizeWhitespace($(cells[1]).text());
    if (programText !== "296") return;

    const rawName = normalizeWhitespace($(cells[0]).text());
    if (!rawName.toLowerCase().includes("knn wohngebäude")) return;

    const variant = extractVariant(rawName);
    if (!variant) return;
    if (!TARGET_VARIANT_SET.has(variant)) return;

    const firstRateCellText = normalizeWhitespace($(cells[3]).text());
    const percentMatch = firstRateCellText.match(/\d{1,2},\d{1,2}/);
    if (!percentMatch) {
      throw new Error(`Kein Prozentwert in Zelle gefunden: ${firstRateCellText}`);
    }

    const effectiveRatePercent = parseGermanPercent(percentMatch[0]);
    ensurePlausibleRate(effectiveRatePercent);

    const validFromRaw = normalizeWhitespace($(cells[cells.length - 1]).text());
    const validFrom = parseDateToIso(validFromRaw);

    foundByVariant.set(variant as TargetVariant, {
      variant: variant as TargetVariant,
      effectiveRatePercent,
      validFrom,
    });
  });

  if (foundByVariant.size !== 3) {
    const foundKeys = Array.from(foundByVariant.keys()).join(", ");
    throw new Error(`Exakt 3 Treffer erwartet, gefunden: ${foundByVariant.size} (${foundKeys})`);
  }

  return TARGET_VARIANTS.map((variant) => {
    const entry = foundByVariant.get(variant);
    if (!entry) {
      throw new Error(`Fehlende Variante: ${variant}`);
    }
    return entry;
  });
}

async function hasLastKnownGood(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  try {
    const html = await fetchHtml(SOURCE_URL);
    const rates = parseKfw296(html);

    const payload: Kfw296Payload = {
      source: SOURCE_URL,
      updatedAt: new Date().toISOString(),
      program: 296,
      product: "KNN Wohngebäude",
      rates,
    };

    await writeJson(outputPath, payload);
    console.log(`KfW 296 erfolgreich aktualisiert: ${outputPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const keepLkg = await hasLastKnownGood(outputPath);

    console.error(`KfW 296 Update fehlgeschlagen: ${message}`);
    if (keepLkg) {
      console.error("Last-known-good bleibt unverändert.");
    } else {
      console.error("Noch keine Last-known-good Datei vorhanden.");
    }

    process.exitCode = 1;
  }
}

void main();