const { Client } = require("pg");
const c = new Client({ connectionString: "postgres://postgres:e6lTbTQoSWnk192m@localhost:5433/postgres" });
c.connect()
  .then(async () => {
    const r = await c.query(
      "SELECT datname, pg_encoding_to_char(encoding) AS enc, datcollate FROM pg_database ORDER BY datname",
    );
    console.log(JSON.stringify(r.rows));
    const t = await c.query("SELECT '₹🚀→—'::text AS s");
    console.log("UNICODE OK:", t.rows[0].s);
    await c.end();
    process.exit(0);
  })
  .catch((e) => {
    console.log("NOT READY:", e.message);
    process.exit(1);
  });
