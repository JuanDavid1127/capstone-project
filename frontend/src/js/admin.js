const API = "http://localhost:3000";
const LOGIN_PAGE = "./login.html"; // change to your login page path
const GRADES = ["G7", "G8", "G9", "G10", "G11", "G12"];

const token = localStorage.getItem("token");
if (!token) {
    window.location.href = LOGIN_PAGE;
}

const payload = JSON.parse(atob(token.split(".")[1]));
if (!payload.is_admin) {
    window.location.href = "dashboard.html";
}

const adminName = document.querySelector("#adminName");
const tabs = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");
const adviserTable = document.querySelector("#adviserTable");
const adviserSearch = document.querySelector("#adviserSearch");
const adviserCount = document.querySelector("#adviserCount");
const activityTable = document.querySelector("#activityTable");
const logSearch = document.querySelector("#logSearch");
const logFilter = document.querySelector("#logFilter");
const recentActivity = document.querySelector("#recentActivity");
const gradeCoverage = document.querySelector("#gradeCoverage");

let advisers = [];
let logRows = [];

adminName.textContent = payload.full_name || "Administrator";

function handleResponse(response) {
    if (response.status === 401) {
        localStorage.clear();
        window.location.href = LOGIN_PAGE;
        throw new Error("Session expired");
    }
    return response.text().then(text => {
        let body;
        try {
            body = JSON.parse(text);
        } catch {
            body = { error: text };
        }
        if (!response.ok) {
            const error = new Error(body.error || "Request Failed");
            error.status = response.status;
            throw error;
        }
        return body;
    });
}

function request(path, options = {}) {
    return fetch(`${API}${path}`, {
        ...options,
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        }
    }).then(handleResponse);
}

function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) {
        element.textContent = value;
    }
}

function makeCell(text) {
    const td = document.createElement("td");
    td.textContent = text ?? "";
    return td;
}

function manilaTime(sqliteUtc) {
    return new Date(sqliteUtc.replace(" ", "T") + "Z")
        .toLocaleString("en-PH", { timeZone: "Asia/Manila" });
}

function describeDetails(row) {
    return Object.entries(row.details || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");
}

function actionCategory(action) {
    if (action.startsWith("login")) return "login";
    if (action.startsWith("student") || action === "auto_assign") return "student";
    if (action.startsWith("adviser") || action === "grade_changed" || action === "section_updated") return "adviser";
    return "system";
}

/* ---------- Tabs ---------- */

function showTab(name) {
    tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.tab === name));
    tabContents.forEach(section => section.classList.toggle("active", section.id === name));

    if (name === "overview") loadOverview();
    if (name === "advisers") loadAdvisers();
    if (name === "log") loadLog();
}

tabs.forEach(tab => {
    tab.addEventListener("click", () => showTab(tab.dataset.tab));
});

document.querySelector("#inviteButton").addEventListener("click", () => showTab("invite"));

document.querySelector("#logout").addEventListener("click", () => {
    localStorage.clear();
    window.location.href = LOGIN_PAGE;
});

/* ---------- Overview ---------- */

function loadOverview() {
    request("/admin/overview")
    .then(data => {
        setText("#totalAdvisers", data.advisers.total);
        setText("#activeAdvisers", data.advisers.active);
        setText("#pendingAdvisers", data.advisers.pending);
        setText("#totalStudents", data.students.total);

        renderGradeCoverage(data);
    })
    .catch(error => showToast(error.message, "error"));

    request("/admin/log?limit=8")
    .then(rows => {
        recentActivity.replaceChildren();

        if (rows.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty";
            empty.textContent = "No recent activity.";
            recentActivity.appendChild(empty);
            return;
        }

        rows.forEach(row => {
            const line = document.createElement("p");
            line.textContent = `${manilaTime(row.created_at)}: ${row.actor_name || "Unknown"} - ${row.action}`;
            recentActivity.appendChild(line);
        });
    })
    .catch(error => showToast(error.message, "error"));
}

function renderGradeCoverage(data) {
    if (!gradeCoverage) return;

    const adviserCounts = {};
    data.advisersByGrade.forEach(row => adviserCounts[row.grade_level] = row.total);

    const studentCounts = {};
    data.studentsByGrade.forEach(row => studentCounts[row.grade_level] = row);

    gradeCoverage.replaceChildren();

    GRADES.forEach(grade => {
        const students = studentCounts[grade] || { total: 0, unassigned: 0 };
        const adviserTotal = adviserCounts[grade] || 0;

        const tr = document.createElement("tr");
        tr.append(
            makeCell(grade),
            makeCell(students.total),
            makeCell(students.unassigned),
            makeCell(adviserTotal)
        );

        if (students.total > 0 && adviserTotal === 0) {
            tr.style.color = "crimson";
            tr.title = "Students registered but no adviser for this grade";
        }

        gradeCoverage.appendChild(tr);
    });
}

/* ---------- Advisers ---------- */

function loadAdvisers() {
    request("/admin/advisers")
    .then(data => {
        advisers = data;
        renderAdvisers();
    })
    .catch(error => showToast(error.message, "error"));
}

function renderAdvisers() {
    const search = adviserSearch.value.trim().toLowerCase();
    const list = advisers.filter(adviser =>
        `${adviser.full_name} ${adviser.username}`.toLowerCase().includes(search)
    );

    adviserCount.textContent = list.length;
    adviserTable.replaceChildren();

    list.forEach(adviser => {
        const select = document.createElement("select");

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select grade";
        select.appendChild(placeholder);

        GRADES.forEach(grade => {
            const option = document.createElement("option");
            option.value = grade;
            option.textContent = grade;
            select.appendChild(option);
        });
        select.value = GRADES.includes(adviser.assigned_level) ? adviser.assigned_level : "";

        const button = document.createElement("button");
        button.type = "button";
        button.textContent = adviser.status === "pending" ? "Approve" : "Save";
        button.addEventListener("click", () => saveAdviser(adviser, select.value));

        const gradeCell = document.createElement("td");
        gradeCell.appendChild(select);
        const actionCell = document.createElement("td");
        actionCell.appendChild(button);

        const tr = document.createElement("tr");
        tr.append(
            makeCell(adviser.full_name),
            makeCell(adviser.username),
            gradeCell,
            makeCell(adviser.section_name || "-"),
            makeCell(adviser.student_count),
            makeCell(adviser.status),
            actionCell
        );
        adviserTable.appendChild(tr);
    });
}

function sendAdviserUpdate(adviser, grade, release) {
    return request(`/admin/advisers/${adviser.id}`, {
        method: "PATCH",
        body: JSON.stringify({ assigned_level: grade, release_students: release })
    });
}

function saveAdviser(adviser, grade) {
    if (!grade) {
        showToast("Choose a grade level first.", "error");
        return;
    }

    sendAdviserUpdate(adviser, grade, false)
    .catch(error => {
        if (error.status !== 409) throw error;

        const confirmed = confirm(`${error.message}\n\nReturn their students to the pool and continue?`);
        if (!confirmed) return null;
        return sendAdviserUpdate(adviser, grade, true);
    })
    .then(result => {
        if (result === null) return;
        showToast("Adviser updated", "success");
        loadAdvisers();
    })
    .catch(error => showToast(error.message, "error"));
}

adviserSearch.addEventListener("input", renderAdvisers);

/* ---------- Activity log ---------- */

function loadLog() {
    request("/admin/log?limit=200")
    .then(rows => {
        logRows = rows;
        renderLog();
    })
    .catch(error => showToast(error.message, "error"));
}

function renderLog() {
    const search = logSearch.value.trim().toLowerCase();
    const filter = logFilter.value;

    const rows = logRows.filter(row =>
        (filter === "all" || actionCategory(row.action) === filter) &&
        `${row.actor_name} ${row.action} ${describeDetails(row)}`.toLowerCase().includes(search)
    );

    activityTable.replaceChildren();

    rows.forEach(row => {
        const tr = document.createElement("tr");
        tr.append(
            makeCell(manilaTime(row.created_at)),
            makeCell(row.actor_name || "Unknown"),
            makeCell(row.action),
            makeCell(describeDetails(row))
        );
        activityTable.appendChild(tr);
    });
}

logSearch.addEventListener("input", renderLog);
logFilter.addEventListener("change", renderLog);

/* ---------- Invite ---------- */

function makeInvite(regenerate) {
    if (regenerate && !confirm("This cancels every invite link already shared. Continue?")) {
        return;
    }

    request("/admin/invite", {
        method: "POST",
        body: JSON.stringify({ regenerate })
    })
    .then(data => {
        const link = new URL(
            `adviser-signup.html?token=${encodeURIComponent(data.token)}`,
            window.location.href
        ).href;

        document.querySelector("#inviteLink").value = link;
        document.querySelector("#generatedInvite").hidden = false;

        const qr = document.querySelector("#qr");
        qr.replaceChildren();
        if (window.QRCode) {
            new QRCode(qr, { text: link, width: 180, height: 180 });
        }
    })
    .catch(error => showToast(error.message, "error"));
}

document.querySelector("#generateInvite").addEventListener("click", () => makeInvite(false));
document.querySelector("#regenerateInvite").addEventListener("click", () => makeInvite(true));

document.querySelector("#copyInvite").addEventListener("click", () => {
    navigator.clipboard.writeText(document.querySelector("#inviteLink").value)
    .then(() => showToast("Link copied", "success"))
    .catch(() => showToast("Could not copy the link", "error"));
});

loadOverview();