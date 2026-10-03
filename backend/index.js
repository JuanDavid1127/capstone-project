require('dotenv').config();
const jwt = require('jsonwebtoken');
const schoolDb = require('./database');
const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const app = express();
const { generateStudentProfile } = require("./services/sf1");
const {generateMasterlist} = require("./services/masterlist");
const {generateRegistrationForm} = require("./services/registerform");
const {selectStudentsForAdviser} = require("./services/autoAssign");
const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: "Too many login attempts, please try again later."
})
const crypto = require('crypto');

const REGISTRATION_CODE = process.env.REGISTRATION_CODE;
if (!REGISTRATION_CODE) {
    console.warn("WARNING: REGISTRATION_CODE is not set. The registration form is open to anyone.");
}

const registrationLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 60,
    message: { error: "Too many registrations from this connection. Please wait a few minutes." }
});
app.use(express.json());
app.use(cors({
    exposedHeaders:["Content-Disposition"]
}));

app.post('/students', registrationLimiter, requireRegistrationToken, (req, res) => {
    const body = req.body;
    const validGrades = ["G7", "G8", "G9", "G10", "G11", "G12"];
    const yesNo = ["yes", "no"];
    const gwa = Number(body.gwa);

    const invalid =
        !(body.last_name && body.first_name) ||
        !/^\d{12}$/.test(body.lrn) ||
        (body.sex !== "male" && body.sex !== "female") ||
        !validGrades.includes(body.grade_level) ||
        String(body.gwa ?? "").trim() === "" || !Number.isFinite(gwa) || gwa < 0 || gwa > 100 ||
        !yesNo.includes(body.returnee) ||
        !yesNo.includes(body.ipCommunity) ||
        !yesNo.includes(body.fourPs) ||
        !yesNo.includes(body.learnerDisability) ||
        !body.currBarangay || !body.currProvince || !body.currCountry ||
        (body.sameAddress === "no" && (!body.permBarangay || !body.permProvince || !body.permCountry )) || body.consent !== true;

    if (invalid) {
        return res.status(400).json({ error: "Invalid input. Please check the form and try again." });
    }

    const guardians = [
        { relationship: "father", last_name: body.fatherLastName, first_name: body.fatherFirstName, middle_name: body.fatherMiddleName, contact_no: body.fatherContactNo },
        { relationship: "mother", last_name: body.motherLastName, first_name: body.motherFirstName, middle_name: body.motherMiddleName, contact_no: body.motherContactNo },
        { relationship: "guardian", last_name: body.guardianLastName, first_name: body.guardianFirstName, middle_name: body.guardianMiddleName, contact_no: body.guardianContactNo }
    ];
    const disabilities = Array.isArray(body.disabilities) ? body.disabilities : [];

    try {
        const register = schoolDb.transaction(() => {
            const result = schoolDb.prepare(`
                INSERT INTO students(lrn, last_name, first_name, middle_name, extension_name, gender, grade_level, gwa, school_year, returnee, birth_place, birth_date, mother_tongue, ip_community, four_ps, four_ps_household_id, has_disability, disability_others)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                body.lrn, body.last_name, body.first_name, body.middle_name, body.extension_name,
                body.sex, body.grade_level, gwa, body.school_year,
                body.returnee === "yes" ? 1 : 0,
                body.birth_place, body.birth_date, body.mother_tongue,
                body.ipCommunity === "yes" ? 1 : 0,
                body.fourPs === "yes" ? 1 : 0,
                body.householdId,
                body.learnerDisability === "yes" ? 1 : 0,
                body.others
            );
            const studentId = Number(result.lastInsertRowid);

            const addressStmt = schoolDb.prepare(`
                INSERT INTO addresses(student_id, address_type, house_no, street, barangay, city, province, country, zipcode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            addressStmt.run(studentId, "current", body.currHouseNo, body.currStreet, body.currBarangay, body.currCity, body.currProvince, body.currCountry, body.currZipcode);

            if (body.sameAddress === "yes") {
                addressStmt.run(studentId, "permanent", body.currHouseNo, body.currStreet, body.currBarangay, body.currCity, body.currProvince, body.currCountry, body.currZipcode);
            } else {
                addressStmt.run(studentId, "permanent", body.permHouseNo, body.permStreet, body.permBarangay, body.permCity, body.permProvince, body.permCountry, body.permZipcode);
            }

            const guardianStmt = schoolDb.prepare(`
                INSERT INTO guardians(student_id, relationship, last_name, first_name, middle_name, contact_number)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            for (const guardian of guardians) {
                if (guardian.last_name) {
                    guardianStmt.run(studentId, guardian.relationship, guardian.last_name, guardian.first_name, guardian.middle_name, guardian.contact_no);
                }
            }

            const disabilityStmt = schoolDb.prepare(`INSERT INTO student_disabilities(student_id, disability_type) VALUES (?, ?)`);
            for (const disability of disabilities) {
                disabilityStmt.run(studentId, String(disability));
            }

            logAction({
                actor: { full_name: "Registration form" },
                action: "student_submitted",
                entityType: "student",
                entityId: studentId,
                details: { lrn: body.lrn, grade_level: body.grade_level, consent: true }
            });

            return studentId;
        });

        const studentId = register();
        return res.status(201).json({ message: "Student Created Successfully", studentId });

    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({ error: "This LRN is already registered." });
        }
        console.error("Student registration error:", error);
        return res.status(500).json({ error: "Registration failed. Please try again." });
    }
});

app.get('/students', authenticateToken, (req, res) => {
    const me = schoolDb.prepare('SELECT assigned_level, status FROM advisers WHERE id = ?').get(req.adviser.id);
    if (req.adviser.is_admin || !me || me.status !== 'active') {
        return res.status(403).json({ error: "Not allowed." });
    }
    res.json(schoolDb.prepare(
        `SELECT * FROM students WHERE grade_level = ? AND adviser_id IS NULL ORDER BY last_name ASC`
    ).all(me.assigned_level));
});

app.post('/advisers', (req, res) => {
    const setupKey = process.env.ADMIN_SETUP_KEY;
    if (setupKey && req.body.setupKey === setupKey) {
        createAdviser(req, res);
    } else {
        requireAdmin(req, res, () => createAdviser(req, res, req.admin));
    }
});

app.post('/login', loginLimiter, async (req, res) => {
    const adviser = schoolDb.prepare('SELECT * FROM advisers WHERE username = ?').get(req.body.username);
    if (adviser != undefined) {
        const comparedPassword = await bcrypt.compare(req.body.password, adviser.password_hash);
        if (comparedPassword) {
            if (adviser.status !== 'active') {
                return res.status(403).send("Account is awaiting admin approval");
            }
            const token = jwt.sign(
                {id: adviser.id, grade_level: adviser.assigned_level, full_name: adviser.full_name, section: adviser.section_name, is_admin: adviser.is_admin},
                process.env.JWT_SECRET,
                {expiresIn: '1d'}
            );
            try {
                logAction({ actor: adviser, action: 'login_success', entityType: 'adviser', entityId: adviser.id });
            } catch (e) { console.error("Log failed:", e); }

            res.json({
                message: "LOGIN SUCCESSFUL",
                token,
                grade_level: adviser.assigned_level,
                full_name: adviser.full_name,
                section_name: adviser.section_name,
                is_admin: adviser.is_admin === 1
            });
        } else {
            try { logAction({ action: 'login_failed', details: { username: req.body.username } }); } catch (e) {}
            res.status(401).send("Incorrect password");
        }
    } else {
        try { logAction({ action: 'login_failed', details: { username: req.body.username } }); } catch (e) {}
        res.status(401).send("No account found");
    }
});

app.patch('/students/:id', authenticateToken, (req, res) => {
    const { action } = req.body;
    const studentId = Number(req.params.id);
    const actor = req.adviser;

    if (!Number.isInteger(studentId)) {
        return res.status(400).json({ error: "Invalid student id." });
    }
    if (actor.is_admin) {
        return res.status(403).json({ error: "Only advisers can assign or remove students." });
    }
    if (action !== "assign" && action !== "remove") {
        return res.status(400).json({ error: "Action must be 'assign' or 'remove'." });
    }

    try {
        const student = schoolDb.prepare('SELECT id, lrn, grade_level FROM students WHERE id = ?').get(studentId);
        if (!student) {
            return res.status(404).json({ error: "Student not found." });
        }

        if (action === "assign") {
            const adviser = schoolDb.prepare('SELECT assigned_level FROM advisers WHERE id = ?').get(actor.id);
            if (!adviser || adviser.assigned_level !== student.grade_level) {
                return res.status(403).json({ error: "This student is not in your grade level." });
            }

            const assign = schoolDb.transaction(() => {
                const result = schoolDb
                    .prepare('UPDATE students SET adviser_id = ? WHERE id = ? AND adviser_id IS NULL')
                    .run(actor.id, studentId);
                if (result.changes === 0) {
                    const conflict = new Error("This student was already assigned by another adviser.");
                    conflict.statusCode = 409;
                    throw conflict;
                }
                logAction({
                    actor, action: 'student_assigned', entityType: 'student', entityId: studentId,
                    details: { lrn: student.lrn, grade_level: student.grade_level }
                });
                return result;
            });
            return res.json(assign());
        }

        // remove
        const remove = schoolDb.transaction(() => {
            const result = schoolDb
                .prepare('UPDATE students SET adviser_id = NULL WHERE id = ? AND adviser_id = ?')
                .run(studentId, actor.id);
            if (result.changes === 0) {
                const notYours = new Error("This student is not in your section.");
                notYours.statusCode = 403;
                throw notYours;
            }
            logAction({
                actor, action: 'student_removed', entityType: 'student', entityId: studentId,
                details: { lrn: student.lrn }
            });
            return result;
        });
        return res.json(remove());

    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        console.error("Student PATCH error:", error);
        return res.status(500).json({ error: "Failed to update student." });
    }
});

app.get('/students/assigned', authenticateToken, (req, res) => {
    const adviser = req.adviser.id;
    const stmt = schoolDb.prepare(`SELECT * FROM students WHERE adviser_id = ? ORDER BY last_name ASC`);
    const students = stmt.all(adviser);
    res.json(students);
})

app.get('/export/masterlist', authenticateToken, async (req, res) => {
    try {
        const adviser = getCurrentAdviser(req.adviser.id);
        if (!adviser) {
            return res.status(404).json({ error: "Adviser not found." });
        }
        const buffer = await generateMasterlist(adviser);
        const filename = `${adviser.grade_level}_${adviser.section || 'NoSection'}_Masterlist.docx`;

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to generate Masterlist" });
    }
});

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

app.get('/admin/overview', requireAdmin, (req, res) => {
    const students = schoolDb.prepare(
        `SELECT COUNT(*) AS total, COALESCE(SUM(adviser_id IS NOT NULL), 0) AS assigned FROM students`
    ).get();
    const advisers = schoolDb.prepare(`
        SELECT COUNT(*) AS total,
               COALESCE(SUM(status = 'active'), 0) AS active,
               COALESCE(SUM(status = 'pending'), 0) AS pending
        FROM advisers WHERE COALESCE(is_admin, 0) = 0
    `).get();
    const studentsByGrade = schoolDb.prepare(`
        SELECT grade_level, COUNT(*) AS total, COALESCE(SUM(adviser_id IS NULL), 0) AS unassigned
        FROM students GROUP BY grade_level
    `).all();
    const advisersByGrade = schoolDb.prepare(`
        SELECT assigned_level AS grade_level, COUNT(*) AS total
        FROM advisers WHERE COALESCE(is_admin, 0) = 0 AND status = 'active'
        GROUP BY assigned_level
    `).all();
    res.json({ students, advisers, studentsByGrade, advisersByGrade });
});

app.get("/export/sf1", authenticateToken, async (req, res) => {
    try {
        const adviser = getCurrentAdviser(req.adviser.id);
        if (!adviser) {
            return res.status(404).json({ error: "Adviser not found." });
        }
        const workbook = await generateStudentProfile(adviser.id);
        const filename = `${adviser.grade_level}_${adviser.section || 'NoSection'}_SF1.xlsx`;

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
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid student id." });

    const student = schoolDb.prepare('SELECT * FROM students WHERE id = ?').get(id);
    if (!student) return res.status(404).send("no student found");

    if (!req.adviser.is_admin) {
        const me = schoolDb.prepare('SELECT assigned_level FROM advisers WHERE id = ?').get(req.adviser.id);
        const mine = student.adviser_id === req.adviser.id;
        const inMyPool = student.adviser_id === null && student.grade_level === me?.assigned_level;
        if (!mine && !inMyPool) {
            return res.status(403).json({ error: "You cannot view this student." });
        }
    }

    res.json({
        student,
        address: schoolDb.prepare(`SELECT * FROM addresses WHERE student_id = ? AND address_type = 'current'`).get(id),
        guardian: schoolDb.prepare('SELECT * FROM guardians WHERE student_id = ?').all(id),
        disability: schoolDb.prepare('SELECT * FROM student_disabilities WHERE student_id = ?').all(id)
    });
});

app.listen(3000, () => {
    console.log("The server is running at port 3000");
})

app.post(`/students/auto-assign`, authenticateToken, (req, res) => {

    if (req.adviser.is_admin) {
        return res.status(403).json({
            error: "Only advisers can automatically assign students."
        });
    }

    try {
        const adviserId = req.adviser.id;
        const me = schoolDb.prepare('SELECT assigned_level, status FROM advisers WHERE id = ?').get(adviserId);
        if (!me || me.status !== 'active') {
            return res.status(403).json({ error: "Your account is not active." });
        }
        const gradeLevel = me.assigned_level;

        const advisers = schoolDb.prepare(`
            SELECT id, full_name, assigned_level, section_name
            FROM advisers
            WHERE assigned_level = ? AND COALESCE(is_admin, 0) = 0 AND status = 'active'
            ORDER BY id ASC
        `).all(gradeLevel);

        if (advisers.length === 0) {
            return res.status(400).json({ error: "No advisers found for this grade level." });
        }
        const allGradeStudents = schoolDb.prepare(`
            SELECT id, lrn, first_name, middle_name, last_name, extension_name, gender, gwa, adviser_id, grade_level
            FROM students
            WHERE grade_level = ?
            ORDER BY gwa DESC, last_name COLLATE NOCASE ASC, first_name COLLATE NOCASE ASC
        `).all(gradeLevel);

        if (allGradeStudents.length === 0) {
            return res.json({
                message: "There are no students in this grade level.",
                assigned: 0
            });
        }
        const unassignedStudents = allGradeStudents.filter(student => student.adviser_id === null);
        if (unassignedStudents.length === 0) {
            return res.json({
                message: "There are no unassigned students for this grade level.",
                assigned: 0
            });
        }
        const selection = selectStudentsForAdviser({adviserId, advisers, allGradeStudents, unassignedStudents});
        
        if (selection.selected.length === 0) {
            return res.json({
                message: "Your class has already reached its target size.",
                assigned: 0,
                target: selection.target,
                currentCount: selection.currentCount,
                remainingQuota: selection.remainingQuota
            });
        }
        const assignStudent = schoolDb.prepare(`UPDATE students SET adviser_id = ? WHERE id = ? AND adviser_id IS NULL`);
        const assignSelected = schoolDb.transaction((students) => {
            let assignedCount = 0;
            for (const student of students) {
                const result = assignStudent.run(adviserId, student.id);

                    if (result.changes === 0) {
                        const conflictError = new Error(
                            "One or more students were already assigned by another adviser."
                        );

                        conflictError.statusCode = 409;

                        throw conflictError;
                    }

                if (result.changes !== 1) {
                    throw new Error(
                        `Failed to assign student ID ${student.id}.`
                    );
                }
                assignedCount++;
            }
            logAction({
                actor: req.adviser,
                action: 'auto_assign',
                entityType: 'adviser',
                entityId: adviserId,
                details: { count: assignedCount, grade_level: gradeLevel }
            });
            return assignedCount;
        });
        const assignedCount = assignSelected(selection.selected);

        return res.json({
            message: "Students assigned successfully.",
            assigned: assignedCount,
            target: selection.target,
            currentCount: selection.currentCount,
            remainingQuota: selection.remainingQuota
        });

    } catch (error) {
    console.error("Auto-assign error:", error);

    if (error.statusCode === 409) {
        return res.status(409).json({
            error: error.message
        });
    }
    return res.status(500).json({
        error:
            error.message ||
            "Failed to automatically assign students."
    });
}
});

app.get('/admin/log', requireAdmin, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const where = [];
    const params = [];

    if (req.query.action)   { where.push('action = ?');   params.push(req.query.action); }
    if (req.query.actor_id) { where.push('actor_id = ?'); params.push(Number(req.query.actor_id)); }

    const rows = schoolDb.prepare(`
        SELECT * FROM activity_log
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY id DESC LIMIT ?
    `).all(...params, limit);

    res.json(rows.map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : null })));
});

app.patch('/advisers/me/section', authenticateToken, (req, res) => {
    if (req.adviser.is_admin) {
        return res.status(403).json({ error: "Only advisers have a section." });
    }
    const name = typeof req.body.section_name === 'string' ? req.body.section_name.trim() : '';
    if (name.length < 1 || name.length > 50) {
        return res.status(400).json({ error: "Section name must be 1 to 50 characters." });
    }
    try {
        const update = schoolDb.transaction(() => {
            const old = schoolDb.prepare('SELECT section_name FROM advisers WHERE id = ?').get(req.adviser.id);
            schoolDb.prepare('UPDATE advisers SET section_name = ? WHERE id = ?').run(name, req.adviser.id);
            logAction({
                actor: req.adviser, action: 'section_updated', entityType: 'adviser', entityId: req.adviser.id,
                details: { from: old?.section_name ?? null, to: name }
            });
        });
        update();
        res.json({ section_name: name });
    } catch (error) {
        console.error("Section update error:", error);
        res.status(500).json({ error: "Failed to update section name." });
    }
});

app.get('/advisers/me', authenticateToken, (req, res) => {
    const me = schoolDb.prepare(`
        SELECT full_name, assigned_level AS grade_level, section_name, status
        FROM advisers WHERE id = ? AND COALESCE(is_admin, 0) = 0
    `).get(req.adviser.id);

    if (!me || me.status !== 'active') {
        return res.status(403).json({ error: "Your account is not active." });
    }
    res.json(me);
});

const VALID_GRADES = ['G7', 'G8', 'G9', 'G10', 'G11', 'G12']; // match how you store grade_level

// Admin creates (or regenerates) the invite link
app.post('/admin/invite', requireAdmin, (req, res) => {
    try {
        if (req.body.regenerate) {
            schoolDb.transaction(() => {
                schoolDb.prepare(`UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'invite_version'`).run();
                logAction({ actor: req.admin, action: 'invite_regenerated' });
            })();
        }
        const v = Number(schoolDb.prepare(`SELECT value FROM settings WHERE key = 'invite_version'`).get().value);
        const token = jwt.sign({ purpose: 'adviser_invite', v }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, expires_in_days: 7 });
    } catch (error) {
        console.error("Invite error:", error);
        res.status(500).json({ error: "Failed to create invite." });
    }
});

// Public: an invited teacher registers a pending account
app.post('/advisers/register', loginLimiter, async (req, res) => {
    const { token, username, password, full_name } = req.body;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const current = Number(schoolDb.prepare(`SELECT value FROM settings WHERE key = 'invite_version'`).get().value);
        if (decoded.purpose !== 'adviser_invite' || decoded.v !== current) throw new Error('revoked');
    } catch {
        return res.status(401).json({ error: "This invite link is invalid or has expired." });
    }
    const ok = [username, full_name].every(v => typeof v === 'string' && v.trim()) &&
               typeof password === 'string' && password.length >= 8;
    if (!ok) return res.status(400).json({ error: "Username, full name and a password of at least 8 characters are required." });

    try {
        const hash = await bcrypt.hash(password, 10);
        schoolDb.transaction(() => {
            const r = schoolDb.prepare(`
                INSERT INTO advisers(username, password_hash, full_name, assigned_level, is_admin, status)
                VALUES (?, ?, ?, 'unassigned', 0, 'pending')
            `).run(username.trim(), hash, full_name.trim());
            logAction({
                actor: { id: Number(r.lastInsertRowid), full_name: full_name.trim() },
                action: 'adviser_registered', entityType: 'adviser', entityId: Number(r.lastInsertRowid),
                details: { username: username.trim() }
            });
        })();
        res.status(201).json({ message: "Account created. Wait for admin approval." });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: "That username is already taken." });
        console.error("Register error:", error);
        res.status(500).json({ error: "Failed to register." });
    }
});

app.get('/admin/advisers', requireAdmin, (req, res) => {
    res.json(schoolDb.prepare(`
        SELECT a.id, a.username, a.full_name, a.assigned_level, a.section_name, a.status,
               COUNT(s.id) AS student_count,
               (SELECT MAX(created_at) FROM activity_log WHERE actor_id = a.id) AS last_activity
        FROM advisers a LEFT JOIN students s ON s.adviser_id = a.id
        WHERE COALESCE(a.is_admin, 0) = 0
        GROUP BY a.id ORDER BY a.status DESC, a.full_name
    `).all());
});

app.patch('/admin/advisers/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const { assigned_level, release_students } = req.body;
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid adviser id." });
    if (!VALID_GRADES.includes(assigned_level)) return res.status(400).json({ error: "Invalid grade level." });

    try {
        const run = schoolDb.transaction(() => {
            const adv = schoolDb.prepare('SELECT * FROM advisers WHERE id = ? AND COALESCE(is_admin,0) = 0').get(id);
            if (!adv) { const e = new Error("Adviser not found."); e.statusCode = 404; throw e; }

            let released = 0;
            if (adv.assigned_level !== assigned_level) {
                const held = schoolDb.prepare('SELECT COUNT(*) AS n FROM students WHERE adviser_id = ?').get(id).n;
                if (held > 0 && !release_students) {
                    const e = new Error(`This adviser holds ${held} students. Send release_students: true to return them to the pool.`);
                    e.statusCode = 409; throw e;
                }
                released = schoolDb.prepare('UPDATE students SET adviser_id = NULL WHERE adviser_id = ?').run(id).changes;
            }
            schoolDb.prepare(`UPDATE advisers SET assigned_level = ?, status = 'active' WHERE id = ?`).run(assigned_level, id);

            if (adv.status === 'pending') {
                logAction({ actor: req.admin, action: 'adviser_approved', entityType: 'adviser', entityId: id, details: { assigned_level } });
            } else if (adv.assigned_level !== assigned_level) {
                logAction({ actor: req.admin, action: 'grade_changed', entityType: 'adviser', entityId: id,
                            details: { from: adv.assigned_level, to: assigned_level, students_released: released } });
            }
            return { id, assigned_level, released };
        });
        res.json(run());
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
        console.error("Adviser update error:", error);
        res.status(500).json({ error: "Failed to update adviser." });
    }
});

app.get('/registration/status', (req, res) => {
    res.json({ required: Boolean(REGISTRATION_CODE) });
});

app.post('/registration/unlock', loginLimiter, (req, res) => {
    if (!REGISTRATION_CODE) return res.json({ token: null });

    if (!codeMatches(req.body.code)) {
        try { logAction({ action: 'registration_unlock_failed' }); } catch (e) {}
        return res.status(401).json({ error: "Incorrect access code." });
    }

    const token = jwt.sign({ purpose: 'registration' }, process.env.JWT_SECRET, { expiresIn: '8h' });
    try { logAction({ action: 'registration_unlocked' }); } catch (e) {}
    res.json({ token });
});

function codeMatches(input) {
    const a = crypto.createHash('sha256').update(String(input ?? '')).digest();
    const b = crypto.createHash('sha256').update(REGISTRATION_CODE).digest();
    return crypto.timingSafeEqual(a, b);
}

function requireRegistrationToken(req, res, next) {
    if (!REGISTRATION_CODE) return next();

    const token = req.headers.authorization?.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.purpose !== 'registration') throw new Error('wrong token');
        next();
    } catch {
        res.status(401).json({ error: "Registration desk is locked. Enter the access code." });
    }
}

function getCurrentAdviser(id) {
    return schoolDb.prepare(`
        SELECT id, full_name, assigned_level AS grade_level, section_name AS section
        FROM advisers WHERE id = ?
    `).get(id);
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).send("rejected");
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Login tokens always have an id. Invite tokens have a purpose and no id.
        if (!decoded.id || decoded.purpose) {
            return res.status(401).send("Invalid or expired token");
        }
        req.adviser = decoded;
        next();
    } catch (error) {
        return res.status(401).send("Invalid or expired token");
    }
}

const insertLog = schoolDb.prepare(`
    INSERT INTO activity_log (actor_id, actor_name, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?)
`);

function logAction({ actor = null, action, entityType = null, entityId = null, details = null }) {
    insertLog.run(
        actor?.id ?? null,
        actor?.full_name ?? null,
        action,
        entityType,
        entityId,
        details ? JSON.stringify(details) : null
    );
}

function requireAdmin(req, res, next) {
    authenticateToken(req, res, () => {
        // Check the database, not the token, so a revoked admin loses access immediately
        const row = schoolDb
            .prepare('SELECT id, full_name, is_admin FROM advisers WHERE id = ?')
            .get(req.adviser.id);

        if (!row || row.is_admin !== 1) {
            return res.status(403).json({ error: "Admin access required." });
        }
        req.admin = row;
        next();
    });
}

async function createAdviser(req, res, actor = null) {
    const { username, password, full_name, assigned_level, section_name } = req.body;

    const required = [username, password, full_name, assigned_level];
    if (!required.every(v => typeof v === 'string' && v.trim() !== '')) {
        return res.status(400).json({ error: "username, password, full_name and assigned_level are required." });
    }
    const isAdmin = (req.body.is_admin === true || Number(req.body.is_admin) === 1) ? 1 : 0;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const insert = schoolDb.prepare(`
            INSERT INTO advisers(username, password_hash, full_name, assigned_level, is_admin, section_name)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const create = schoolDb.transaction(() => {
            const result = insert.run(username.trim(), hashedPassword, full_name.trim(), assigned_level, isAdmin, section_name ?? null);
            logAction({
                actor,
                action: 'adviser_created',
                entityType: 'adviser',
                entityId: Number(result.lastInsertRowid),
                details: { username: username.trim(), assigned_level, is_admin: isAdmin, via: actor ? 'admin' : 'setup_key' }
            });
            return result;
        });
        const result = create();
        res.status(201).json({ id: Number(result.lastInsertRowid), username: username.trim() });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ error: "That username is already taken." });
        }
        console.error("Create adviser error:", error);
        res.status(500).json({ error: "Failed to create adviser." });
    }
}

