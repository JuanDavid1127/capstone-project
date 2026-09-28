const form = document.querySelector("#registrationForm");
const fourPsInput = document.querySelectorAll("input[name='fourPs']");
const fourPsInputField = document.querySelector("#householdId");
const sameAddressInput = document.querySelectorAll("input[name='sameAddress']");
const permAddress = document.querySelector(".perm-address-grid");
const learnersDisabilityInput = document.querySelectorAll("input[name='learnerDisability']");
const disabilityGrid = document.querySelector(".disability-grid");

form.addEventListener("submit", (e) => {
    e.preventDefault();

    const student = {
        lrn : document.querySelector("#lrn").value,
        last_name : document.querySelector("#lastName").value.trim(),
        first_name : document.querySelector("#firstName").value.trim(),
        middle_name : document.querySelector("#middleName").value.trim(),
        extension_name : document.querySelector("#extension").value.trim(),
        sex : document.querySelector('input[name="sex"]:checked').value,
        grade_level : document.querySelector("#gradeLevel").value,
        school_year : document.querySelector("#schoolYear").value,
        returnee : document.querySelector('input[name="returnee"]:checked').value,
        birth_place : document.querySelector("#birthPlace").value,
        mother_tongue : document.querySelector("#motherTongue").value,
        ipCommunity : document.querySelector('input[name="ipCommunity"]:checked').value,
        fourPs : document.querySelector('input[name="fourPs"]:checked').value,
        householdId : document.querySelector("#householdId").value,
        learnerDisability : document.querySelector('input[name="learnerDisability"]:checked').value,
        others : document.querySelector("#others").value,
        sameAddress : document.querySelector('input[name="sameAddress"]:checked').value

    }
    const disabilities = Array.from(
        document.querySelectorAll('input[name="disabilities[]"]:checked')
    ).map(checkbox => checkbox.value)

    const currAddress = {
        currHouseNo : document.querySelector('input[name="currHouseNo"]').value,
        currStreet : document.querySelector('input[name="currStreet"]').value,
        currBarangay : document.querySelector('input[name="currBarangay"]').value,
        currCity : document.querySelector('input[name="currCity"]').value,
        currProvince : document.querySelector('input[name="currProvince"]').value,
        currCountry : document.querySelector('input[name="currCountry"]').value,
        currZipcode : document.querySelector('input[name="currZipcode"]').value
    }

    const permAddress = {
        permHouseNo : document.querySelector('input[name="permHouseNo"]').value,
        permStreet : document.querySelector('input[name="permStreet"]').value,
        permBarangay : document.querySelector('input[name="permBarangay"]').value,
        permCity : document.querySelector('input[name="permCity"]').value,
        permProvince : document.querySelector('input[name="permProvince"]').value,
        permCountry : document.querySelector('input[name="permCountry"]').value,
        permZipcode : document.querySelector('input[name="permZipcode"]').value
    }

    const father = {
        fatherLastName : document.querySelector('input[name="fatherLastName"]').value,
        fatherFirstName : document.querySelector('input[name="fatherFirstName"]').value,
        fatherMiddleName : document.querySelector('input[name="fatherMiddleName"]').value,
        fatherContactNo : document.querySelector('input[name="fatherContactNo"]').value
    }

    const mother = {
        motherLastName : document.querySelector('input[name="motherLastName"]').value,
        motherFirstName : document.querySelector('input[name="motherFirstName"]').value,
        motherMiddleName : document.querySelector('input[name="motherMiddleName"]').value,
        motherContactNo : document.querySelector('input[name="motherContactNo"]').value
    }

    const guardian = {
        guardianLastName : document.querySelector('input[name="guardianLastName"]').value,
        guardianFirstName : document.querySelector('input[name="guardianFirstName"]').value,
        guardianMiddleName : document.querySelector('input[name="guardianMiddleName"]').value,
        guardianContactNo : document.querySelector('input[name="guardianContactNo"]').value
    }
    
    const combined = {
        ...student, 
        disabilities : disabilities, 
        ...currAddress, 
        ...permAddress,
        ...father,
        ...mother,
        ...guardian    
    }

    fetch("http://localhost:3000/students", {
        method: "POST",
        headers: {"Content-Type" : "application/json"},
        body: JSON.stringify(combined)
    })
    .then(response => {
        if(!response.ok) {
            throw new Error("Registration Failed");
        }

        return response.json();
    })
    .then(data => {
        console.log(data)
        showToast("Registration Complete!", "success");
        form.reset();
    })
    .catch(error => {
        showToast(error.message, "error");
    })
})

function validateStudent(student, disabilities) {
    const errors = [];

    if(!/^\d{12}$/.test(student.lrn.trim())) {
        errors.push("LRN must contain exactly 12 digits.");
    }

    if(!student.last_name) {
        errors.push("last name is required");
    }

    if(!student.first_name) {
        errors.push("first name is required");
    }
}

fourPsInput.forEach(input => {
    input.addEventListener("change", () => {
        if(input.value === "no" && input.checked) {
            fourPsInputField.value = "";
            fourPsInputField.style.borderColor = "rgba(0, 0, 0, 0.1)"
            fourPsInputField.disabled = true;
        }

        if(input.value === "yes" && input.checked) {
            fourPsInputField.style.borderColor = "#999"
            fourPsInputField.disabled = false;
        }
    })
})

sameAddressInput.forEach(input => {
    input.addEventListener("change", () => {
        const fields = permAddress.querySelectorAll("input");
        if(input.value === "no" && input.checked) {
            fields.forEach(field => {
                field.style.borderColor = "#999"
                field.disabled = false;
            })
        }

        if(input.value === "yes" && input.checked) {
            fields.forEach(field => {
                field.style.borderColor = "rgba(0, 0, 0, 0.1)"
                field.disabled = true;
            })
        }
    })
})

learnersDisabilityInput.forEach(input => {
    input.addEventListener("change", () => {
        const checkboxes = disabilityGrid.querySelectorAll("input");
        if(input.value === "no" && input.checked) {
            checkboxes.forEach(checkbox => {
                checkbox.disabled = true;
                checkbox.checked = false;
                checkbox.style.borderColor = "rgba(0, 0, 0, 0.1)"
                checkbox.value = "";
                
            }) 
        }

        if(input.value === "yes" && input.checked) {
            checkboxes.forEach(checkbox => {
                checkbox.disabled = false;
                checkbox.style.borderColor = "#999"
            })
        }
    })
})