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
    const boolean = ["yes", "no"]
    const returnee = req.body.returnee === "yes" ? 1 : 0;
    const hasDisability = req.body.learnerDisability === "yes" ? 1 : 0;
    const isFourPs = req.body.fourPs === "yes" ? 1 : 0;
    const isIpCommunity = req.body.ipCommunity === "yes" ? 1 : 0;
    const guardians = [
        { 
            relationship: "father", 
            last_name: req.body.fatherLastName, 
            first_name: req.body.fatherFirstName,
            middle_name: req.body.fatherMiddleName,
            contact_no: req.body.fatherContactNo   
        },
        {
            relationship: "mother",
            last_name: req.body.motherLastName, 
            first_name: req.body.motherFirstName,
            middle_name: req.body.motherMiddleName,
            contact_no: req.body.motherContactNo  
        },
        {
            relationship: "guardian",
            last_name: req.body.guardianLastName, 
            first_name: req.body.guardianFirstName,
            middle_name: req.body.guardianMiddleName,
            contact_no: req.body.guardianContactNo  
        }
    ]
    console.log(req.body)
    if(
        !(req.body.last_name && req.body.first_name) ||
        !/^\d{12}$/.test(req.body.lrn) || 
        (req.body.sex !== "male" && req.body.sex !== "female") || 
        !validGrades.includes(req.body.grade_level) ||
        !boolean.includes(req.body.returnee) ||
        !boolean.includes(req.body.ipCommunity) ||
        !boolean.includes(req.body.fourPs) ||
        !boolean.includes(req.body.learnerDisability) ||
        req.body.currBarangay === "" ||
        req.body.currProvince === "" ||
        req.body.currCountry === "" ||
        (req.body.sameAddress === "no" && (
            req.body.permBarangay === "" ||
            req.body.permProvince === "" ||
            req.body.permCountry === ""
        )) 
    ) {
        return res.status(400).send("Invalid Input");
    }
    try {
        const stmt = schoolDb.prepare('INSERT INTO students(lrn, last_name, first_name, middle_name, extension_name, gender, grade_level, school_year, returnee, birth_place, mother_tongue, ip_community, four_ps, four_ps_household_id, has_disability, disability_others) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

        const learnersInformation = stmt.run(
            req.body.lrn, req.body.last_name, req.body.first_name, req.body.middle_name, req.body.extension_name, req.body.sex, req.body.grade_level, req.body.school_year, returnee, req.body.birth_place, req.body.mother_tongue, isIpCommunity, isFourPs, req.body.householdId, hasDisability, req.body.others 
        );

        const studentId = learnersInformation.lastInsertRowid;
        
        const addressStmt = schoolDb.prepare('INSERT INTO addresses(student_id, address_type, house_no, street, barangay, city, province, country, zipcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

        addressStmt.run(studentId, "current", req.body.currHouseNo, req.body.currStreet, req.body.currBarangay, req.body.currCity, req.body.currProvince, req.body.currCountry, req.body.currZipcode);

        if(req.body.sameAddress === "yes") {
            addressStmt.run(studentId, "permanent", req.body.currHouseNo, req.body.currStreet, req.body.currBarangay, req.body.currCity, req.body.currProvince, req.body.currCountry, req.body.currZipcode);
        } else {
            addressStmt.run(studentId, "permanent", req.body.permHouseNo, req.body.permStreet, req.body.permBarangay, req.body.permCity, req.body.permProvince, req.body.permCountry, req.body.permZipcode)
        }

        const guardianStmt = schoolDb.prepare('INSERT INTO guardians(student_id, relationship, last_name, first_name, middle_name, contact_number) VALUES (?, ?, ?, ?, ?, ?)');

        for(const guardian of guardians) {
            if(guardian.last_name) {
                guardianStmt.run(
                    studentId, 
                    guardian.relationship, 
                    guardian.last_name, 
                    guardian.first_name, 
                    guardian.middle_name, 
                    guardian.contact_no
                )
            }
        }

        const disabilities = req.body.disabilities || [];
        
        const disabilityStmt = schoolDb.prepare(`INSERT INTO student_disabilities(student_id, disability_type) VALUES (?, ?)`);

        for(const disability of disabilities) {
            disabilityStmt.run(
                studentId,
                disability
            )
        }

        return res.status(201).json({
            message: "Student Created Successfully", studentId
        });

    } catch(error) {
        return res.status(409).send("cannot be processed, try again")
    }
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