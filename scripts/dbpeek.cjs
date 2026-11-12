const { Client } = require("pg");
const c = new Client({ connectionString: "postgres://postgres:e6lTbTQoSWnk192m@localhost:5433/nexora" });
c.connect()
  .then(async () => {
    const sessions = await c.query(
      "SELECT u.email, s.created_at, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT 5",
    );
    console.log(JSON.stringify(sessions.rows, null, 1));
    const audit = await c.query(
      "SELECT action, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 10",
    );
    console.log(JSON.stringify(audit.rows, null, 1));
    await c.end();
    process.exit(0);
  })
  .catch((e) => {
    console.log("ERR", e.message);
    process.exit(1);
  });
