import { generateBatchForecasts } from './lib/gemini';
import { getEnrichedMatches } from './lib/football';

async function test() {
  const matches = await getEnrichedMatches('2026-05-03', 'PL');
  if (matches.length > 0) {
    console.log("Found matches:", matches.length);
    const res = await generateBatchForecasts(matches);
    console.log("Generated:", res.size);
  } else {
    console.log("No matches found");
  }
}

test();
