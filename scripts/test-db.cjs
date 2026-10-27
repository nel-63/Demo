const { Client } = require("pg");

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL introuvable dans .env");
  }

  const url = new URL(connectionString);
  console.log("Hote :", url.hostname);
  console.log("Base :", url.pathname.slice(1));

  const client = new Client({ connectionString });

  try {
    await client.connect();

    const result = await client.query(
      "SELECT current_database() AS database, current_user AS username"
    );

    console.log("Connexion reussie :", result.rows[0]);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error("Echec :", error.message);
  process.exitCode = 1;
});
