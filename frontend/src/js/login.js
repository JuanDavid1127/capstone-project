const form = document.querySelector("#loginForm");
const username = document.querySelector("#username");
const password = document.querySelector("#password");

form.addEventListener("submit", (e) => {
    e.preventDefault();

    fetch("http://localhost:3000/login", {
        method: "POST",
        headers: {"Content-Type" : "application/json"},
        body: JSON.stringify({username : username.value, password : password.value})
    })
    .then(response => response.json())
    .then(data => console.log(data))
})