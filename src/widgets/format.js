/** A number for a lab readout: grouped thousands, fixed decimals, "–" when unknown. */
export const fmt = (x, digits = 0) => (Number.isFinite(x)
  ? x.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '–');
