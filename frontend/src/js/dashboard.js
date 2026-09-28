const token = localStorage.getItem("token");
const gradeLevel = localStorage.getItem("grade_level");
const fullName = localStorage.getItem("full_name");
const available = document.querySelector("#available");
const assigned = document.querySelector("#assigned");
const gradeNumber = document.querySelectorAll(".gradeNumber");
const teacherName = document.querySelector("#teacherName");
const countId = document.querySelector("#count");
const logoutBtn = document.querySelector(".logout");
const studentModal = document.querySelector("#studentModal");
const closeModal = document.querySelector("#closeModal");
const masterListBtn = document.querySelector("#save");

teacherName.textContent = fullName;
gradeNumber.forEach(text => {
    text.textContent = gradeLevel.split("").slice(1).join("");
})

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

            button.textContent = "Remove";
            button.classList.remove("assign");
            button.classList.add("remove");

            assigned.appendChild(row);

            countId.textContent = Number(countId.textContent) + 1;
        })
    }

    if(event.target.classList.contains("view-profile")) {
        const studentId = event.target.dataset.studentId;

        loadStudentProfile(studentId, token)
    }
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

            button.textContent = "Assign";
            button.classList.remove("remove");
            button.classList.add("assign");

            available.appendChild(row);

            countId.textContent = Number(countId.textContent) - 1;
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
    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = "masterlist.docx";
    link.click();
    URL.revokeObjectURL(url);

    } catch (error) {
        showToast(error.message, "error")
    }
} 

function loadStudents(token) {
    available.innerHTML = "";
    fetch(`http://localhost:3000/students?grade_level=${gradeLevel}`, {
        headers: {
            "Authorization" : `Bearer ${token}`
        }
    })
    .then(handleResponse)
    .then(data => {
        if(!data) return;
        data.forEach(student => {
            const row = `<tr>
                            <td><b>${student.last_name}, ${student.first_name} ${student.middle_name}</b></td>
                            <td>${student.grade_level}</td>
                            <td>${student.lrn}</td>
                            <td><button class="view-profile" data-student-id="${student.id}">View</button></td>
                            <td><button class="assign" data-student-id=${student.id}>Assign</button></td>
                        </tr>
                        `
            available.innerHTML += row;
        })
    });
}

function loadAssignedStudents(token) {
    let counter = 0;
    assigned.innerHTML = "";
    fetch("http://localhost:3000/students/assigned?", {
        headers: {
            "Authorization" : `Bearer ${token}`
        }
    })
    .then(handleResponse)
    .then(data => {
        if(!data) return;
        data.forEach(student => {
            const row = `<tr>
                            <td><b>${student.last_name}, ${student.first_name} ${student.middle_name}</b></td>
                            <td>${student.grade_level}</td>
                            <td>${student.lrn}</td>
                            <td><button class="view-profile" data-student-id="${student.id}">View</button></td>
                            <td><button class="remove" data-student-id=${student.id}>Remove</button></td>
                        </tr>
                        `
            assigned.innerHTML += row;
            counter++;
        })
        countId.textContent = counter;
    })
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
        const disabilities = data.disability;

        document.querySelector("#disabilities").innerHTML =
            disabilities.length > 0 ?
            disabilities.map(disability => `
                <div class="disability">
                    ${(disability.disability_type).split("_").join(" ")}
                </div>
            `).join("") :
            `<p class="empty">None</p>`;


        const guardians = data.guardian;

        document.querySelector("#guardians").innerHTML =
            guardians.length > 0 ?
            guardians.map(guardian => `
                <div class="guardian">

                    <p>
                        <span class="label">Relationship</span>
                        <span class="value">${guardian.relationship}</span>
                    </p>

                    <p>
                        <span class="label">Name</span>
                        <span class="value">
                            ${guardian.last_name}, ${guardian.first_name}
                        </span>
                    </p>

                    <p>
                        <span class="label">Contact #</span>
                        <span class="value">${guardian.contact_number}</span>
                    </p>

                </div>
            `).join("") :
            `<p class="empty">None</p>`;

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

closeModal.addEventListener("click", () => {
    studentModal.classList.remove("show");
})

