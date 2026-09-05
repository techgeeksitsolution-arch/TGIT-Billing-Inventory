import { prisma } from "../db.js";

const OCR_CONFIG_KEY = "ocrProvider";

const ALLOWED_MIMES = [
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
  "application/pdf",
];
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function validateUploadFile(file) {
  if (!file) return { ok: false, error: "NO_FILE", message: "No file provided" };
  if (!ALLOWED_MIMES.includes(file.mimetype)) {
    return { ok: false, error: "INVALID_TYPE", message: `File type ${file.mimetype} not allowed. Use PNG, JPG, WebP, GIF, or PDF.` };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: "FILE_TOO_LARGE", message: `File exceeds ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB limit.` };
  }
  return { ok: true };
}

export async function getOcrConfig(organizationId) {
  const s = await prisma.setting.findUnique({
    where: { organizationId_key: { organizationId, key: OCR_CONFIG_KEY } },
  });
  if (!s?.value) return { provider: null, apiKey: null, endpoint: null, model: null, enabled: false };
  const parsed = JSON.parse(s.value);
  return {
    provider: parsed.provider || null,
    apiKey: parsed.apiKey || null,
    apiKey2: parsed.apiKey2 || null,
    endpoint: parsed.endpoint || null,
    model: parsed.model || null,
    enabled: Boolean(parsed.enabled),
  };
}

export async function saveOcrConfig(organizationId, cfg) {
  await prisma.setting.upsert({
    where: { organizationId_key: { organizationId, key: OCR_CONFIG_KEY } },
    update: { value: JSON.stringify(cfg) },
    create: { organizationId, key: OCR_CONFIG_KEY, value: JSON.stringify(cfg) },
  });
}

export function redactOcrConfig(cfg) {
  return {
    provider: cfg.provider || null,
    endpoint: cfg.endpoint || null,
    model: cfg.model || null,
    enabled: Boolean(cfg.enabled),
    configured: isProviderConfigured(cfg),
  };
}

function isProviderConfigured(cfg) {
  if (!cfg.provider || !cfg.enabled) return false;
  switch (cfg.provider) {
    case "GEMINI": return Boolean(cfg.apiKey);
    case "MISTRAL": return Boolean(cfg.apiKey);
    case "GOOGLE_VISION": return Boolean(cfg.apiKey);
    case "AZURE_FORM": return Boolean(cfg.apiKey && cfg.endpoint);
    case "TESSERACT": return true;
    case "PADDLEOCR": return true;
    default: return false;
  }
}

function checkProviderCredentials(cfg) {
  if (!cfg.provider) return { ok: false, message: "No provider selected" };
  switch (cfg.provider) {
    case "GEMINI":
      if (!cfg.apiKey) return { ok: false, message: "Gemini API key is required" };
      return { ok: true };
    case "MISTRAL":
      if (!cfg.apiKey) return { ok: false, message: "Mistral API key is required" };
      return { ok: true };
    case "GOOGLE_VISION":
      if (!cfg.apiKey) return { ok: false, message: "Google Vision API key is required" };
      return { ok: true };
    case "AZURE_FORM":
      if (!cfg.apiKey) return { ok: false, message: "Azure API key is required" };
      if (!cfg.endpoint) return { ok: false, message: "Azure endpoint URL is required" };
      return { ok: true };
    case "TESSERACT":
      return { ok: true };
    case "PADDLEOCR":
      return { ok: true };
    default:
      return { ok: false, message: `Unknown provider: ${cfg.provider}` };
  }
}

async function callGemini(apiKey, base64Data, mimeType) {
  const model = "gemini-3.6-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: "Extract ALL text from this purchase invoice image exactly as it appears. Include every line, number, date, GSTIN, HSN code, item name, quantity, rate, tax amounts, and totals. Preserve the original layout and formatting as much as possible. Do not summarize or omit any text." },
          { inlineData: { mimeType: mimeType || "image/png", data: base64Data } },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    if (res.status === 400 || res.status === 403) throw new Error("Invalid API credentials");
    throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n") || "";
  return text;
}

async function callMistral(apiKey, base64Data, mimeType) {
  const url = "https://api.mistral.ai/v1/ocr";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: {
        type: "image_url",
        image_url: `data:${mimeType || "image/png"};base64,${base64Data}`,
      },
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw new Error("Invalid API credentials");
    throw new Error(`Mistral API error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const pages = data.pages || [];
  return pages.map(p => p.markdown || p.text || "").join("\n\n");
}

async function callGoogleVision(apiKey, base64Data) {
  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: base64Data },
          features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
        }],
      }),
      signal: AbortSignal.timeout(60000),
    }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    if (res.status === 400 || res.status === 403) throw new Error("Invalid API credentials");
    throw new Error(`Google Vision API error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.responses?.[0]?.fullTextAnnotation?.text || "";
}

async function callAzureForm(apiKey, endpoint, base64Data) {
  const url = endpoint.replace(/\/$/, "");
  const analyzeUrl = `${url}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30`;

  const buf = Buffer.from(base64Data, "base64");
  const res = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Ocp-Apim-Subscription-Key": apiKey,
    },
    body: buf,
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw new Error("Invalid API credentials");
    throw new Error(`Azure Document Intelligence error ${res.status}: ${err.slice(0, 200)}`);
  }
  const result = await res.json();
  const lines = [];
  if (result.analyzeResult?.pages) {
    for (const page of result.analyzeResult.pages) {
      for (const line of page.lines || []) {
        lines.push(line.content);
      }
    }
  }
  return lines.join("\n");
}

async function callTesseractLocal(base64Data) {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const { writeFile, unlink, readFile } = await import("fs/promises");
    const { join } = await import("path");
    const { tmpdir } = await import("os");
    const execAsync = promisify(exec);

    const buf = Buffer.from(base64Data, "base64");
    const isPdf = buf[0] === 0x25 && buf[1] === 0x50;
    const ext = isPdf ? "pdf" : "png";
    const tmpPath = join(tmpdir(), `ocr_${Date.now()}.${ext}`);
    await writeFile(tmpPath, buf);

    const outBase = join(tmpdir(), `ocr_out_${Date.now()}`);
    try {
      await execAsync(`tesseract "${tmpPath}" "${outBase}" -l eng`, { timeout: 30000 });
      const text = await readFile(`${outBase}.txt`, "utf-8").catch(() => "");
      return text;
    } finally {
      await unlink(tmpPath).catch(() => {});
      await unlink(`${outBase}.txt`).catch(() => {});
    }
  } catch (e) {
    throw new Error(`Tesseract failed: ${e.message}`);
  }
}

async function callPaddleOCR(base64Data) {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const { writeFile, unlink, readFile } = await import("fs/promises");
    const { join } = await import("path");
    const { tmpdir } = await import("os");
    const execAsync = promisify(exec);

    const buf = Buffer.from(base64Data, "base64");
    const isPdf = buf[0] === 0x25 && buf[1] === 0x50;
    const ext = isPdf ? "pdf" : "png";
    const tmpPath = join(tmpdir(), `ocr_paddle_${Date.now()}.${ext}`);
    await writeFile(tmpPath, buf);

    const outDir = join(tmpdir(), `paddle_out_${Date.now()}`);
    try {
      await execAsync(`paddleocr --image "${tmpPath}" --output ${outDir}`, { timeout: 60000 });
      const jsonFiles = await import("fs/promises").then(fs => fs.readdir(outDir).catch(() => []));
      let text = "";
      for (const f of jsonFiles) {
        if (f.endsWith(".json")) {
          const raw = await readFile(join(outDir, f), "utf-8").catch(() => "");
          try {
            const data = JSON.parse(raw);
            if (data?.rec_texts) text += data.rec_texts.join("\n") + "\n";
            else if (Array.isArray(data)) {
              for (const item of data) {
                if (item?.[1]?.[0]) text += item[1][0] + "\n";
              }
            }
          } catch { text += raw + "\n"; }
        }
      }
      if (!text) {
        const txtFiles = await import("fs/promises").then(fs => fs.readdir(outDir).catch(() => []));
        for (const f of txtFiles) {
          if (f.endsWith(".txt")) {
            text += await readFile(join(outDir, f), "utf-8").catch(() => "") + "\n";
          }
        }
      }
      return text;
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  } catch (e) {
    throw new Error(`PaddleOCR failed: ${e.message}`);
  }
}

export async function extractTextFromImage(organizationId, base64Data, mimeType) {
  const cfg = await getOcrConfig(organizationId);

  if (!cfg.enabled || !cfg.provider) {
    return { text: "", provider: "none", status: "NOT_CONFIGURED" };
  }

  const credCheck = checkProviderCredentials(cfg);
  if (!credCheck.ok) {
    return { text: "", provider: cfg.provider, status: "NOT_CONFIGURED", message: credCheck.message };
  }

  let text = "";
  try {
    switch (cfg.provider) {
      case "GEMINI":
        text = await callGemini(cfg.apiKey, base64Data, mimeType);
        break;
      case "MISTRAL":
        text = await callMistral(cfg.apiKey, base64Data, mimeType);
        break;
      case "GOOGLE_VISION":
        text = await callGoogleVision(cfg.apiKey, base64Data);
        break;
      case "AZURE_FORM":
        text = await callAzureForm(cfg.apiKey, cfg.endpoint, base64Data);
        break;
      case "TESSERACT":
        text = await callTesseractLocal(base64Data);
        break;
      case "PADDLEOCR":
        text = await callPaddleOCR(base64Data);
        break;
      default:
        return { text: "", provider: cfg.provider, status: "UNKNOWN_PROVIDER" };
    }
    return { text, provider: cfg.provider, status: "OK" };
  } catch (e) {
    console.error(`OCR extraction failed [${cfg.provider}]:`, e.message);
    return { text: "", provider: cfg.provider, status: "OCR_FAILED", message: e.message };
  }
}

export function getLocalToolStatus() {
  const results = {};
  try {
    const { execSync } = require("child_process");
    try { execSync("tesseract --version", { stdio: "pipe" }); results.tesseract = true; } catch { results.tesseract = false; }
  } catch { results.tesseract = false; }
  try {
    const { execSync } = require("child_process");
    try { execSync("paddleocr --help", { stdio: "pipe" }); results.paddleocr = true; } catch { results.paddleocr = false; }
  } catch { results.paddleocr = false; }
  return results;
}

function findField(text, patterns) {
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return (m[1] || m[0]).trim();
  }
  return null;
}

function findAmount(text, labelPatterns) {
  const raw = findField(text, labelPatterns);
  if (!raw) return null;
  const cleaned = raw.replace(/[,\s]/g, "").replace(/[₹$]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function findCompanyName(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^(INVOICE|TAX\s*INVOICE|BILL|PURCHASE\s*ORDER)/i.test(line)) continue;
    if (/^(Bill\s*To|Ship\s*To|Item|Product|Description|Quantity|Amount|Summary|Note|Signature|UDYAM)/i.test(line)) continue;
    if (/^(Here|I\s|The\s|This|Please)/i.test(line)) continue;
    if (/^[\d\s\-+()]{8,}$/.test(line)) continue;
    if (/^[\w.+-]+@[\w.-]+\.\w{2,}$/.test(line)) continue;
    if (/^\d{4,8}$/.test(line)) continue;
    if (line.length < 3 || line.length > 60) continue;
    if (/^[A-Z][A-Za-z\s&.\-']+(?:Pvt|Ltd|LLP|Inc|Co|Solutions?|Enterprises?|Traders?|Services?|Company|Trading)\.?$/i.test(line)) return line;
    if (/^[A-Z][A-Za-z\s&.\-']{5,50}$/.test(line) && !/^\d/.test(line)) return line;
  }
  return null;
}

function extractGstin(text) {
  const m = text.match(/(?:GSTIN|GST\s*(?:No|Number|#)?|UIN)\s*[:.\-]?\s*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][Z\d][0-9A-Z])/i);
  return m ? m[1].toUpperCase() : null;
}

function extractStateCode(text) {
  const gstin = extractGstin(text);
  if (gstin) return gstin.substring(0, 2);
  const m = text.match(/(?:State\s*(?:Code|No)?)\s*[:.\-]?\s*(\d{2})/i);
  return m ? m[1] : null;
}

function extractInvoiceNumber(text) {
  const cleaned = text.replace(/\|/g, " ");
  return findField(cleaned, [
    /(?:Invoice\s*(?:No|Number|#|\.))\s*[:.\-\s:]*([A-Z0-9][\w\/\-]+)/i,
    /(?:Bill\s*(?:No|Number|#|\.))\s*[:.\-\s:]*([A-Z0-9][\w\/\-]+)/i,
    /(?:Inv\s*(?:No|#))\s*[:.\-\s:]*([A-Z0-9][\w\/\-]+)/i,
  ]);
}

function extractDate(text, labelPatterns) {
  const cleaned = text.replace(/\|/g, " ");
  const raw = findField(cleaned, labelPatterns);
  if (!raw) return null;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m2 = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m2) {
    let [, dd, mm, yy] = m2;
    if (yy.length === 2) yy = "20" + yy;
    const d2 = new Date(`${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`);
    if (!isNaN(d2.getTime())) return d2.toISOString().slice(0, 10);
  }
  const m3 = raw.match(/(\d{1,2})[\/\-.](\w+)[\/\-.](\d{2,4})/);
  if (m3) {
    const months = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
    const monKey = m3[2].toLowerCase().slice(0, 3);
    if (months[monKey]) {
      let yy = m3[3]; if (yy.length === 2) yy = "20" + yy;
      const d3 = new Date(`${yy}-${months[monKey]}-${m3[1].padStart(2, "0")}`);
      if (!isNaN(d3.getTime())) return d3.toISOString().slice(0, 10);
    }
  }
  return null;
}

function extractState(text) {
  const states = [
    "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
    "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka",
    "Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram",
    "Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu",
    "Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
    "Delhi","Jammu and Kashmir","Ladakh","Chandigarh","Puducherry",
  ];
  for (const s of states) {
    if (text.toLowerCase().includes(s.toLowerCase())) return s;
  }
  return extractStateCode(text);
}

function extractItems(text) {
  const items = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const itemPattern = /^(.{3,60}?)\s+(\d+(?:\.\d+)?)\s+(?:x\s*)?(\d+(?:,\d{3})*(?:\.\d+)?)\s+(?:x\s*)?(\d+(?:,\d{3})*(?:\.\d+)?)/i;
  const simplePattern = /^(.{3,50}?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s*$/i;

  for (const line of lines) {
    const m = line.match(itemPattern);
    if (m) {
      items.push({
        description: m[1].trim(),
        quantity: parseFloat(m[2]) || 1,
        unitPrice: parseFloat(m[3].replace(/,/g, "")) || 0,
        totalAmount: parseFloat(m[4].replace(/,/g, "")) || 0,
      });
      continue;
    }
    const m2 = line.match(simplePattern);
    if (m2) {
      items.push({
        description: m2[1].trim(),
        quantity: 1,
        unitPrice: parseFloat(m2[2].replace(/,/g, "")) || 0,
        totalAmount: parseFloat(m2[3].replace(/,/g, "")) || 0,
      });
    }
  }
  return items;
}

function extractHsn(text) {
  const m = text.match(/(?:HSN|SAC)\s*(?:Code)?\s*[:.\-]?\s*(\d{4,8})/i);
  if (m) return m[1];
  const hsnLine = text.split("\n").find(l => /\b\d{4,8}\b/.test(l) && /HSN/i.test(l));
  if (hsnLine) {
    const h = hsnLine.match(/\b(\d{4,8})\b/);
    if (h) return h[1];
  }
  return null;
}

function stripMarkdown(text) {
  let s = text;
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/?div[^>]*>/gi, "");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/^\|/gm, "");
  s = s.replace(/\|$/gm, "");
  s = s.replace(/\|/g, " ");
  s = s.replace(/^[-:]{3,}\s*$/gm, "");
  s = s.replace(/^[\s*]{3,}\s*$/gm, "");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s;
}

function cleanCellHtml(s) {
  return s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function parseIndianNumber(s) {
  if (!s) return 0;
  let cleaned = s.replace(/[₹$]/g, "").replace(/,/g, "").trim();
  cleaned = cleaned.replace(/[A-Za-z]+/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function detectTableColumns(headerCells) {
  const map = { desc: -1, hsn: -1, qty: -1, rate: -1, taxable: -1, gst: -1, amount: -1, tax: -1 };
  for (let i = 0; i < headerCells.length; i++) {
    const c = headerCells[i].toLowerCase().replace(/[^a-z\s\/]/g, "");
    if (/^(sr|s\/?no|#|no\.?)$/.test(c)) continue;
    if (map.desc === -1 && /desc|product|item|particular/.test(c)) map.desc = i;
    else if (map.hsn === -1 && /hsn|sac/.test(c)) map.hsn = i;
    else if (map.qty === -1 && /qty|quantity|pcs|nos/.test(c)) map.qty = i;
    else if (map.rate === -1 && /rate|price|unit\s*price/.test(c)) map.rate = i;
    else if (map.taxable === -1 && /taxable|base|sub/.test(c)) map.taxable = i;
    else if (map.gst === -1 && /gst|tax/.test(c)) map.gst = i;
    else if (map.amount === -1 && /amount|total|value/.test(c)) map.amount = i;
  }
  if (map.amount === -1) map.amount = headerCells.length - 1;
  if (map.desc === -1) map.desc = 0;
  return map;
}

function extractTableItems(text) {
  const items = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  let inTable = false;
  let headerCells = null;
  let colMap = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line.split("|").map(c => cleanCellHtml(c)).filter(c => c.length > 0);
      if (cells.length < 3) continue;
      const isHeader = cells.some(c => /no|desc|item|product|hsn|qty|quantity|rate|amount|gst|tax|price|sac|particular/i.test(c));
      const isSeparator = cells.every(c => /^[-:]+$/.test(c));
      if (isSeparator) continue;
      if (isHeader && !inTable) {
        inTable = true;
        headerCells = cells;
        colMap = detectTableColumns(cells);
        continue;
      }
      if (inTable) {
        const getCell = (key) => colMap[key] >= 0 && colMap[key] < cells.length ? cells[colMap[key]] : null;
        const rawDesc = getCell("desc") || cells[colMap.desc] || "";
        const descParts = rawDesc.split(/\n/).map(s => s.trim()).filter(Boolean);
        const description = descParts[0] || "";
        const embeddedHsn = rawDesc.match(/HSN\s*(?:Code)?\s*:?\s*(\d{4,8})/i);
        const hsnCode = getCell("hsn") || (embeddedHsn ? embeddedHsn[1] : null);
        let quantity = parseIndianNumber(getCell("qty")) || 1;
        let unitPrice = parseIndianNumber(getCell("rate"));
        let taxableAmount = parseIndianNumber(getCell("taxable"));
        let totalAmount = parseIndianNumber(getCell("amount"));
        let gstPercent = null;
        const gstCell = getCell("gst") || getCell("tax");
        if (gstCell) {
          const gstMatch = gstCell.match(/(\d+(?:\.\d+)?)\s*%/);
          if (gstMatch) gstPercent = gstMatch[1];
        }
        if (unitPrice === 0 && quantity > 0 && taxableAmount > 0) unitPrice = taxableAmount / quantity;
        if (taxableAmount === 0 && unitPrice > 0 && quantity > 0) taxableAmount = unitPrice * quantity;
        if (totalAmount === 0 && taxableAmount > 0) totalAmount = taxableAmount;
        items.push({ description, hsnCode, quantity, unitPrice, taxableAmount, totalAmount, gstPercent });
      }
    } else {
      inTable = false;
      headerCells = null;
      colMap = null;
    }
  }
  return items;
}

export function parseOcrText(text) {
  if (!text || !text.trim()) {
    return {
      supplier: { name: null, address: null, gstin: null, state: null, stateCode: null, phone: null, email: null },
      invoice: { supplierInvoiceNo: null, invoiceDate: null, dueDate: null, poNo: null, placeOfSupply: null },
      items: [],
      totals: { taxableTotal: null, cgstTotal: null, sgstTotal: null, igstTotal: null, otherCharges: 0, roundOff: 0, grandTotal: null },
      confidence: "LOW",
    };
  }

  let clean = stripMarkdown(text);
  clean = clean.replace(/^Here is .+?[:.]\s*/im, "");
  clean = clean.replace(/^I\s+(?:have|will|extracted|preserved).+$/im, "");
  clean = clean.replace(/^\*\*\*+\s*$/gm, "");

  const gstin = extractGstin(clean);
  const stateCode = extractStateCode(clean);

  const supplierName = findField(clean, [
    /(?:Supplier|Vendor|Seller|From|Sold\s*By|Billed\s*By)\s*[:.\-]\s*(.{3,80})/i,
  ]) || findCompanyName(clean);

  const address = findField(clean, [
    /(?:Address|Addr)\s*[:.\-]\s*(.{5,120})/i,
  ]);
  const state = extractState(clean);
  const phone = findField(clean, [/(?:Phone|Tel|Mobile)\s*[:.\-]\s*([\d\s\-+]{8,15})/i]);
  const email = findField(clean, [/(?:Email|E-mail)\s*[:.\-]\s*([\w.+-]+@[\w.-]+\.\w{2,})/i]);

  const supplierInvoiceNo = extractInvoiceNumber(clean);
  const invoiceDate = extractDate(clean, [
    /(?:Invoice\s*Date|Date\s*of\s*Invoice|Bill\s*Date)\s*[:.\-\s:]*([\d\/\-.\w\s]+)/i,
  ]);
  const dueDate = extractDate(clean, [/(?:Due\s*Date|Payment\s*Due)\s*[:.\-\s:]*([\d\/\-.\w\s]+)/i]);
  const poNo = findField(clean, [/(?:PO\s*(?:No|Number|#|\.?)|Purchase\s*Order|Order\s*(?:No|Number))\s*[:.\-\s:]*([A-Z0-9][\w\/\-]+)/i]);
  const placeOfSupply = findField(clean, [/(?:Place\s*of\s*Supply|POS)\s*[:.\-\s:]*([\w\s,.-]{3,50})/i]);

  let items = extractTableItems(text);
  if (items.length === 0) {
    items = extractItems(clean);
  }

  const taxableTotal = findAmount(clean, [
    /(?:Taxable\s*(?:Value|Amount|Total)|Base\s*Amount)\s*[:.\-\s:]*\s*(?:Rs\.?\s*)?([₹$]?\s*[\d,]+(?:\.\d{1,2})?)/i,
  ]);
  const cgstTotal = findAmount(clean, [/(?:CGST|Central\s*GST)\s*(?:\([^)]*\))?\s*[:.\-\s:]*(?:\d+(?:\.\d+)?%\s*[:.\-\s:]*)?(?:Rs\.?\s*)?([₹$]?\s*[\d,]+(?:\.\d{1,2})?)/i]);
  const sgstTotal = findAmount(clean, [/(?:SGST|State\s*GST)\s*(?:\([^)]*\))?\s*[:.\-\s:]*(?:\d+(?:\.\d+)?%\s*[:.\-\s:]*)?(?:Rs\.?\s*)?([₹$]?\s*[\d,]+(?:\.\d{1,2})?)/i]);
  const igstTotal = findAmount(clean, [/(?:IGST|Integrated\s*GST)\s*(?:\([^)]*\))?\s*[:.\-\s:]*(?:\d+(?:\.\d+)?%\s*[:.\-\s:]*)?(?:Rs\.?\s*)?([₹$]?\s*[\d,]+(?:\.\d{1,2})?)/i]);
  const grandTotal = findAmount(clean, [
    /(?:Grand\s*Total|Sub\s*Total|Total\s*(?:Amount|Payable)|Amount\s*(?:Payable|Due))\s*[:.\-\s:]*\s*(?:Rs\.?\s*)?([₹$]?\s*[\d,]+(?:\.\d{1,2})?)/i,
  ]);
  const otherCharges = findAmount(clean, [/(?:Other\s*Charges?|Freight|Shipping)\s*[:.\-]?\s*(?:Rs\.?\s*)?([₹$]?\s*[\d,]+(?:\.\d{1,2})?)/i]) || 0;
  const roundOff = findAmount(clean, [/(?:Round\s*[- ]?off|Adjustment\/?Round\s*off)\s*[:.\-]?\s*([₹$]?\s*[\d,]+(?:\.\d{1,2})?)/i]) || 0;

  let confidence = "HIGH";
  if (!gstin && !supplierName) confidence = "LOW";
  else if (!supplierInvoiceNo || !invoiceDate) confidence = "MEDIUM";
  if (items.length === 0) confidence = "LOW";

  const mappedItems = items.filter(it => it.description && !/amount\s*in\s*words|sub\s*total|grand\s*total|balance|signature|please\s*note/i.test(it.description) && (it.unitPrice > 0 || it.totalAmount > 0 || it.hsnCode)).map(it => {
    let desc = it.description.replace(/\*\*/g, "").replace(/HSN\s*(?:Code)?\s*:\s*\d{4,8}/gi, "").trim();
    let hsn = it.hsnCode;
    if (!hsn) { const m = it.description.match(/HSN\s*(?:Code)?\s*:\s*(\d{4,8})/i); if (m) hsn = m[1]; }
    return {
      description: desc,
      hsnCode: hsn || null,
      quantity: it.quantity || 1,
      unitPrice: it.unitPrice || 0,
      taxableAmount: it.taxableAmount || 0,
      totalAmount: it.totalAmount || 0,
      gstPercent: it.gstPercent || null,
      cgstRate: 0, sgstRate: 0, igstRate: 0,
      cgstAmount: 0, sgstAmount: 0, igstAmount: 0,
      discount: 0, uom: "Nos",
    };
  });

  if (mappedItems.length > 0) {
    const itemsNeedInference = mappedItems.every(it => !it.gstPercent);
    if (itemsNeedInference && taxableTotal > 0) {
      let inferredRate = 0;
      if (igstTotal > 0) inferredRate = round2((igstTotal / taxableTotal) * 100);
      else if (cgstTotal > 0 && sgstTotal > 0) inferredRate = round2(((cgstTotal + sgstTotal) / taxableTotal) * 100);
      else if (cgstTotal > 0) inferredRate = round2((cgstTotal / taxableTotal) * 200);
      if (inferredRate > 0) {
        mappedItems.forEach(it => { it.gstPercent = String(inferredRate); });
      }
    }
  }

  return {
    supplier: { name: supplierName, address, gstin, state, stateCode, phone, email },
    invoice: { supplierInvoiceNo, invoiceDate, dueDate, poNo, placeOfSupply },
    items: mappedItems,
    totals: { taxableTotal, cgstTotal, sgstTotal, igstTotal, otherCharges, roundOff, grandTotal },
    confidence,
  };
}
