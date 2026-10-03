const form = document.querySelector("#registrationForm");

const fourPsInput = document.querySelectorAll("input[name='fourPs']");
const fourPsInputField = document.querySelector("#householdId");

const sameAddressInput = document.querySelectorAll("input[name='sameAddress']");
const permAddress = document.querySelector(".perm-address-grid");

const learnersDisabilityInput = document.querySelectorAll("input[name='learnerDisability']");
const disabilityGrid = document.querySelector(".disability-grid");

const lockScreen = document.querySelector("#lockScreen");
const unlockForm = document.querySelector("#unlockForm");
const accessCode = document.querySelector("#accessCode");

function lockDesk() {
    sessionStorage.removeItem("registrationToken");
    lockScreen.hidden = false;
    accessCode.value = "";
    accessCode.focus();
}

fetch("http://localhost:3000/registration/status")
.then(response => response.json())
.then(data => {
    if (data.required && !sessionStorage.getItem("registrationToken")) {
        lockDesk();
    }
})
.catch(() => showToast("Cannot reach the server", "error"));

unlockForm.addEventListener("submit", (e) => {
    e.preventDefault();

    fetch("http://localhost:3000/registration/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: accessCode.value })
    })
    .then(response => response.json().then(data => {
        if (!response.ok) throw new Error(data.error || "Unlock failed");
        return data;
    }))
    .then(data => {
        sessionStorage.setItem("registrationToken", data.token);
        lockScreen.hidden = true;
    })
    .catch(error => showToast(error.message, "error"));
});


function clearError(element) {
    if (!element) return;

    element.classList.remove("invalid");

    const error = element.parentElement?.querySelector(".field-error");

    if (error) {
        error.remove();
    }
}


function showError(element, message) {
    if (!element) return;

    clearError(element);

    element.classList.add("invalid");

    const error = document.createElement("small");
    error.className = "field-error";
    error.textContent = message;

    if (element.parentElement) {
        element.parentElement.appendChild(error);
    }
}


function showGroupError(container, message) {
    if (!container) return;

    const existing = container.querySelector(".field-error");

    if (existing) {
        existing.remove();
    }

    container.classList.add("invalid-group");

    const error = document.createElement("small");
    error.className = "field-error";
    error.textContent = message;

    container.appendChild(error);
}


function clearGroupError(container) {
    if (!container) return;

    container.classList.remove("invalid-group");

    const error = container.querySelector(".field-error");

    if (error) {
        error.remove();
    }
}


function getValue(selector) {
    const element = document.querySelector(selector);
    return element ? element.value.trim() : "";
}


function getRadioValue(name) {
    const selected = document.querySelector(`input[name="${name}"]:checked`);
    return selected ? selected.value : "";
}


/* ================================
   VALIDATE STUDENT
================================ */

function validateStudent() {
    let valid = true;

    const lrn = document.querySelector("#lrn");
    const schoolYear = document.querySelector("#schoolYear");
    const lastName = document.querySelector("#lastName");
    const firstName = document.querySelector("#firstName");
    const middleName = document.querySelector("#middleName");
    const birthPlace = document.querySelector("#birthPlace");
    const motherTongue = document.querySelector("#motherTongue");
    const gradeLevel = document.querySelector("#gradeLevel");
    const previousGwa = document.querySelector("#previousGwa");
    const gwaValue = previousGwa.value.trim();
    const sexGroup = document.querySelector('input[name="sex"]')?.closest(".field");
    const returneeGroup = document.querySelector(".check-row");
    const ipGroup = document.querySelector('input[name="ipCommunity"]')?.closest(".field");
    const fourPsGroup = document.querySelector('input[name="fourPs"]')?.closest(".field");
    const disabilityGroup = document.querySelector('input[name="learnerDisability"]')?.closest(".section");
    const sameAddressGroup = document.querySelector(".same-address");


    /* LRN */

    if (!/^\d{12}$/.test(lrn.value.trim())) {
        showError(lrn, "LRN must contain exactly 12 digits.");
        valid = false;
    } else {
        clearError(lrn);
    }


    /* School Year */

    if (!/^\d{4}-\d{4}$/.test(schoolYear.value.trim())) {
        showError(schoolYear, "Enter the school year using YYYY-YYYY.");
        valid = false;
    } else {
        clearError(schoolYear);
    }


    /* Grade Level */

    if (!gradeLevel.value) {
        showError(gradeLevel, "Please select a grade level.");
        valid = false;
    } else {
        clearError(gradeLevel);
    }

    if (!/^\d{1,3}(\.\d{1,2})?$/.test(gwaValue) || Number(gwaValue) > 100) {
        showError(previousGwa, "Enter a GWA from 0 to 100 (up to 2 decimals).");
        valid = false;
    } else {
        clearError(previousGwa);
    }


    /* Last Name */

    if (!lastName.value.trim()) {
        showError(lastName, "Last name is required.");
        valid = false;
    } else if (!/^[a-zA-ZÀ-ÿ' -]+$/.test(lastName.value.trim())) {
        showError(lastName, "Last name contains invalid characters.");
        valid = false;
    } else {
        clearError(lastName);
    }


    /* First Name */

    if (!firstName.value.trim()) {
        showError(firstName, "First name is required.");
        valid = false;
    } else if (!/^[a-zA-ZÀ-ÿ' -]+$/.test(firstName.value.trim())) {
        showError(firstName, "First name contains invalid characters.");
        valid = false;
    } else {
        clearError(firstName);
    }


    /* Middle Name */

    if (
        middleName.value.trim() &&
        !/^[a-zA-ZÀ-ÿ' -]+$/.test(middleName.value.trim())
    ) {
        showError(middleName, "Middle name contains invalid characters.");
        valid = false;
    } else {
        clearError(middleName);
    }


    /* Birth Place */

    if (birthPlace.value.trim() && birthPlace.value.trim().length < 2) {
        showError(birthPlace, "Please enter a valid place of birth.");
        valid = false;
    } else {
        clearError(birthPlace);
    }


    /* Mother Tongue */

    if (motherTongue.value.trim() && motherTongue.value.trim().length < 2) {
        showError(motherTongue, "Please enter a valid mother tongue.");
        valid = false;
    } else {
        clearError(motherTongue);
    }


    /* Sex */

    if (!getRadioValue("sex")) {
        showGroupError(sexGroup, "Please select a sex.");
        valid = false;
    } else {
        clearGroupError(sexGroup);
    }


    /* Returnee */

    if (!getRadioValue("returnee")) {
        showGroupError(returneeGroup, "Please select an answer.");
        valid = false;
    } else {
        clearGroupError(returneeGroup);
    }


    /* IP Community */

    if (!getRadioValue("ipCommunity")) {
        showGroupError(ipGroup, "Please select an answer.");
        valid = false;
    } else {
        clearGroupError(ipGroup);
    }


    /* 4Ps */

    const fourPs = getRadioValue("fourPs");

    if (!fourPs) {
        showGroupError(fourPsGroup, "Please select an answer.");
        valid = false;
    } else {
        clearGroupError(fourPsGroup);
    }

    if (fourPs === "yes" && !fourPsInputField.value.trim()) {
        showError(
            fourPsInputField,
            "Household ID is required when 4Ps is Yes."
        );
        valid = false;
    } else {
        clearError(fourPsInputField);
    }


    /* Disability */

    const learnerDisability = getRadioValue("learnerDisability");

    if (!learnerDisability) {
        showGroupError(
            disabilityGroup,
            "Please indicate whether the learner has a disability."
        );
        valid = false;
    } else {
        clearGroupError(disabilityGroup);
    }

    if (learnerDisability === "yes") {

        const checkedDisabilities = document.querySelectorAll(
            'input[name="disabilities[]"]:checked'
        );

        if (checkedDisabilities.length === 0) {
            showGroupError(
                disabilityGrid,
                "Please select at least one disability."
            );
            valid = false;
        } else {
            clearGroupError(disabilityGrid);
        }

    } else {
        clearGroupError(disabilityGrid);
    }


    /* Same Address */

    const sameAddress = getRadioValue("sameAddress");

    if (!sameAddress) {
        showGroupError(
            sameAddressGroup,
            "Please indicate whether the addresses are the same."
        );
        valid = false;
    } else {
        clearGroupError(sameAddressGroup);
    }


    /* Current Address */

    const currentAddressFields = [
        document.querySelector('input[name="currHouseNo"]'),
        document.querySelector('input[name="currStreet"]'),
        document.querySelector('input[name="currBarangay"]'),
        document.querySelector('input[name="currCity"]'),
        document.querySelector('input[name="currProvince"]'),
        document.querySelector('input[name="currCountry"]'),
        document.querySelector('input[name="currZipcode"]')
    ];

    currentAddressFields.forEach(field => {
        if (!field) return;

        if (!field.value.trim()) {
            showError(field, "This field is required.");
            valid = false;
        } else {
            clearError(field);
        }
    });


    /* Permanent Address */

    if (sameAddress === "no") {

        const permanentAddressFields = [
            document.querySelector('input[name="permHouseNo"]'),
            document.querySelector('input[name="permStreet"]'),
            document.querySelector('input[name="permBarangay"]'),
            document.querySelector('input[name="permCity"]'),
            document.querySelector('input[name="permProvince"]'),
            document.querySelector('input[name="permCountry"]'),
            document.querySelector('input[name="permZipcode"]')
        ];

        permanentAddressFields.forEach(field => {
            if (!field) return;

            if (!field.value.trim()) {
                showError(field, "This field is required.");
                valid = false;
            } else {
                clearError(field);
            }
        });
    }


    /* Contact Numbers */

    const contactFields = [
        document.querySelector('input[name="fatherContactNo"]'),
        document.querySelector('input[name="motherContactNo"]'),
        document.querySelector('input[name="guardianContactNo"]')
    ];

    contactFields.forEach(field => {

        if (!field || !field.value.trim()) {
            return;
        }

        if (!/^\d{11}$/.test(field.value.trim())) {
            showError(field, "Contact number must contain exactly 11 digits.");
            valid = false;
        } else {
            clearError(field);
        }
    });

    const consent = document.querySelector("#consent");
    const consentGroup = consent.closest(".field");

    if (!consent.checked) {
        showGroupError(consentGroup, "You must agree to the data privacy notice.");
        valid = false;
    } else {
        clearGroupError(consentGroup);
    }


    return valid;
}


/* ================================
   SUBMIT
================================ */

form.addEventListener("submit", async (e) => {

    e.preventDefault();

    if (!validateStudent()) {
        showToast("Please correct the highlighted fields.", "error");

        const firstInvalid = form.querySelector(".invalid");

        if (firstInvalid) {
            firstInvalid.focus();
            firstInvalid.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }

        return;
    }


    const student = {
        lrn: getValue("#lrn"),
        last_name: getValue("#lastName"),
        first_name: getValue("#firstName"),
        middle_name: getValue("#middleName"),
        extension_name: getValue("#extension"),

        sex: getRadioValue("sex"),

        grade_level: getValue("#gradeLevel"),
        gwa: getValue("#previousGwa"),
        school_year: getValue("#schoolYear"),

        returnee: getRadioValue("returnee"),

        birth_place: getValue("#birthPlace"),
        mother_tongue: getValue("#motherTongue"),

        ipCommunity: getRadioValue("ipCommunity"),
        fourPs: getRadioValue("fourPs"),

        householdId: getValue("#householdId"),

        learnerDisability: getRadioValue("learnerDisability"),

        others: getValue("#others"),

        sameAddress: getRadioValue("sameAddress"),
        consent: document.querySelector("#consent").checked
    };


    const disabilities = Array.from(
        document.querySelectorAll(
            'input[name="disabilities[]"]:checked'
        )
    ).map(checkbox => checkbox.value);


    const currAddress = {
        currHouseNo: getValue('input[name="currHouseNo"]'),
        currStreet: getValue('input[name="currStreet"]'),
        currBarangay: getValue('input[name="currBarangay"]'),
        currCity: getValue('input[name="currCity"]'),
        currProvince: getValue('input[name="currProvince"]'),
        currCountry: getValue('input[name="currCountry"]'),
        currZipcode: getValue('input[name="currZipcode"]')
    };


    const permanentAddress = {
        permHouseNo: getValue('input[name="permHouseNo"]'),
        permStreet: getValue('input[name="permStreet"]'),
        permBarangay: getValue('input[name="permBarangay"]'),
        permCity: getValue('input[name="permCity"]'),
        permProvince: getValue('input[name="permProvince"]'),
        permCountry: getValue('input[name="permCountry"]'),
        permZipcode: getValue('input[name="permZipcode"]')
    };


    const father = {
        fatherLastName: getValue('input[name="fatherLastName"]'),
        fatherFirstName: getValue('input[name="fatherFirstName"]'),
        fatherMiddleName: getValue('input[name="fatherMiddleName"]'),
        fatherContactNo: getValue('input[name="fatherContactNo"]')
    };


    const mother = {
        motherLastName: getValue('input[name="motherLastName"]'),
        motherFirstName: getValue('input[name="motherFirstName"]'),
        motherMiddleName: getValue('input[name="motherMiddleName"]'),
        motherContactNo: getValue('input[name="motherContactNo"]')
    };


    const guardian = {
        guardianLastName: getValue('input[name="guardianLastName"]'),
        guardianFirstName: getValue('input[name="guardianFirstName"]'),
        guardianMiddleName: getValue('input[name="guardianMiddleName"]'),
        guardianContactNo: getValue('input[name="guardianContactNo"]')
    };


    const combined = {
        ...student,
        disabilities,
        ...currAddress,
        ...permanentAddress,
        ...father,
        ...mother,
        ...guardian
    };


    const submitButton = form.querySelector(".submit-btn");

    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";


    try {

        const response = await fetch("http://localhost:3000/students", {
            method: "POST",
            headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${sessionStorage.getItem("registrationToken") || ""}`
        },
            body: JSON.stringify(combined)
        });


        const data = await response.json();
        if (response.status === 401) {
            lockDesk();
        }


        if (!response.ok) {
            throw new Error(
                data.message ||
                data.error ||
                "Registration failed."
            );
        }


        console.log(data);

        showToast("Registration Complete!", "success");

        form.reset();


        /* Restore conditional fields */

        fourPsInputField.disabled = true;

        document.querySelectorAll(".perm-address-grid input").forEach(field => {
            field.disabled = true;
        });

        document.querySelectorAll(".disability-grid input").forEach(field => {
            field.disabled = true;
            field.checked = false;
        });


    } catch (error) {

        console.error(error);

        showToast(error.message, "error");

    } finally {

        submitButton.disabled = false;
        submitButton.textContent = "Submit";

    }
});


/* ================================
   4Ps
================================ */

fourPsInput.forEach(input => {

    input.addEventListener("change", () => {

        clearGroupError(
            input.closest(".field")
        );

        if (input.value === "no" && input.checked) {

            fourPsInputField.value = "";
            fourPsInputField.disabled = true;

            clearError(fourPsInputField);

        }

        if (input.value === "yes" && input.checked) {

            fourPsInputField.disabled = false;
            fourPsInputField.focus();

        }
    });
});


/* ================================
   SAME ADDRESS
================================ */

sameAddressInput.forEach(input => {

    input.addEventListener("change", () => {

        clearGroupError(
            input.closest(".same-address")
        );

        const fields = permAddress.querySelectorAll("input");

        if (input.value === "no" && input.checked) {

            fields.forEach(field => {
                field.disabled = false;
            });

        }

        if (input.value === "yes" && input.checked) {

            fields.forEach(field => {
                field.value = "";
                field.disabled = true;
                clearError(field);
            });

        }
    });
});


/* ================================
   DISABILITY
================================ */

learnersDisabilityInput.forEach(input => {

    input.addEventListener("change", () => {

        const checkboxes = disabilityGrid.querySelectorAll(
            'input[name="disabilities[]"]'
        );

        if (input.value === "no" && input.checked) {

            checkboxes.forEach(checkbox => {
                checkbox.disabled = true;
                checkbox.checked = false;
            });

            document.querySelector("#others").value = "";
            document.querySelector("#others").disabled = true;

            clearGroupError(disabilityGrid);

        }


        if (input.value === "yes" && input.checked) {

            checkboxes.forEach(checkbox => {
                checkbox.disabled = false;
            });

            document.querySelector("#others").disabled = false;

        }
    });
});


/* ================================
   LIVE VALIDATION
================================ */

const inputs = form.querySelectorAll(
    "input[type='text'], input[type='tel'], select"
);

inputs.forEach(input => {

    input.addEventListener("input", () => {

        if (input.classList.contains("invalid")) {
            clearError(input);
        }

    });

    input.addEventListener("change", () => {

        if (input.classList.contains("invalid")) {
            clearError(input);
        }

    });
});


/* ================================
   INITIAL STATE
================================ */

fourPsInputField.disabled = true;

document.querySelectorAll(".perm-address-grid input").forEach(field => {
    field.disabled = true;
});

document.querySelectorAll(
    '.disability-grid input[name="disabilities[]"]'
).forEach(field => {
    field.disabled = true;
});

document.querySelector("#others").disabled = true;
