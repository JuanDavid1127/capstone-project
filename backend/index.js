require('dotenv').config();
const jwt = require('jsonwebtoken');
const schoolDb = require('./database');
const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const app = express();
const {generateSF1} = require("./services/sf1");
const {generateMasterlist} = require("./services/masterlist");
const {generateRegistrationForm} = require("./services/registerform");
const {selectStudentsForAdviser} = require("./services/autoAssign");
const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: "Too many login attempts, please try again later."
})
app.use(express.json());
app.use(cors({
    exposedHeaders:["Content-Disposition"]
}));

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
    const stmt = schoolDb.prepare(`SELECT * FROM students WHERE grade_level = ? AND adviser_id IS NULL ORDER BY last_name ASC`);
    const students = stmt.all(req.query.grade_level);
    res.json(students);
})

app.post('/advisers', (req, res) => {
    if(req.body.setupKey === process.env.ADMIN_SETUP_KEY) {
        createAdviser(req, res);
    } else {
        authenticateToken(req, res, () => {
            if(req.adviser.is_admin !== 1) {
                return res.status(403).send("admin access required")
            }
            createAdviser(req, res);
        })
    }
})

app.post('/login', loginLimiter, async (req, res) => {
    const adviser = schoolDb.prepare('SELECT * FROM advisers WHERE username = ?').get(req.body.username);
    if(adviser != undefined) {
        const comparedPassword = await bcrypt.compare(req.body.password, adviser.password_hash);
        if(comparedPassword) {
            const token = jwt.sign(
                {id: adviser.id, grade_level: adviser.assigned_level, full_name: adviser.full_name, section: adviser.section_name},
                process.env.JWT_SECRET,
                {expiresIn: '1d'}
            )
            res.json({message: "LOGIN SUCCESSFUL", token, grade_level: adviser.assigned_level, full_name: adviser.full_name, section_name: adviser.section_name});
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
    const stmt = schoolDb.prepare(`SELECT * FROM students WHERE adviser_id = ? ORDER BY last_name ASC`);
    const students = stmt.all(adviser);
    res.json(students);
})

app.get('/export/masterlist', authenticateToken, async (req, res) => {
    try {
        const buffer = await generateMasterlist(req.adviser);
        const filename = `${req.adviser.grade_level}_${req.adviser.section}_Masterlist.docx`

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${filename}"`
        );

        res.send(buffer);
    } catch(error) {
        console.error(error);
        res.status(500).json({
            error: "Failed to generate Masterlist"
        })
    }
})

app.get('/export/registerform/:studentId', authenticateToken, async (req, res) => {
    try {
        const studentId = Number(req.params.studentId);
        if (!Number.isInteger(studentId)) {
            return res.status(400).json({ error: "Invalid student id" });
        }

        const buffer = await generateRegistrationForm(studentId, req.adviser.id);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="registration-form-${studentId}.pdf"`
        );
        res.send(buffer);
    } catch (error) {
        console.error("Registration form export failed:", error);
        res.status(error.status || 500).json({ error: error.message });
    }
});

app.get("/export/sf1", authenticateToken, async (req, res) => {
    try {
        const adviserId = req.adviser.id;
        const workbook = await generateSF1(adviserId);
        const filename = `${req.adviser.grade_level}_${req.adviser.section}_SF1.xlsx`;

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${filename}"`
        );

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error(error);

        if (error.message.startsWith("Too many") || error.message.startsWith("No students")) {
            return res.status(400).json({ error: error.message });
        }

        res.status(500).json({ error: "Failed to generate SF1" });
    }
});

app.get('/students/:id', authenticateToken, (req, res) => {
    const studentStmt = schoolDb.prepare('SELECT * FROM students WHERE id = ?');
    const addressStmt = schoolDb.prepare(`SELECT * FROM addresses WHERE student_id = ? AND address_type = 'current'`);
    const guardianStmt = schoolDb.prepare('SELECT * FROM guardians WHERE student_id = ?');
    const disabilityStmt = schoolDb.prepare('SELECT * FROM student_disabilities WHERE student_id = ?');

    const student = studentStmt.get(req.params.id);
    if(student === undefined) {
        return res.status(404).send("no student found")
    }

    const address = addressStmt.get(req.params.id);
    const guardian = guardianStmt.all(req.params.id);
    const disability = disabilityStmt.all(req.params.id);

    res.json({
        student,
        address,
        guardian,
        disability
    })
})

app.listen(3000, () => {
    console.log("The server is running at port 3000");
})

app.post(`/students/auto-assign`, authenticateToken, (req, res) => {
    try {
        const adviserId = req.adviser.id;
        const gradeLevel = req.adviser.grade_level;

        /*
            Get every adviser assigned to this grade level.
            These advisers are used to calculate the fixed quotas.
        */
        const advisers = schoolDb.prepare(`
            SELECT
                id,
                full_name,
                assigned_level,
                section_name
            FROM advisers
            WHERE assigned_level = ?
            AND COALESCE(is_admin, 0) = 0
            ORDER BY id ASC
        `).all(gradeLevel);

        if (advisers.length === 0) {
            return res.status(400).json({
                error: "No advisers found for this grade level."
            });
        }

        /*
            Get EVERY student in the grade.

            This is important because the quota is based on
            the total grade population, not just unassigned students.
        */
        const allGradeStudents = schoolDb.prepare(`
            SELECT
                id,
                lrn,
                first_name,
                middle_name,
                last_name,
                extension_name,
                gender,
                gwa,
                adviser_id,
                grade_level
            FROM students
            WHERE grade_level = ?
            ORDER BY
                gwa DESC,
                last_name COLLATE NOCASE ASC,
                first_name COLLATE NOCASE ASC
        `).all(gradeLevel);

        if (allGradeStudents.length === 0) {
            return res.json({
                message: "There are no students in this grade level.",
                assigned: 0
            });
        }

        /*
            Only students that have not been assigned to an adviser
            can be selected.
        */
        const unassignedStudents = allGradeStudents.filter(
            student => student.adviser_id === null
        );

        if (unassignedStudents.length === 0) {
            return res.json({
                message: "There are no unassigned students for this grade level.",
                assigned: 0
            });
        }

        /*
            Determine which students THIS adviser should receive.
        */
        const selection = selectStudentsForAdviser({
            adviserId,
            advisers,
            allGradeStudents,
            unassignedStudents
        });

        if (selection.selected.length === 0) {
            return res.json({
                message: "Your class has already reached its target size.",
                assigned: 0,
                target: selection.target,
                currentCount: selection.currentCount,
                remainingQuota: selection.remainingQuota
            });
        }

        /*
            Update only the selected students.

            The transaction makes the selection and assignment
            atomic.
        */
        const assignStudent = schoolDb.prepare(`
            UPDATE students
            SET adviser_id = ?
            WHERE id = ?
              AND adviser_id IS NULL
        `);

        const assignSelected = schoolDb.transaction((students) => {
            let assignedCount = 0;

            for (const student of students) {
                const result = assignStudent.run(
                    adviserId,
                    student.id
                );

                /*
                    A selected student should still be unassigned.
                    If this unexpectedly changes, throw so the
                    transaction rolls back.
                */
                if (result.changes !== 1) {
                    throw new Error(
                        `Failed to assign student ID ${student.id}.`
                    );
                }

                assignedCount++;
            }

            return assignedCount;
        });

        const assignedCount = assignSelected(
            selection.selected
        );

        return res.json({
            message: "Students assigned successfully.",
            assigned: assignedCount,
            target: selection.target,
            currentCount: selection.currentCount,
            remainingQuota: selection.remainingQuota
        });

    } catch (error) {
        console.error("Auto-assign error:", error);

        return res.status(500).json({
            error: error.message || "Failed to automatically assign students."
        });
    }
});

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

async function createAdviser(req, res) {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const stmt = schoolDb.prepare('INSERT INTO advisers(username, password_hash, full_name, assigned_level) VALUES (?, ?, ?, ?)');
    res.send(stmt.run(req.body.username, hashedPassword, req.body.full_name, req.body.assigned_level));
}

