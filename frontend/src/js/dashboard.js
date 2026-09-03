const token = localStorage.getItem("token");
const gradeLevel = localStorage.getItem("grade_level");
const fullName = localStorage.getItem("full_name");
const available = document.querySelector("#available");
const assigned = document.querySelector("#assigned");
const gradeNumber = document.querySelectorAll(".gradeNumber");
const teacherName = document.querySelector("#teacherName");
const countId = document.querySelector("#count");
const logoutBtn = document.querySelector(".logout");

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

logoutBtn.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "../../index.html";
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
        .then(response => response.json())
        .then(data => loadStudents(token))
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
        .then(response => response.json())
        .then(data => {
            loadAssignedStudents(token); 
            loadStudents(token);
        });
    }
})


function checkAuth(token) {
    if(!token) {
        window.location.href = "../../index.html";
    }
}

function loadStudents(token) {
    available.innerHTML = "";
    fetch(`http://localhost:3000/students?grade_level=${gradeLevel}`, {
        headers: {
            "Authorization" : `Bearer ${token}`
        }
    })
    .then(response => response.json())
    .then(data => {
        data.forEach(student => {
            const row = `<tr>
                            <td><b>${student.name}</b></td>
                            <td>${student.grade_level}</td>
                            <td>${student.lrn}</td>
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
    .then(response => response.json())
    .then(data => {
        data.forEach(student => {
            const row = `<tr>
                            <td><b>${student.name}</b></td>
                            <td>${student.grade_level}</td>
                            <td>${student.lrn}</td>
                            <td><button class="remove" data-student-id=${student.id}>Remove</button></td>
                        </tr>
                        `
            assigned.innerHTML += row;
            counter++;
        })
        countId.textContent = counter;
    })
}

