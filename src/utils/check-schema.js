const { pool } = require("./database");

async function checkDatabaseSchema() {
  try {
    // Check what tables exist
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;

    const result = await pool.query(tablesQuery);
    console.log("\n📋 Available tables:");
    result.rows.forEach((row) => {
      console.log(`  - ${row.table_name}`);
    });

    // Check for tables containing 'personality' or 'instance'
    const personalityTables = result.rows.filter((row) =>
      row.table_name.toLowerCase().includes("personality")
    );

    const instanceTables = result.rows.filter((row) =>
      row.table_name.toLowerCase().includes("instance")
    );

    console.log("\n🎭 Personality-related tables:");
    personalityTables.forEach((row) => {
      console.log(`  - ${row.table_name}`);
    });

    console.log("\n🤖 Instance-related tables:");
    instanceTables.forEach((row) => {
      console.log(`  - ${row.table_name}`);
    });

    // If we find personality tables, check their structure
    if (personalityTables.length > 0) {
      const tableName = personalityTables[0].table_name;
      console.log(`\n🔍 Structure of ${tableName}:`);

      const columnsQuery = `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position;
      `;

      const columns = await pool.query(columnsQuery, [tableName]);
      columns.rows.forEach((col) => {
        console.log(
          `  - ${col.column_name}: ${col.data_type} (${
            col.is_nullable === "YES" ? "nullable" : "not null"
          })`
        );
      });
    }

    // If we find instance tables, check their structure
    if (instanceTables.length > 0) {
      const tableName = instanceTables[0].table_name;
      console.log(`\n🔍 Structure of ${tableName}:`);

      const columnsQuery = `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position;
      `;

      const columns = await pool.query(columnsQuery, [tableName]);
      columns.rows.forEach((col) => {
        console.log(
          `  - ${col.column_name}: ${col.data_type} (${
            col.is_nullable === "YES" ? "nullable" : "not null"
          })`
        );
      });
    }
  } catch (error) {
    console.error("❌ Error checking database schema:", error);
  } finally {
    process.exit(0);
  }
}

checkDatabaseSchema();
