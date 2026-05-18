const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Ustaw SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY przed uruchomieniem migracji.");
  process.exit(1);
}

const dbPath = path.join(__dirname, "..", "data", "db.json");
if (!fs.existsSync(dbPath)) {
  console.error("Nie znaleziono data/db.json.");
  process.exit(1);
}

async function supabaseRequest(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`Supabase error ${response.status}: ${await response.text()}`);
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  await supabaseRequest("app_state", {
    method: "POST",
    body: JSON.stringify({ id: "main", data, updated_at: new Date().toISOString() })
  });
  console.log("Przeniesiono data/db.json do Supabase.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
