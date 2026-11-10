const fs = require("node:fs"),
  path = require("node:path");
const Database = require("better-sqlite3");
function openAuthStore(directory, { BufferJSON, initAuthCreds, proto }) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, "baileys-auth.db"),
    db = new Database(filename);
  fs.chmodSync(filename, 0o600);
  db.pragma("journal_mode=WAL");
  db.pragma("busy_timeout=5000");
  db.exec(
    "CREATE TABLE IF NOT EXISTS auth(scope TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(scope,id)); CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,value TEXT NOT NULL,created_at INTEGER NOT NULL);",
  );
  const read = db.prepare("SELECT value FROM auth WHERE scope=? AND id=?");
  const put = db.prepare(
    "INSERT OR REPLACE INTO auth(scope,id,value) VALUES(?,?,?)",
  );
  const remove = db.prepare("DELETE FROM auth WHERE scope=? AND id=?");
  const encode = (value) => JSON.stringify(value, BufferJSON.replacer);
  const decode = (value) => JSON.parse(value, BufferJSON.reviver);
  const row = read.get("creds", "main");
  const creds = row ? decode(row.value) : initAuthCreds();
  const saveCreds = () => put.run("creds", "main", encode(creds));
  saveCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) =>
          Object.fromEntries(
            ids.map((id) => {
              const stored = read.get(type, id);
              let value = stored ? decode(stored.value) : undefined;
              if (type === "app-state-sync-key" && value)
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              return [id, value];
            }),
          ),
        set: async (data) =>
          db.transaction(() => {
            for (const [type, values] of Object.entries(data))
              for (const [id, value] of Object.entries(values)) {
                if (value == null) remove.run(type, id);
                else put.run(type, id, encode(value));
              }
          })(),
      },
    },
    saveCreds,
    getMessage: (key) => {
      const message = db
        .prepare("SELECT value FROM messages WHERE id=?")
        .get(key.id);
      return message ? decode(message.value) : undefined;
    },
    saveMessage: (id, message) =>
      db.transaction(() => {
        db.prepare(
          "INSERT OR REPLACE INTO messages(id,value,created_at) VALUES(?,?,?)",
        ).run(id, encode(message), Date.now());
        db.prepare(
          "DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY created_at DESC LIMIT 1000)",
        ).run();
      })(),
    close: () => db.close(),
  };
}
module.exports = { openAuthStore };
