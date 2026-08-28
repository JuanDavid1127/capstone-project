checkAuth();

window.addEventListener("pageshow", (event) => {
        if(event.persisted) {
            checkAuth();
    }
})

function checkAuth() {
    const token = localStorage.getItem("token");
    if(!token) {
        window.location.href = "../../index.html";
    }
}