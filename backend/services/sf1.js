const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");
const schoolDb = require("../database");

const TEMPLATE_PATH = path.join(__dirname, "..", "assets", "student_profile_template.xlsx");

// ---------------------------------------------------------------------------
// Template layout (student_profile_template.xlsx)
// ---------------------------------------------------------------------------
const FIRST_STUDENT_ROW = 8;             // row 7 is the column header
const MIN_STUDENT_ROWS = 40;             // the template has 40 numbered slots; more rows are added if needed
const TEMPLATE_SIGNATURE_FIRST_ROW = 56; // blank spacer row above "Prepared by"
const TEMPLATE_SIGNATURE_LAST_ROW = 60;  // "Teacher I / Assistant Principal II" row
const TEMPLATE_ADVISER_NAME_ROW = 59;    // row holding the adviser's name (column C)
const LAST_COLUMN_NUMBER = 18;           // column R (right margin, inside the print area)
const COLUMNS_TO_CLEAR = LAST_COLUMN_NUMBER + 15;

// Every student row gets the same height so the sheet looks even.
const MIN_ROW_HEIGHT = 30;               // room for two lines of text
const HEIGHT_PER_TEXT_LINE = 15;
const CHARACTERS_PER_WIDTH_UNIT = 0.95;  // rough estimate of how much text fits in a column

// ---------------------------------------------------------------------------
// Template columns. `getValue` receives one student "profile" (see buildStudentProfile).
// ---------------------------------------------------------------------------
const COLUMNS = [
    { columnNumber: 2,  width: 45.25, getValue: (profile) => profile.fullName },                              // B  COMPLETE NAME OF STUDENTS
    { columnNumber: 3,  width: 27.9,  getValue: (profile) => toNumberIfAllDigits(profile.lrn) },               // C  LRN
    { columnNumber: 4,  width: 26.1,  getValue: (profile) => profile.gender },                                // D  GENDER
    { columnNumber: 5,  width: 21.6,  getValue: (profile) => profile.age },                                   // E  AGE
    { columnNumber: 6,  width: 23.0,  getValue: (profile) => profile.birthDate, numberFormat: "mm/dd/yyyy" }, // F  BIRTHDAY
    { columnNumber: 7,  width: 49.6,  getValue: (profile) => profile.address },                               // G  COMPLETE ADDRESS
    { columnNumber: 8,  width: 26.9,  getValue: (profile) => profile.studentContactNumber },                  // H  CONTACT NUMBER (the student's own)
    { columnNumber: 9,  width: 42.25, getValue: (profile) => profile.motherName },                            // I  MOTHER'S NAME
    { columnNumber: 10, width: 39.6,  getValue: (profile) => profile.fatherName },                            // J  FATHER'S NAME
    { columnNumber: 11, width: 34.25, getValue: (profile) => profile.guardianName },                          // K  GUARDIAN'S NAME
    { columnNumber: 12, width: 33.9,  getValue: (profile) => profile.emergencyContactName },                  // L  PERSON TO CONTACT IN CASE OF EMERGENCY
    { columnNumber: 13, width: 22.75, getValue: (profile) => profile.emergencyContactNumber },                // M  CONTACT NUMBER (of the person to contact)
    { columnNumber: 14, width: 13.0,  getValue: (profile) => profile.emergencyContactRelationship },          // N  RELATIONSHIP TO LEARNER
    { columnNumber: 15, width: 13.0,  getValue: (profile) => toNumberIfPossible(profile.height) },            // O  HEIGHT (cm)
    { columnNumber: 16, width: 24.6,  getValue: (profile) => toNumberIfPossible(profile.weight) },            // P  WEIGHT (kg)
    { columnNumber: 17, width: 37.9,  getValue: (profile) => profile.medicalHistory },                        // Q  MEDICAL HISTORY
];

const CENTERED_COLUMN_NUMBERS = new Set([3, 4, 5, 6, 8, 13, 14, 15, 16]);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function generateStudentProfile(adviserId) {
    const studentRows = loadStudentRows(adviserId);
    if (studentRows.length === 0) {
        throw new Error("No students are assigned to this adviser");
    }

    const guardiansByStudentId = loadGuardiansByStudentId(studentRows.map((student) => student.id));
    const profiles = studentRows.map((student) =>
        buildStudentProfile(student, guardiansByStudentId[student.id] || [])
    );

    const adviser = schoolDb
        .prepare("SELECT full_name, assigned_level, section_name FROM advisers WHERE id = ?")
        .get(adviserId);
    const schoolInfo = schoolDb.prepare("SELECT * FROM school WHERE id = 1").get();

    const workbook = await loadTemplateWorkbook();
    const worksheet = workbook.worksheets[0];

    fillTitleBlock(worksheet, { adviser, schoolInfo, schoolYear: findSchoolYear(profiles) });

    // Remember how the template rows look, then clear everything below the column header.
    const firstRowStyle = captureRowStyle(worksheet, FIRST_STUDENT_ROW);
    const otherRowStyle = captureRowStyle(worksheet, FIRST_STUDENT_ROW + 1);
    const signatureBlock = captureSignatureBlock(worksheet);
    clearRowsBelowHeader(worksheet);

    const studentRowCount = Math.max(profiles.length, MIN_STUDENT_ROWS);
    const studentRowHeight = calculateUniformRowHeight(profiles);

    fillStudentRows(worksheet, profiles, { studentRowCount, studentRowHeight, firstRowStyle, otherRowStyle });

    const signatureFirstRow = FIRST_STUDENT_ROW + studentRowCount;
    placeSignatureBlock(worksheet, signatureBlock, signatureFirstRow, adviser);

    return workbook;
}

// ---------------------------------------------------------------------------
// Loading data
// ---------------------------------------------------------------------------
function loadStudentRows(adviserId) {
    // students.* so optional columns (contact_number, height, weight, medical_history,
    // emergency_contact_*) are picked up automatically if they exist.
    // LEFT JOIN so a student without a "current" address is still listed.
    const rows = schoolDb
        .prepare(
            `SELECT students.*,
                    addresses.house_no, addresses.street, addresses.barangay,
                    addresses.city, addresses.province
             FROM students
             LEFT JOIN addresses
                ON students.id = addresses.student_id
                AND LOWER(addresses.address_type) = 'current'
             WHERE students.adviser_id = ?
             ORDER BY students.gender DESC,
                      students.last_name COLLATE NOCASE ASC,
                      students.first_name COLLATE NOCASE ASC`
        )
        .all(adviserId);

    // A student with more than one "current" address would appear twice, so keep the first only.
    const alreadySeenIds = new Set();
    return rows.filter((row) => {
        if (alreadySeenIds.has(row.id)) return false;
        alreadySeenIds.add(row.id);
        return true;
    });
}

function loadGuardiansByStudentId(studentIds) {
    const placeholders = studentIds.map(() => "?").join(", ");
    const guardianRows = schoolDb
        .prepare(`SELECT * FROM guardians WHERE student_id IN (${placeholders}) ORDER BY id ASC`)
        .all(...studentIds);

    const guardiansByStudentId = {};
    for (const guardianRow of guardianRows) {
        if (!guardiansByStudentId[guardianRow.student_id]) {
            guardiansByStudentId[guardianRow.student_id] = [];
        }
        guardiansByStudentId[guardianRow.student_id].push(guardianRow);
    }
    return guardiansByStudentId;
}

async function loadTemplateWorkbook() {
    if (!fs.existsSync(TEMPLATE_PATH)) {
        throw new Error(
            `Template not found: ${TEMPLATE_PATH}. Put student_profile_template.xlsx in backend/assets/.`
        );
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(TEMPLATE_PATH);
    return workbook;
}

// ---------------------------------------------------------------------------
// Turning database rows into one flat "profile" per student
// ---------------------------------------------------------------------------
function buildStudentProfile(student, guardians) {
    const relationshipOf = (guardian) => String(guardian.relationship || "").trim().toLowerCase();

    const father = guardians.find((guardian) => relationshipOf(guardian) === "father");
    const mother = guardians.find((guardian) => relationshipOf(guardian) === "mother");
    const legalGuardian = guardians.find(
        (guardian) => relationshipOf(guardian) !== "father" && relationshipOf(guardian) !== "mother"
    );

    // Person to contact in case of emergency: the dedicated students.emergency_contact_* columns
    // if they exist, otherwise the legal guardian, then the mother, then the father.
    const defaultEmergencyContact = legalGuardian || mother || father;

    return {
        fullName: formatStudentName(student),
        lrn: student.lrn,
        gender: String(student.gender ?? "").toUpperCase(),
        age: calculateAge(student.birth_date, student.school_year),
        birthDate: parseDate(student.birth_date),
        address: formatAddress(student),
        schoolYear: student.school_year,

        // The student's own number only (students.contact_number / contact_no). Blank if none is stored.
        studentContactNumber: student.contact_number || student.contact_no || null,

        motherName: formatParentName(mother),
        fatherName: formatParentName(father),
        guardianName: formatParentName(legalGuardian),

        emergencyContactName: student.emergency_contact_name || formatParentName(defaultEmergencyContact),
        emergencyContactNumber: student.emergency_contact_no || defaultEmergencyContact?.contact_number || null,
        emergencyContactRelationship:
            student.emergency_relationship || defaultEmergencyContact?.relationship || null,

        height: student.height,
        weight: student.weight,
        medicalHistory: student.medical_history,
    };
}

function formatStudentName(student) {
    return `${student.last_name}, ${student.first_name} ${student.middle_name || ""} ${student.extension_name || ""}`
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

function formatParentName(parent) {
    if (!parent || !parent.last_name) return "";
    return `${parent.last_name}, ${parent.first_name || ""} ${parent.middle_name || ""}`
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

// "123 ST. JOSEPH HOME, BRGY. UNO, ALAMINOS, LAGUNA"
function formatAddress(addressRow) {
    const clean = (text) => String(text ?? "").trim();
    const houseAndStreet = [clean(addressRow.house_no), clean(addressRow.street)].filter(Boolean).join(" ");
    const addressParts = [
        houseAndStreet,
        clean(addressRow.barangay),
        clean(addressRow.city),
        clean(addressRow.province),
    ].filter(Boolean);

    return addressParts.length ? addressParts.join(", ").toUpperCase() : null;
}

// Age as of June 1 of the school year (same rule as the original SF1 code)
function calculateAge(birthDateText, schoolYear) {
    if (!birthDateText || !schoolYear) return null;

    const birthDate = new Date(birthDateText);
    const schoolStartYear = parseInt(String(schoolYear).split("-")[0], 10);
    if (Number.isNaN(birthDate.getTime()) || Number.isNaN(schoolStartYear)) return null;

    const referenceDate = new Date(schoolStartYear, 5, 1);
    let age = referenceDate.getFullYear() - birthDate.getFullYear();

    const birthdayNotYetReached =
        referenceDate.getMonth() < birthDate.getMonth() ||
        (referenceDate.getMonth() === birthDate.getMonth() && referenceDate.getDate() < birthDate.getDate());
    if (birthdayNotYetReached) age--;

    return age;
}

// "2013-04-20" -> Date at UTC midnight, so Excel shows the right day in any timezone
function parseDate(dateText) {
    const dateParts = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateText || "");
    if (!dateParts) return null;
    const [, year, month, day] = dateParts;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function toNumberIfAllDigits(value) {
    if (value === undefined || value === null || value === "") return null;
    const text = String(value).trim();
    return /^\d{1,15}$/.test(text) ? Number(text) : text;
}

function toNumberIfPossible(value) {
    if (value === undefined || value === null || value === "") return null;
    const number = Number(value);
    return Number.isNaN(number) ? String(value) : number;
}

function findSchoolYear(profiles) {
    const profileWithSchoolYear = profiles.find((profile) => profile.schoolYear);
    return profileWithSchoolYear ? profileWithSchoolYear.schoolYear : null;
}

// ---------------------------------------------------------------------------
// Filling in the worksheet
// ---------------------------------------------------------------------------
function fillTitleBlock(worksheet, { adviser, schoolInfo, schoolYear }) {
    const gradeNumber = String(adviser?.assigned_level ?? "").replace(/\D/g, "");
    const sectionName = String(adviser?.section_name ?? "").trim();

    // Sheet tab names can't contain \ / ? * [ ] : and are limited to 31 characters
    worksheet.name = `GRADE ${gradeNumber}-${sectionName}`.replace(/[\\/?*[\]:]/g, "").slice(0, 31);

    // Keep the template's own header lines and only swap in the school's values.
    // Lines: 0-2 blank (space for the logo), 3 Republic, 4 DepEd, 5 Region, 6 Division, 7 School, 8 City/Province
    const headerLines = String(worksheet.getCell("A1").value).split("\n");
    headerLines[5] = `REGION ${schoolInfo.region}`.toUpperCase();
    headerLines[6] = `SCHOOLS DIVISION OF ${schoolInfo.division}`.toUpperCase();
    headerLines[7] = String(schoolInfo.school_name).toUpperCase();
    if (schoolInfo.city_province) {
        headerLines[8] = String(schoolInfo.city_province).toUpperCase();
    }
    worksheet.getCell("A1").value = headerLines.join("\n");

    if (schoolYear) {
        worksheet.getCell("B4").value = `S.Y. ${schoolYear}`;
    }
    worksheet.getCell("B5").value = `GRADE ${gradeNumber}- ${sectionName}`.toUpperCase();
}

function clearRowsBelowHeader(worksheet) {
    const lastRowToClear = Math.max(worksheet.rowCount, TEMPLATE_SIGNATURE_LAST_ROW);

    for (let rowNumber = FIRST_STUDENT_ROW; rowNumber <= lastRowToClear; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        for (let columnNumber = 1; columnNumber <= COLUMNS_TO_CLEAR; columnNumber++) {
            const cell = row.getCell(columnNumber);
            cell.value = null;
            cell.style = {};
        }
        row.height = undefined;
    }
}

function fillStudentRows(worksheet, profiles, { studentRowCount, studentRowHeight, firstRowStyle, otherRowStyle }) {
    for (let studentIndex = 0; studentIndex < studentRowCount; studentIndex++) {
        const row = worksheet.getRow(FIRST_STUDENT_ROW + studentIndex);

        applyRowStyle(row, studentIndex === 0 ? firstRowStyle : otherRowStyle);
        row.height = studentRowHeight;

        const profile = profiles[studentIndex];
        if (!profile) continue; // empty numbered slot

        const numberCell = row.getCell(1);
        numberCell.value = studentIndex + 1;
        numberCell.alignment = { horizontal: "center", vertical: "middle" };

        for (const column of COLUMNS) {
            const cell = row.getCell(column.columnNumber);
            const cellValue = column.getValue(profile);
            const hasValue = cellValue !== undefined && cellValue !== null && cellValue !== "";

            cell.value = hasValue ? cellValue : null;
            if (column.numberFormat && hasValue) {
                cell.numFmt = column.numberFormat;
            }
            cell.alignment = {
                horizontal: CENTERED_COLUMN_NUMBERS.has(column.columnNumber) ? "center" : "left",
                vertical: "middle",
                wrapText: true,
            };
        }
    }
}

// All student rows share one height: tall enough for the longest entry in the class
// (never less than MIN_ROW_HEIGHT), so no row looks shorter than the others.
function calculateUniformRowHeight(profiles) {
    let mostLinesNeeded = 1;

    for (const profile of profiles) {
        for (const column of COLUMNS) {
            const cellValue = column.getValue(profile);
            if (typeof cellValue !== "string") continue;

            const charactersPerLine = column.width * CHARACTERS_PER_WIDTH_UNIT;
            const linesNeeded = Math.ceil(cellValue.length / charactersPerLine);
            mostLinesNeeded = Math.max(mostLinesNeeded, linesNeeded);
        }
    }

    return Math.max(MIN_ROW_HEIGHT, mostLinesNeeded * HEIGHT_PER_TEXT_LINE);
}

// ---------------------------------------------------------------------------
// Signature block ("Prepared by" ... adviser / assistant principal)
// ---------------------------------------------------------------------------
function captureSignatureBlock(worksheet) {
    const signatureRows = [];
    for (let rowNumber = TEMPLATE_SIGNATURE_FIRST_ROW; rowNumber <= TEMPLATE_SIGNATURE_LAST_ROW; rowNumber++) {
        signatureRows.push(captureRow(worksheet, rowNumber));
    }
    return signatureRows;
}

function placeSignatureBlock(worksheet, signatureRows, signatureFirstRow, adviser) {
    signatureRows.forEach((savedRow, rowOffset) => {
        restoreRow(worksheet, signatureFirstRow + rowOffset, savedRow);
    });

    // "Teacher I" and the Assistant Principal's name stay as written in the template.
    const adviserNameRow = signatureFirstRow + (TEMPLATE_ADVISER_NAME_ROW - TEMPLATE_SIGNATURE_FIRST_ROW);
    worksheet.getCell(`C${adviserNameRow}`).value = String(adviser?.full_name ?? "").toUpperCase();

    const signatureLastRow = signatureFirstRow + (TEMPLATE_SIGNATURE_LAST_ROW - TEMPLATE_SIGNATURE_FIRST_ROW);
    worksheet.pageSetup.printArea = `A1:R${signatureLastRow}`;
}

// ---------------------------------------------------------------------------
// Copying row styles from the template
// ---------------------------------------------------------------------------
const deepCopy = (object) => JSON.parse(JSON.stringify(object));

function captureRowStyle(worksheet, rowNumber) {
    const row = worksheet.getRow(rowNumber);
    const stylesByColumn = {};
    for (let columnNumber = 1; columnNumber <= LAST_COLUMN_NUMBER; columnNumber++) {
        stylesByColumn[columnNumber] = deepCopy(row.getCell(columnNumber).style);
    }
    return stylesByColumn;
}

function applyRowStyle(row, stylesByColumn) {
    for (let columnNumber = 1; columnNumber <= LAST_COLUMN_NUMBER; columnNumber++) {
        row.getCell(columnNumber).style = deepCopy(stylesByColumn[columnNumber]);
    }
}

function captureRow(worksheet, rowNumber) {
    const row = worksheet.getRow(rowNumber);
    const cellsByColumn = {};
    for (let columnNumber = 1; columnNumber <= LAST_COLUMN_NUMBER; columnNumber++) {
        const cell = row.getCell(columnNumber);
        cellsByColumn[columnNumber] = { value: cell.value, style: deepCopy(cell.style) };
    }
    return { height: row.height, cellsByColumn };
}

function restoreRow(worksheet, rowNumber, savedRow) {
    const row = worksheet.getRow(rowNumber);
    for (let columnNumber = 1; columnNumber <= LAST_COLUMN_NUMBER; columnNumber++) {
        const savedCell = savedRow.cellsByColumn[columnNumber];
        row.getCell(columnNumber).value = savedCell.value;
        row.getCell(columnNumber).style = savedCell.style;
    }
    if (savedRow.height) row.height = savedRow.height;
}

// generateSF1 is kept as an alias so existing imports keep working
module.exports = { generateStudentProfile, generateSF1: generateStudentProfile };