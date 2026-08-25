export function applyRoundOff(calculatedTotal, roundOffMode) {
  const ct = Math.round(calculatedTotal * 100) / 100;
  const mode = (roundOffMode || "NEAREST").toUpperCase();
  if (mode === "NONE") {
    return { grandTotal: ct, roundOff: 0 };
  }
  let grandTotal;
  if (mode === "UP") grandTotal = Math.ceil(ct);
  else if (mode === "DOWN") grandTotal = Math.floor(ct);
  else grandTotal = Math.round(ct);
  return { grandTotal, roundOff: Math.round((grandTotal - ct) * 100) / 100 };
}

export const ROUND_OFF_MODES = [
  { value: "NEAREST", label: "Nearest (Round)" },
  { value: "UP", label: "Round Up" },
  { value: "DOWN", label: "Round Down" },
  { value: "NONE", label: "None" },
];
