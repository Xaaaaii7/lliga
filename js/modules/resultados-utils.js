// -----------------------------
// METEO Helpers
// -----------------------------

const weatherCache = new Map(); // key (city lower) -> { label, emoji }

export const weatherCodeToCategory = (code) => {
    if (code == null) return null;
    const c = Number(code);

    if (c === 0) return { label: "Despejado", emoji: "☀️" };
    if ([1, 2, 3].includes(c)) return { label: "Nublado", emoji: "⛅" };
    if ([45, 48].includes(c)) return { label: "Niebla", emoji: "🌫️" };

    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(c))
        return { label: "Lluvia", emoji: "🌧️" };

    if ([71, 73, 75, 77, 85, 86].includes(c))
        return { label: "Nieve", emoji: "❄️" };

    return { label: "Variable", emoji: "🌥️" };
};

export const fetchWeatherForCity = async (cityName) => {
    if (!cityName) return null;
    const key = cityName.toLowerCase();

    if (weatherCache.has(key)) return weatherCache.get(key);

    try {
        const geoUrl =
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=es&format=json`;
        const geoRes = await fetch(geoUrl, { cache: 'no-store' });
        if (!geoRes.ok) throw new Error(`Geo HTTP ${geoRes.status}`);
        const geo = await geoRes.json();
        const loc = geo?.results?.[0];
        if (!loc) {
            weatherCache.set(key, null);
            return null;
        }

        const lat = loc.latitude;
        const lon = loc.longitude;

        const meteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current_weather=true`;
        const meteoRes = await fetch(meteoUrl, { cache: 'no-store' });
        if (!meteoRes.ok) throw new Error(`Meteo HTTP ${meteoRes.status}`);
        const meteoData = await meteoRes.json();

        const cat = weatherCodeToCategory(meteoData?.current_weather?.weathercode);
        if (cat) {
            weatherCache.set(key, cat);
            return cat;
        }
    } catch (e) {
        console.warn('Meteo error para ciudad', cityName, e);
    }

    weatherCache.set(key, null);
    return null;
};
