const { generateBatchForecasts } = require('./lib/gemini');
const { getEnrichedMatches } = require('./lib/football');

async function test() {
  const matches = await getEnrichedMatches('2026-05-02', 'PD');
  if (matches.length > 0) {
    const res = await generateBatchForecasts(matches);
    console.log(res);
  } else {
    console.log("No matches found");
  }
}

test();
