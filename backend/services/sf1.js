const ExcelJS = require("exceljs");
const path = require("path");
const schoolDb = require("../database");

async function generateSF1(adviserId) {
    const stmt = schoolDb.prepare(`
        SELECT
            students.id,
            students.lrn,
            students.last_name,
            students.first_name,
            students.middle_name,
            students.extension_name,
            students.gender,
            students.school_year,
            students.birth_date,
            students.religion,
            students.ip_community,
            students.learning_modality,
            students.remarks,
            students.mother_tongue,
            addresses.house_no,
            addresses.street,
            addresses.barangay,
            addresses.city,
            addresses.province
        FROM students 
        JOIN addresses 
            ON students.id = addresses.student_id 
            AND addresses.address_type = 'current' 
        WHERE students.adviser_id = ? 
        ORDER BY students.gender DESC, students.last_name COLLATE NOCASE ASC, students.first_name COLLATE NOCASE ASC`);

    const joined = stmt.all(adviserId);

    const studentId = joined.map((student) => student.id);

    if (studentId.length <= 0) {
        throw new Error("No students are assigned to this adviser");
    }

    const placeholder = studentId.map(() => "?").join(", ");
    const guardianStmt = schoolDb.prepare(`
        SELECT * FROM guardians WHERE student_id IN (${placeholder})
        `);
    const guardians = guardianStmt.all(...studentId);

    const guardiansByStudent = guardians.reduce((groups, guardian) => {
        if (!groups[guardian.student_id]) {
            groups[guardian.student_id] = [];
        }
        groups[guardian.student_id].push(guardian);

        return groups;
    }, {});

    const students = joined.map(student => {
        return {
            ...student,
            guardians: guardiansByStudent[student.id] || []
        };
    });

    const adviserStmt = schoolDb.prepare("SELECT full_name, assigned_level, section_name FROM advisers WHERE id = ?");
    const adviser = adviserStmt.get(adviserId);

    const schoolStmt = schoolDb.prepare("SELECT * FROM school WHERE id = 1");
    const schoolInfo = schoolStmt.get();

    const workbook = new ExcelJS.Workbook();
    const templatePath = path.join(__dirname, "..", "assets", "SF1_template.xlsx");

    await workbook.xlsx.readFile(templatePath);

    const worksheet = workbook.worksheets[0];

    worksheet.getCell("F3").value = schoolInfo.school_id;
    worksheet.getCell("K3").value = schoolInfo.region;
    worksheet.getCell("T3").value = schoolInfo.division;
    worksheet.getCell("F4").value = schoolInfo.school_name;
    worksheet.getCell("T4").value = students[0]?.school_year || "";
    worksheet.getCell("AE4").value = adviser.assigned_level ? `Grade ${adviser.assigned_level.replace(/^G/i, "")}` : "";
    worksheet.getCell("AM4").value = adviser.section_name || "";

    worksheet.getCell("AE74").value = adviser.full_name || "";
    worksheet.getCell("AN75").value = schoolInfo.school_head || "";
    worksheet.getCell("AN78").value = "BoSY Date: ";
    worksheet.getCell("AQ78").value = "EoSY Date: ";

    const today = new Date();
    worksheet.getCell("A83").value = `Generated on: ${today.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;

    const males = students.filter(student => student.gender?.toLowerCase() === "male");
    const females = students.filter(student => student.gender?.toLowerCase() === "female");

    worksheet.getCell("X74").value = males.length;
    worksheet.getCell("X77").value = females.length;
    worksheet.getCell("X79").value = students.length;

    const MALE_START_ROW = 7;
    const MALE_CAPACITY = 31;
    const MALE_TOTAL_ROW = 38;

    const FEMALE_START_ROW = 39;
    const FEMALE_CAPACITY = 31;
    const FEMALE_TOTAL_ROW = 70;

    const COMBINED_ROW = 71;

    const columns = {
        lrn: "A",
        fullName: "C",
        sex: "G",
        birthDate: "H",
        age: "J",
        motherTongue: "L",
        ip: "N",
        religion: "O",
        houseNo: "P",
        barangay: "R",
        city: "U",
        province: "W",
        fatherName: "AB",
        motherName: "AF",
        guardianName: "AK",
        guardianRelationship: "AO",
        contactNumber: "AP",
        learningModality: "AR",
        remarks: "AS"
    };

    if (males.length > MALE_CAPACITY) {
        throw new Error(`Too many male students. Maximum is ${MALE_CAPACITY}.`);
    }

    if (females.length > FEMALE_CAPACITY) {
        throw new Error(`Too many female students. Maximum is ${FEMALE_CAPACITY}.`);
    }

    males.forEach((student, index) => {
        writeStudentRow(worksheet, student, MALE_START_ROW + index, columns);
    });

    worksheet.getCell(`A${MALE_TOTAL_ROW}`).value = males.length;
    worksheet.getCell(`C${MALE_TOTAL_ROW}`).value = "TOTAL MALE";

    females.forEach((student, index) => {
        writeStudentRow(worksheet, student, FEMALE_START_ROW + index, columns);
    });

    worksheet.getCell(`A${FEMALE_TOTAL_ROW}`).value = females.length;
    worksheet.getCell(`C${FEMALE_TOTAL_ROW}`).value = "TOTAL FEMALE";

    worksheet.getCell(`A${COMBINED_ROW}`).value = students.length;
    worksheet.getCell(`C${COMBINED_ROW}`).value = "COMBINED";

    return workbook;
}

function formatGuardianName(guardian) {
    if (!guardian) {
        return "";
    }
    return `${guardian.last_name}, ${guardian.first_name} ${guardian.middle_name}`;
}

function calculateAge(birthDate, schoolYear) {
    if (!birthDate || !schoolYear) {
        return "";
    }

    const birth = new Date(birthDate);
    const startYear = parseInt(schoolYear.split("-")[0]);

    const referenceDate = new Date(startYear, 5, 1);

    let age = referenceDate.getFullYear() - birth.getFullYear();

    if (
        referenceDate.getMonth() < birth.getMonth() ||
        (referenceDate.getMonth() === birth.getMonth() && referenceDate.getDate() < birth.getDate())
    ) {
        age--;
    }

    return age;
}

function writeStudentRow(worksheet, student, rowNumber, columns) {
    const fullnameStudent = `${student.last_name}, ${student.first_name} ${student.middle_name || ""} ${student.extension_name || ""}`;

    const singleLetterGender = student.gender?.toLowerCase() === "male" ? "M" : "F";

    const father = student.guardians.find(
        guardian => guardian.relationship.toLowerCase() === "father"
    );

    const mother = student.guardians.find(
        guardian => guardian.relationship.toLowerCase() === "mother"
    );

    const guardians = student.guardians.find(
        guardian =>
            guardian.relationship.toLowerCase() !== "father" &&
            guardian.relationship.toLowerCase() !== "mother"
    );

    const contactNumbers = [father?.contact_number, mother?.contact_number].filter(Boolean);

    if (contactNumbers.length === 0 && guardians?.contact_number) {
        contactNumbers.push(guardians.contact_number);
    }

    const fullNameFather = formatGuardianName(father);
    const fullNameMother = formatGuardianName(mother);
    const fullNameGuardian = formatGuardianName(guardians);

    const row = worksheet.getRow(rowNumber);

    row.getCell(columns.lrn).value = student.lrn;
    row.getCell(columns.fullName).value = fullnameStudent.replace(/\s+/g, " ").trim().toUpperCase();
    row.getCell(columns.sex).value = singleLetterGender;
    row.getCell(columns.birthDate).value = student.birth_date;
    row.getCell(columns.age).value = calculateAge(student.birth_date, student.school_year);
    row.getCell(columns.motherTongue).value = student.mother_tongue;
    row.getCell(columns.ip).value = student.ip_community ? "yes" : "no";
    row.getCell(columns.religion).value = student.religion;

    row.getCell(columns.houseNo).value = student.house_no?.toUpperCase() || "";
    row.getCell(columns.barangay).value = student.barangay?.toUpperCase() || "";
    row.getCell(columns.city).value = student.city?.toUpperCase() || "";
    row.getCell(columns.province).value = student.province?.toUpperCase() || "";

    row.getCell(columns.fatherName).value = fullNameFather.toUpperCase();
    row.getCell(columns.motherName).value = fullNameMother.toUpperCase();
    row.getCell(columns.guardianName).value = fullNameGuardian.toUpperCase();
    row.getCell(columns.guardianRelationship).value = guardians?.relationship?.toUpperCase() || "";
    row.getCell(columns.contactNumber).value = contactNumbers.join(", ");

    row.getCell(columns.learningModality).value = student.learning_modality;
    row.getCell(columns.remarks).value = student.remarks;
}

module.exports = { generateSF1 };