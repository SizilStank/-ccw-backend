// netlify/functions/recommend.js
// Env vars required: ANTHROPIC_API_KEY

const PRODUCTS = [
  // TOP SELLERS — theme-based, work for birthday AND everyday
  { name: "Farm Themed Coloring Tablecloth", handle: "farm-themed-coloring-table-cover", keywords: ["farm", "animals", "animal", "cow", "horse", "pig"] },
  { name: "Construction Birthday Coloring Tablecloth", handle: "construction-birthday-coloring-tablecloth", keywords: ["construction", "trucks", "truck", "building", "digger"] },
  { name: "Dog Party Coloring Tablecloth", handle: "dog-party-coloring-tablecloth", keywords: ["dog", "dogs", "puppy", "puppies", "pets", "pet"] },
  { name: "Sweet Birthday Coloring Tablecloth", handle: "sweet-birthday-coloring-tablecloth", keywords: ["sweet", "candy", "sweets", "dessert", "cake"] },
  { name: "Football Coloring Tablecloth", handle: "football-coloring-tablecloth", keywords: ["football", "sports", "sport", "soccer", "ball"] },
  { name: "Dino Adventure Giant Coloring Tablecloth", handle: "personalized-dinosaur-birthday-coloring-poster", keywords: ["dino", "dinosaur", "dinosaurs", "dinos", "adventure", "t-rex"] },
  { name: "Princess Fantasy Giant Coloring Tablecloth", handle: "princess-birthday-table-cover-personalized", keywords: ["princess", "fantasy", "unicorn", "fairy", "magic", "castle"] },
  { name: "Ocean Explorers Giant Coloring Tablecloth", handle: "ocean-coloring-tablecloth", keywords: ["ocean", "sea", "fish", "fishing", "mermaid", "beach"] },
  { name: "Ice Cream Dreams Giant Coloring Tablecloth", handle: "ice-cream-coloring-poster", keywords: ["ice cream", "icecream", "sweets", "dessert", "treats"] },

  // HOLIDAY
  { name: "Christmas Coloring Tablecloth", handle: "color-you-own-christmas-table-cover", keywords: ["christmas", "xmas", "santa", "winter holiday"] },
  { name: "Thanksgiving Coloring Tablecloth", handle: "color-your-own-thanksgiving-table-cover", keywords: ["thanksgiving", "turkey", "harvest", "november"] },
  { name: "Pumpkin Patch Coloring Tablecloth", handle: "pumpkin-patch-coloring-tablecloth", keywords: ["halloween", "pumpkin", "fall harvest", "autumn", "october"] },
  { name: "Easter Party Bundle", handle: "easter-party-coloring-bundle", keywords: ["easter", "spring", "bunny", "eggs"] },
  { name: "America 250 Giant Coloring Tablecloth", handle: "america-250-coloring-tablecloth", keywords: ["4th of july", "patriotic", "america", "independence", "july"] },

  // FAITH
  { name: "Fishers of Men Giant Coloring Tablecloth", handle: "fishers-of-men-coloring-tablecloth", keywords: ["fishers", "faith", "scripture", "church", "bible"] },
  { name: "Fruit of the Spirit Giant Coloring Tablecloth", handle: "fruit-of-the-spirit-coloring-tablecloth", keywords: ["fruit of the spirit", "faith", "scripture", "spirit"] },
  { name: "Baptism Coloring Tablecloth", handle: "baptism-coloring-tablecloth", keywords: ["baptism", "christening", "communion"] },
];

// Rule-based matching — guaranteed fallback if AI fails
function findBestMatch(occasion, who, theme) {
  const searchStr = `${occasion} ${who} ${theme}`.toLowerCase();
  let bestProduct = null;
  let bestScore = 0;
  for (const product of PRODUCTS) {
    let score = 0;
    for (const keyword of product.keywords) {
      if (searchStr.includes(keyword.toLowerCase())) {
        score += keyword.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestProduct = product;
    }
  }
  return bestProduct || PRODUCTS[0];
}

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
    console.error("Missing fields:", JSON.stringify({ occasion, who, theme }));
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  const productList = PRODUCTS.map(p => `- ${p.name} (handle: ${p.handle})`).join("\n");
  const fallbackProduct = findBestMatch(occasion, who, theme);

  const prompt = `You are the product recommender for Creative Crayons Workshop, which sells giant coloring tablecloths (5ft x 3.5ft). The whole table becomes a coloring canvas for birthday parties, holiday dinners, and everyday family meals.

Key rule: Always match the theme the customer picked. Never recommend a holiday product unless the occasion is a specific holiday.

Our product line:
${productList}

Customer quiz answers:
- Occasion: ${occasion}
- Who is coloring: ${who}
- Theme: ${theme}

Respond ONLY with a raw JSON object. No markdown. No backticks. No explanation. Just the JSON.

{
  "name": "<product name exactly as listed above>",
  "why": "<2 warm sentences, max 55 words, use you and your family>"
}`;

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
      const errText = await res.text();
      console.error("Anthropic API error:", res.status, errText);
      throw new Error("Anthropic API error: " + res.status);
    }

    const data = await res.json();
    const raw = data.content?.find(b => b.type === "text")?.text || "";
    console.log("AI raw response:", raw);

    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.name) throw new Error("AI response missing name field");

    // Always look up the handle from our list — never trust the AI to return it correctly
    const matched = PRODUCTS.find(p => p.name === parsed.name) || fallbackProduct;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        name: matched.name,
        handle: matched.handle,
        why: parsed.why || "We think your family will love this one!",
      }),
    };

  } catch (err) {
    console.error("Using rule-based fallback. Error:", err.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        name: fallbackProduct.name,
        handle: fallbackProduct.handle,
        why: "Based on your answers, we think your family will love this one! Grab 10% off your first order below.",
      }),
    };
  }
}