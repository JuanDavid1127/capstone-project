require("dotenv").config();

const API = "http://localhost:3000/advisers";
const GRADES = ["G7", "G8", "G9", "G10", "G11", "G12"];
const SECTIONS = ["Rizal", "Bonifacio", "Mabini"];
const PASSWORD = "password123";

const firstNames = ["Maria", "Jose", "Ana", "Pedro", "Liza", "Carlo", "Grace", "Ramon", "Joy", "Mark", "Cathy", "Dennis", "Rhea", "Paulo", "Nina", "Arnel", "Joan", "Ben"];
const lastNames = ["Santos", "Reyes", "Cruz", "Bautista", "Garcia", "Mendoza", "Torres", "Flores", "Ramos", "Aquino", "Navarro", "Castillo", "Villanueva", "Dizon", "Pascual", "Salazar", "Domingo", "Lopez"];

async function seed() {
    if (!process.env.ADMIN_SETUP_KEY) {
        console.log("ADMIN_SETUP_KEY is missing from .env. Add it temporarily, restart the server, and run this again.");
        return;
    }

    let created = 0;
    let index = 0;
    const failures = [];

    for (const grade of GRADES) {
        for (let i = 0; i < SECTIONS.length; i++) {
            const adviser = {
                setupKey: process.env.ADMIN_SETUP_KEY,
                username: `seed_${grade.toLowerCase()}_${i + 1}`,
                password: PASSWORD,
                full_name: `${firstNames[index]} ${lastNames[index]}`,
                assigned_level: grade,
                section_name: `${SECTIONS[i]}`,
                is_admin: 0
            };
            index++;

            const res = await fetch(API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(adviser)
            });

            if (res.ok) created++;
            else failures.push(`${adviser.username}: ${res.status} ${(await res.text()).slice(0, 120)}`);
        }
    }

    console.log(`Created ${created} of ${GRADES.length * SECTIONS.length}`);
    failures.forEach(f => console.log(f));
    console.log(`Log in with username like seed_g8_1 and password ${PASSWORD}`);
}

seed();