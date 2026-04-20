// netlify/functions/recommend.js
// Proxies quiz answers to Claude API and returns a personalized product recommendation.
// Env vars required: ANTHROPIC_API_KEY

const PRODUCTS = [
  { name: "Farm Friends Giant Coloring Tablecloth", handle: "farm-themed-coloring-table-cover", themes: ["farm animals and nature", "everyday family meals", "toddlers and young kids"] },
  { name: "Dino Adventure Giant Coloring Tablecloth", handle: "personalized-dinosaur-birthday-coloring-poster", themes: ["dinosaurs and adventure", "school-age kids", "birthday party"] },
  { name: "Princess Fantasy Giant Coloring Tablecloth", handle: "princess-birthday-table-cover-personalized", themes: ["princess and fantasy", "toddlers and young kids", "birthday party"] },
  { name: "Ocean Explorers Giant Coloring Tablecloth", handle: "ocean-coloring-tablecloth", themes: ["ocean and sea creatures", "school-age kids", "everyday family meals"] },
  { name: "Fishers of Men Giant Coloring Tablecloth", handle: "armor-of-god-faith-based-coloring-tablecloth", themes: ["faith-based scripture art", "faith or church event"] },
  { name: "Fruit of the Spirit Giant Coloring Tablecloth", handle: "fruit-of-the-spirit-coloring-tablecloth", themes: ["faith-based scripture art", "faith or church event", "everyday family meals"] },
  { name: "America 250 Giant Coloring Tablecloth", handle: "america-250", themes: ["patriotic America theme", "holiday dinner", "a mix of all ages"] },
  { name: "Birthday Bash Giant Coloring Tablecloth", handle: "happy-birthday-coloring-collage-table-cover", themes: ["birthday party", "school-age kids", "a mix of all ages"] },
  { name: "Ice Cream Dreams Giant Coloring Tablecloth", handle: "ice-cream-coloring-poster", themes: ["everyday family meals", "birthday party", "toddlers and young kids"] },
  { name: "Pumpkin Patch Giant Coloring Tablecloth", handle: "pumpkin-patch-coloring-table-cover", themes: ["holiday dinner", "farm animals and nature", "a mix of all ages"] },
  { name: "Christmas Joy Giant Coloring Tablecloth", handle: "color-you-own-christmas-table-cover", themes: ["holiday dinner", "faith or church event", "a mix of all ages"] },
];

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "https://creativecrayonsworkshop.com",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { occasion, who, theme } = body;

  if (!occasion || !who || !theme) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  const productList = PRODUCTS.map(p => `- ${p.name} (handle: ${p.handle})`).join("\n");

  const prompt = `You are the product recommender for Creative Crayons Workshop, which sells giant coloring tablecloths (5ft x 3.5ft) and matching placemat packs. These are beloved for family gatherings, parties, and activities because the whole table becomes a coloring canvas.

Our current product line:
${productList}

A customer just completed a quiz:
- Occasion: ${occasion}
- Who will be coloring: ${who}
- Theme preference: ${theme}

Based on their answers, select the single best product from the list above and write a warm, specific recommendation.

Respond ONLY with a JSON object (no markdown, no backticks, no preamble) with exactly three fields:
- "name": the product name exactly as listed above
- "handle": the handle exactly as listed above
- "why": 2 warm, enthusiastic sentences (max 55 words) explaining why this is perfect for them. Reference the occasion and who is coloring. Sound like a friendly brand, not a robot. Use "you" and "your family."`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status}`);
    }

    const data = await res.json();
    const raw = data.content?.find(b => b.type === "text")?.text || "{}";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        name: parsed.name || "Giant Coloring Tablecloth",
        handle: parsed.handle || "",
        why: parsed.why || "We think this one is a perfect fit for your next gathering!",
      }),
    };
  } catch (err) {
    console.error("Recommend error:", err);
    // Fallback — still return something useful
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        name: "Giant Coloring Tablecloth",
        handle: "",
        why: "Based on your answers, we've found the perfect tablecloth for your family! Grab 10% off your first order below.",
      }),
    };
  }
}
