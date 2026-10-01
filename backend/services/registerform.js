const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const schoolDb = require("../database");

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 38; // inner left edge of fields
const BLACK = rgb(0, 0, 0);
const FIELD_H = 28;

// ---------- small helpers ----------

// Convert "distance from top of page" (+ element height) to pdf-lib's bottom-left y.
const yOf = (top, height = 0) => PAGE_HEIGHT - top - height;

const upper = (v) => (v == null ? "" : String(v).toUpperCase());

// "a. blind" / "BLIND" / "visual_impairment" -> comparable keys ("blind", "visualimpairment")
const normKey = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/^[a-z]\.\s*/, "")
    .replace(/[^a-z0-9]/g, "");

function fitSize(font, text, maxWidth, size, min = 6) {
  while (size > min && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  return size;
}

function formatBirthDate(v) {
  if (!v) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : String(v);
}

function computeAge(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || "");
  if (!m) return "";
  const birth = new Date(+m[1], +m[2] - 1, +m[3]);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hadBirthday =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hadBirthday) age--;
  return age;
}

// ---------- drawing primitives (all use "top" coordinates) ----------

function drawText(ctx, text, x, top, size = 7, isBold = false) {
  ctx.page.drawText(text, {
    x,
    y: yOf(top) - size,
    size,
    font: isBold ? ctx.bold : ctx.font,
    color: BLACK,
  });
}

function drawCentered(ctx, text, left, width, top, size, isBold = true) {
  const f = isBold ? ctx.bold : ctx.font;
  const w = f.widthOfTextAtSize(text, size);
  drawText(ctx, text, left + (width - w) / 2, top, size, isBold);
}

function drawBox(ctx, x, top, width, height) {
  ctx.page.drawRectangle({
    x,
    y: yOf(top, height),
    width,
    height,
    borderWidth: 0.75,
    borderColor: BLACK,
  });
}

function drawField(ctx, { x, top, width, height = FIELD_H, label, value, size = 10 }) {
  drawBox(ctx, x, top, width, height);
  drawText(ctx, label, x + 3, top + 3, 6, true);
  const text = upper(value);
  if (text) {
    const s = fitSize(ctx.font, text, width - 10, size);
    ctx.page.drawText(text, {
      x: x + 5,
      y: yOf(top, height) + 5,
      size: s,
      font: ctx.font,
      color: BLACK,
    });
  }
}

// Draws a checkbox + label. Returns the x where the label ends.
function drawCheckbox(ctx, x, top, label, checked = false, labelSize = 7) {
  const box = 8;
  drawBox(ctx, x, top, box, box);
  if (checked) {
    ctx.page.drawRectangle({
      x: x + 1.75,
      y: yOf(top, box) + 1.75,
      width: box - 3.5,
      height: box - 3.5,
      color: BLACK,
    });
  }
  ctx.page.drawText(label, {
    x: x + box + 3,
    y: yOf(top, box) + 1.5,
    size: labelSize,
    font: ctx.font,
    color: BLACK,
  });
  return x + box + 3 + ctx.font.widthOfTextAtSize(label, labelSize);
}

// value: true -> Yes ticked, false -> No ticked, null/undefined -> neither
function drawYesNo(ctx, x, top, value) {
  const afterYes = drawCheckbox(ctx, x, top, "Yes", value === true);
  drawCheckbox(ctx, afterYes + 8, top, "No", value === false);
}

// ---------- sections ----------

function drawHeader(ctx, d) {
  drawText(ctx, "Revised as of 03/27/2023", 498, 20, 6);
  drawBox(ctx, 506, 30, 68, 13);
  drawCentered(ctx, "ANNEX 1", 506, 68, 33, 7);

  drawCentered(ctx, "BASIC EDUCATION ENROLLMENT FORM", 0, PAGE_WIDTH, 42, 12);
  drawCentered(ctx, "THIS FORM IS NOT FOR SALE", 0, PAGE_WIDTH, 57, 6);

  drawField(ctx, { x: LEFT, top: 68, width: 100, label: "School Year", value: d.schoolYear });
  drawField(ctx, { x: 146, top: 68, width: 100, label: "Grade Level to Enroll", value: d.gradeLevel });

  // "Check the appropriate box only" panel
  drawBox(ctx, 262, 68, 312, FIELD_H);
  drawText(ctx, "Check the appropriate box only", 268, 71, 6.5, true);
  drawText(ctx, "1. With LRN?", 268, 84, 7);
  drawYesNo(ctx, 316, 83, d.withLRN);
  drawText(ctx, "2. Returning (Balik-Aral)", 388, 84, 7);
  drawYesNo(ctx, 480, 83, d.returning);

  drawText(ctx, "INSTRUCTIONS:", LEFT, 103, 6.5, true);
  drawText(
    ctx,
    "Print legibly all information required in CAPITAL letters. Submit accomplished form to the Person-in-Charge/Registrar/Class Adviser. Use black or blue pen only.",
    LEFT + 58,
    103,
    6
  );
}

const DISABILITY_COLUMNS = [
  { x: 46, items: [["Visual Impairment", 0], ["a. blind", 1], ["b. low vision", 1], ["Multiple Disorder", 0]] },
  { x: 170, items: [["Hearing Impairment", 0], ["Autism Spectrum Disorder", 0], ["Speech/Language Disorder", 0]] },
  { x: 300, items: [["Learning Disability", 0], ["Emotional-Behavioral Disorder", 0], ["Cerebral Palsy", 0]] },
  {
    x: 430,
    items: [
      ["Intellectual Disability", 0],
      ["Orthopedic/Physical Handicap", 0],
      ["Special Health Problem/Chronic Disease", 0],
      ["a. Cancer", 1],
    ],
  },
];

function drawLearnerInfo(ctx, d) {
  drawCentered(ctx, "LEARNER INFORMATION", 0, PAGE_WIDTH, 118, 8);

  // r1
  drawField(ctx, { x: LEFT, top: 132, width: 300, label: "PSA Birth Certificate No. (if available upon registration)", value: d.psaBirthCertNo });
  drawField(ctx, { x: 346, top: 132, width: 228, label: "Learner Reference No. (LRN)", value: d.lrn });

  // r2
  drawField(ctx, { x: LEFT, top: 164, width: 250, label: "Last Name", value: d.lastName });
  drawField(ctx, { x: 296, top: 164, width: 104, label: "Birthdate (mm/dd/yyyy)", value: formatBirthDate(d.birthDate) });
  drawBox(ctx, 408, 164, 96, FIELD_H);
  drawText(ctx, "Sex", 411, 167, 6, true);
  drawCheckbox(ctx, 413, 178, "Male", upper(d.sex) === "MALE");
  drawCheckbox(ctx, 448, 178, "Female", upper(d.sex) === "FEMALE");
  drawField(ctx, { x: 512, top: 164, width: 62, label: "Age", value: d.age ?? computeAge(d.birthDate) });

  // r3, r4
  drawField(ctx, { x: LEFT, top: 196, width: 250, label: "First Name", value: d.firstName });
  drawField(ctx, { x: 296, top: 196, width: 278, label: "Place of Birth (Municipality/City)", value: d.placeOfBirth });
  drawField(ctx, { x: LEFT, top: 228, width: 250, label: "Middle Name", value: d.middleName });
  drawField(ctx, { x: 296, top: 228, width: 278, label: "Mother Tongue", value: d.motherTongue });

  // r5: extension name + IP community
  drawField(ctx, { x: LEFT, top: 260, width: 120, label: "Extension Name e.g. Jr., III (if applicable)", value: d.extensionName });
  drawBox(ctx, 166, 260, 408, FIELD_H);
  drawText(ctx, "Belonging to any Indigenous Peoples (IP) Community/Indigenous Cultural Community", 170, 263, 6, true);
  drawYesNo(ctx, 172, 275, d.ipCommunity);
  drawText(ctx, "If Yes, please specify:", 250, 275, 6.5, true);
  if (d.ipSpecify) {
    const t = upper(d.ipSpecify);
    drawText(ctx, t, 330, 274, fitSize(ctx.font, t, 240, 8), false);
  }

  // r6: 4Ps
  drawBox(ctx, LEFT, 292, 250, FIELD_H);
  drawText(ctx, "Is your family a beneficiary of 4Ps?", 42, 295, 6.5, true);
  drawYesNo(ctx, 44, 307, d.fourPs);
  drawField(ctx, { x: 296, top: 292, width: 278, label: "If Yes, write the 4Ps Household ID Number below", value: d.fourPsId });

  // r7: disability block
  const dTop = 324;
  drawBox(ctx, LEFT, dTop, 536, 70);
  drawText(ctx, "Is the child a Learner with Disability?", 46, dTop + 4, 7.5, true);
  drawYesNo(ctx, 196, dTop + 3, d.hasDisability);
  drawText(ctx, "If Yes, specify the type of disability:", 46, dTop + 17, 6.5, true);

  const selected = (d.disabilities || []).map(normKey);
  DISABILITY_COLUMNS.forEach((col) => {
    col.items.forEach(([label, indent], i) => {
      drawCheckbox(
        ctx,
        col.x + indent * 10,
        dTop + 28 + i * 10,
        label,
        selected.includes(normKey(label)),
        6.5
      );
    });
  });

  return dTop + 70; // 394
}

function drawAddressBlock(ctx, top, a = {}, labels = {}) {
  drawField(ctx, { x: LEFT, top, width: 110, label: labels.house || "House No.", value: a.houseNo });
  drawField(ctx, { x: 156, top, width: 230, label: "Sitio/Street Name", value: a.street });
  drawField(ctx, { x: 394, top, width: 180, label: "Barangay", value: a.barangay });
  const t2 = top + 32;
  drawField(ctx, { x: LEFT, top: t2, width: 180, label: "Municipality/City", value: a.city });
  drawField(ctx, { x: 226, top: t2, width: 160, label: "Province", value: a.province });
  drawField(ctx, { x: 394, top: t2, width: 110, label: "Country", value: a.country });
  drawField(ctx, { x: 512, top: t2, width: 62, label: "Zip Code", value: a.zip });
  return t2 + FIELD_H;
}

function drawAddresses(ctx, d, top) {
  drawText(ctx, "Current Address", LEFT, top + 6, 8, true);
  let end = drawAddressBlock(ctx, top + 16, d.currentAddress);

  const permTop = end + 6;
  drawText(ctx, "Permanent Address", LEFT, permTop + 6, 8, true);
  drawText(ctx, "Same with your Current Address?", 150, permTop + 7, 7, true);
  drawYesNo(ctx, 290, permTop + 6, d.permanentSameAsCurrent);

  const perm = d.permanentSameAsCurrent === true ? d.currentAddress : d.permanentAddress;
  end = drawAddressBlock(ctx, permTop + 16, perm, { house: "House No./Street" });
  return end;
}

function drawGuardianRow(ctx, top, title, p = {}) {
  drawText(ctx, title, LEFT, top, 7, true);
  const t = top + 9;
  drawField(ctx, { x: LEFT, top: t, width: 150, label: "Last Name", value: p.lastName });
  drawField(ctx, { x: 196, top: t, width: 150, label: "First Name", value: p.firstName });
  drawField(ctx, { x: 354, top: t, width: 120, label: "Middle Name", value: p.middleName });
  drawField(ctx, { x: 482, top: t, width: 92, label: "Contact Number", value: p.contact, size: 9 });
  return t + FIELD_H;
}

function drawGuardians(ctx, d, top) {
  drawCentered(ctx, "PARENT'S/GUARDIAN'S INFORMATION", 0, PAGE_WIDTH, top + 8, 8);
  let y = top + 22;
  y = drawGuardianRow(ctx, y, "Father's Name", d.father);
  y = drawGuardianRow(ctx, y + 6, "Mother's Maiden Name", d.mother);
  y = drawGuardianRow(ctx, y + 6, "Legal Guardian's Name", d.guardian);
  return y;
}

// ---------- data: DB rows -> form data ----------

const studentStmt = schoolDb.prepare(`
    SELECT
        students.id,
        students.lrn,
        students.last_name,
        students.first_name,
        students.middle_name,
        students.extension_name,
        students.gender,
        students.grade_level,
        students.school_year,
        students.returnee,
        students.birth_date,
        students.birth_place,
        students.mother_tongue,
        students.ip_community,
        students.four_ps,
        students.four_ps_household_id,
        students.has_disability,

        addresses.house_no,
        addresses.street,
        addresses.barangay,
        addresses.city,
        addresses.province,
        addresses.country,
        addresses.zipcode

    FROM students
    LEFT JOIN addresses
        ON students.id = addresses.student_id
        AND LOWER(addresses.address_type) = 'current'

    WHERE students.id = ?
      AND students.adviser_id = ?
`);

const permanentAddressStmt = schoolDb.prepare(`
    SELECT house_no, street, barangay, city, province, country, zipcode
    FROM addresses
    WHERE student_id = ?
      AND LOWER(address_type) = 'permanent'
`);

const guardiansStmt = schoolDb.prepare(`
    SELECT relationship, last_name, first_name, middle_name, contact_number
    FROM guardians
    WHERE student_id = ?
    ORDER BY id ASC
`);

const disabilitiesStmt = schoolDb.prepare(`
    SELECT disability_type
    FROM student_disabilities
    WHERE student_id = ?
`);

// 1/"1"/"yes"/"true" -> true, 0/"0"/"no"/"false" -> false, empty -> null (both boxes blank)
function toBool(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().toLowerCase();
  if (["1", "yes", "true", "y"].includes(s)) return true;
  if (["0", "no", "false", "n"].includes(s)) return false;
  return null;
}

// "G8" / "8" / "Grade 10" -> "08" / "08" / "10"
function formatGradeLevel(v) {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(2, "0") : "";
}

function mapAddress(a) {
  if (!a) return {};
  return {
    houseNo: a.house_no,
    street: a.street,
    barangay: a.barangay,
    city: a.city,
    province: a.province,
    country: a.country,
    zip: a.zipcode,
  };
}

function sameAddress(a, b) {
  const keys = ["houseNo", "street", "barangay", "city", "province", "country", "zip"];
  const norm = (v) => String(v ?? "").trim().toUpperCase();
  return keys.every((k) => norm(a[k]) === norm(b[k]));
}

function mapGuardian(g) {
  if (!g) return {};
  return {
    lastName: g.last_name,
    firstName: g.first_name,
    middleName: g.middle_name,
    contact: g.contact_number,
  };
}

// Finds the first guardian row whose relationship text contains the keyword
// ("father", "mother", "guardian"), case-insensitive.
function pickGuardian(guardians, keyword) {
  return guardians.find((g) => String(g.relationship || "").toLowerCase().includes(keyword));
}

// Pure function: DB rows in, the object the drawing code expects out.
// This is the only place DB column names get translated into form field names.
function buildFormData(row, permanentRow, guardians = [], disabilityRows = []) {
  const current = mapAddress({
    house_no: row.house_no,
    street: row.street,
    barangay: row.barangay,
    city: row.city,
    province: row.province,
    country: row.country,
    zipcode: row.zipcode,
  });
  const permanent = mapAddress(permanentRow);

  return {
    schoolYear: row.school_year,
    gradeLevel: formatGradeLevel(row.grade_level),
    withLRN: Boolean(row.lrn),
    returning: toBool(row.returnee),
    lrn: row.lrn,
    psaBirthCertNo: "", // no column in the schema
    lastName: row.last_name,
    firstName: row.first_name,
    middleName: row.middle_name,
    extensionName: row.extension_name,
    birthDate: row.birth_date,
    sex: row.gender,
    placeOfBirth: row.birth_place,
    motherTongue: row.mother_tongue,
    ipCommunity: toBool(row.ip_community),
    fourPs: toBool(row.four_ps),
    fourPsId: row.four_ps_household_id,
    hasDisability: toBool(row.has_disability) ?? (disabilityRows.length ? true : null),
    disabilities: disabilityRows.map((r) => r.disability_type),
    currentAddress: current,
    permanentSameAsCurrent: permanentRow ? sameAddress(current, permanent) : null,
    permanentAddress: permanent,
    father: mapGuardian(pickGuardian(guardians, "father")),
    mother: mapGuardian(pickGuardian(guardians, "mother")),
    guardian: mapGuardian(pickGuardian(guardians, "guardian")),
  };
}

// Looks up ONE student that belongs to this adviser. Throws an error with .status = 404 if not found.
async function generateRegistrationForm(studentId, adviserId) {
  const row = studentStmt.get(studentId, adviserId);
  if (!row) {
    const err = new Error("Student not found");
    err.status = 404;
    throw err;
  }
  const permanentRow = permanentAddressStmt.get(row.id);
  const guardians = guardiansStmt.all(row.id);
  const disabilityRows = disabilitiesStmt.all(row.id);
  return renderRegistrationForm(buildFormData(row, permanentRow, guardians, disabilityRows));
}

// ---------- main ----------

async function renderRegistrationForm(data = {}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const ctx = {
    page,
    font: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  drawHeader(ctx, data);
  let top = drawLearnerInfo(ctx, data);
  top = drawAddresses(ctx, data, top);
  top = drawGuardians(ctx, data, top + 6);

  // one big outer border around everything below the instructions
  const outerTop = 114;
  const h = top + 6 - outerTop;
  page.drawRectangle({
    x: 30,
    y: yOf(outerTop, h),
    width: 552,
    height: h,
    borderWidth: 1,
    borderColor: BLACK,
  });

  return Buffer.from(await pdf.save());
}

module.exports = { generateRegistrationForm, renderRegistrationForm, buildFormData };

// Run directly (node registration.js) to write a sample PDF.
if (require.main === module) {
  const fs = require("fs");
  renderRegistrationForm({
    schoolYear: "2026-2027",
    gradeLevel: "08",
    withLRN: true,
    returning: false,
    lrn: "108188180016",
    lastName: "Corrales",
    firstName: "Princess Arika",
    middleName: "Corrales",
    extensionName: "",
    birthDate: "2013-04-20",
    sex: "Female",
    placeOfBirth: "Alaminos, Laguna",
    motherTongue: "Filipino",
    ipCommunity: false,
    fourPs: false,
    hasDisability: false,
    disabilities: [],
    currentAddress: {
      houseNo: "123",
      street: "St. Joseph Home, Marcelino",
      barangay: "Brgy. Uno",
      city: "Alaminos",
      province: "Laguna",
      country: "Philippines",
      zip: "4001",
    },
    permanentSameAsCurrent: true,
    father: { lastName: "Ilagan", firstName: "Edison", middleName: "De Lion", contact: "09511247064" },
    mother: { lastName: "Corrales", firstName: "Mila", middleName: "Artiaga", contact: "09511247064" },
    guardian: { lastName: "Ilagan", firstName: "Edison", middleName: "De Lion", contact: "09511247064" },
  }).then((buf) => {
    fs.writeFileSync("registration-test.pdf", buf);
    console.log("wrote registration-test.pdf");
  });
}