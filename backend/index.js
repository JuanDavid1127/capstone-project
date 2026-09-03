require('dotenv').config();
const jwt = require('jsonwebtoken');
const schoolDb = require('./database');
const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const app = express();
const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: "Too many login attempts, please try again later."
})
app.use(express.json());
app.use(cors());

app.post( '/students', (req, res) => {
    const validGrades = ["G7", "G8", "G9", "G10", "G11", "G12"]
    if(
        !req.body.name || 
        !/^\d{12}$/.test(req.body.lrn) || 
        (req.body.gender !== "male" && req.body.gender !== "female") || 
        !validGrades.includes(req.body.grade_level)
    ) {
        return res.status(400).send("Invalid Input");
    }
    const stmt = schoolDb.prepare('INSERT INTO students(name, lrn, gender, grade_level) VALUES (?, ?, ?, ?)');
    res.send(stmt.run(req.body.name, req.body.lrn, req.body.gender, req.body.grade_level));
})

app.get('/students', authenticateToken, (req, res) => {
    const stmt = schoolDb.prepare(`SELECT * FROM students WHERE grade_level = ? AND adviser_id IS NULL`);
    const students = stmt.all(req.query.grade_level);
    res.json(students);
})

app.post('/advisers', authenticateToken, async (req, res) => {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const stmt = schoolDb.prepare('INSERT INTO advisers(username, password_hash, full_name, assigned_level) VALUES (?, ?, ?, ?)');
    res.send(stmt.run(req.body.username, hashedPassword, req.body.full_name, req.body.assigned_level));
})

app.post('/login', loginLimiter, async (req, res) => {
    const adviser = schoolDb.prepare('SELECT * FROM advisers WHERE username = ?').get(req.body.username);
    if(adviser != undefined) {
        const comparedPassword = await bcrypt.compare(req.body.password, adviser.password_hash);
        if(comparedPassword) {
            const token = jwt.sign(
                {id: adviser.id, grade_level: adviser.assigned_level, full_name: adviser.full_name},
                process.env.JWT_SECRET,
                {expiresIn: '1d'}
            )
            res.json({message: "LOGIN SUCCESSFUL", token, grade_level: adviser.assigned_level, full_name: adviser.full_name});
        } else {
            res.status(401).send("Incorrect password");
        }
    } else {
        res.status(401).send("No account found");
    }
})

app.patch('/students/:id', authenticateToken, (req, res) => {
    const action = req.body.action;
    const adviser = req.adviser.id;
    if(action === "assign") {
        const stmt = schoolDb.prepare('UPDATE students SET adviser_id = ? WHERE id = ? AND adviser_id IS NULL');
        const result = stmt.run(adviser, req.params.id);
        if(result.changes === 0) {
            return res.status(409).send("This student was already assigned by another adviser");
        } else {
            res.send(result);
        }
    } else if(action === "remove") {
        const stmt = schoolDb.prepare('UPDATE students SET adviser_id = NULL WHERE id = ?');
        res.send(stmt.run(req.params.id));
    }
})

app.get('/students/assigned', authenticateToken, (req, res) => {
    const adviser = req.adviser.id;
    const stmt = schoolDb.prepare(`SELECT * FROM students WHERE adviser_id = ?`);
    const students = stmt.all(adviser);
    res.json(students);
})

app.listen(3000, () => {
    console.log("The server is running at port 3000");
})


function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if(!token) {
        return res.status(401).send("rejected");
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.adviser = decoded;
        next();
    } catch (error) {
        return res.status(401).send("Invalid or expired token");
    }
}