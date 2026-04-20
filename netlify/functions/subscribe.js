// netlify/functions/subscribe.js
// Subscribes an email to Klaviyo, tags with quiz answers and AI recommendation,
// and triggers a welcome flow with a 10% discount.
// Env vars required: KLAVIYO_PRIVATE_KEY, KLAVIYO_LIST_ID, KLAVIYO_DISCOUNT_CODE (optional)

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

  const { email, occasion, who, theme, recommendedProduct, recommendedHandle } = body;

  if (!email || !email.includes("@")) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid email" }) };
  }

  const KLAVIYO_KEY = process.env.KLAVIYO_PRIVATE_KEY;
  const LIST_ID = process.env.KLAVIYO_LIST_ID;

  if (!KLAVIYO_KEY || !LIST_ID) {
    console.error("Missing Klaviyo env vars");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server configuration error" }) };
  }

  // Build the Klaviyo profile with custom quiz properties
  const profilePayload = {
    data: {
      type: "profile",
      attributes: {
        email,
        properties: {
          quiz_occasion: occasion || "",
          quiz_who: who || "",
          quiz_theme: theme || "",
          quiz_recommended_product: recommendedProduct || "",
          quiz_recommended_handle: recommendedHandle || "",
          quiz_completed: true,
          quiz_completed_at: new Date().toISOString(),
          discount_code: process.env.KLAVIYO_DISCOUNT_CODE || "WELCOME10",
          // Shopify product URL — used in Klaviyo flow email template
          quiz_product_url: recommendedHandle
            ? `https://creativecrayonsworkshop.com/products/${recommendedHandle}`
            : "https://creativecrayonsworkshop.com/collections/all",
        },
      },
    },
  };

  try {
    // Step 1: Upsert the profile
    const profileRes = await fetch("https://a.klaviyo.com/api/profile-import/", {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.api+json",
        "Authorization": `Klaviyo-API-Key ${KLAVIYO_KEY}`,
        "revision": "2024-10-15",
      },
      body: JSON.stringify(profilePayload),
    });

    const profileData = await profileRes.json();
    const profileId = profileData?.data?.id;

    if (!profileId) {
      throw new Error("Failed to upsert Klaviyo profile: " + JSON.stringify(profileData));
    }

    // Step 2: Subscribe the profile to the list (triggers welcome flow)
    const subscribeRes = await fetch(`https://a.klaviyo.com/api/lists/${LIST_ID}/relationships/profiles/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.api+json",
        "Authorization": `Klaviyo-API-Key ${KLAVIYO_KEY}`,
        "revision": "2024-10-15",
      },
      body: JSON.stringify({
        data: [{ type: "profile", id: profileId }],
      }),
    });

    // 204 = already subscribed, 200/201 = newly subscribed — both are fine
    if (!subscribeRes.ok && subscribeRes.status !== 204) {
      const errText = await subscribeRes.text();
      throw new Error(`Klaviyo list subscribe failed: ${subscribeRes.status} ${errText}`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        discountCode: process.env.KLAVIYO_DISCOUNT_CODE || "WELCOME10",
      }),
    };
  } catch (err) {
    console.error("Subscribe error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Subscription failed. Please try again." }),
    };
  }
}
