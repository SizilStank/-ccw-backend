// netlify/functions/recommend.js
// Proxies quiz answers to Claude API and returns a personalized product recommendation.
// Env vars required: ANTHROPIC_API_KEY

const PRODUCTS = [
  // TOP SELLERS — theme-based, work for birthday AND everyday
  { name: "Farm Themed Coloring Tablecloth", handle: "farm-themed-coloring-table-cover", themes: ["farm animals", "farm", "animals", "birthday party", "everyday family fun"] },
  { name: "Construction Birthday Coloring Tablecloth", handle: "construction-birthday-coloring-tablecloth", themes: ["construction", "trucks", "building", "birthday party", "everyday family fun", "school-age kids"] },
  { name: "Dog Party Coloring Tablecloth", handle: "dog-party-coloring-tablecloth", themes: ["dogs", "puppies", "pets", "animals", "birthday party", "everyday family fun", "toddlers and young kids"] },
  { name: "Sweet Birthday Coloring Tablecloth", handle: "sweet-birthday-coloring-tablecloth", themes: ["sweets", "ice cream", "candy", "birthday party", "everyday family fun", "toddlers and young kids"] },
  { name: "Football Coloring Tablecloth", handle: "football-coloring-tablecloth", themes: ["football", "sports", "birthday party", "everyday family fun", "school-age kids"] },
  { name: "Dino Adventure Giant Coloring Tablecloth", handle: "personalized-dinosaur-birthday-coloring-poster", themes: ["dinosaurs", "dinos", "adventure", "birthday party", "everyday family fun", "school-age kids"] },
  { name: "Princess Fantasy Giant Coloring Tablecloth", handle: "princess-birthday-table-cover-personalized", themes: ["princess", "fantasy", "unicorn", "birthday party", "everyday family fun", "toddlers and young kids"] },
  { name: "Ocean Explorers Giant Coloring Tablecloth", handle: "ocean-coloring-tablecloth", themes: ["ocean", "sea", "fish", "fishing", "birthday party", "everyday family fun", "school-age kids"] },
  { name: "Ice Cream Dreams Giant Coloring Tablecloth", handle: "ice-cream-coloring-poster", themes: ["ice cream", "sweets", "candy", "birthday party", "everyday family fun", "toddlers and young kids"] },

  // HOLIDAY — occasion-specific
  { name: "Christmas Coloring Tablecloth", handle: "color-you-own-christmas-table-cover", themes: ["Christmas", "holiday dinner"] },
  { name: "Thanksgiving Coloring Tablecloth", handle: "color-your-own-thanksgiving-table-cover", themes: ["Thanksgiving", "holiday dinner"] },
  { name: "Pumpkin Patch Coloring Tablecloth", handle: "pumpkin-patch-coloring-tablecloth", themes: ["Halloween", "fall", "pumpkin", "holiday dinner"] },
  { name: "Easter Party Bundle", handle: "easter-party-coloring-bundle", themes: ["Easter", "holiday dinner", "faith or church event"] },
  { name: "America 250 Giant Coloring Tablecloth", handle: "america-250-coloring-tablecloth", themes: ["4th of July", "patriotic", "holiday dinner"] },

  // FAITH
  { name: "Fishers of Men Giant Coloring Tablecloth", handle: "fishers-of-men-coloring-tablecloth", themes: ["faith", "scripture", "fishing", "faith or church event"] },
  { name: "Fruit of the Spirit Giant Coloring Tablecloth", handle: "fruit-of-the-spirit-coloring-tablecloth", themes: ["faith", "scripture", "faith or church event", "everyday family fun"] },
  { name: "Baptism Coloring Tablecloth", handle: "baptism-coloring-tablecloth", themes: ["baptism", "christening", "faith", "faith or church event"] },
];

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
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

  const prompt = `You are the product recommender for Creative Crayons Workshop, which sells giant coloring tablecloths (5ft x 3.5ft). The whole table becomes a coloring canvas — kids and families color together at birthday parties, holiday dinners, and everyday meals.

Key insight: 90% of our tablecloths are used for birthday parties. Even everyday themes like Farm, Dog, and Construction are top birthday sellers. Always lean toward the theme the customer picked — the occasion matters less than what they are into.

Our product line:
${productList}

A customer just completed a quiz:
- Occasion: ${occasion}
- Who will be coloring: ${who}
- Theme they picked: ${theme}

Pick the single best product. Prioritize theme match above all else. If their theme does not exactly match a product, pick the closest one. Never recommend a holiday product unless the occasion is a specific holiday.

Respond ONLY with a JSON object (no markdown, no backticks, no preamble) with exactly three fields:
- "name": the product name exactly as listed above
- "handle": the handle exactly as listed above
- "why": 2 warm sentences (max 55 words) explaining why this is perfect. Reference the theme and who is coloring. Sound like a friendly brand mom, not a robot. Use "you" and "your family."`;

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
