const API = "http://localhost:3000/students";
const COUNT = 800;
const GRADES = ["G7", "G8", "G9", "G10", "G11", "G12"];
const GRADE = process.argv[2]; // optional: node seed.js G8 puts all of them in G8

const lastNames = ["Santos", "Reyes", "Cruz", "Bautista", "Garcia", "Mendoza", "Torres", "Flores", "Ramos", "Aquino"];
const maleNames = ["Juan", "Miguel", "Carlo", "Paolo", "Ramon"];
const femaleNames = ["Maria", "Angela", "Sofia", "Kristine", "Bea"];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

async function seed() {
    let created = 0;
    const failures = [];

    for (let i = 1; i <= COUNT; i++) {
        const sex = Math.random() < 0.5 ? "male" : "female";
        const student = {
            lrn: `9990${String(i).padStart(8, "0")}`,   // 12 digits, all start with 9999 so they are easy to delete
            last_name: pick(lastNames),
            first_name: pick(sex === "male" ? maleNames : femaleNames),
            middle_name: "Test",
            extension_name: "",
            sex,
            grade_level: GRADE || pick(GRADES),
            gwa: (75 + Math.random() * 24).toFixed(2),
            school_year: "2026-2027",
            returnee: "no",
            birth_place: "Obando",
            birth_date: "2012-05-01",
            mother_tongue: "Tagalog",
            ipCommunity: "no",
            fourPs: "no",
            householdId: "",
            learnerDisability: "no",
            others: "",
            sameAddress: "yes",
            currHouseNo: "1", currStreet: "Test St", currBarangay: "Test",
            currCity: "Obando", currProvince: "Bulacan", currCountry: "Philippines", currZipcode: "3021",
            fatherLastName: "Test", fatherFirstName: "Father", fatherMiddleName: "", fatherContactNo: "09123456789",
            motherLastName: "Test", motherFirstName: "Mother", motherMiddleName: "", motherContactNo: "09123456789",
            guardianLastName: "", guardianFirstName: "", guardianMiddleName: "", guardianContactNo: ""
        };

        const res = await fetch(API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(student)
        });

        if (res.ok) created++;
        else failures.push(`${student.lrn}: ${res.status} ${await res.text()}`);
    }

    console.log(`Created ${created} of ${COUNT}`);
    failures.slice(0, 5).forEach(f => console.log(f));
}

seed();