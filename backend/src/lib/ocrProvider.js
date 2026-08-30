import { prisma } from "../db.js";

const OCR_CONFIG_KEY = "ocrProvider";

const ALLOWED_MIMES = [
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
  "application/pdf",
];
const MAX_FILE_SIZE = 15 * 1024 * 1024;

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
    configured: Boolean(cfg.apiKey && cfg.provider),
  };
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
    throw new Error(`Google Vision API error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.responses?.[0]?.fullTextAnnotation?.text || "";
  return text;
}

async function callAzureForm(apiKey, endpoint, base64Data) {
  const url = endpoint || "https://tgit-ocr.cognitiveservices.azure.com";
  const analyzeUrl = `${url.replace(/\/$/, "")}/formmodels/analyze?api-version=2023-07-31`;

  const buf = Buffer.from(base64Data, "base64");
  const res = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Ocp-Apim-Subscription-Key": apiKey,
    },
    body: buf,
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Azure Form API error ${res.status}: ${err.slice(0, 200)}`);
  }
  const result = await res.json();
  const lines = [];
  if (result.analyzeResult?.readResult?.pages) {
    for (const page of result.analyzeResult.readResult.pages) {
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

export async function extractTextFromImage(organizationId, base64Data) {
  const cfg = await getOcrConfig(organizationId);

  if (!cfg.enabled || !cfg.provider) {
    return { text: "", provider: "none", status: "NOT_CONFIGURED" };
  }

  let text = "";
  switch (cfg.provider) {
    case "GOOGLE_VISION":
      text = await callGoogleVision(cfg.apiKey, base64Data);
      break;
    case "AZURE_FORM":
      text = await callAzureForm(cfg.apiKey, cfg.endpoint, base64Data);
      break;
    case "TESSERACT":
      text = await callTesseractLocal(base64Data);
      break;
    default:
      return { text: "", provider: cfg.provider, status: "UNKNOWN_PROVIDER" };
  }

  return { text, provider: cfg.provider, status: "OK" };
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

function extractGstin(text) {
  const m = text.match(/(?:GSTIN|GST\s*(?:No|Number|#)?|UIN)\s*[:.\-]?\s*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][Z\d][0-9A-Z])/i);
  return m ? m[1].toUpperCase() : null;
}

function extractInvoiceNumber(text) {
  return findField(text, [
    /(?:Invoice\s*(?:No|Number|#|\.))\s*[:.\-]?\s*([A-Z0-9][\w\/\-]+)/i,
    /(?:Bill\s*(?:No|Number|#|\.))\s*[:.\-]?\s*([A-Z0-9][\w\/\-]+)/i,
    /(?:Inv\s*(?:No|#))\s*[:.\-]?\s*([A-Z0-9][\w\/\-]+)/i,
  ]);
}

function extractDate(text, labelPatterns) {
  const raw = findField(text, labelPatterns);
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
  const stCode = text.match(/(?:State\s*(?:Code|No)?)\s*[:.\-]?\s*(\d{2})/i);
  if (stCode) return stCode[1];
  return null;
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

function extractHsn(text, description) {
  const m = text.match(/(?:HSN|SAC)\s*(?:Code)?\s*[:.\-]?\s*(\d{4,8})/i);
  if (m) return m[1];
  const hsnLine = text.split("\n").find(l => /\b\d{4,8}\b/.test(l) && /HSN/i.test(l));
  if (hsnLine) {
    const h = hsnLine.match(/\b(\d{4,8})\b/);
    if (h) return h[1];
  }
  return null;
}

export function parseOcrText(text) {
  if (!text || !text.trim()) {
    return {
      supplier: { name: null, address: null, gstin: null, state: null, phone: null, email: null },
      invoice: { supplierInvoiceNo: null, invoiceDate: null, dueDate: null, poNo: null, placeOfSupply: null },
      items: [],
      totals: { taxableTotal: null, cgstTotal: null, sgstTotal: null, igstTotal: null, otherCharges: 0, roundOff: 0, grandTotal: null },
      confidence: "LOW",
    };
  }

  const gstin = extractGstin(text);
  const supplierName = findField(text, [
    /(?:Supplier|Vendor|Seller|From|Sold\s*By)\s*[:.\-]?\s*(.{3,80})/i,
    /^([A-Z][A-Za-z\s&]{3,60}(?:Pvt|Ltd|LLP|Inc|Co)\.?)/m,
  ]);
  const address = findField(text, [
    /(?:Address|Addr)\s*[:.\-]?\s*(.{5,120})/i,
  ]);
  const state = extractState(text);
  const phone = findField(text, [/(?:Phone|Tel|Mobile)\s*[:.\-]?\s*([\d\s\-+]{8,15})/i]);
  const email = findField(text, [/(?:Email|E-mail)\s*[:.\-]?\s*([\w.+-]+@[\w.-]+\.\w{2,})/i]);

  const supplierInvoiceNo = extractInvoiceNumber(text);
  const invoiceDate = extractDate(text, [
    /(?:Invoice\s*Date|Date\s*of\s*Invoice|Bill\s*Date)\s*[:.\-]?\s*([\d\/\-.\w\s]+)/i,
  ]);
  const dueDate = extractDate(text, [/(?:Due\s*Date|Payment\s*Due)\s*[:.\-]?\s*([\d\/\-.\w\s]+)/i]);
  const poNo = findField(text, [/(?:PO\s*(?:No|Number|#)|Purchase\s*Order)\s*[:.\-]?\s*([A-Z0-9][\w\/\-]+)/i]);
  const placeOfSupply = findField(text, [/(?:Place\s*of\s*Supply|POS)\s*[:.\-]?\s*(.{3,50})/i]);

  const items = extractItems(text);

  const taxableTotal = findAmount(text, [
    /(?:Taxable\s*(?:Value|Amount|Total))\s*[:.\-]?\s*([₹$]?\s*[\d,]+(?:\.\d{1,2})?)/i,
  ]);
  const cgstTotal = findAmount(text, [/CGST\s*[:.\-]?\s*([₹$]?\s*[\d,]+(?:\.\d{1,2})?)/i]);
  const sgstTotal = findAmount(text, [/SGST\s*[:.\-]?\s*([₹$]?\s*[\d,]+(?:\.\d{1,2})?)/i]);
  const igstTotal = findAmount(text, [/IGST\s*[:.\-]?\s*([₹$]?\s*[\d,]+(?:\.\d{1,2})?)/i]);
  const grandTotal = findAmount(text, [
    /(?:Grand\s*Total|Total\s*(?:Amount|Payable)|Amount\s*(?:Payable|Due))\s*[:.\-]?\s*([₹$]?\s*[\d,]+(?:\.\d{1,2})?)/i,
  ]);
  const otherCharges = findAmount(text, [/(?:Other\s*Charges?|Freight|Shipping)\s*[:.\-]?\s*([₹$]?\s*[\d,]+(?:\.\d{1,2})?)/i]) || 0;
  const roundOff = findAmount(text, [/(?:Round\s*[- ]?off)\s*[:.\-]?\s*([₹$]?\s*[\d,]+(?:\.\d{1,2})?)/i]) || 0;

  let confidence = "HIGH";
  if (!gstin && !supplierName) confidence = "LOW";
  else if (!supplierInvoiceNo || !invoiceDate) confidence = "MEDIUM";
  if (items.length === 0) confidence = "LOW";

  return {
    supplier: { name: supplierName, address, gstin, state, phone, email },
    invoice: { supplierInvoiceNo, invoiceDate, dueDate, poNo, placeOfSupply },
    items: items.map(it => ({
      ...it,
      hsnCode: extractHsn(text, it.description),
      cgstRate: 0, sgstRate: 0, igstRate: 0,
      cgstAmount: 0, sgstAmount: 0, igstAmount: 0,
      discount: 0, uom: "Nos",
    })),
    totals: { taxableTotal, cgstTotal, sgstTotal, igstTotal, otherCharges, roundOff, grandTotal },
    confidence,
  };
}
