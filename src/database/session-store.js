const session = require("express-session");
class SQLiteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
  }
  get(sid, cb) {
    try {
      const row = this.db
        .prepare("SELECT data FROM sessions WHERE sid=? AND expires>?")
        .get(sid, Date.now());
      cb(null, row ? JSON.parse(row.data) : null);
    } catch (e) {
      cb(e);
    }
  }
  set(sid, data, cb = () => {}) {
    try {
      const expires = data.cookie?.expires
        ? new Date(data.cookie.expires).getTime()
        : Date.now() + 8 * 3600000;
      this.db
        .prepare(
          "INSERT INTO sessions(sid,data,expires) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET data=excluded.data,expires=excluded.expires",
        )
        .run(sid, JSON.stringify(data), expires);
      this.db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
      cb(null);
    } catch (e) {
      cb(e);
    }
  }
  touch(sid, data, cb) {
    this.set(sid, data, cb);
  }
  destroy(sid, cb = () => {}) {
    try {
      this.db.prepare("DELETE FROM sessions WHERE sid=?").run(sid);
      cb(null);
    } catch (e) {
      cb(e);
    }
  }
}
module.exports = SQLiteSessionStore;
