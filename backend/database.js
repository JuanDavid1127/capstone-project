const db = require('better-sqlite3');
const schoolDb = new db("school.db");

schoolDb.exec(`
        CREATE TABLE IF NOT EXISTS students(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            adviser_id INTEGER,
            lrn TEXT NOT NULL UNIQUE,
            last_name TEXT NOT NULL,
            first_name TEXT NOT NULL,
            middle_name TEXT,
            extension_name TEXT,
            gender TEXT NOT NULL,
            grade_level TEXT NOT NULL,
            school_year TEXT NOT NULL,
            returnee INTEGER NOT NULL,
            birth_place TEXT NOT NULL,
            mother_tongue TEXT NOT NULL,
            ip_community INTEGER NOT NULL,
            four_ps INTEGER NOT NULL,
            four_ps_household_id TEXT,
            has_disability INTEGER,
            disability_others TEXT
        )
    `)

schoolDb.exec(`
        CREATE TABLE IF NOT EXISTS addresses(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            address_type TEXT,
            house_no TEXT,
            street TEXT,
            barangay TEXT NOT NULL,
            city TEXT,
            province TEXT NOT NULL,
            country TEXT NOT NULL,
            zipcode TEXT
        )
    `)

schoolDb.exec(`
        CREATE TABLE IF NOT EXISTS guardians(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            relationship TEXT NOT NULL,
            last_name TEXT NOT NULL,
            first_name TEXT NOT NULL,
            middle_name TEXT,
            contact_number TEXT
        )
    `)

schoolDb.exec(`
        CREATE TABLE IF NOT EXISTS student_disabilities(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            disability_type TEXT NOT NULL
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