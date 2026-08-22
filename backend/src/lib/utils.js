import { Decimal } from "@prisma/client/runtime/library";

export function getCurrentFinancialYear() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month >= 3) {
    return `${year.toString().slice(-2)}-${(year + 1).toString().slice(-2)}`;
  }
  return `${(year - 1).toString().slice(-2)}-${year.toString().slice(-2)}`;
}

export function getFinancialYearRange() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month >= 3) {
    return {
      start: new Date(year, 3, 1),
      end: new Date(year + 1, 2, 31, 23, 59, 59),
    };
  }
  return {
    start: new Date(year - 1, 3, 1),
    end: new Date(year, 2, 31, 23, 59, 59),
  };
}

export function roundTo2(n) {
  return Math.round(n * 100) / 100;
}

export function calculateItemTax(item, taxMode, taxRatePercent) {
  const qty = Number(item.quantity);
  const rate = Number(item.unitRate);
  const taxableValue = roundTo2(qty * rate);
  const taxRate = Number(taxRatePercent || 0);

  let cgstRate = 0;
  let sgstRate = 0;
  let igstRate = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (taxMode === "INTRA_STATE_GST") {
    cgstRate = roundTo2(taxRate / 2);
    sgstRate = roundTo2(taxRate / 2);
    cgstAmount = roundTo2((taxableValue * cgstRate) / 100);
    sgstAmount = roundTo2((taxableValue * sgstRate) / 100);
  } else if (taxMode === "INTER_STATE_GST") {
    igstRate = roundTo2(taxRate);
    igstAmount = roundTo2((taxableValue * igstRate) / 100);
  }

  const totalTax = cgstAmount + sgstAmount + igstAmount;
  const totalAmount = roundTo2(taxableValue + totalTax);

  return {
    taxableValue,
    cgstRate,
    sgstRate,
    igstRate,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalAmount,
  };
}

export function calculateInvoiceTotals(items, taxMode) {
  let taxableTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  for (const item of items) {
    taxableTotal += Number(item.taxableValue);
    cgstTotal += Number(item.cgstAmount);
    sgstTotal += Number(item.sgstAmount);
    igstTotal += Number(item.igstAmount);
  }

  const totalTax = roundTo2(cgstTotal + sgstTotal + igstTotal);
  taxableTotal = roundTo2(taxableTotal);
  cgstTotal = roundTo2(cgstTotal);
  sgstTotal = roundTo2(sgstTotal);
  igstTotal = roundTo2(igstTotal);
  const grandTotalPreRound = taxableTotal + totalTax;
  const grandTotal = Math.round(grandTotalPreRound);
  const roundOff = roundTo2(grandTotal - grandTotalPreRound);

  return {
    taxableTotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    totalTax,
    roundOff,
    grandTotal,
  };
}

export function numberToWords(num) {
  if (num === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convertGroup(n) {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " and " + convertGroup(n % 100) : "");
  }

  const wholePart = Math.floor(num);
  const decimalPart = Math.round((num - wholePart) * 100);

  if (wholePart === 0 && decimalPart === 0) return "Zero";

  let result = "";
  const crore = Math.floor(wholePart / 10000000);
  const lakh = Math.floor((wholePart % 10000000) / 100000);
  const thousand = Math.floor((wholePart % 100000) / 1000);
  const remainder = wholePart % 1000;

  if (crore > 0) result += convertGroup(crore) + " Crore ";
  if (lakh > 0) result += convertGroup(lakh) + " Lakh ";
  if (thousand > 0) result += convertGroup(thousand) + " Thousand ";
  if (remainder > 0) result += convertGroup(remainder);

  result = result.trim() + " Rupees";

  if (decimalPart > 0) {
    result += " and " + convertGroup(decimalPart) + " Paise";
  }

  result += " Only";
  return result;
}
