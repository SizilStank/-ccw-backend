// netlify/functions/subscribe.js
// Env vars required: KLAVIYO_PRIVATE_KEY, KLAVIYO_LIST_ID, KLAVIYO_DISCOUNT_CODE

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
  const DISCOUNT_CODE = process.env.KLAVIYO_DISCOUNT_CODE || "WELCOME20";

  if (!KLAVIYO_KEY || !LIST_ID) {
    console.error("Missing Klaviyo env vars");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server configuration error" }) };
  }

  const klaviyoHeaders = {
    "Content-Type": "application/vnd.api+json",
    "Authorization": `Klaviyo-API-Key ${KLAVIYO_KEY}`,
    "revision": "2024-10-15",
  };

  try {
    // Step 1: Upsert profile WITHOUT subscriptions (profile-import doesn't support it)
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
            discount_code: DISCOUNT_CODE,
            quiz_product_url: recommendedHandle
              ? `https://creativecrayonsworkshop.com/products/${recommendedHandle}`
              : "https://creativecrayonsworkshop.com/collections/all",
          },
        },
      },
    };

    const profileRes = await fetch("https://a.klaviyo.com/api/profile-import/", {
      method: "POST",
      headers: klaviyoHeaders,
      body: JSON.stringify(profilePayload),
    });

    const profileData = await profileRes.json();
    const profileId = profileData?.data?.id;

    if (!profileId) {
      throw new Error("Failed to upsert profile: " + JSON.stringify(profileData));
    }

    console.log("Profile upserted:", profileId);

    // Step 2: Subscribe to list — this sets email marketing consent via list membership
    const subscribeRes = await fetch(`https://a.klaviyo.com/api/lists/${LIST_ID}/relationships/profiles/`, {
      method: "POST",
      headers: klaviyoHeaders,
      body: JSON.stringify({
        data: [{ type: "profile", id: profileId }],
      }),
    });

    if (!subscribeRes.ok && subscribeRes.status !== 204) {
      const errText = await subscribeRes.text();
      throw new Error(`List subscribe failed: ${subscribeRes.status} ${errText}`);
    }

    console.log("Subscribed to list:", LIST_ID);

    // Step 3: Explicitly set email marketing consent via subscriptions endpoint
    const consentRes = await fetch(`https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/`, {
      method: "POST",
      headers: klaviyoHeaders,
      body: JSON.stringify({
        data: {
          type: "profile-subscription-bulk-create-job",
          attributes: {
            profiles: {
              data: [
                {
                  type: "profile",
                  attributes: {
                    email,
                    subscriptions: {
                      email: {
                        marketing: {
                          consent: "SUBSCRIBED",
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
          relationships: {
            list: {
              data: {
                type: "list",
                id: LIST_ID,
              },
            },
          },
        },
      }),
    });

    if (!consentRes.ok) {
      const errText = await consentRes.text();
      console.error("Consent step failed (non-fatal):", consentRes.status, errText);
      // Non-fatal — profile is still subscribed to list
    } else {
      console.log("Email marketing consent set");
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        discountCode: DISCOUNT_CODE,
      }),
    };

  } catch (err) {
    console.error("Subscribe error:", err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Subscription failed. Please try again." }),
    };
  }
}