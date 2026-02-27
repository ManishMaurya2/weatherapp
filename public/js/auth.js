async function handleAuth(event, type, emailParam = null) {
    event.preventDefault();

    const alert = document.getElementById('alert');
    const submitBtn = document.getElementById('submitBtn');
    const originalBtnText = submitBtn.innerHTML;

    // Clear alert
    alert.style.display = 'none';
    alert.className = 'alert';

    // Prepare data
    let body = {};
    if (type === 'login' || type === 'register') {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        if (type === 'register') {
            const confirmPassword = document.getElementById('confirmPassword').value;
            if (password !== confirmPassword) {
                showAlert('Passwords do not match', 'error');
                return;
            }
        }
        body = { email, password };
    } else if (type === 'verify-otp') {
        const otp = document.getElementById('fullOtp').value;
        if (otp.length !== 6) {
            showAlert('Please enter all 6 digits', 'error');
            return;
        }
        body = { email: emailParam, otp };
    }

    // Loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loader"></span> Processing...';

    try {
        const response = await fetch(`/api/${type}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Something went wrong');
        }

        if (data.needsOTP) {
            window.location.href = `/otp.html?email=${encodeURIComponent(data.email)}`;
            return;
        }

        if (data.redirect) {
            window.location.href = data.redirect;
            return;
        }

        if (type === 'register') {
            window.location.href = `/otp.html?email=${encodeURIComponent(data.email)}`;
            return;
        }

        showAlert(data.message, 'success');

    } catch (error) {
        showAlert(error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

function showAlert(message, type) {
    const alert = document.getElementById('alert');
    alert.style.display = 'block';
    alert.className = `alert alert-${type}`;
    alert.innerText = message;
}
