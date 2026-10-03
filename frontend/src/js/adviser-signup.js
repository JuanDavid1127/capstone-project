const form = document.querySelector("#adviserSignupForm");
const username = document.querySelector("#username");
const password = document.querySelector("#password");
const confirmPassword = document.querySelector("#confirmPassword");
const lastName = document.querySelector("#lastName");
const firstName = document.querySelector("#firstName");
const middleName = document.querySelector("#middleName");
const registerBtn = document.querySelector("#registerBtn");
const loading = document.querySelector("#loading");
const inviteStatus = document.querySelector("#inviteStatus");

const inviteToken = new URLSearchParams(window.location.search).get("token");

function showInviteError(message) {
    inviteStatus.classList.add("error");
    inviteStatus.querySelector(".status-icon").textContent = "!";
    inviteStatus.querySelector("strong").textContent = "Invitation problem";
    inviteStatus.querySelector("p").textContent = message;
    registerBtn.disabled = true;
}

function checkInvite() {
    if (!inviteToken) {
        showInviteError("This page needs an invitation link from the administrator.");
        return;
    }

    try {
        const invite = JSON.parse(atob(inviteToken.split(".")[1]));
        if (invite.exp && invite.exp * 1000 < Date.now()) {
            showInviteError("This invitation link has expired. Ask the administrator for a new one.");
        }
    } catch {
        showInviteError("This invitation link is not valid.");
    }
}

checkInvite();

form.addEventListener("submit", (e) => {
    e.preventDefault();

    if (password.value.length < 8) {
        showToast("Password must be at least 8 characters", "error");
        return;
    }

    if (password.value !== confirmPassword.value) {
        showToast("Passwords do not match", "error");
        return;
    }

    // Format: First Middle Last. Change the order here if your admin-created accounts use another format.
    const fullName = [firstName.value, middleName.value, lastName.value]
        .map(part => part.trim())
        .filter(Boolean)
        .join(" ");

    loading.style.display = "flex";
    registerBtn.disabled = true;

    fetch("http://localhost:3000/advisers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            token: inviteToken,
            username: username.value.trim(),
            password: password.value,
            full_name: fullName
        })
    })
    .then(response => {
        return response.text().then(text => {
            let body;
            try {
                body = JSON.parse(text);
            } catch {
                body = { error: text };
            }
            if (!response.ok) {
                throw new Error(body.error || "Registration failed");
            }
            return body;
        });
    })
    .then(data => {
        loading.style.display = "none";
        showToast("Account created. Wait for admin approval.", "success");
        setTimeout(() => {
            window.location.href = "./login.html";
        }, 2000);
    })
    .catch(error => {
        loading.style.display = "none";
        registerBtn.disabled = false;
        showToast(error.message, "error");
    });
});