require('dotenv').config();
const jwt = require('jsonwebtoken');
const schoolDb = require('./database');
const express = require('express');
const bcrypt = require('bcrypt');
const cors = require('cors');
const app = express();
app.use(express.json());
app.use(cors());

app.post( '/students', (req, res) => {
    const stmt = schoolDb.prepare('INSERT INTO students(name, lrn, gender, grade_level) VALUES (?, ?, ?, ?)');
    res.send(stmt.run(req.body.name, req.body.lrn, req.body.gender, req.body.grade_level));
})

app.get('/students', (req, res) => {
    const stmt = schoolDb.prepare(`SELECT * FROM students WHERE grade_level = ? AND adviser_id IS NULL`);
    const students = stmt.all(req.query.grade_level);
    res.json(students);
})

app.post('/advisers', async (req, res) => {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const stmt = schoolDb.prepare('INSERT INTO advisers(username, password_hash, full_name, assigned_level) VALUES (?, ?, ?, ?)');
    res.send(stmt.run(req.body.username, hashedPassword, req.body.full_name, req.body.assigned_level));
})

app.post('/login', async (req, res) => {
    const adviser = schoolDb.prepare('SELECT * FROM advisers WHERE username = ?').get(req.body.username);
    if(adviser != undefined) {
        const comparedPassword = await bcrypt.compare(req.body.password, adviser.password_hash);
        if(comparedPassword) {
            const token = jwt.sign(
                {id: adviser.id, grade_level: adviser.assigned_level},
                process.env.JWT_SECRET,
                {expiresIn: '1d'}
            )
            res.json({message: "LOGIN SUCCESSFUL", token});
        } else {
            res.status(401).send("Incorrect password");
        }
    } else {
        res.status(401).send("No account found");
    }
})

app.listen(3000, () => {
    console.log("The server is running at port 3000");
})