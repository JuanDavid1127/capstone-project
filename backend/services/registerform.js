const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const schoolDb = require("../database");

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 38;
const FIELD_H = 28; 
const ROW_GAP = 6; 
const CHECKBOX_SIZE = 8;
const OUTER_BORDER_TOP = 114;
const BLACK = rgb(0, 0, 0);

const LEARNER_ROW_START = 132;
const LEARNER_ROW_STEP = 32;
const learnerRowTop = (row) => LEARNER_ROW_START + row * LEARNER_ROW_STEP;

const DISABILITY_BLOCK_H = 70;
const DISABILITY_INDENT = 10;
const DISABILITY_LINE_H = 10;

const pdfY = (top, height = 0) => PAGE_HEIGHT - top - height;

const toUpper = (v) => (v == null ? "" : String(v).toUpperCase());

const normKey = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/^[a-z]\.\s*/, "")
    .replace(/[^a-z0-9]/g, "");

function fitFontSize(font, text, maxWidth, size, min = 6) {
  while (size > min && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  return size;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function formatBirthDate(v) {
  if (!v) return "";
  const m = ISO_DATE.exec(v);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : String(v);
}

function computeAge(v) {
  const m = ISO_DATE.exec(v || "");
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

function drawText(ctx, text, x, top, size = 7, isBold = false) {
  ctx.page.drawText(text, {
    x,
    y: pdfY(top) - size,
    size,
    font: isBold ? ctx.bold : ctx.font,
    color: BLACK,
  });
}

function drawCentered(ctx, text, left, width, top, size, isBold = true) {
  const font = isBold ? ctx.bold : ctx.font;
  const textWidth = font.widthOfTextAtSize(text, size);
  drawText(ctx, text, left + (width - textWidth) / 2, top, size, isBold);
}

function drawBox(ctx, x, top, width, height) {
  ctx.page.drawRectangle({
    x,
    y: pdfY(top, height),
    width,
    height,
    borderWidth: 0.75,
    borderColor: BLACK,
  });
}

function drawField(ctx, { x, top, width, height = FIELD_H, label, value, size = 10 }) {
  drawBox(ctx, x, top, width, height);
  drawText(ctx, label, x + 3, top + 3, 6, true);

  const text = toUpper(value);
  if (!text) return;

  ctx.page.drawText(text, {
    x: x + 5,
    y: pdfY(top, height) + 5,
    size: fitFontSize(ctx.font, text, width - 10, size),
    font: ctx.font,
    color: BLACK,
  });
}

function drawCheckbox(ctx, x, top, label, checked = false, labelSize = 7) {
  const box = CHECKBOX_SIZE;
  drawBox(ctx, x, top, box, box);

  if (checked) {
    ctx.page.drawRectangle({
      x: x + 1.75,
      y: pdfY(top, box) + 1.75,
      width: box - 3.5,
      height: box - 3.5,
      color: BLACK,
    });
  }

  ctx.page.drawText(label, {
    x: x + box + 3,
    y: pdfY(top, box) + 1.5,
    size: labelSize,
    font: ctx.font,
    color: BLACK,
  });

  return x + box + 3 + ctx.font.widthOfTextAtSize(label, labelSize);
}

function drawYesNo(ctx, x, top, value) {
  const afterYes = drawCheckbox(ctx, x, top, "Yes", value === true);
  drawCheckbox(ctx, afterYes + 8, top, "No", value === false);
}

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

const item = (label) => ({ label, indent: 0 });
const subItem = (label) => ({ label, indent: 1 });

// Four columns of disability checkboxes; `x` is the column's left edge.
const DISABILITY_COLUMNS = [
  {
    x: 46,
    items: [item("Visual Impairment"), subItem("a. blind"), subItem("b. low vision"), item("Multiple Disorder")],
  },
  {
    x: 170,
    items: [item("Hearing Impairment"), item("Autism Spectrum Disorder"), item("Speech/Language Disorder")],
  },
  {
    x: 300,
    items: [item("Learning Disability"), item("Emotional-Behavioral Disorder"), item("Cerebral Palsy")],
  },
  {
    x: 430,
    items: [
      item("Intellectual Disability"),
      item("Orthopedic/Physical Handicap"),
      item("Special Health Problem/Chronic Disease"),
      subItem("a. Cancer"),
    ],
  },
];

function drawNameBirthSexRow(ctx, d, top) {
  drawField(ctx, { x: LEFT, top, width: 250, label: "Last Name", value: d.lastName });
  drawField(ctx, { x: 296, top, width: 104, label: "Birthdate (mm/dd/yyyy)", value: formatBirthDate(d.birthDate) });

  drawBox(ctx, 408, top, 96, FIELD_H);
  drawText(ctx, "Sex", 411, top + 3, 6, true);
  drawCheckbox(ctx, 413, top + 14, "Male", toUpper(d.sex) === "MALE");
  drawCheckbox(ctx, 448, top + 14, "Female", toUpper(d.sex) === "FEMALE");

  drawField(ctx, { x: 512, top, width: 62, label: "Age", value: d.age ?? computeAge(d.birthDate) });
}

function drawExtensionAndIpRow(ctx, d, top) {
  drawField(ctx, { x: LEFT, top, width: 120, label: "Extension Name e.g. Jr., III (if applicable)", value: d.extensionName });

  drawBox(ctx, 166, top, 408, FIELD_H);
  drawText(ctx, "Belonging to any Indigenous Peoples (IP) Community/Indigenous Cultural Community", 170, top + 3, 6, true);
  drawYesNo(ctx, 172, top + 15, d.ipCommunity);
  drawText(ctx, "If Yes, please specify:", 250, top + 15, 6.5, true);

  if (d.ipSpecify) {
    const text = toUpper(d.ipSpecify);
    drawText(ctx, text, 330, top + 14, fitFontSize(ctx.font, text, 240, 8), false);
  }
}

function drawFourPsRow(ctx, d, top) {
  drawBox(ctx, LEFT, top, 250, FIELD_H);
  drawText(ctx, "Is your family a beneficiary of 4Ps?", 42, top + 3, 6.5, true);
  drawYesNo(ctx, 44, top + 15, d.fourPs);

  drawField(ctx, { x: 296, top, width: 278, label: "If Yes, write the 4Ps Household ID Number below", value: d.fourPsId });
}

function drawDisabilityBlock(ctx, d, top) {
  drawBox(ctx, LEFT, top, 536, DISABILITY_BLOCK_H);
  drawText(ctx, "Is the child a Learner with Disability?", 46, top + 4, 7.5, true);
  drawYesNo(ctx, 196, top + 3, d.hasDisability);
  drawText(ctx, "If Yes, specify the type of disability:", 46, top + 17, 6.5, true);

  const selected = (d.disabilities || []).map(normKey);

  DISABILITY_COLUMNS.forEach(({ x, items }) => {
    items.forEach(({ label, indent }, line) => {
      drawCheckbox(
        ctx,
        x + indent * DISABILITY_INDENT,
        top + 28 + line * DISABILITY_LINE_H,
        label,
        selected.includes(normKey(label)),
        6.5
      );
    });
  });
}

function drawLearnerInfo(ctx, d) {
  drawCentered(ctx, "LEARNER INFORMATION", 0, PAGE_WIDTH, 118, 8);

  drawField(ctx, {
    x: LEFT,
    top: learnerRowTop(0),
    width: 300,
    label: "PSA Birth Certificate No. (if available upon registration)",
    value: d.psaBirthCertNo,
  });
  drawField(ctx, { x: 346, top: learnerRowTop(0), width: 228, label: "Learner Reference No. (LRN)", value: d.lrn });

  drawNameBirthSexRow(ctx, d, learnerRowTop(1));

  drawField(ctx, { x: LEFT, top: learnerRowTop(2), width: 250, label: "First Name", value: d.firstName });
  drawField(ctx, { x: 296, top: learnerRowTop(2), width: 278, label: "Place of Birth (Municipality/City)", value: d.placeOfBirth });

  drawField(ctx, { x: LEFT, top: learnerRowTop(3), width: 250, label: "Middle Name", value: d.middleName });
  drawField(ctx, { x: 296, top: learnerRowTop(3), width: 278, label: "Mother Tongue", value: d.motherTongue });

  drawExtensionAndIpRow(ctx, d, learnerRowTop(4));
  drawFourPsRow(ctx, d, learnerRowTop(5));
  drawDisabilityBlock(ctx, d, learnerRowTop(6));

  return learnerRowTop(6) + DISABILITY_BLOCK_H;
}

function drawAddressBlock(ctx, top, a = {}, labels = {}) {
  drawField(ctx, { x: LEFT, top, width: 110, label: labels.house || "House No.", value: a.houseNo });
  drawField(ctx, { x: 156, top, width: 230, label: "Sitio/Street Name", value: a.street });
  drawField(ctx, { x: 394, top, width: 180, label: "Barangay", value: a.barangay });

  const secondRow = top + 32;
  drawField(ctx, { x: LEFT, top: secondRow, width: 180, label: "Municipality/City", value: a.city });
  drawField(ctx, { x: 226, top: secondRow, width: 160, label: "Province", value: a.province });
  drawField(ctx, { x: 394, top: secondRow, width: 110, label: "Country", value: a.country });
  drawField(ctx, { x: 512, top: secondRow, width: 62, label: "Zip Code", value: a.zip });

  return secondRow + FIELD_H;
}

function drawAddresses(ctx, d, top) {
  drawText(ctx, "Current Address", LEFT, top + 6, 8, true);
  const currentEnd = drawAddressBlock(ctx, top + 16, d.currentAddress);

  const permanentTop = currentEnd + ROW_GAP;
  drawText(ctx, "Permanent Address", LEFT, permanentTop + 6, 8, true);
  drawText(ctx, "Same with your Current Address?", 150, permanentTop + 7, 7, true);
  drawYesNo(ctx, 290, permanentTop + 6, d.permanentSameAsCurrent);

  const permanent = d.permanentSameAsCurrent === true ? d.currentAddress : d.permanentAddress;
  return drawAddressBlock(ctx, permanentTop + 16, permanent, { house: "House No./Street" });
}

function drawGuardianRow(ctx, top, title, person = {}) {
  drawText(ctx, title, LEFT, top, 7, true);

  const rowTop = top + 9;
  drawField(ctx, { x: LEFT, top: rowTop, width: 150, label: "Last Name", value: person.lastName });
  drawField(ctx, { x: 196, top: rowTop, width: 150, label: "First Name", value: person.firstName });
  drawField(ctx, { x: 354, top: rowTop, width: 120, label: "Middle Name", value: person.middleName });
  drawField(ctx, { x: 482, top: rowTop, width: 92, label: "Contact Number", value: person.contact, size: 9 });

  return rowTop + FIELD_H;
}

function drawGuardians(ctx, d, top) {
  drawCentered(ctx, "PARENT'S/GUARDIAN'S INFORMATION", 0, PAGE_WIDTH, top + 8, 8);

  let y = top + 22;
  y = drawGuardianRow(ctx, y, "Father's Name", d.father);
  y = drawGuardianRow(ctx, y + ROW_GAP, "Mother's Maiden Name", d.mother);
  y = drawGuardianRow(ctx, y + ROW_GAP, "Legal Guardian's Name", d.guardian);
  return y;
}

function drawOuterBorder(ctx, bottom) {
  const height = bottom - OUTER_BORDER_TOP;
  ctx.page.drawRectangle({
    x: 30,
    y: pdfY(OUTER_BORDER_TOP, height),
    width: 552,
    height,
    borderWidth: 1,
    borderColor: BLACK,
  });
}

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
  top = drawGuardians(ctx, data, top + ROW_GAP);
  drawOuterBorder(ctx, top + ROW_GAP);

  return Buffer.from(await pdf.save());
}

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


function toBool(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().toLowerCase();
  if (["1", "yes", "true", "y"].includes(s)) return true;
  if (["0", "no", "false", "n"].includes(s)) return false;
  return null;
}

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

const ADDRESS_KEYS = ["houseNo", "street", "barangay", "city", "province", "country", "zip"];

function sameAddress(a, b) {
  const norm = (v) => String(v ?? "").trim().toUpperCase();
  return ADDRESS_KEYS.every((key) => norm(a[key]) === norm(b[key]));
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

function pickGuardian(guardians, keyword) {
  return guardians.find((g) => String(g.relationship || "").toLowerCase().includes(keyword));
}


function buildFormData(row, permanentRow, guardians = [], disabilityRows = []) {
  const current = mapAddress(row); 
  const permanent = mapAddress(permanentRow);

  return {
    schoolYear: row.school_year,
    gradeLevel: formatGradeLevel(row.grade_level),
    withLRN: Boolean(row.lrn),
    returning: toBool(row.returnee),
    lrn: row.lrn,
    psaBirthCertNo: "", 
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

module.exports = { generateRegistrationForm, renderRegistrationForm, buildFormData };