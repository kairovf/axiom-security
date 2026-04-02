// /api/subscribe.js — Vercel Serverless Function
// Captures lead + attribution source + serves PDF link

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const BREVO_LIST_ID = parseInt(process.env.BREVO_LIST_ID || "1");

  if (!BREVO_API_KEY) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  try {
    const { name, email, contractName, source } = req.body;

    if (!name || !email || !contractName) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Add contact to Brevo with attribution source
    await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify({
        email: email,
        attributes: {
          FIRSTNAME: name,
          CONTRACT: contractName,
          SOURCE: source || "unknown",
          SIGNUP_DATE: new Date().toISOString(),
        },
        listIds: [BREVO_LIST_ID],
        updateEnabled: true,
      }),
    }).catch(() => {});

    // Map contract name to PDF filename
    const pdfMap = {
      "GemPad Lock": "GemPad_Lock.pdf",
      "LeetSwap V2": "LeetSwap_V2.pdf",
      "CloberDEX": "CloberDEX.pdf",
      "SKI MASK DOG": "SKI_MASK_DOG.pdf",
      "tBTC": "tBTC.pdf",
      "Aerodrome": "Aerodrome.pdf",
    };

    const pdfFile = pdfMap[contractName] || null;
    const pdfUrl = pdfFile ? `/reports/${pdfFile}` : null;

    return res.status(200).json({
      success: true,
      pdfUrl: pdfUrl,
    });
  } catch (error) {
    console.error("Subscribe error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
