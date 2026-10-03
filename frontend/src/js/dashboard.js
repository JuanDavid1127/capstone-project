const token = localStorage.getItem("token");
const editSectionBtn = document.querySelector("#editSection");
let gradeLevel = localStorage.getItem("grade_level");
let fullName = localStorage.getItem("full_name");
let nameOfSection = localStorage.getItem("section_name");
const available = document.querySelector("#available");
const assigned = document.querySelector("#assigned");
const gradeNumber = document.querySelectorAll(".gradeNumber");
const teacherName = document.querySelector("#teacherName");
const sectionName = document.querySelector("#sectionName");
const countId = document.querySelector("#count");
const logoutBtn = document.querySelector(".logout");
const studentModal = document.querySelector("#studentModal");
const closeModal = document.querySelector("#closeModal");
const masterListBtn = document.querySelector("#save");
const studentProfileBtn = document.querySelector("#exportSF1");
const autoAssignBtn = document.querySelector("#autoAssign");
const searchInput = document.querySelector("#search");
const payload = JSON.parse(atob(token.split(".")[1]));
if (!token) {
    window.location.href = "../pages/login.html";
}

if (payload.is_admin) {
    window.location.href = "admin.html";
}



showProfile({
    grade_level: gradeLevel || "",
    full_name: fullName || "",
    section_name: nameOfSection
});
loadProfile();

checkAuth(token);
loadStudents(token);
loadAssignedStudents(token);

window.addEventListener("pageshow", (event) => {
        if(event.persisted) {
            checkAuth(token);
    }
})

masterListBtn.addEventListener("click", () => {
    const token = localStorage.getItem("token");
    downloadMasterList(token);
})

studentProfileBtn.addEventListener("click", () => {
    const token = localStorage.getItem("token");
    downloadStudentProfile(token);
})

autoAssignBtn.addEventListener("click", async () => {
    const confirmed = confirm(
        "This will distribute all unassigned students across all advisers in your grade level"
    )

    if(!confirmed) {
        return;
    } 
    autoAssignBtn.disabled = true;
    try {
        const response = await fetch(
            "http://localhost:3000/students/auto-assign",
            {
                method: "POST",
                headers: {
                    "Authorization" : `Bearer ${token}`
                }
            }
        )

        const data = await response.json();

        if(!response.ok) {
            showToast(
                data.error || "Failed to assign students.",
                "error"
            )
            return;
        }

        if(data.assigned === 0) {
            showToast(
                data.message || "There are no unassigned students.",
                "success"
            )
        } else {
            showToast(
                `${data.assigned} student(s) assigned successfully.`,
                "success"
            )
        }

        await loadStudents(token);
        await loadAssignedStudents(token);
    } catch(error) {
        console.error("Auto-assign error:", error);

        showToast(
            "Failed to assign students. Please try again",
            "error"
        )
    } finally {
        autoAssignBtn.disabled = false;
    }
})



logoutBtn.addEventListener("click", () => {
    localStorage.clear();
    showToast("Logged out Successfully", "success");
    setTimeout(() => {
    window.location.href = "../pages/login.html";
    }, 1200);
})

available.addEventListener("click", (event) => {
    if(event.target.classList.contains("assign")) {
        const button = event.target;
        const studentId = button.dataset.studentId;
        fetch(`http://localhost:3000/students/${studentId}`, {
            method: "PATCH",
            headers: {
                "Authorization" : `Bearer ${token}`,
                "Content-Type" : "application/json"
            },
            body: JSON.stringify({action : "assign"})
        })
        .then(handleResponse)
        .then(data => {
            const row = button.closest("tr");
            const actionCell = button.closest("td");

            button.textContent = "Remove";
            button.classList.remove("assign");
            button.classList.add("remove");

            row.insertBefore(createViewCell(studentId), actionCell);
            row.appendChild(createDownloadCell(studentId));

            assigned.appendChild(row);
            countId.textContent = Number(countId.textContent) + 1;
            syncEmptyState(available, 5, "No unassigned students");
            syncEmptyState(assigned, 7, "No students assigned to your section yet");
        });
    }

    if(event.target.classList.contains("view-profile")) {
        const studentId = event.target.dataset.studentId;

        loadStudentProfile(studentId, token)
    }
})

assigned.addEventListener("click", async (event) => {
    const btn = event.target.closest(".download-form");
    if(!btn) return;

    const studentId = btn.dataset.studentId;

    const res = await fetch(`http://localhost:3000/export/registerform/${studentId}`, {
        headers: {
            "Authorization": `Bearer ${token}`
        }
    })

    if(!res.ok) {
        const err = await res.json();
        showToast(err.error || "Download failed, Try again");
        return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registration-form-${studentId}.pdf`;
    a.click()
    URL.revokeObjectURL(url);
})

assigned.addEventListener("click", (event) => {
    if(event.target.classList.contains("remove")) {
        const button = event.target;
        const studentId = button.dataset.studentId;
        fetch(`http://localhost:3000/students/${studentId}`, {
            method: "PATCH",
            headers: {
                "Authorization" : `Bearer ${token}`,
                "Content-Type" : "application/json"
            },
            body: JSON.stringify({action : "remove"})
        })
        .then(handleResponse)
        .then(data => {
        
            const row = button.closest("tr");

            row.querySelector(".download-form")?.closest("td")?.remove();
            row.querySelector(".view-profile")?.closest("td")?.remove();

            button.textContent = "Assign";
            button.classList.remove("remove");
            button.classList.add("assign");

            available.appendChild(row);
            countId.textContent = Number(countId.textContent) - 1;
            syncEmptyState(available, 5, "No unassigned students");
            syncEmptyState(assigned, 7, "No students assigned to your section yet");
        });
    }

    if(event.target.classList.contains("view-profile")) {
        const studentId = event.target.dataset.studentId;

        loadStudentProfile(studentId, token)
    }
})


function checkAuth(token) {
    if(!token) {
        window.location.href = "../pages/login.html";
    }
}

function handleResponse(response) {
    if(response.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "../pages/login.html";
        return null
    }

    if(!response.ok) {
        throw new Error("Request Failed");
    }

    return response.json();
}

async function downloadStudentProfile(token) {
    try {
        const response = await fetch("http://localhost:3000/export/sf1", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const data = await response.json();
            console.log(data);
            return;
        }

        const blob = await response.blob();

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const contentDisposition = response.headers.get("Content-Disposition");
        let filename = "SF1.xlsx";

        if(contentDisposition) {
            const match = contentDisposition.match(/filename="?([^"]+)"?/);
            if(match) {
                filename = match[1];
            }
        }

        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
    } catch(error) {
        showToast(error.message, "error")
    }
}

async function downloadMasterList(token) {
    try {
        const response = await fetch("http://localhost:3000/export/masterlist", {
            headers: {
                "Authorization" : `Bearer ${token}`
            }
        })
        if(!response.ok) {
            throw new Error("Request Failed");
        }
    const data = await response.blob();
    const contentDisposition = response.headers.get("Content-Disposition");
    let filename = "masterlist.docx";

    if(contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if(match) {
            filename = match[1];
        }
    }
    const url = URL.createObjectURL(data);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;

    link.click();
    
    URL.revokeObjectURL(url);

    } catch (error) {
        showToast(error.message, "error")
    }
} 

function loadStudents(token) {
    available.replaceChildren();
    return fetch(`http://localhost:3000/students?grade_level=${gradeLevel}`, {
        headers: { "Authorization": `Bearer ${token}` }
    })
    .then(handleResponse)
    .then(data => {
        if(!data) return;
        data.forEach(student => {
            const row = document.createElement("tr");
            row.append(
                createNameCell(student),
                createTextCell(student.grade_level),
                createTextCell(student.lrn),
                createTextCell(student.gwa),
                createActionCell("assign", "Assign", student.id)
            );
            available.appendChild(row);
        });
        syncEmptyState(available, 5, "No unassigned students");
        applySort(available);
        applySearch();
    })
    .catch(error => showToast(error.message, "error"));
}

function loadAssignedStudents(token) {
    assigned.replaceChildren();
    return fetch("http://localhost:3000/students/assigned", {
        headers: { "Authorization": `Bearer ${token}` }
    })
    .then(handleResponse)
    .then(data => {
        if(!data) return;
        data.forEach(student => {
            const row = document.createElement("tr");
            row.append(
                createNameCell(student),
                createTextCell(student.grade_level),
                createTextCell(student.lrn),
                createTextCell(student.gwa),
                createViewCell(student.id),
                createDownloadCell(student.id),
                createActionCell("remove", "Remove", student.id)
            );
            assigned.appendChild(row);
        });
        countId.textContent = data.length;
        syncEmptyState(assigned, 7, "No students assigned to your section yet");
        applySort(assigned);
        applySearch();
    })
    .catch(error => showToast(error.message, "error"));
}

function loadStudentProfile(studentId, token) {
    fetch(`http://localhost:3000/students/${studentId}`, {
        headers: {
            "Authorization" : `Bearer ${token}`
        }
    })
    .then(handleResponse)
    .then(data => {
        if(!data) return;
        console.log(data)

        const fields = [
            ["lrn", data.student.lrn],
            ["fullName", `${data.student.last_name}, ${data.student.first_name} ${data.student.middle_name}`],
            ["gender", data.student.gender],
            ["gradeLevel", data.student.grade_level],
            ["schoolYear", data.student.school_year],
            ["returnee", data.student.returnee, true],
            ["birthPlace", data.student.birth_place],
            ["motherTongue", data.student.mother_tongue],
            ["ipCommunity", data.student.ip_community, true],
            ["fourPs", data.student.four_ps, true],
            ["fourPsHouseholdId", data.student.four_ps_household_id],
            ["hasDisability", data.student.has_disability, true],
            ["currHouseNo", data.address.house_no],
            ["currStreet", data.address.street],
            ["currBarangay", data.address.barangay],
            ["currCity", data.address.city],
            ["currProvince", data.address.province],
            ["currCountry", data.address.country],
            ["currZipcode",data.address.zipcode]
        ]
        const disabilityBox = document.querySelector("#disabilities");
        disabilityBox.replaceChildren();
        if (data.disability.length === 0) {
            const none = document.createElement("p");
            none.className = "empty";
            none.textContent = "None";
            disabilityBox.appendChild(none);
        }
        data.disability.forEach(disability => {
            const div = document.createElement("div");
            div.className = "disability";
            div.textContent = disability.disability_type.split("_").join(" ");
            disabilityBox.appendChild(div);
        });

        const guardianBox = document.querySelector("#guardians");
        guardianBox.replaceChildren();
        if (data.guardian.length === 0) {
            const none = document.createElement("p");
            none.className = "empty";
            none.textContent = "None";
            guardianBox.appendChild(none);
        }
        data.guardian.forEach(guardian => {
            const div = document.createElement("div");
            div.className = "guardian";

            [
                ["Relationship", guardian.relationship],
                ["Name", `${guardian.last_name}, ${guardian.first_name}`],
                ["Contact #", guardian.contact_number]
            ].forEach(([label, value]) => {
                const p = document.createElement("p");
                const labelSpan = document.createElement("span");
                labelSpan.className = "label";
                labelSpan.textContent = label;
                const valueSpan = document.createElement("span");
                valueSpan.className = "value";
                valueSpan.textContent = value || "N/A";
                p.append(labelSpan, valueSpan);
                div.appendChild(p);
            });

            guardianBox.appendChild(div);
        });

        for (let [id, value, isBoolean] of fields) {
            if(isBoolean) {
                value = Number(value) === 0 ? "no" : "yes";
            }
            if(value === "") {
                value = "N/A"
            }
            document.querySelector("#" + id).textContent = value;
        }
        studentModal.classList.add("show");
    })
}

function createDownloadCell(studentId) {
    const downloadCell = document.createElement("td");

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "download-form";
    downloadBtn.dataset.studentId = studentId;

    downloadBtn.innerHTML = `
        <img src="../icons/download.svg" alt="">
        Download
    `;

    downloadCell.appendChild(downloadBtn);

    return downloadCell;

}

function createViewCell(studentId) {
    const viewCell = document.createElement("td");

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "view-profile";
    viewBtn.dataset.studentId = studentId;
    viewBtn.textContent = "View";

    viewCell.appendChild(viewBtn);
    return viewCell;
}

function syncEmptyState(tbody, columns, message) {
    const hasStudents = tbody.querySelector("tr:not(.empty-row)");
    const emptyRow = tbody.querySelector(".empty-row");

    if (hasStudents) {
        emptyRow?.remove();
        return;
    }

    if (!emptyRow) {
        const tr = document.createElement("tr");
        tr.className = "empty-row";

        const td = document.createElement("td");
        td.colSpan = columns;
        td.textContent = message;

        tr.appendChild(td);
        tbody.appendChild(tr);
    }
}

function sortTable(tbody, key, direction) {
    const column = key === "name" ? 0 : 3;
    const rows = Array.from(tbody.querySelectorAll("tr:not(.empty-row)"));

    rows.sort((a, b) => {
        const x = a.children[column].textContent.trim();
        const y = b.children[column].textContent.trim();

        const result = key === "gwa"
            ? (Number(x) || 0) - (Number(y) || 0)
            : x.localeCompare(y, undefined, { sensitivity: "base" });

        return direction === "asc" ? result : -result;
    });

    rows.forEach(row => tbody.appendChild(row));
}

// Re-apply the current sort after rows are loaded or moved between tables
function applySort(tbody) {
    const th = tbody.closest("table").querySelector("th[data-direction]");
    if (th) sortTable(tbody, th.dataset.sort, th.dataset.direction);
}

document.addEventListener("click", (event) => {
    const th = event.target.closest("th[data-sort]");
    if (!th) return;

    const table = th.closest("table");
    const tbody = table.querySelector("tbody");
    const key = th.dataset.sort;

    // GWA starts highest first, names start A to Z
    const first = key === "gwa" ? "desc" : "asc";
    const direction = th.dataset.direction
        ? (th.dataset.direction === "asc" ? "desc" : "asc")
        : first;

    table.querySelectorAll("th[data-sort]").forEach(other => delete other.dataset.direction);
    th.dataset.direction = direction;

    sortTable(tbody, key, direction);
});

function applySearch() {
    const words = searchInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);

    [available, assigned].forEach(tbody => {
        tbody.querySelectorAll("tr:not(.empty-row)").forEach(row => {
            const text = `${row.children[0].textContent} ${row.children[2].textContent}`.toLowerCase();
            const matches = words.every(word => text.includes(word));
            row.style.display = matches ? "" : "none";
        });
    });
}

function fullStudentName(student) {
    return [`${student.last_name},`, student.first_name, student.middle_name]
        .filter(Boolean)
        .join(" ");
}

function createTextCell(text) {
    const td = document.createElement("td");
    td.textContent = text ?? "";
    return td;
}

function createNameCell(student) {
    const td = document.createElement("td");
    const bold = document.createElement("b");
    bold.textContent = fullStudentName(student);
    td.appendChild(bold);
    return td;
}

function createActionCell(className, label, studentId) {
    const td = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.studentId = studentId;
    button.textContent = label;
    td.appendChild(button);
    return td;
}

function showProfile(profile) {
    gradeLevel = profile.grade_level;
    fullName = profile.full_name;
    nameOfSection = profile.section_name;

    localStorage.setItem("grade_level", gradeLevel);
    localStorage.setItem("full_name", fullName);
    localStorage.setItem("section_name", nameOfSection ?? "");

    teacherName.textContent = fullName;
    sectionName.textContent = nameOfSection || "No section";
    gradeNumber.forEach(text => {
        text.textContent = gradeLevel.replace(/\D/g, "");
    });
}

function loadProfile() {
    return fetch("http://localhost:3000/advisers/me", {
        headers: { "Authorization": `Bearer ${token}` }
    })
    .then(handleResponse)
    .then(profile => {
        if (!profile) return;
        showProfile(profile);
    })
    .catch(error => showToast(error.message, "error"));
}

editSectionBtn.addEventListener("click", () => {
    const current = sectionName.textContent === "No section" ? "" : sectionName.textContent;
    const input = prompt("Enter your section name:", current);
    if (input === null) return;

    const name = input.trim();
    if (name.length < 1 || name.length > 50) {
        showToast("Section name must be 1 to 50 characters.", "error");
        return;
    }

    fetch("http://localhost:3000/advisers/me/section", {
        method: "PATCH",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ section_name: name })
    })
    .then(handleResponse)
    .then(data => {
        if (!data) return;
        nameOfSection = data.section_name;
        localStorage.setItem("section_name", nameOfSection);
        sectionName.textContent = nameOfSection;
        showToast("Section name updated", "success");
    })
    .catch(error => showToast(error.message, "error"));
});

searchInput.addEventListener("input", applySearch);

closeModal.addEventListener("click", () => {
    studentModal.classList.remove("show");
})


