function showToast(message, type) {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.className = `toast ${type}`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3000); 
}