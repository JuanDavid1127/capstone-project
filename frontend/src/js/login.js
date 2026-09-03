const form = document.querySelector("#loginForm");
const username = document.querySelector("#username");
const password = document.querySelector("#password");
const loading = document.querySelector("#loading");

form.addEventListener("submit", (e) => {
    e.preventDefault();
    
    loading.style.display = "block"
    fetch("http://localhost:3000/login", {
        method: "POST",
        headers: {"Content-Type" : "application/json"},
        body: JSON.stringify({username : username.value, password : password.value})
    })
    .then(response => response.json())
    .then(data => {
        loading.style.display = "none";
        localStorage.setItem("token", data.token);
        localStorage.setItem( "grade_level", data.grade_level);
        localStorage.setItem("full_name", data.full_name)
        window.location.href = "./src/pages/dashboard.html";
    })
    .catch(error => {
        loading.style.display = "none";
        alert(error);
    })
})