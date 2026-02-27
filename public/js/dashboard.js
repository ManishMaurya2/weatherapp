document.addEventListener('DOMContentLoaded', async () => {
    // Check session first
    const sessionRes = await fetch('/api/session');
    const sessionData = await sessionRes.json();

    if (!sessionData.loggedIn) {
        window.location.href = '/index.html';
        return;
    }

    document.getElementById('userEmailDisplay').innerText = `Logged in as: ${sessionData.email}`;

    // Event Listeners
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('searchBtn').addEventListener('click', fetchWeather);
    document.getElementById('cityInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') fetchWeather();
    });
});

async function handleLogout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/index.html';
    } catch (err) {
        console.error('Logout failed', err);
    }
}

async function fetchWeather() {
    const city = document.getElementById('cityInput').value.trim();
    if (!city) return;

    const alert = document.getElementById('alert');
    const searchBtn = document.getElementById('searchBtn');
    const weatherContent = document.getElementById('weatherContent');
    const emptyState = document.getElementById('emptyState');

    // Loading state
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<span class="loader"></span>';
    alert.style.display = 'none';

    try {
        const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'City not found');

        displayWeather(data);
        weatherContent.classList.remove('hidden');
        emptyState.classList.add('hidden');

    } catch (err) {
        showAlert(err.message, 'error');
        weatherContent.classList.add('hidden');
        emptyState.classList.remove('hidden');
    } finally {
        searchBtn.disabled = false;
        searchBtn.innerText = 'Search Weather';
    }
}

function displayWeather(data) {
    const { current, forecast } = data;

    // Current weather
    document.getElementById('cityName').innerText = `${current.name}, ${current.sys.country}`;
    document.getElementById('currentDate').innerText = new Date().toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long'
    });
    document.getElementById('currentTemp').innerText = Math.round(current.main.temp);
    document.getElementById('weatherDesc').innerText = current.weather[0].description;
    document.getElementById('weatherIcon').src = `https://openweathermap.org/img/wn/${current.weather[0].icon}@4x.png`;

    document.getElementById('humidity').innerText = current.main.humidity;
    document.getElementById('windSpeed').innerText = (current.wind.speed * 3.6).toFixed(1); // m/s to km/h
    document.getElementById('pressure').innerText = current.main.pressure;
    document.getElementById('feelsLike').innerText = Math.round(current.main.feels_like);

    // Forecast
    const forecastGrid = document.getElementById('forecastGrid');
    forecastGrid.innerHTML = '';

    // OpenWeather 5-day forecast gives data every 3 hours. Let's pick one for each day.
    const dailyForecasts = forecast.list.filter(item => item.dt_txt.includes('12:00:00'));

    dailyForecasts.forEach(item => {
        const date = new Date(item.dt * 1000);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

        const card = document.createElement('div');
        card.className = 'forecast-item';
        card.innerHTML = `
            <div class="forecast-day">${dayName}</div>
            <img class="forecast-icon" src="https://openweathermap.org/img/wn/${item.weather[0].icon}@2x.png" alt="icon">
            <div class="forecast-temp">${Math.round(item.main.temp)}°</div>
        `;
        forecastGrid.appendChild(card);
    });
}

function showAlert(message, type) {
    const alert = document.getElementById('alert');
    alert.style.display = 'block';
    alert.className = `alert alert-${type}`;
    alert.innerText = message;
}
