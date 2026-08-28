const token = localStorage.getItem("token");
const available = document.querySelector("#available");
checkAuth(token);
loadStudents(token);

window.addEventListener("pageshow", (event) => {
        if(event.persisted) {
            checkAuth(token);
    }
})

function checkAuth(token) {
    if(!token) {
        window.location.href = "../../index.html";
    }
}

function loadStudents(token) {
    available.innerHTML = "";
    fetch("http://localhost:3000/students?grade_level=G10", {
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
                            <td><button class="assign">Assign</button></td>
                        </tr>
                        `
            available.innerHTML += row;
        })
        
    });
}