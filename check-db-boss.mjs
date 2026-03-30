import mysql from "mysql2/promise";

async function checkDb() {
  const connection = await mysql.createConnection({
    host: "127.0.0.1",
    port: 3306,
    user: "root",
    password: "", // Default from db.ts
    database: "ads_manager",
  });

  try {
    const [rows] = await connection.execute("SELECT * FROM business_config");
    console.log("Business Config Records:");
    console.log(JSON.stringify(rows, null, 2));

    const [allReports] = await connection.execute("SELECT * FROM business_config WHERE business_name LIKE '%BOSS STORE%'");
     console.log("\nMatching Results:");
    console.log(JSON.stringify(allReports, null, 2));

  } catch (err) {
    console.error("Error querying DB:", err.message);
  } finally {
    await connection.end();
  }
}

checkDb();
