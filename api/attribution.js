// /api/attribution.js — Tracks how visitors found AXIOM (standalone popup)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { source, page, timestamp } = req.body;
    if (!source) return res.status(400).json({ error: "Missing source" });

    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    if (BREVO_API_KEY) {
      await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `visitor-${Date.now()}@attribution.axiom`,
          attributes: { SOURCE: source, ENTRY_PAGE: page || "/", VISIT_DATE: timestamp || new Date().toISOString() },
          listIds: [parseInt(process.env.BREVO_LIST_ID || "1")],
          updateEnabled: false,
        }),
      }).catch(() => {});
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
}
