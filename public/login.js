document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');
    const errorMessage = document.getElementById('errorMessage');

    // Check if already logged in
    checkSession();

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            showError('Por favor, completa todos los campos');
            return;
        }

        // Disable button and show loading
        loginBtn.disabled = true;
        loginBtn.textContent = 'Iniciando sesión...';
        hideError();

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password }),
                credentials: 'include'
            });

            const data = await response.json();

            if (response.ok) {
                // Login successful
                window.location.href = '/';
            } else {
                // Login failed
                showError(data.error || 'Error al iniciar sesión');
                loginBtn.disabled = false;
                loginBtn.textContent = 'Iniciar Sesión';
            }
        } catch (error) {
            console.error('Login error:', error);
            showError('Error de conexión. Por favor, intenta de nuevo.');
            loginBtn.disabled = false;
            loginBtn.textContent = 'Iniciar Sesión';
        }
    });

    async function checkSession() {
        try {
            const response = await fetch('/api/auth/session', {
                credentials: 'include'
            });

            if (response.ok) {
                // Already logged in, redirect to main app
                window.location.href = '/';
            }
        } catch (error) {
            // Not logged in, stay on login page
        }
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
    }

    function hideError() {
        errorMessage.classList.add('hidden');
    }
});
