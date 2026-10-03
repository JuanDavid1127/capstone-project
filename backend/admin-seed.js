require("dotenv").config();

const API = "http://localhost:3000/advisers";
const USERNAME = "admin";
const PASSWORD = "admin12345";

async function seed() {
    if (!process.env.ADMIN_SETUP_KEY) {
        console.log("ADMIN_SETUP_KEY is missing from .env. Add it temporarily, restart the server, and run this again.");
        return;
    }

    const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            setupKey: process.env.ADMIN_SETUP_KEY,
            username: USERNAME,
            password: PASSWORD,
            full_name: "System Administrator",
            assigned_level: "G7",   // required by the table, but ignored for admins
            section_name: null,
            is_admin: 1
        })
    });

    if (res.ok) {
        console.log(`Admin created. Log in with username "${USERNAME}" and password "${PASSWORD}".`);
    } else {
        console.log(`Failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
}

seed();