const form = document.querySelector("#loginForm");
const username = document.querySelector("#username");
const password = document.querySelector("#password");
const loading = document.querySelector("#loading");

form.addEventListener("submit", (e) => {
    e.preventDefault();
    
    loading.style.display = "flex"
    fetch("http://localhost:3000/login", {
        method: "POST",
        headers: {"Content-Type" : "application/json"},
        body: JSON.stringify({username : username.value, password : password.value})
    })
    .then(response => {
        if(!response.ok) {
            throw new error("Wrong Username or Password");
        }
        return response.json();
    })
    .then(data => {
        showToast("logged in Successfully", "success");
        loading.style.display = "none";
        localStorage.setItem("token", data.token);
        localStorage.setItem( "grade_level", data.grade_level);
        localStorage.setItem("full_name", data.full_name)
        setTimeout(() => {
            window.location.href = "../pages/dashboard.html";
        }, 1200)
    })
    .catch(error => {
        showToast(error.message, "error");
        loading.style.display = "none";
    })
})