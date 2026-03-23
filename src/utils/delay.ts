/** Random delay between min and max ms */
export function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Gaussian-ish human delay centered around 1.5s */
export function humanDelay(): Promise<void> {
  // Box-Muller transform for normal distribution
  const u1 = Math.random();
  const u2 = Math.random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const ms = Math.max(500, Math.floor(1500 + normal * 500));
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Simulate reading time based on text length */
export function readingDelay(text: string): Promise<void> {
  const wordsPerMinute = 200;
  const words = text.split(/\s+/).length;
  const ms = Math.max(1000, (words / wordsPerMinute) * 60 * 1000);
  return new Promise(resolve => setTimeout(resolve, ms));
}
