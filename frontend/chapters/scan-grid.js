// Include both endpoints; the service accepts at most 128 actual work points.
export function fieldGrid(maximum, count = 61) {
  const n = [29, 61, 121].includes(Number(count)) ? Number(count) : 61;
  return Array.from({length:n}, (_, i) => Number((maximum * i / (n - 1)).toFixed(8)));
}
