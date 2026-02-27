import { mkdir, writeFile } from "node:fs/promises";
import { access, constants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const SOURCE_URL = "https://www.interhyp.de/zinsen/";

type InterhypPayload = {
  source: string;
  updatedAt: string;
  trancheYears: 10;
  ltvBucket: ">90";
  effectiveRatePercent: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.resolve(__dirname, "../../data/market/interhyp_10y_ltv_gt90.json");

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: string): string {
  return normalizeWhitespace(value).replace(/\s+/g, "").toLowerCase();
}

function parseGermanPercent(input: string): number {
  const cleaned = input
    .replace(/\u00a0/g, " ")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.\-]/g, "");

  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) {
    throw new Error(`Ungültiger Prozentwert: ${input}`);
  }
  return value;
}

function ensurePlausibleRate(value: number): void {
  if (value < 0 || value > 15) {
    throw new Error(`Unplausibler Zinswert: ${value}`);
  }
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; KNN-Interhyp-Bot/1.0)",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} beim Abruf von ${url}`);
  }

  return response.text();
}

function findTargetTable($: cheerio.CheerioAPI): cheerio.Cheerio<any> {
  const heading = $("h1, h2, h3, h4, strong")
    .filter((_, el) => normalizeWhitespace($(el).text()) === "Zinstabelle: Effektiver Jahreszins")
    .first();

  if (heading.length) {
    const scopedTable = heading.closest("section, article, div").find("table").first();
    if (scopedTable.length) {
      return scopedTable;
    }
  }

  const allTables = $("table").toArray();
  for (const table of allTables) {
    const headerCells = $(table).find("tr").first().find("th, td");
    const headerTexts = headerCells
      .toArray()
      .map((cell) => normalizeHeader($(cell).text()));

    const hasTranche = headerTexts.some((text) => text.includes("zinsbindungtranche"));
    const hasBucket = headerTexts.some((text) => text.includes("beleihungsauslauf>90"));
    if (hasTranche && hasBucket) {
      return $(table);
    }
  }

  throw new Error("Zieltabelle nicht gefunden (Zinstabelle: Effektiver Jahreszins)");
}

function parseInterhypRate(html: string): number {
  const $ = cheerio.load(html);
  const table = findTargetTable($);

  const headerCells = table.find("tr").first().find("th, td").toArray();
  const normalizedHeaders = headerCells.map((cell) => normalizeHeader($(cell).text()));

  const trancheIndex = normalizedHeaders.findIndex((text) => text.includes("zinsbindungtranche"));
  const ltvIndex = normalizedHeaders.findIndex((text) => text.includes("beleihungsauslauf>90"));

  if (trancheIndex < 0 || ltvIndex < 0) {
    throw new Error("Erforderliche Header-Spalten nicht gefunden");
  }

  const dataRows = table.find("tr").slice(1).toArray();
  const targetRow = dataRows.find((row) => {
    const cells = $(row).find("td, th").toArray();
    if (cells.length === 0) return false;
    const firstCellValue = normalizeWhitespace($(cells[trancheIndex] ?? cells[0]).text());
    return firstCellValue === "10";
  });

  if (!targetRow) {
    throw new Error("Zeile mit Zinsbindung Tranche = 10 nicht gefunden");
  }

  const targetCells = $(targetRow).find("td, th").toArray();
  if (ltvIndex >= targetCells.length) {
    throw new Error("Zielspalte Beleihungsauslauf >90 in Zielzeile nicht vorhanden");
  }

  const rawValue = normalizeWhitespace($(targetCells[ltvIndex]).text());
  if (!rawValue.includes("%")) {
    throw new Error(`Zielzelle enthält keinen Prozentwert: ${rawValue}`);
  }

  const value = parseGermanPercent(rawValue);
  ensurePlausibleRate(value);
  return value;
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
    const effectiveRatePercent = parseInterhypRate(html);

    const payload: InterhypPayload = {
      source: SOURCE_URL,
      updatedAt: new Date().toISOString(),
      trancheYears: 10,
      ltvBucket: ">90",
      effectiveRatePercent,
    };

    await writeJson(outputPath, payload);
    console.log(`Interhyp-Zins erfolgreich aktualisiert: ${outputPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const keepLkg = await hasLastKnownGood(outputPath);

    console.error(`Interhyp-Update fehlgeschlagen: ${message}`);
    if (keepLkg) {
      console.error("Last-known-good bleibt unverändert.");
    } else {
      console.error("Noch keine Last-known-good Datei vorhanden.");
    }

    process.exitCode = 1;
  }
}

void main();