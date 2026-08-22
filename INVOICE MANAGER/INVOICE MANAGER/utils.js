(function () {
  "use strict";

  const COMPANY_DEFAULTS = {
    companyName: "Tech Geeks IT Solutions",
    address: "Bande Ali Pally\nBansdroni",
    phone: "8420580444",
    gstin: "19ARTPN5011E1ZO",
    udyam: "UDYAM-WB-10-0083452",
    bankDetails: "",
    logoDataUrl: "assets/TGIT.png",
    signatureDataUrl: ""
  };

  function clean(value) {
    if (value === undefined || value === null) return "";
    const text = String(value).trim();
    if (!text || /^(undefined|null|n\/a)$/i.test(text)) return "";
    if (/^0(?:\.0+)?$/.test(text)) return "";
    return text;
  }

  function numberValue(value) {
    if (value === undefined || value === null || value === "") return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const n = Number(String(value).replace(/[₹,\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function money(value) {
    const n = numberValue(value);
    if (!n) return "";
    return "₹ " + n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function signedMoney(value) {
    const n = numberValue(value);
    if (!n) return "";
    const sign = n > 0 ? "+" : "-";
    return sign + " ₹ " + Math.abs(n).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function qty(value) {
    const n = numberValue(value);
    return n ? n.toFixed(2) : "";
  }

  function ratePercent(value) {
    const n = numberValue(value);
    return n ? n.toFixed(2) + "%" : "";
  }

  function fileDate(value) {
    const d = parseDate(value);
    if (!d) return clean(value);
    return [
      String(d.getDate()).padStart(2, "0"),
      String(d.getMonth() + 1).padStart(2, "0"),
      d.getFullYear()
    ].join("-");
  }

  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number") {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      epoch.setUTCDate(epoch.getUTCDate() + value);
      return new Date(epoch.getUTCFullYear(), epoch.getUTCMonth(), epoch.getUTCDate());
    }
    const text = String(value).trim();
    if (!text) return null;
    const direct = new Date(text);
    if (!Number.isNaN(direct.getTime())) return direct;
    const m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (!m) return null;
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(year, Number(m[2]) - 1, Number(m[1]));
  }

  function todayParts() {
    const d = new Date();
    return {
      date: fileDate(d),
      time: d.toLocaleTimeString("en-IN", { hour12: false })
    };
  }

  function safeFileName(value) {
    return clean(value).replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "-") || "invoice";
  }

  function amountInWordsIndian(amount) {
    const n = Math.round(numberValue(amount));
    if (!n) return "";
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    const belowHundred = (x) => x < 20 ? ones[x] : [tens[Math.floor(x / 10)], ones[x % 10]].filter(Boolean).join(" ");
    const belowThousand = (x) => {
      const h = Math.floor(x / 100);
      const r = x % 100;
      return [h ? ones[h] + " Hundred" : "", r ? belowHundred(r) : ""].filter(Boolean).join(" ");
    };
    const parts = [];
    let rest = n;
    const crore = Math.floor(rest / 10000000); rest %= 10000000;
    const lakh = Math.floor(rest / 100000); rest %= 100000;
    const thousand = Math.floor(rest / 1000); rest %= 1000;
    if (crore) parts.push(belowThousand(crore) + " Crore");
    if (lakh) parts.push(belowThousand(lakh) + " Lakh");
    if (thousand) parts.push(belowThousand(thousand) + " Thousand");
    if (rest) parts.push(belowThousand(rest));
    return parts.join(" ") + " Rupees Only";
  }

  function getColumn(row, names) {
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
    }
    const normalized = {};
    Object.keys(row).forEach((k) => normalized[k.toUpperCase().replace(/\s+/g, " ").trim()] = row[k]);
    for (const name of names) {
      const key = name.toUpperCase().replace(/\s+/g, " ").trim();
      if (Object.prototype.hasOwnProperty.call(normalized, key)) return normalized[key];
    }
    return "";
  }

  function invoiceFileName(invoice) {
    const date = fileDate(invoice.invoiceDate).replace(/-/g, "");
    return "INVOICE_" + safeFileName(invoice.invoiceNo) + "_" + date + ".pdf";
  }

  function escapeHtml(value) {
    return clean(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch]));
  }

  window.TGITUtils = {
    COMPANY_DEFAULTS,
    clean,
    numberValue,
    money,
    signedMoney,
    qty,
    ratePercent,
    fileDate,
    parseDate,
    todayParts,
    safeFileName,
    amountInWordsIndian,
    getColumn,
    invoiceFileName,
    escapeHtml
  };
})();
