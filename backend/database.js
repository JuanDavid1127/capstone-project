const db = require('better-sqlite3');
const schoolDb = new db("school.db");

schoolDb.exec(`
        CREATE TABLE IF NOT EXISTS students(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        lrn TEXT NOT NULL UNIQUE,
        gender TEXT NOT NULL,
        grade_level TEXT NOT NULL,
        adviser_id INTEGER
        )
    `)

schoolDb.exec(`
        CREATE TABLE IF NOT EXISTS advisers(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        assigned_level TEXT NOT NULL
        )
    
    `)

module.exports = schoolDb;