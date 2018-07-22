const Lowdb = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const fs = require("fs-extra");
const path = require("path");
const home = require("user-home");

let folder = path.join(home, ".cluas");
fs.ensureDirSync(folder);

const db = new Lowdb(new FileSync(path.resolve(folder, "db.json")));

// Seed an empty DB
db.defaults({
    prompts: []
}).write();

module.exports = db;
