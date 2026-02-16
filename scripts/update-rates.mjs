import { readFile, writeFile } from "node:fs/promises";

const OUTPUT_FILE = new URL("../rates.json", import.meta.url);

const DEFAULT_RATES = {
  byTerm: { 10: 0.01, 25: 0.61, 35: 0.86 },
  kfw296CompareRate: 0.01,
  marketRate: 3.91,
};

const SOURCES = {
  kfw: {
    url:
      process.env.KFW_RATES_URL ||
      "https://www.kfw.de/inlandsfoerderung/Privatpersonen/Neubau/F%C3%B6rderprodukte/Klimafreundlicher-Neubau-im-Niedrigpreissegment-(296)/",
  },
  interhyp: {
    url: process.env.INTERHYP_RATES_URL || "https://www.interhyp.de/zinsen/",
  },
};

function toDisplayStand(date = new Date()) {
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(date);
}

function parsePercent(value) {
  if (!value) return undefined;
  const normalized = String(value).replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function toPlainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&gt;/gi, ">")
    .replace(/&lt;/gi, "<")
    .replace(/\s+/g, " ")
    .trim();
}

function hasKfw296AnnuityAnchors(text) {
  const hasProgram = /kredit\s*nr\.?\s*296/i.test(text) || /program-numbers\s*=\s*"296"/i.test(text);
  const hasKonditionen = /konditionen/i.test(text);
  const hasTerm10 = /4\s*bis\s*10\s*jahre/i.test(text);
  const hasTerm25 = /11\s*bis\s*25\s*jahre/i.test(text);
  const hasTerm35 = /26\s*bis\s*35\s*jahre/i.test(text);
  return hasProgram && hasKonditionen && hasTerm10 && hasTerm25 && hasTerm35;
}

function extractSection(text, startRegex, endRegexes = []) {
  const start = text.search(startRegex);
  if (start < 0) return "";

  const searchFrom = start + 40;
  const endCandidates = endRegexes
    .map((regex) => {
      const tail = text.slice(searchFrom);
      const idx = tail.search(regex);
      return idx >= 0 ? searchFrom + idx : -1;
    })
    .filter((value) => value > start);

  const end = endCandidates.length > 0 ? Math.min(...endCandidates) : Math.min(text.length, start + 3000);
  return text.slice(start, end);
}

function extractFirstPercent(text, regex) {
  const match = text.match(regex);
  return parsePercent(match?.[1]);
}

function findPercentNear(text, anchorRegex, radius = 420) {
  const anchor = text.search(anchorRegex);
  if (anchor < 0) return undefined;
  const start = Math.max(0, anchor - Math.floor(radius / 3));
  const end = Math.min(text.length, anchor + radius);
  const snippet = text.slice(start, end);
  const match = snippet.match(/\d{1,2},\d{1,2}\s*%|\d{1,2}\.\d{1,2}\s*%/);
  return parsePercent(match?.[0]);
}

function findMarketRate(text) {
  const candidates = [];
  const regex = /\d{1,2},\d{1,2}\s*%|\d{1,2}\.\d{1,2}\s*%/g;
  for (const match of text.matchAll(regex)) {
    const value = parsePercent(match[0]);
    if (Number.isFinite(value) && value >= 1 && value <= 10) candidates.push(value);
  }
  if (candidates.length === 0) return undefined;
  return candidates.sort((a, b) => a - b)[0];
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; KfW296RateBot/1.0)",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const html = await response.text();
  return html;
}

async function scrapeKfw() {
  const html = await fetchHtml(SOURCES.kfw.url);
  const plainText = toPlainText(html);
  const hasAnchors = hasKfw296AnnuityAnchors(plainText);
  const annuitySection = extractSection(plainText, /konditionen\s*[-–]?\s*annuit[aä]ten?darlehen/i, [
    /bereitstellung/i,
    /f[öo]rderantrag/i,
    /weitere\s+informationen/i,
  ]);
  const scope = annuitySection || plainText;

  const rate10 = findPercentNear(scope, /4\s*bis\s*10/i) ?? DEFAULT_RATES.byTerm[10];
  const rate25 = findPercentNear(scope, /11\s*bis\s*25/i) ?? DEFAULT_RATES.byTerm[25];
  const rate35 = findPercentNear(scope, /26\s*bis\s*35/i) ?? DEFAULT_RATES.byTerm[35];
  const teaserRate =
    extractFirstPercent(plainText, /f[öo]rderkredit\s+ab\s*(\d{1,2}[,.]\d{1,2})\s*%/i) ??
    extractFirstPercent(plainText, /(\d{1,2}[,.]\d{1,2})\s*%\s*effektivem\s*jahreszins/i);

  const status = hasAnchors || annuitySection || Number.isFinite(teaserRate) ? "ok" : "partial";

  return {
    byTerm: { 10: rate10, 25: rate25, 35: rate35 },
    kfw296CompareRate: Number.isFinite(teaserRate) ? teaserRate : rate10,
    status,
  };
}

function findInterhypRateFor10YearsAbove90(text) {
  const rowPattern =
    /beleihungsauslauf\s*(?:>|>=|≥)\s*90[\s\S]{0,900}?\b10\b\s+(\d{1,2}[,.]\d{1,2})\s*%\s+(\d{1,2}[,.]\d{1,2})\s*%\s+(\d{1,2}[,.]\d{1,2})\s*%/i;
  const rowMatch = text.match(rowPattern);
  if (rowMatch) {
    const over90 = parsePercent(rowMatch[3]);
    if (Number.isFinite(over90)) return over90;
  }

  const ltvNear = findPercentNear(text, /beleihungsauslauf\s*(?:>|>=|≥)\s*90/i, 1400);
  if (Number.isFinite(ltvNear) && ltvNear >= 1 && ltvNear <= 10) return ltvNear;

  return undefined;
}

async function scrapeInterhyp() {
  const html = await fetchHtml(SOURCES.interhyp.url);
  const plainText = toPlainText(html);

  const targetedRate = findInterhypRateFor10YearsAbove90(plainText);
  if (Number.isFinite(targetedRate)) {
    return { marketRate: targetedRate, status: "ok" };
  }

  const fallbackRate = findMarketRate(plainText) ?? DEFAULT_RATES.marketRate;
  return { marketRate: fallbackRate, status: "partial" };
}

async function readExistingRates() {
  try {
    const raw = await readFile(OUTPUT_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  const now = new Date();
  const existing = (await readExistingRates()) || {};

  let kfwResult = {
    byTerm: existing?.rates?.byTerm || DEFAULT_RATES.byTerm,
    kfw296CompareRate: existing?.rates?.kfw296CompareRate ?? DEFAULT_RATES.kfw296CompareRate,
    status: "fallback",
  };

  let interhypResult = {
    marketRate: existing?.rates?.marketRate ?? DEFAULT_RATES.marketRate,
    status: "fallback",
  };

  try {
    kfwResult = await scrapeKfw();
  } catch (error) {
    console.warn("KfW scraping fallback:", error.message);
  }

  try {
    interhypResult = await scrapeInterhyp();
  } catch (error) {
    console.warn("Interhyp scraping fallback:", error.message);
  }

  const payload = {
    updatedAt: now.toISOString(),
    displayStand: toDisplayStand(now),
    sources: {
      kfw: {
        url: SOURCES.kfw.url,
        status: kfwResult.status,
      },
      interhyp: {
        url: SOURCES.interhyp.url,
        status: interhypResult.status,
      },
    },
    rates: {
      byTerm: {
        10: Number(kfwResult.byTerm[10]),
        25: Number(kfwResult.byTerm[25]),
        35: Number(kfwResult.byTerm[35]),
      },
      kfw296CompareRate: Number(kfwResult.kfw296CompareRate),
      marketRate: Number(interhypResult.marketRate),
    },
  };

  await writeFile(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log("rates.json updated", payload.rates);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
